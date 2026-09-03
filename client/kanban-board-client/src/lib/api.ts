import axios from "axios";

/**
 * Axios instance pre-configured with the backend API base URL.
 *
 * In production, the API may be served from the same origin or a different
 * domain. Use NEXT_PUBLIC_API_URL to override at build time.
 */
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Attach the JWT token to requests when available in localStorage.
 */
api.interceptors.request.use(
  (config) => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("token")
        : null;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
