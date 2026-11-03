const OPEN_LIBRARY_URL = "https://openlibrary.org";
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 1;
const MAX_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

class OpenLibraryError extends Error {
  constructor(code, message, { upstreamStatus = null, cause = null } = {}) {
    super(message, { cause });
    this.name = "OpenLibraryError";
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

const boundedEnvInteger = (name, fallback, min, max) => {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const getRequestTimeoutMs = () => boundedEnvInteger(
  "OPEN_LIBRARY_TIMEOUT_MS",
  DEFAULT_TIMEOUT_MS,
  1000,
  MAX_TIMEOUT_MS,
);

const getRetryCount = () => boundedEnvInteger(
  "OPEN_LIBRARY_RETRIES",
  DEFAULT_RETRIES,
  0,
  MAX_RETRIES,
);

const isTransientNetworkError = (error) => {
  const code = error?.cause?.code || error?.code;
  if (["UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(code)) {
    return true;
  }
  return error instanceof TypeError && /fetch failed/i.test(error.message);
};

const isTimeoutNetworkError = (error) => {
  const code = error?.cause?.code || error?.code;
  return ["UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "ETIMEDOUT"].includes(code)
    || /timeout/i.test(error?.name || "")
    || /timed out/i.test(error?.message || "");
};

/*
  Open Library asks API clients to identify themselves with a User-Agent
  (app name + a contact), and throttles anonymous traffic harder.
  Set OPEN_LIBRARY_USER_AGENT in .env, e.g. "ShelfLife/1.0 (you@example.com)".
*/
const getRequestHeaders = () => ({
  Accept: "application/json",
  "User-Agent": process.env.OPEN_LIBRARY_USER_AGENT || "ShelfLife/1.0 (book tracking app)",
});

const isRetryableStatus = (status) => status === 408 || status === 429 || status >= 500;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const fetchOpenLibraryJson = async (url, {
  signal,
  timeoutMs = getRequestTimeoutMs(),
  retries = getRetryCount(),
  fetchImpl = fetch,
} = {}) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetchImpl(url, { signal: requestSignal, headers: getRequestHeaders() });
      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        lastError = new OpenLibraryError(
          "OPEN_LIBRARY_HTTP_ERROR",
          `Open Library returned HTTP ${response.status}`,
          { upstreamStatus: response.status },
        );
        if (!retryable || attempt === retries) throw lastError;
      } else {
        try {
          return await response.json();
        } catch (cause) {
          throw new OpenLibraryError(
            "OPEN_LIBRARY_INVALID_JSON",
            "Open Library returned invalid JSON",
            { cause },
          );
        }
      }
    } catch (error) {
      if (error instanceof OpenLibraryError) {
        if (error.code === "OPEN_LIBRARY_HTTP_ERROR" && isRetryableStatus(error.upstreamStatus) && attempt < retries) {
          lastError = error;
        } else {
          throw error;
        }
      } else if (signal?.aborted) {
        throw new OpenLibraryError("OPEN_LIBRARY_ABORTED", "Open Library request was cancelled", { cause: error });
      } else if (timeoutController.signal.aborted) {
        lastError = new OpenLibraryError("OPEN_LIBRARY_TIMEOUT", "Open Library request timed out", { cause: error });
        if (attempt === retries) throw lastError;
      } else if (isTransientNetworkError(error)) {
        const code = isTimeoutNetworkError(error) ? "OPEN_LIBRARY_TIMEOUT" : "OPEN_LIBRARY_NETWORK_ERROR";
        const message = code === "OPEN_LIBRARY_TIMEOUT"
          ? "Open Library request timed out"
          : "Could not connect to Open Library";
        lastError = new OpenLibraryError(code, message, { cause: error });
        if (attempt === retries) throw lastError;
      } else {
        throw new OpenLibraryError("OPEN_LIBRARY_NETWORK_ERROR", "Could not connect to Open Library", { cause: error });
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (attempt < retries) await wait(300 * (2 ** attempt));
  }
  throw lastError || new OpenLibraryError("OPEN_LIBRARY_NETWORK_ERROR", "Could not connect to Open Library");
};

const SEARCH_FIELDS = [
  "key",
  "title",
  "author_name",
  "author_key",
  "first_publish_year",
  "cover_i",
  "subject",
  "publisher",
  "number_of_pages_median",
  "first_sentence",
  "language",
  "ratings_count",
  "ratings_average",
  "readinglog_count",
  "edition_count",
].join(",");


/*
  Open Library's sort values.

  These are the values our frontend will use.
*/
const SORT_OPTIONS = {
  relevance: null,
  editions: "editions",
  firstPublished: "old",
  mostRecent: "new",
  topRated: "rating",
  readingLog: "readinglog",
  trending: "trending",
  random: "random",
};


/*
  Search Open Library
*/
const searchOpenLibrary = async ({
  query,
  page = 1,
  limit = 20,
  sort = "relevance",
  signal,
}) => {
  const url = new URL(`${OPEN_LIBRARY_URL}/search.json`);

  url.searchParams.set("q", query);
  url.searchParams.set("page", page);
  url.searchParams.set("limit", limit);
  url.searchParams.set("fields", SEARCH_FIELDS);

  const sortValue = SORT_OPTIONS[sort];

  if (sortValue) {
    url.searchParams.set("sort", sortValue);
  }

  const result = await fetchOpenLibraryJson(url, { signal });
  if (!result || !Array.isArray(result.docs) || !Number.isFinite(result.numFound)) {
    throw new OpenLibraryError("OPEN_LIBRARY_INVALID_RESPONSE", "Open Library returned an invalid search response");
  }
  return result;
};


/*
  Convert Open Library data into the format
  our frontend understands.
*/
const transformSearchResult = (book) => {
  const openLibraryId = book.key?.replace("/works/", "");

  return {
    openLibraryId,

    title: book.title || "Unknown Title",

    authors: (book.author_name || []).map(
      (name, index) => ({
        name,
        openLibraryId:
          book.author_key?.[index] || null,
      })
    ),

    coverUrl: book.cover_i
      ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`
      : "",

    firstPublishYear:
      book.first_publish_year || null,

    subjects: book.subject
      ? book.subject.slice(0, 10)
      : [],

    ratingsCount:
      book.ratings_count || 0,

    ratingsAverage:
      book.ratings_average || 0,

    readingLogCount:
      book.readinglog_count || 0,

    editionCount:
      book.edition_count || 0,

    publisher:
      book.publisher?.[0] || "",

    pageCount:
      book.number_of_pages_median || null,

    description:
      Array.isArray(book.first_sentence)
        ? book.first_sentence.join(" ")
        : book.first_sentence || "",

    language:
      book.language?.[0] || null,

    source: "openlibrary",
  };
};

const getOpenLibraryBook = async (openLibraryId) => {
  const work = await fetchOpenLibraryJson(`${OPEN_LIBRARY_URL}/works/${openLibraryId}.json`);
  if (!work || typeof work !== "object" || Array.isArray(work) || !work.key) {
    throw new OpenLibraryError("OPEN_LIBRARY_INVALID_RESPONSE", "Open Library returned an invalid work response");
  }

  // Open Library Work API returns author references
  // instead of author names.
  const authors = await Promise.all(
    (work.authors || []).map(async (authorEntry) => {
      const authorKey = authorEntry.author?.key;

      if (!authorKey) {
        return {
          name: "Unknown Author",
          openLibraryId: null,
        };
      }

      try {
        const author = await fetchOpenLibraryJson(`${OPEN_LIBRARY_URL}${authorKey}.json`);

        return {
          name: author.name || "Unknown Author",
          openLibraryId: authorKey.replace(
            "/authors/",
            ""
          ),
        };
      } catch (error) {
        console.error(`Open Library author lookup failed: ${error.code || "UPSTREAM_ERROR"}`);

        return {
          name: "Unknown Author",
          openLibraryId: null,
        };
      }
    })
  );

  return {
    ...work,
    authors,
  };
};


module.exports = {
  searchOpenLibrary,
  transformSearchResult,
  getOpenLibraryBook,
  OpenLibraryError,
  fetchOpenLibraryJson,
};