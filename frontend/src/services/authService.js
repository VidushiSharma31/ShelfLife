export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/$/, "");

let accessToken = null;
let refreshPromise = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

export const clearAccessToken = () => {
  accessToken = null;
};

const responseData = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const request = async (path, options = {}, retry = true) => {
  const headers = new Headers(options.headers || {});
  if (options.body && typeof options.body !== "string") {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body: options.body && typeof options.body !== "string"
      ? JSON.stringify(options.body)
      : options.body,
    credentials: "include",
  });
  let data = await responseData(response);

  const publicAuthEndpoint = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"]
    .includes(path);
  if (response.status === 401 && retry && !publicAuthEndpoint) {
    const restored = await refreshSession();
    if (restored) return request(path, options, false);
  }

  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
};

export const apiRequest = request;

const refreshSession = async () => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        const data = await responseData(response);
        if (!response.ok) {
          clearAccessToken();
          return null;
        }
        setAccessToken(data.accessToken);
        return data;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
};

export const restoreSession = refreshSession;

export const register = async (payload) => {
  const data = await request("/auth/register", { method: "POST", body: payload }, false);
  setAccessToken(data.accessToken);
  return data;
};

export const login = async (payload) => {
  const data = await request("/auth/login", { method: "POST", body: payload }, false);
  setAccessToken(data.accessToken);
  return data;
};

export const logout = async () => {
  await request("/auth/logout", { method: "POST" }, false);
  clearAccessToken();
};
