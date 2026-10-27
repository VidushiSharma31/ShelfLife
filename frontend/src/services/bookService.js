import { API_URL } from "./authService";

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

  const response = await fetch(
    `${API_URL}/books/search?${params}`
  );

  if (!response.ok) {
    throw new Error("Failed to search books");
  }

  return response.json();
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