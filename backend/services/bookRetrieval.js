/*
  Turns a chat message into Open Library searches and returns candidate books.

  Why this exists: Open Library's /search.json matches the words you send against book
  metadata (title, author, subject...). Sending a whole sentence such as
  "Recommend a fantasy book with clever twists" matches nothing, because no book contains
  those words. So we extract what the reader actually means:

    - a genre            -> subject:"fantasy"   (sorted by popularity)
    - "like <a book>"    -> look that book up, borrow its subjects, search by those
    - leftover keywords  -> plain keyword search as a last resort
*/
const { searchOpenLibrary, transformSearchResult } = require("./openLibraryService");

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_SEARCH_CACHE_ENTRIES = 100;
const MIN_CANDIDATES = 10;
const searchCache = new Map();

const STOPWORDS = new Set((
  "a an the and or but of for to with without in on at from by as into about over under "
  + "me my mine i im ive id we you your it its this that these those is are was were be been am "
  + "do does did can could would should will shall may might must please "
  + "some something anything any one ones another other more most very really just also "
  + "book books novel novels story stories read reading reader recommend recommended recommendation "
  + "recommendations suggest suggestion suggestions give show find want wanna need looking look "
  + "like similar good great best new nice cool surprise what which who whom how where when why "
  + "have has had get got make makes with some kind kinds type types sort"
).split(/\s+/));

// [pattern in the message, subject to search for in Open Library]
const GENRE_PATTERNS = [
  [/\b(sci[- ]?fi|science fiction)\b/, "science fiction"],
  [/\bfantasy\b/, "fantasy"],
  [/\b(mystery|mysteries|whodunit|detective)\b/, "mystery"],
  [/\b(thriller|thrillers|suspense)\b/, "thriller"],
  [/\b(romance|romances|romantic)\b/, "romance"],
  [/\bhorror\b/, "horror"],
  [/\bhistorical\b/, "historical fiction"],
  [/\bdystopi(?:a|an|as)\b/, "dystopia"],
  [/\b(young adult|ya)\b/, "young adult"],
  [/\b(biography|biographies|memoir|memoirs)\b/, "biography"],
  [/\bself[- ]help\b/, "self-help"],
  [/\bcrime\b/, "crime"],
  [/\b(humou?r|funny|comedy)\b/, "humor"],
  [/\bclassics?\b/, "classic literature"],
  [/\badventure\b/, "adventure"],
  [/\b(graphic novels?|comics?|manga)\b/, "comics"],
  [/\bpoetry\b/, "poetry"],
];

const REFERENCE_PATTERN = /\b(?:something |anything |books? |stuff )?(?:like|similar to|reminds? me of|in the (?:style|vein) of|fans? of|after reading|loved|enjoyed)\s+(.+)$/i;

// Subjects that say nothing about content (library admin tags, people, places...).
const JUNK_SUBJECT = /accessible|daisy|library|large type|lending|reading level|protected|overdrive|open library|^fiction$|juvenile|in fiction|nyt:|award|\(|\)|,|:|\d/i;

const normalize = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();

const buildSearchPlan = (request) => {
  const text = normalize(request);

  let reference = null;
  const referenceMatch = String(request || "").match(REFERENCE_PATTERN);
  if (referenceMatch) {
    const phrase = normalize(referenceMatch[1])
      .replace(/^(?:a|an|the)\s+(?:book|novel|series)\s+(?:called|named|titled)\s+/, "")
      .replace(/\s+(?:but|except|only|though|yet|that|which|more|less|minus|without)\s+.*$/, "")
      .replace(/\s+(?:series|books?|novels?|saga|trilogy)$/, "")
      .trim();
    // Keep it only if it looks like a title: 1-6 words that are not just a genre.
    const looksLikeGenre = GENRE_PATTERNS.some(([pattern]) => pattern.test(phrase)) && phrase.split(" ").length <= 2;
    if (phrase && phrase.split(" ").length <= 6 && !looksLikeGenre) reference = phrase;
  }

  const genres = GENRE_PATTERNS.filter(([pattern]) => pattern.test(text)).map(([, subject]) => subject);

  const genreWords = new Set(GENRE_PATTERNS.flatMap(([pattern]) => text.match(pattern) || []).flatMap((m) => String(m).split(" ")));
  const keywords = [...new Set(text.split(" ").filter((word) => (
    word.length > 2 && !STOPWORDS.has(word) && !genreWords.has(word)
  )))].slice(0, 5);

  return { reference, genres, keywords };
};

