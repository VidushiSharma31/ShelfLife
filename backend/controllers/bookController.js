const {
  searchOpenLibrary,
  transformSearchResult,
  getOpenLibraryBook,
  OpenLibraryError,
} = require("../services/openLibraryService");

const sendCatalogError = (res, error, operation) => {
  const code = error instanceof OpenLibraryError ? error.code : "OPEN_LIBRARY_UPSTREAM_ERROR";
  console.error(`Open Library ${operation} failed: ${code}`);

  if (code === "OPEN_LIBRARY_ABORTED") {
    return res.status(499).json({ code, message: "The book catalog request was cancelled." });
  }
  if (code === "OPEN_LIBRARY_TIMEOUT") {
    return res.status(504).json({ code, message: "The book catalog is taking too long to respond. Please try again." });
  }
  if (code === "OPEN_LIBRARY_HTTP_ERROR" && error.upstreamStatus === 404) {
    return res.status(404).json({ code: "BOOK_NOT_FOUND", message: "This book could not be found in the catalog." });
  }
  if (code === "OPEN_LIBRARY_HTTP_ERROR" && error.upstreamStatus === 429) {
    return res.status(503).json({ code, message: "The book catalog is busy. Please try again shortly." });
  }
  return res.status(502).json({ code, message: "The book catalog is temporarily unavailable. Please try again shortly." });
};

/*
  GET /api/books/search?q=harry+potter
*/
const searchBooks = async (req, res) => {
  try {
    const query = req.query.q?.trim();

    const page = Number(req.query.page) || 1;

    const limit = Math.min(
      Number(req.query.limit) || 20,
      50
    );

    const sort = req.query.sort || "relevance";

    if (!query) {
      return res.status(400).json({
        message: "Search query is required",
      });
    }
    if (query.length > 200 || !Number.isInteger(page) || page < 1) {
      return res.status(400).json({ message: "Search query or page is invalid" });
    }

    const validSorts = [
      "relevance",
      "editions",
      "firstPublished",
      "mostRecent",
      "topRated",
      "readingLog",
      "trending",
      "random",
    ];

    if (!validSorts.includes(sort)) {
      return res.status(400).json({
        message: "Invalid sort option",
      });
    }

    const data = await searchOpenLibrary({
      query,
      page,
      limit,
      sort,
    });

    const books = data.docs.map(transformSearchResult).filter((book) => book.openLibraryId);

    res.json({
      books,

      query,

      totalResults: data.numFound,

      pagination: {
        page,
        limit,
        totalPages: Math.ceil(
          data.numFound / limit
        ),
      },

      sort,
    });
  } catch (error) {
    return sendCatalogError(res, error, "search");
  }
};

const getBookById = async (req, res) => {
  try {
    const { openLibraryId } = req.params;

    const book = await getOpenLibraryBook(openLibraryId);

    res.json({
      openLibraryId: book.key?.replace("/works/", ""),
      title: book.title || "Unknown Title",

      description:
        typeof book.description === "string"
          ? book.description
          : book.description?.value || "",

      subjects: book.subjects || [],

      coverUrl: book.covers?.[0]
        ? `https://covers.openlibrary.org/b/id/${book.covers[0]}-L.jpg`
        : "",

      firstPublishYear:
        book.first_publish_date || null,

      authors: book.authors || [],

      source: "openlibrary",
    });
  } catch (error) {
    return sendCatalogError(res, error, "work lookup");
  }
};


module.exports = {
  searchBooks,
  getBookById,
  sendCatalogError,
};