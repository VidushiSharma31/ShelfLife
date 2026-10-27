const OPEN_LIBRARY_URL = "https://openlibrary.org";

const SEARCH_FIELDS = [
  "key",
  "title",
  "author_name",
  "author_key",
  "first_publish_year",
  "cover_i",
  "subject",
  "isbn",
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

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Open Library returned ${response.status}`
    );
  }

  return response.json();
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
  const response = await fetch(
    `${OPEN_LIBRARY_URL}/works/${openLibraryId}.json`
  );

  if (!response.ok) {
    throw new Error(
      `Open Library returned ${response.status}`
    );
  }

  const work = await response.json();

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
        const authorResponse = await fetch(
          `${OPEN_LIBRARY_URL}${authorKey}.json`
        );

        if (!authorResponse.ok) {
          throw new Error(
            `Author request failed: ${authorResponse.status}`
          );
        }

        const author = await authorResponse.json();

        return {
          name: author.name || "Unknown Author",
          openLibraryId: authorKey.replace(
            "/authors/",
            ""
          ),
        };
      } catch (error) {
        console.error(
          `Failed to fetch author ${authorKey}:`,
          error.message
        );

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
};