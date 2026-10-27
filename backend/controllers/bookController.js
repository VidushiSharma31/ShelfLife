const {
  searchOpenLibrary,
  transformSearchResult,
  getOpenLibraryBook,
} = require("../services/openLibraryService");


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

    const books = data.docs.map(transformSearchResult);

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
    console.error("Book search error:", error);

    res.status(500).json({
      message: "Failed to search books",
    });
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
    console.error("Book details error:", error);

    res.status(500).json({
      message: "Failed to fetch book details",
    });
  }
};


module.exports = {
  searchBooks,
  getBookById,
};