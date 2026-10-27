import { API_URL } from "./authService";

const searchCache = new Map();
const CACHE_DURATION_MS = 10 * 60 * 1000;

export const searchBooks = async ({
  query,
  page = 1,
  limit = 20,
  sort = "relevance",
}) => {
  const params = new URLSearchParams({
    q: query,
    page,
    limit,
    sort,
  });

  const cacheKey = params.toString();
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const response = await fetch(
    `${API_URL}/books/search?${params}`
  );

  if (!response.ok) {
    throw new Error("Failed to search books");
  }

  const data = await response.json();
  searchCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_DURATION_MS });
  return data;
};


export const getBookById = async (openLibraryId) => {
  const response = await fetch(
    `${API_URL}/books/${openLibraryId}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch book");
  }

  return response.json();
};