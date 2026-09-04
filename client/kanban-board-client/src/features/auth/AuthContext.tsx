"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import api from "@/lib/api";

/**
 * Auth context for the cookie-based auth flow (Phase 5 Step 8).
 *
 * Previous design (Phase 4–5 Step 7): the JWT was persisted in
 * `localStorage` under `"token"`, read by the axios request
 * interceptor, and attached as `Authorization: Bearer ...` on
 * every request. The user identity (`{ id, email }`) was cached
 * separately under `"auth.user"`. The whole thing was
 * subscription-based (`useSyncExternalStore` over the `storage`
 * event) so React could react to cross-tab sign-outs.
 *
 * New design (Phase 5 Step 8): the JWT lives in an httpOnly
 * `token` cookie the server sets on `POST /api/auth/register` and
 * `/login`. `localStorage` never holds the token (an XSS payload
 * can't exfiltrate what JS can't read). The browser attaches the
 * cookie to every same-origin request automatically, and the
 * axios instance is configured with `withCredentials: true` so it
 * also attaches cross-origin. The client therefore never has a
 * meaningful token *value* to expose — `isAuthenticated` is the
 * only boolean it can compute, by asking the server.
 *
 * Identity is fetched on demand from `GET /api/auth/me`:
 *  - on first mount (the cookie may already be present from a
 *    previous session; the server's `/me` response confirms it
 *    and returns the user)
 *  - after every successful register / login (the cookie was just
 *    set; we re-fetch `/me` to learn `id` / `email`)
 *  - after every sign-out (the cookie was just cleared; `/me`
 *    would 401, so we clear the snapshot directly)
 *
 * Cross-component sync is via a custom `kanban-auth-change`
 * event on `window` — keeping the implementation dead simple
 * (no external state library) and the SSR story identical (the
 * event is only dispatched in the browser).
 */

const AUTH_CHANGE_EVENT = "kanban-auth-change";
type AuthChangeReason = "login" | "logout" | "me-ok" | "me-401";

interface MeResponse {
  id: string;
  email: string;
}

export interface AuthContextValue {
  /**
   * True when the user has a valid session. Computed from the
   * latest `/api/auth/me` response: `null` (loading / unknown) →
   * `true` (server returned a user) → `false` (server returned
   * 401 after sign-out or a stale cookie).
   */
  isAuthenticated: boolean;
  /**
   * The registered user's id, or `null` if not yet known. Populated
   * by `/api/auth/me` on first mount and on every successful
   * register / login. Best-effort identity, not a hard contract.
   */
  userId: string | null;
  /**
   * The registered user's email, or `null` if not yet known. See
   * `userId` for the same caveat.
   */
  userEmail: string | null;
  /**
   * Register a new user with the given credentials. The server
   * sets the httpOnly `token` cookie and returns
   * `{ id, email, token }`; the body token is for non-browser
   * clients (curl / tests). On success this also re-fetches
   * `/me` to populate `userId` / `userEmail` and broadcasts an
   * auth change to other mounted components.
   */
  registerWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ id: string; email: string; token: string }>;
  /**
   * Sign in an existing user. Same flow as `registerWithEmail` —
   * server sets the cookie, then we re-fetch `/me`.
   */
  loginWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ email: string; token: string }>;
  /**
   * End the session. Calls `POST /api/auth/logout` (server clears
   * the httpOnly `token` cookie), clears the local identity
   * snapshot, and broadcasts an auth change so mounted components
   * (e.g. `BoardView`'s 401 branch) can navigate to `/`.
   *
   * The navigation itself is the caller's responsibility — the
   * auth context stays router-agnostic.
   */
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  userId: null,
  userEmail: null,
  registerWithEmail: async () => {
    throw new Error("AuthProvider not mounted");
  },
  loginWithEmail: async () => {
    throw new Error("AuthProvider not mounted");
  },
  signOut: async () => {
    throw new Error("AuthProvider not mounted");
  },
});

/**
 * Fetch the current user from `GET /api/auth/me`. Resolves to
 * `null` on a 401 (no / invalid cookie) so the caller doesn't
 * have to inspect the error; re-throws on any other failure so
 * the calling site's existing error UI still fires.
 */
