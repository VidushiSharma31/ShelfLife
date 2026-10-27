const SUPPORTED_GENRES = [
  "Fantasy",
  "Science Fiction",
  "Mystery",
  "Thriller",
  "Romance",
  "Historical Fiction",
  "Horror",
  "Biography",
  "History",
  "Self-Help",
  "Philosophy",
  "Poetry",
  "Contemporary Fiction",
];

const normalizeGenres = (genres = []) => [...new Set(genres)];

module.exports = { SUPPORTED_GENRES, normalizeGenres };
