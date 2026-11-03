/*
  Quick health check for the Book Buddy dependencies.

    npm run check:ai

  Calls Gemini and Open Library directly (no LangChain, no database) and prints the
  exact HTTP status / message, so you can see which side is failing and why.
*/
require("dotenv").config();

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const { getModelChain, getThinkingConfig } = require("../services/geminiProvider");

const chain = getModelChain();
const model = chain[0];

const redact = (text) => String(text)
  .replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]")
  .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]");

const timed = async (label, run) => {
  const started = Date.now();
  try {
    const detail = await run();
    console.log(`  OK   ${label} (${Date.now() - started} ms)${detail ? ` - ${detail}` : ""}`);
    return true;
  } catch (error) {
    const cause = error?.cause?.code ? ` [${error.cause.code}]` : "";
    console.log(`  FAIL ${label} (${Date.now() - started} ms) - ${redact(error?.message || error)}${cause}`);
    return false;
  }
};

const geminiGenerate = async (modelName, thinkingLevel) => {
  const response = await fetch(`${GEMINI_BASE}/models/${modelName}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: 'Reply with JSON: {"ok": true}' }] }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
        ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${body?.error?.status || ""}: ${body?.error?.message || "no message"}`);
  }
  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  return `replied: ${text.trim().slice(0, 60) || "(empty)"} | finishReason=${body?.candidates?.[0]?.finishReason}`;
};

const checkGemini = async () => {
  console.log("\nGemini");
  if (!process.env.GEMINI_API_KEY) {
    console.log("  FAIL GEMINI_API_KEY is not set in backend/.env");
    return;
  }

  await timed("list models available to this key", async () => {
    const response = await fetch(`${GEMINI_BASE}/models?pageSize=200`, {
      signal: AbortSignal.timeout(15000),
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`HTTP ${response.status} ${body?.error?.status || ""}: ${body?.error?.message || "no message"}`);
    const usable = (body.models || [])
      .filter((item) => (item.supportedGenerationMethods || []).includes("generateContent"))
      .map((item) => item.name.replace(/^models\//, ""));
    const flash = usable.filter((name) => /flash/.test(name) && !/image|tts|live|audio/.test(name));
    console.log(`       flash models for this key: ${flash.join(", ") || "(none)"}`);
    if (!usable.includes(model)) console.log(`       NOTE: configured model "${model}" is NOT in this list`);
    return `${usable.length} models support generateContent`;
  });

  console.log(`       app will try, in order: ${chain.join(" -> ")}`);
  for (const name of chain) {
    const thinking = getThinkingConfig(name)?.thinkingLevel;
    await timed(`"${name}"${thinking ? ` (thinkingLevel=${thinking}, as the app sends it)` : ""}`, () => geminiGenerate(name, thinking));
  }
};

const checkOpenLibrary = async () => {
  console.log("\nOpen Library");
  const headers = {
    Accept: "application/json",
    "User-Agent": process.env.OPEN_LIBRARY_USER_AGENT || "ShelfLife/1.0 (book tracking app)",
  };
  const search = async (query, fields) => {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "20");
    if (fields) url.searchParams.set("fields", fields);
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    return `${body.docs?.length ?? 0} results`;
  };
  await timed("search 'cozy fantasy' (lean fields, what the app uses)", () => search(
    "cozy fantasy",
    "key,title,author_name,author_key,first_publish_year,cover_i,subject,publisher,number_of_pages_median,first_sentence,language,ratings_count,ratings_average,readinglog_count,edition_count",
  ));
  await timed("search 'cozy fantasy' (no fields, for comparison)", () => search("cozy fantasy"));
};

const checkRetrieval = async () => {
  console.log("\nBook Buddy retrieval (what the chat actually searches for)");
  const { retrieveCandidates, buildSearchPlan } = require("../services/bookRetrieval");
  for (const message of ["Recommend a fantasy book with clever twists.", "recommend me something like harry potter"]) {
    console.log(`  "${message}"  plan: ${JSON.stringify(buildSearchPlan(message))}`);
    await timed("candidates found", async () => {
      const books = await retrieveCandidates(message);
      return `${books.length} books, e.g. ${books.slice(0, 3).map((book) => book.title).join(" | ") || "(none)"}`;
    });
  }
};

(async () => {
  await checkGemini();
  await checkOpenLibrary();
  await checkRetrieval();
  console.log("");
})();
