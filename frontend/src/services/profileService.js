import { apiRequest } from "./authService";

export const updateProfile = (payload) => apiRequest("/profile/me", { method: "PATCH", body: payload });
export const getPublicProfile = (userId) => apiRequest(`/profile/users/${encodeURIComponent(userId)}`);
