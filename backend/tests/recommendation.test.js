const assert = require("node:assert/strict");
const test = require("node:test");

const {
  requestSchema,
  modelResponseSchema,
  parseModelContent,
  suggestionResponseSchema,
  suggestionMessages,
  makeRetrievalQuery,
  loadPersonalization,
  isRereadRequest,
  matchVerifiedBooks,
} = require("../services/recommendationService");
const prisma = require("../lib/prisma");
const { buildSearchPlan, retrieveCandidates } = require("../services/bookRetrieval");
const { verifySuggestions, scoreMatch } = require("../services/bookLookup");
const { recommendationRateLimit } = require("../middleware/recommendationRateLimit");
const { chat, sendChatError } = require("../controllers/recommendationController");
const {
  OpenLibraryError,
  fetchOpenLibraryJson,
  searchOpenLibrary,
} = require("../services/openLibraryService");
const {
  invokeWithRetry,
  describeProviderError,
  isModelUnavailableError,
  isOverloadedError,
  isCredentialError,
} = require("../services/geminiProvider");

test("chat request validation bounds messages and history", () => {
  assert.equal(requestSchema.safeParse({ message: "Fantasy with clever twists" }).success, true);
  assert.equal(requestSchema.safeParse({ message: " " }).success, false);
  assert.equal(requestSchema.safeParse({ message: "a".repeat(1001) }).success, false);
  assert.equal(requestSchema.safeParse({
    message: "Suggest a book",
    history: Array.from({ length: 9 }, () => ({ role: "user", content: "More" })),
  }).success, false);
  assert.equal(requestSchema.safeParse({ message: "Suggest a book", userId: "another-user" }).success, false);
});

test("Gemini response validation rejects malformed or oversized output", () => {
  assert.deepEqual(parseModelContent(JSON.stringify({
    message: "These could fit.",
    recommendations: [{ openLibraryId: "OL123W", reason: "A close match." }],
  })), {
    message: "These could fit.",
    recommendations: [{ openLibraryId: "OL123W", reason: "A close match." }],
  });
  assert.throws(() => parseModelContent("not json"), { code: "GEMINI_INVALID_RESPONSE" });
  assert.equal(modelResponseSchema.safeParse({
    message: "Here are some books.",
    recommendations: Array.from({ length: 5 }, (_, index) => ({
      openLibraryId: `OL${index}W`,
      reason: "A match",
    })),
  }).success, false);
});

test("recommendation ids are matched to retrieved Open Library records only", () => {
  const books = [
    { openLibraryId: "OL123W", title: "Verified Title", authors: [{ name: "Verified Author" }] },
  ];
  const recommendations = matchVerifiedBooks([
    { openLibraryId: "OL123W", reason: "It matches." },
    { openLibraryId: "OL-fabricated", reason: "Invented book." },
    { openLibraryId: "OL123W", reason: "Duplicate." },
  ], books);

  assert.deepEqual(recommendations, [{ book: books[0], reason: "It matches." }]);
});

test("broad follow-ups use recent context and user can request rereads", () => {
  assert.equal(
    makeRetrievalQuery("more", [{ role: "user", content: "A cozy fantasy with a mystery" }], []),
    "A cozy fantasy with a mystery more",
  );
  assert.equal(isRereadRequest("Recommend something similar to a book I enjoyed"), true);
  assert.equal(isRereadRequest("Suggest a new mystery novel"), false);
});

