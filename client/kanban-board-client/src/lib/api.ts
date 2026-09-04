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

/**
 * Read the HTTP status code off an unknown error value.
 *
 * Axios throws `AxiosError` instances for non-2xx responses, and the
 * response is on `error.response.status`. Network errors (no response
 * received) have `error.response === undefined`, so this returns
 * `null` in that case — the caller can branch on `null` to render
 * a "couldn't reach the server" message instead of an HTTP-specific
 * one.
 *
 * Used by the board view's `BoardErrorState` to discriminate between
 * 401 (session expired), 403 (no access), 404 (deleted), and network
 * failures. Returns `null` for any non-axios error so the caller can
 * fall through to a generic message.
 */
export function readErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  // AxiosError: the response (if any) carries the status. We don't
  // import the AxiosError class to keep this helper dependency-free
  // and friendly to SSR — duck-typing on `response` is enough.
  const maybeResponse = (error as { response?: unknown }).response;
  if (typeof maybeResponse !== "object" || maybeResponse === null) {
    return null;
  }
  const status = (maybeResponse as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}