async function fetchMe(): Promise<MeResponse | null> {
  try {
    const { data } = await api.get<MeResponse>("/auth/me");
    return data;
  } catch (err) {
    if (typeof err === "object" && err !== null) {
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      if (status === 401) return null;
    }
    throw err;
  }
}

function broadcastAuthChange(reason: AuthChangeReason): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AuthChangeReason>(AUTH_CHANGE_EVENT, { detail: reason }),
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // `null` = "haven't asked the server yet". Components that
  // gate on `isAuthenticated` should treat `null` as "show a
  // loading state, not a redirect" — the home page does exactly
  // that (its "Loading your workspace…" placeholder).
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  // On first mount, ask the server "who am I?". The server reads
  // the httpOnly cookie via `authMiddleware` and returns
  // `{ id, email }` if it's still valid, or 401 if it isn't.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await fetchMe();
      if (cancelled) return;
      if (me) setUser(me);
      setBootstrapped(true);
    })().catch(() => {
      // Network / 5xx — don't block the app, just leave the user
      // unauthenticated. The home page's "couldn't load boards"
      // branch covers the boards list case.
      if (!cancelled) setBootstrapped(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cross-component sync. A successful login on one component
  // (e.g. AuthScreen) should be picked up by the home page
  // immediately without a full page reload. The custom event
  // carries the reason so the home page's effect can decide
  // whether to re-fetch boards (login) or redirect (logout).
  useEffect(() => {
    if (typeof window === "undefined") return;
    function handle(event: Event) {
      const reason = (event as CustomEvent<AuthChangeReason>).detail;
      if (reason === "logout") {
        setUser(null);
        return;
      }
      if (reason === "login" || reason === "me-ok") {
        // Re-fetch the canonical identity; the server is the
        // source of truth for the JWT payload.
        fetchMe()
          .then((me) => {
            if (me) setUser(me);
          })
          .catch(() => {
            // Ignore — the next user action will re-trigger.
          });
      }
    }
    window.addEventListener(AUTH_CHANGE_EVENT, handle);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, handle);
  }, []);

  const setIdentityFromAuthResponse = useCallback(
    (email: string, id?: string) => {
      // The register response carries `{ id, email, token }` so we
      // can set the identity directly. The login response carries
      // only `{ email, token }` — we set the email optimistically
      // and re-fetch `/me` to fill in the id.
      if (id) {
        setUser({ id, email });
        broadcastAuthChange("me-ok");
      } else {
        // Trigger the re-fetch path via the broadcast.
        broadcastAuthChange("login");
      }
    },
    [],
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<{
        id: string;
        email: string;
        token: string;
      }>("/auth/register", { email, password });
      setIdentityFromAuthResponse(data.email, data.id);
      return data;
    },
    [setIdentityFromAuthResponse],
  );

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<{ email: string; token: string }>(
        "/auth/login",
        { email, password },
      );
      setIdentityFromAuthResponse(data.email);
      return data;
    },
    [setIdentityFromAuthResponse],
  );

  const signOut = useCallback(async () => {
    // Fire-and-forget the network call. The server's `Set-Cookie:
    // token=; Max-Age=0` is what actually ends the session; the
    // local state update below is what unmounts the gated UI.
    try {
      await api.post("/auth/logout");
    } catch {
      // Even on a network error, clear the local state so the
      // UI is responsive. The cookie may still be valid until
      // the user closes the tab, but they'll be sent to the
      // auth screen either way.
    }
    setUser(null);
    broadcastAuthChange("logout");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      // `bootstrapped` flips true once the first `/me` has resolved
      // (either with a user or with a 401). Before that we report
      // `false` to keep the redirect logic in `BoardViewGate` from
      // bouncing the user to `/` while we're still figuring out
      // whether the cookie is present.
      isAuthenticated: bootstrapped && user !== null,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      registerWithEmail,
      loginWithEmail,
      signOut,
    }),
    [bootstrapped, user, registerWithEmail, loginWithEmail, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
