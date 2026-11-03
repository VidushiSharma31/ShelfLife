import { apiRequest } from "./authService";

export const chatWithBookBuddy = (payload) => apiRequest("/recommendations/chat", {
  method: "POST",
  body: payload,
});