const subjectQuery = (subjects) => subjects
  .map((subject) => `subject:"${subject.replace(/"/g, "")}"`)
  .join(" ");

const pickSubjects = (books, limit = 2) => {
  const counts = new Map();
  books.forEach((book) => (book.subjects || []).forEach((raw) => {
    const subject = String(raw).trim().toLowerCase();
    if (!subject || subject.length > 30 || JUNK_SUBJECT.test(subject)) return;
    counts.set(subject, (counts.get(subject) || 0) + 1);
  }));
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([subject]) => subject);
};

const cachedSearch = async (query, sort = "relevance") => {
  const key = `${sort}|${query.toLowerCase().trim()}`;
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.books;

  let result;
  try {
    result = await searchOpenLibrary({ query, limit: 20, sort });
  } catch (cause) {
    // Open Library is slow/flaky at times: an expired cache entry beats an error.
    if (cached?.books?.length) {
      console.warn(`Open Library search failed (${cause.code || "UPSTREAM_ERROR"}); serving cached results`);
      return cached.books;
    }
    const error = new Error("Open Library retrieval failed");
    error.code = "OPEN_LIBRARY_UNAVAILABLE";
    error.upstreamCode = cause.code;
    error.cause = cause;
    throw error;
  }
  const books = (result.docs || []).map(transformSearchResult).filter((book) => book.openLibraryId);
  if (searchCache.size >= MAX_SEARCH_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(key, { books, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
  return books;
};

/*
  Returns up to ~20 candidate books. Throws the Open Library error only if every search
  failed; if searches worked but found nothing, returns [].
  `search` is injectable for tests.
*/
const retrieveCandidates = async (request, { search = cachedSearch, favoriteGenres = [] } = {}) => {
  const plan = buildSearchPlan(request);
  const collected = new Map();
  let succeeded = 0;
  let firstError = null;

  const run = async (query, sort) => {
    try {
      const books = await search(query, sort);
      succeeded += 1;
      console.log(`Book Buddy search [${sort}] ${query} -> ${books.length} results`);
      return books;
    } catch (error) {
      firstError = firstError || error;
      console.warn(`Book Buddy search [${sort}] ${query} failed: ${error.upstreamCode || error.code || error.message}`);
      return [];
    }
  };
  const isReference = (book) => Boolean(plan.reference) && book.title.toLowerCase().includes(plan.reference);
  const add = (books) => books.forEach((book) => {
    if (!isReference(book) && !collected.has(book.openLibraryId)) collected.set(book.openLibraryId, book);
  });
  const enough = () => collected.size >= MIN_CANDIDATES;

  if (plan.reference) {
    const referenceBooks = (await run(plan.reference, "relevance")).filter(isReference).slice(0, 3);
    const subjects = pickSubjects(referenceBooks, 3);
    if (subjects.length >= 2) add(await run(subjectQuery(subjects.slice(0, 2)), "readinglog"));
    if (!enough() && subjects.length) add(await run(subjectQuery(subjects.slice(0, 1)), "readinglog"));
  }

  for (const genre of plan.genres.slice(0, 2)) {
    if (enough()) break;
    add(await run(subjectQuery([genre]), "readinglog"));
  }

  if (!enough() && plan.keywords.length) add(await run(plan.keywords.join(" "), "relevance"));

  // Nothing specific asked ("surprise me"): fall back to the reader's favourite genres.
  if (collected.size === 0 && plan.genres.length === 0 && !plan.reference) {
    for (const genre of favoriteGenres.slice(0, 2)) {
      if (enough()) break;
      add(await run(subjectQuery([String(genre).toLowerCase()]), "readinglog"));
    }
  }

  // Still nothing and nothing specific asked: offer popular fiction rather than an empty answer.
  if (collected.size === 0 && !plan.reference && plan.genres.length === 0 && plan.keywords.length === 0) {
    add(await run(subjectQuery(["fiction"]), "readinglog"));
  }

  if (succeeded === 0 && firstError) throw firstError;
  return [...collected.values()].slice(0, 24);
};

module.exports = {
  buildSearchPlan,
  retrieveCandidates,
  cachedSearch,
  pickSubjects,
  subjectQuery,
};
