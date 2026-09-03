"use client";

import {
  createContext,
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import api from "@/lib/api";

/**
 * Lightweight auth context for Phase 4.
 *
 * The server's `/api/auth/register` and `/api/auth/login` endpoints
 * issue a JWT; the existing axios instance in `src/lib/api.ts` reads
 * `localStorage.getItem("token")` on every request and attaches it
 * as `Authorization: Bearer ...`. The `AuthProvider` exposes the
 * same token through context so React components can read it
 * without touching `localStorage` directly.
 *
 * A real login / register UI lands in Phase 5. For the demo, the
 * home page exposes a "Quick register (dev only)" button that calls
 * `registerWithEmail` below.
 *
 * Token state is synced to `localStorage` via `useSyncExternalStore`
 * — the recommended React 19 way to read a non-React external
 * store (like `localStorage`) without triggering a cascading render
 * from a mount-effect.
 */

const TOKEN_STORAGE_KEY = "token";

function subscribeTokenStorage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // Phase 4 doesn't open multiple tabs of the same board, so the
  // cheapest correct store is a manual `storage` listener. Phase 5's
  // real auth UI can swap in a richer channel if needed.
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getTokenSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

function getServerTokenSnapshot(): string | null {
  // On the server (and during the very first client render) the
  // storage is empty. The real value hydrates on the first browser
  // tick via `subscribeTokenStorage` + a client-only snapshot.
  return null;
}

export interface AuthContextValue {
  /** The current JWT, or `null` if no token is stored. */
  token: string | null;
  /** Persist a token to localStorage and update context state. */
  setToken: (token: string) => void;
  /** Remove the token from localStorage and context state. */
  clearToken: () => void;
  /**
   * Dev-only helper: register a new user with a random email and
   * persist the returned token. Returns the parsed response.
   */
  registerWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ id: string; email: string; token: string }>;
}

export const AuthContext = createContext<AuthContextValue>({
  token: null,
  setToken: () => {},
  clearToken: () => {},
  registerWithEmail: async () => {
    throw new Error("AuthProvider not mounted");
  },
});

interface RegisterResponse {
  id: string;
  email: string;
  token: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // `useSyncExternalStore` reads `localStorage` lazily (no SSR
  // access, no mount-effect setState) and re-renders when a
  // `storage` event fires.
  const token = useSyncExternalStore(
    subscribeTokenStorage,
    getTokenSnapshot,
    getServerTokenSnapshot,
  );

  const setToken = useCallback((next: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, next);
      // The `storage` event does NOT fire in the same tab that wrote
      // the value, so manually notify subscribers to keep React in
      // sync. We dispatch a synthetic storage event for this.
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: TOKEN_STORAGE_KEY,
          newValue: next,
        }),
      );
    }
  }, []);

  const clearToken = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: TOKEN_STORAGE_KEY,
          newValue: null,
        }),
      );
    }
  }, []);

  const registerWithEmail = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<RegisterResponse>("/auth/register", {
        email,
        password,
      });
      setToken(data.token);
      return data;
    },
    [setToken],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ token, setToken, clearToken, registerWithEmail }),
    [token, setToken, clearToken, registerWithEmail],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