test("personalization queries use only the verified current user's genres and reading data", async () => {
  const originalFindUser = prisma.user.findUnique;
  const originalFindReadEntries = prisma.readingEntry.findMany;
  let userQuery;
  let readQuery;
  prisma.user.findUnique = async (args) => {
    userQuery = args;
    return {
      genres: [{ genre: "Fantasy" }],
      readingEntries: [{
        status: "CURRENTLY_READING",
        personalRating: null,
        shelf: { status: "CURRENTLY_READING" },
        book: { openLibraryId: "OL1W", title: "Current Book", authorNames: ["Reader Author"] },
      }],
    };
  };
  prisma.readingEntry.findMany = async (args) => {
    readQuery = args;
    return [{ book: { openLibraryId: "OL2W" } }];
  };

  try {
    const data = await loadPersonalization("verified-user");
    assert.equal(userQuery.where.id, "verified-user");
    assert.equal(readQuery.where.ownerId, "verified-user");
    assert.deepEqual(readQuery.where.shelf, { status: "READ" });
    assert.deepEqual(data.genres, ["Fantasy"]);
    assert.deepEqual(data.readBooks, ["OL2W"]);
    assert.equal(data.readingContext[0].title, "Current Book");
    assert.equal(JSON.stringify(data).includes("notes"), false);
  } finally {
    prisma.user.findUnique = originalFindUser;
    prisma.readingEntry.findMany = originalFindReadEntries;
  }
});

