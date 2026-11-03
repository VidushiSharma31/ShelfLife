import { API_URL } from "./authService";

const searchCache = new Map();
const CACHE_DURATION_MS = 10 * 60 * 1000;

const readResponse = async (response, fallbackMessage) => {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }

  if (!response.ok) {
    const error = new Error(data.message || fallbackMessage);
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
};

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

  const response = await fetch(`${API_URL}/books/search?${params}`);
  const data = await readResponse(response, "The book catalog is temporarily unavailable. Please try again.");
  if (!Array.isArray(data.books)) {
    throw new Error("The book catalog returned an invalid response. Please try again.");
  }
  searchCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_DURATION_MS });
  return data;
};


export const getBookById = async (openLibraryId) => {
  const response = await fetch(`${API_URL}/books/${openLibraryId}`);
  return readResponse(response, "The book catalog is temporarily unavailable. Please try again.");
};