import { API_URL, apiRequest } from "./authService";

export const updateProfile = (payload) => apiRequest("/profile/me", { method: "PATCH", body: payload });
export const getPublicProfile = (userId) => apiRequest(`/profile/users/${encodeURIComponent(userId)}`);
export const getFavoriteGenres = () => apiRequest("/profile/me/genres");
export const updateFavoriteGenres = (genres) => apiRequest("/profile/me/genres", { method: "PUT", body: { genres } });
export const uploadProfilePicture = (file) => apiRequest("/profile/me/avatar", { method: "PUT", body: file });
export const removeProfilePicture = () => apiRequest("/profile/me/avatar", { method: "DELETE" });

export const profilePictureSource = (url) => {
  if (!url) return "";
  if (url.startsWith("/uploads/")) return `${API_URL.replace(/\/api$/, "")}${url}`;
  return url;
};