test("chat endpoint reports missing Gemini configuration without calling a provider", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  try {
    await chat({ body: { message: "Suggest a fantasy book" } }, response);
    assert.equal(response.statusCode, 503);
    assert.match(response.body.message, /GEMINI_API_KEY/);
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("guest chat is rate limited without trusting a client user id", () => {
  const ip = `test-${Date.now()}`;
  const makeResponse = () => ({
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set() {},
    json() {},
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = makeResponse();
    let continued = false;
    recommendationRateLimit({ ip, body: { userId: "ignored" } }, response, () => { continued = true; });
    assert.equal(continued, true);
  }
  const limitedResponse = makeResponse();
  recommendationRateLimit({ ip, body: { userId: "ignored" } }, limitedResponse, () => assert.fail("Guest bucket should be limited"));
  assert.equal(limitedResponse.statusCode, 429);
});

test("Open Library helper returns valid successful JSON and accepts empty result sets", async () => {
  const result = await fetchOpenLibraryJson("https://openlibrary.org/search.json", {
    retries: 0,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ numFound: 0, docs: [] }),
    }),
  });
  assert.deepEqual(result, { numFound: 0, docs: [] });

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ numFound: 0, docs: [] }),
  });
  try {
    const emptySearch = await searchOpenLibrary({ query: "no matching titles" });
    assert.deepEqual(emptySearch.docs, []);
    assert.equal(emptySearch.numFound, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test("Open Library retries a transient connect failure once, then succeeds", async () => {
  let calls = 0;
  const result = await fetchOpenLibraryJson("https://openlibrary.org/search.json", {
    retries: 1,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test("Open Library timeout is bounded and retries no more than configured", async () => {
  let calls = 0;
  await assert.rejects(fetchOpenLibraryJson("https://openlibrary.org/search.json", {
    timeoutMs: 5,
    retries: 1,
    fetchImpl: async (_url, { signal }) => {
      calls += 1;
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    },
  }), (error) => error.code === "OPEN_LIBRARY_TIMEOUT");
  assert.equal(calls, 2);
});

test("Open Library HTTP and malformed JSON failures are explicit and not retried", async () => {
  let httpCalls = 0;
  await assert.rejects(fetchOpenLibraryJson("https://openlibrary.org/work.json", {
    retries: 2,
    fetchImpl: async () => {
      httpCalls += 1;
      return { ok: false, status: 404 };
    },
  }), (error) => error instanceof OpenLibraryError
    && error.code === "OPEN_LIBRARY_HTTP_ERROR"
    && error.upstreamStatus === 404);
  assert.equal(httpCalls, 1);

  let jsonCalls = 0;
  await assert.rejects(fetchOpenLibraryJson("https://openlibrary.org/search.json", {
    retries: 2,
    fetchImpl: async () => {
      jsonCalls += 1;
      return { ok: true, json: async () => { throw new SyntaxError("bad json"); } };
    },
  }), (error) => error.code === "OPEN_LIBRARY_INVALID_JSON");
  assert.equal(jsonCalls, 1);
});

test("Book Buddy reports Open Library and Gemini upstream failures without internal details", () => {
  const makeResponse = () => ({
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  });

  const catalogResponse = makeResponse();
  sendChatError(Object.assign(new Error("internal network detail"), {
    code: "OPEN_LIBRARY_UNAVAILABLE",
    upstreamCode: "OPEN_LIBRARY_TIMEOUT",
  }), catalogResponse);
  assert.equal(catalogResponse.statusCode, 504);
  assert.match(catalogResponse.body.message, /Live book verification/);
  assert.doesNotMatch(JSON.stringify(catalogResponse.body), /internal network detail/);

  const providerResponse = makeResponse();
  sendChatError(Object.assign(new Error("sensitive provider detail"), { code: "GEMINI_TIMEOUT" }), providerResponse);
  assert.equal(providerResponse.statusCode, 504);
  assert.doesNotMatch(JSON.stringify(providerResponse.body), /sensitive provider detail/);
});

test("Gemini retries one transient provider failure but not credential failures", async () => {
  let transientCalls = 0;
  const result = await invokeWithRetry(async () => {
    transientCalls += 1;
    if (transientCalls === 1) throw Object.assign(new Error("service unavailable"), { status: 503 });
    return "ok";
  }, { retries: 1 });
  assert.equal(result, "ok");
  assert.equal(transientCalls, 2);

  let credentialCalls = 0;
  await assert.rejects(invokeWithRetry(async () => {
    credentialCalls += 1;
    throw Object.assign(new Error("invalid key"), { status: 401 });
  }, { retries: 1 }), { status: 401 });
  assert.equal(credentialCalls, 1);
});

test("Gemini response parsing accepts block-array content and fenced JSON, and ignores thinking blocks", () => {
  const payload = { message: "These could fit.", recommendations: [{ openLibraryId: "OL1W", reason: "Close match." }] };
  assert.deepEqual(parseModelContent([
    { type: "thinking", text: "internal reasoning that must be ignored" },
    { type: "text", text: JSON.stringify(payload) },
  ]), payload);
  assert.deepEqual(parseModelContent("```json\n" + JSON.stringify(payload) + "\n```"), payload);
  assert.throws(() => parseModelContent(""), { code: "GEMINI_INVALID_RESPONSE" });
  assert.throws(() => parseModelContent(undefined), { code: "GEMINI_INVALID_RESPONSE" });
});

test("Gemini provider errors are classified and logged without leaking the API key", () => {
  assert.equal(isModelUnavailableError(Object.assign(new Error("models/x is not found for API version v1beta"), { status: 404 })), true);
  assert.equal(isOverloadedError(Object.assign(new Error("The model is overloaded"), { status: 503 })), true);
  assert.equal(isCredentialError(Object.assign(new Error("API key not valid"), { status: 400 })), true);
  assert.equal(isCredentialError(Object.assign(new Error("something else"), { status: 500 })), false);

  const described = describeProviderError(Object.assign(
    new Error("failed https://x.googleapis.com/v1?key=AIzaSyA1234567890123456789012345 now"),
    { status: 400 },
  ));
  assert.match(described, /status=400/);
  assert.doesNotMatch(described, /AIza/);
});

test("Open Library sends a User-Agent and retries 429 once", async () => {
  let calls = 0;
  let seenHeaders;
  const result = await fetchOpenLibraryJson("https://openlibrary.org/search.json", {
    retries: 1,
    fetchImpl: async (_url, options) => {
      calls += 1;
      seenHeaders = options.headers;
      if (calls === 1) return { ok: false, status: 429 };
      return { ok: true, json: async () => ({ fine: true }) };
    },
  });
  assert.deepEqual(result, { fine: true });
  assert.equal(calls, 2);
  assert.match(seenHeaders["User-Agent"], /ShelfLife/);
});

test("search plan turns chat sentences into genre, reference and keyword searches", () => {
  assert.deepEqual(buildSearchPlan("Recommend a fantasy book with clever twists."), {
    reference: null,
    genres: ["fantasy"],
    keywords: ["clever", "twists"],
  });
  const harry = buildSearchPlan("recommend me something like harry potter");
  assert.equal(harry.reference, "harry potter");
  assert.deepEqual(harry.keywords.includes("recommend"), false);
  assert.equal(buildSearchPlan("something like The Lord of the Rings series").reference, "the lord of the rings");
  assert.equal(buildSearchPlan("books similar to Pride and Prejudice but funnier").reference, "pride and prejudice");
  assert.equal(buildSearchPlan("I like fantasy").reference, null);
  assert.deepEqual(buildSearchPlan("a cozy sci-fi mystery").genres.sort(), ["mystery", "science fiction"]);
});

test("retrieval never sends the raw sentence and finds books by genre", async () => {
  const sent = [];
  const fakeSearch = async (query, sort) => {
    sent.push(query);
    if (query === 'subject:"fantasy"') {
      return Array.from({ length: 12 }, (_, index) => ({ openLibraryId: `OL${index}W`, title: `Fantasy ${index}`, subjects: [] }));
    }
    return []; // sentences match nothing on Open Library
  };
  const books = await retrieveCandidates("Recommend a fantasy book with clever twists.", { search: fakeSearch });
  assert.equal(books.length, 12);
  assert.equal(sent.includes("Recommend a fantasy book with clever twists."), false);
  assert.deepEqual(sent, ['subject:"fantasy"']);
});

test("'like <book>' looks the book up, borrows its subjects and excludes the book itself", async () => {
  const sent = [];
  const fakeSearch = async (query) => {
    sent.push(query);
    if (query === "harry potter") {
      return [{ openLibraryId: "OLHP1W", title: "Harry Potter and the Stone", subjects: ["Wizards", "Magic", "Accessible book", "Potter, Harry (Fictitious character)"] }];
    }
    if (query === 'subject:"wizards" subject:"magic"' || query === 'subject:"magic" subject:"wizards"') {
      return [
        { openLibraryId: "OLHP2W", title: "Harry Potter and the Chamber", subjects: [] },
        ...Array.from({ length: 10 }, (_, index) => ({ openLibraryId: `OLX${index}W`, title: `Magic School ${index}`, subjects: [] })),
      ];
    }
    return [];
  };
  const books = await retrieveCandidates("recommend me something like harry potter", { search: fakeSearch });
  assert.equal(books.length, 10);
  assert.equal(books.some((book) => /harry potter/i.test(book.title)), false);
  assert.equal(sent.some((query) => /accessible|fictitious/i.test(query)), false);
});

test("retrieval throws only when every search failed, and returns [] when searches work but find nothing", async () => {
  const failure = Object.assign(new Error("down"), { code: "OPEN_LIBRARY_UNAVAILABLE", upstreamCode: "OPEN_LIBRARY_TIMEOUT" });
  await assert.rejects(retrieveCandidates("fantasy", { search: async () => { throw failure; } }), { code: "OPEN_LIBRARY_UNAVAILABLE" });
  assert.deepEqual(await retrieveCandidates("fantasy", { search: async () => [] }), []);
});

test("suggestion matching needs the right title AND author", () => {
  const book = (title, ...names) => ({ openLibraryId: "OL1W", title, authors: names.map((name) => ({ name })) });
  const wanted = { title: "The Lightning Thief", author: "Rick Riordan" };
  assert.ok(scoreMatch(book("The Lightning Thief", "Rick Riordan"), wanted) > scoreMatch(book("Percy Jackson: The Lightning Thief", "Rick Riordan"), wanted));
  assert.ok(scoreMatch(book("Lightning Thief", "Rick Riordan"), wanted) > 0, "leading 'The' is ignored");
  assert.equal(scoreMatch(book("The Lightning Thief", "Someone Else"), wanted), 0, "same title, different author");
  assert.equal(scoreMatch(book("The Lightning Rod", "Rick Riordan"), wanted), 0, "different title");
  assert.ok(scoreMatch(book("Circe", "Madeline Miller"), { title: "Circe", author: "Madeline Miller" }) > 0);
  assert.ok(scoreMatch(book("Caf\u00e9 Society", "J. K. Rowling"), { title: "Cafe Society", author: "JK Rowling" }) > 0, "accents and initials");
});

test("verifySuggestions keeps only books Open Library has, in order, without duplicates", async () => {
  const catalog = {
    "The Lightning Thief": [
      { openLibraryId: "OL10W", title: "The Lightning Thief", authors: [{ name: "Rick Riordan" }], readingLogCount: 500 },
    ],
    "Circe": [
      { openLibraryId: "OL20W", title: "Circe", authors: [{ name: "Madeline Miller" }], readingLogCount: 300 },
    ],
  };
  const searched = [];
  const fakeSearch = async (query) => {
    searched.push(query);
    const title = Object.keys(catalog).find((name) => query.includes(name));
    return title ? catalog[title] : [];
  };
  const verified = await verifySuggestions([
    { title: "The Lightning Thief", author: "Rick Riordan", reason: "Greek myths at a camp." },
    { title: "A Book That Does Not Exist", author: "Nobody Real", reason: "Invented." },
    { title: "Circe", author: "Madeline Miller", reason: "Mythic retelling." },
    { title: "Circe", author: "Madeline Miller", reason: "Duplicate." },
  ], { search: fakeSearch });
  assert.deepEqual(verified.map((entry) => entry.book.openLibraryId), ["OL10W", "OL20W"]);
  assert.equal(verified[0].reason, "Greek myths at a camp.");
});

test("verifySuggestions reports Open Library as down only when every lookup failed", async () => {
  const down = async () => { throw Object.assign(new Error("boom"), { code: "OPEN_LIBRARY_TIMEOUT" }); };
  await assert.rejects(
    verifySuggestions([{ title: "Dune", author: "Frank Herbert", reason: "r" }, { title: "Emma", author: "Jane Austen", reason: "r" }], { search: down }),
    { code: "OPEN_LIBRARY_UNAVAILABLE", upstreamCode: "OPEN_LIBRARY_TIMEOUT" },
  );
  let calls = 0;
  const flaky = async () => { calls += 1; if (calls <= 2) throw new Error("boom"); return []; };
  assert.deepEqual(await verifySuggestions([{ title: "Dune", author: "Frank Herbert", reason: "r" }], { search: flaky, concurrency: 1 }).catch((e) => e.code), "OPEN_LIBRARY_UNAVAILABLE");
});

test("suggestion prompt carries the reader's request and reading context, and the schema is lenient on extras", () => {
  const messages = suggestionMessages({
    message: "greek mythology fantasy like harry potter",
    history: [],
    personalization: { genres: ["Fantasy"], preferredBooks: [{ title: "Loved Book", authors: ["A"] }], readingContext: [{ title: "Read Book", authors: ["B"], status: "READ", rating: 5 }], readBooks: ["OL9W"] },
    preferences: { genres: [] },
  });
  const human = messages[messages.length - 1][1];
  assert.match(human, /greek mythology/);
  assert.match(human, /Read Book/);
  assert.equal(suggestionResponseSchema.safeParse({
    message: "Here you go.",
    suggestions: [{ title: "Circe", author: "Madeline Miller", reason: "Fits.", extra: "ignored" }],
  }).success, true);
  assert.equal(suggestionResponseSchema.safeParse({ message: "Hi", suggestions: [{ title: "", author: "X", reason: "r" }] }).success, false);
  assert.deepEqual(parseModelContent(JSON.stringify({ message: "Ask me more.", suggestions: [] }), suggestionResponseSchema), { message: "Ask me more.", suggestions: [] });
});
