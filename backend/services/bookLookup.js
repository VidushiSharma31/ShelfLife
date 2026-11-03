/*
  Verifies AI-suggested books ({ title, author }) against Open Library.

  The model may only suggest; a book is shown to the reader only if Open Library has a
  matching record. That keeps the model's knowledge (good taste) while the app keeps
  control of what is real (no invented titles, real covers and metadata).
*/
const { searchOpenLibrary, transformSearchResult } = require("./openLibraryService");

const LOOKUP_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_LOOKUP_CACHE_ENTRIES = 300;
const LOOKUP_CONCURRENCY = 4;
const lookupCache = new Map();

const clean = (text) => String(text || "")
  .toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const normalizeTitle = (title) => clean(String(title).replace(/\(.*?\)/g, " ")).replace(/^(?:the|a|an)\s+/, "");

const surnameOf = (author) => clean(author).split(" ").filter(Boolean).pop() || "";

/*
  0 = not the same book. Higher = better match.
  The title must match (exactly, or one is a prefix/substring of the other, which covers
  subtitles and series suffixes). When an author is given it must match too, otherwise a
  different book that happens to share the title would slip through.
*/
const scoreMatch = (book, suggestion) => {
  const wanted = normalizeTitle(suggestion.title);
  const found = normalizeTitle(book.title);
  if (!wanted || !found) return 0;

  let score;
  if (found === wanted) score = 10;
  else if (found.startsWith(wanted) || wanted.startsWith(found)) score = 7;
  else if (found.includes(wanted) || wanted.includes(found)) score = 4;
  else return 0;

  const surname = surnameOf(suggestion.author);
  if (surname) {
    const authorMatches = (book.authors || []).some((author) => clean(author.name).includes(surname));
    if (!authorMatches) return 0;
    score += 5;
  }
  return score;
};

const pickBestMatch = (books, suggestion) => books
  .map((book) => ({ book, score: scoreMatch(book, suggestion) }))
  .filter((entry) => entry.score > 0)
  .sort((left, right) => right.score - left.score
    || (right.book.readingLogCount || 0) - (left.book.readingLogCount || 0)
    || (right.book.editionCount || 0) - (left.book.editionCount || 0))[0]?.book || null;

const quoted = (text) => `"${String(text).replace(/["\\]/g, " ").trim()}"`;

const defaultSearch = async (query) => {
  const result = await searchOpenLibrary({ query, limit: 8, sort: "relevance" });
  return (result.docs || []).map(transformSearchResult).filter((book) => book.openLibraryId);
};

const lookupOne = async (suggestion, search) => {
  const key = `${normalizeTitle(suggestion.title)}|${surnameOf(suggestion.author)}`;
  const cached = lookupCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.book;

  // Precise fielded search first, then a looser one (handles odd title/author spellings).
  const queries = [
    `title:${quoted(suggestion.title)} author:${quoted(suggestion.author)}`,
    `${suggestion.title} ${suggestion.author}`,
  ];
  let book = null;
  for (const query of queries) {
    book = pickBestMatch(await search(query), suggestion);
    if (book) break;
  }

  if (lookupCache.size >= MAX_LOOKUP_CACHE_ENTRIES) lookupCache.delete(lookupCache.keys().next().value);
  // Only cache hits: a miss may just have been a flaky response.
  if (book) lookupCache.set(key, { book, expiresAt: Date.now() + LOOKUP_CACHE_TTL_MS });
  return book;
};

/*
  Returns [{ book, reason, suggestion }] in the model's order, for suggestions that exist on
  Open Library (deduplicated). Throws the Open Library error only if EVERY lookup failed
  (so the caller can report "Open Library is down" rather than "no results").
  `search` is injectable for tests.
*/
const verifySuggestions = async (suggestions, { search = defaultSearch, concurrency = LOOKUP_CONCURRENCY } = {}) => {
  const results = new Array(suggestions.length).fill(null);
  let failures = 0;
  let firstError = null;
  let cursor = 0;

  const worker = async () => {
    while (cursor < suggestions.length) {
      const index = cursor;
      cursor += 1;
      try {
        const book = await lookupOne(suggestions[index], search);
        console.log(`Book Buddy lookup "${suggestions[index].title}" by ${suggestions[index].author} -> ${book ? "found" : "not found"}`);
        results[index] = book;
      } catch (error) {
        failures += 1;
        firstError = firstError || error;
        console.warn(`Book Buddy lookup "${suggestions[index].title}" failed: ${error.code || error.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, suggestions.length) }, worker));

  if (failures === suggestions.length && firstError) {
    const error = new Error("Open Library retrieval failed");
    error.code = "OPEN_LIBRARY_UNAVAILABLE";
    error.upstreamCode = firstError.code;
    error.cause = firstError;
    throw error;
  }

  const seen = new Set();
  return suggestions.flatMap((suggestion, index) => {
    const book = results[index];
    if (!book || seen.has(book.openLibraryId)) return [];
    seen.add(book.openLibraryId);
    return [{ book, reason: suggestion.reason, suggestion }];
  });
};

module.exports = {
  verifySuggestions,
  scoreMatch,
  pickBestMatch,
  normalizeTitle,
};
