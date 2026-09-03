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
 * The context also surfaces the registered user's `id` and `email`
 * (persisted to `localStorage` under the `auth.user` key). These
 * are populated by `registerWithEmail`; after a token paste they
 * are `null`. Components that need them should treat them as
 * "best effort" — they exist so the sidebar's current-user card
 * can show a real email when one is available, not as a hard
 * identity contract. A real identity model lands in Phase 5.
 *
 * Token state is synced to `localStorage` via `useSyncExternalStore`
 * — the recommended React 19 way to read a non-React external
 * store (like `localStorage`) without triggering a cascading render
 * from a mount-effect.
 */

const TOKEN_STORAGE_KEY = "token";
const USER_STORAGE_KEY = "auth.user";

interface StoredUser {
  id: string;
  email: string;
}

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

function getUserSnapshot(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredUser>;
    if (typeof parsed.id === "string" && typeof parsed.email === "string") {
      return { id: parsed.id, email: parsed.email };
    }
    return null;
  } catch {
    return null;
  }
}

function getServerUserSnapshot(): StoredUser | null {
  return null;
}

export interface AuthContextValue {
  /** The current JWT, or `null` if no token is stored. */
  token: string | null;
  /**
   * The registered user's id, or `null` if not yet known. Populated
   * by `registerWithEmail` from the server's register response. After
   * a token paste or page refresh on a non-register flow, this stays
   * `null` — treat it as "best effort" identity.
   */
  userId: string | null;
  /**
   * The registered user's email, or `null` if not yet known. See
   * `userId` for the same caveat.
   */
  userEmail: string | null;
  /** Persist a token to localStorage and update context state. */
  setToken: (token: string) => void;
  /** Remove the token (and the cached user) from localStorage + context. */
  clearToken: () => void;
  /**
   * Dev-only helper: register a new user with a random email and
   * persist the returned token (and user id/email). Returns the
   * parsed response.
   */
  registerWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ id: string; email: string; token: string }>;
}

export const AuthContext = createContext<AuthContextValue>({
  token: null,
  userId: null,
  userEmail: null,
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
  const user = useSyncExternalStore(
    subscribeTokenStorage,
    getUserSnapshot,
    getServerUserSnapshot,
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
      window.localStorage.removeItem(USER_STORAGE_KEY);
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
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          USER_STORAGE_KEY,
          JSON.stringify({ id: data.id, email: data.email }),
        );
        window.dispatchEvent(
          new StorageEvent("storage", { key: USER_STORAGE_KEY }),
        );
      }
      return data;
    },
    [setToken],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      setToken,
      clearToken,
      registerWithEmail,
    }),
    [token, user, setToken, clearToken, registerWithEmail],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
