import { apiRequest } from "./authService";

export const getDashboard = () => apiRequest("/reading/dashboard");
export const getShelves = () => apiRequest("/shelves");
export const createShelf = (payload) => apiRequest("/shelves", { method: "POST", body: payload });
export const updateShelf = (shelfId, payload) => apiRequest(`/shelves/${shelfId}`, { method: "PATCH", body: payload });
export const deleteShelf = (shelfId) => apiRequest(`/shelves/${shelfId}`, { method: "DELETE" });
export const addBookToShelf = (shelfId, payload) => apiRequest(`/shelves/${shelfId}/books`, { method: "POST", body: payload });
export const updateReading = (entryId, payload) => apiRequest(`/reading/${entryId}`, { method: "PATCH", body: payload });
export const removeReading = (entryId) => apiRequest(`/reading/${entryId}`, { method: "DELETE" });
