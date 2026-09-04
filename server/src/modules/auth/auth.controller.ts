import type { Request, Response } from "express";
import { config } from "../../config/env.js";
import * as authService from "./auth.service.js";
import type { LoginInput, RegisterInput } from "./auth.validation.js";

/**
 * Name of the httpOnly cookie that carries the JWT. Centralized so
 * the producer (this file) and consumer (`authMiddleware`) agree on
 * the key. The client never sees this value — `httpOnly` blocks
 * `document.cookie` access — but the browser attaches it to every
 * same-site request to the API origin automatically.
 */
export const AUTH_COOKIE_NAME = "token";

/**
 * Translates a `jsonwebtoken` `expiresIn` string ("7d", "1h", "30m",
 * "60s", or a plain number of seconds) into the milliseconds the
 * browser needs for `Set-Cookie: ...; Max-Age=…`. The default of
 * 7 days matches `JWT_EXPIRES_IN` and is the only fallback path.
 *
 * The accepted formats are documented in
 * https://github.com/auth0/node-jsonwebtoken#jwt-expiration--expiration-description-
 */
function jwtExpiresInToMs(expiresIn: string | number): number {
  if (typeof expiresIn === "number") return expiresIn * 1000;
  const trimmed = expiresIn.trim();
  // Plain number → seconds.
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const match = /^(\d+)\s*([smhdw])$/i.exec(trimmed);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // safe default = 7d
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };
  return n * multipliers[unit];
}

/**
 * Writes the JWT to the httpOnly `token` cookie. Centralized so the
 * register and login flows produce an identical Set-Cookie header.
 *
 * Flags:
 *  - `httpOnly: true` — the client cannot read it via
 *    `document.cookie`, so an XSS payload cannot exfiltrate it.
 *  - `sameSite: "lax"` — the cookie is sent on top-level
 *    navigations but not on cross-site sub-requests. Sufficient for
 *    our SPA (same origin) and a basic CSRF mitigation.
 *  - `secure: NODE_ENV === "production"` — only sent over HTTPS in
 *    production. Browsers ignore `secure: true` on plain HTTP, but
 *    we still gate it so local dev works.
 *  - `path: "/"` — sent on every request to the API origin.
 *  - `maxAge` — matches `JWT_EXPIRES_IN` so the cookie expires in
 *    lockstep with the JWT it carries.
 */
function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    path: "/",
    maxAge: jwtExpiresInToMs(config.JWT_EXPIRES_IN),
  });
}

/**
 * POST /api/auth/register
 *
 * Validates the request body via the zod schema, registers a new user via
 * the service, sets the httpOnly `token` cookie, and returns 201 with
 * `{ id, email, token }`. The body token is kept for backwards
 * compatibility with curl / non-browser clients; the browser flow reads
 * the cookie instead.
 *
 * Errors (duplicate email, validation failure) are thrown and forwarded to
 * the central error middleware by `asyncHandler`.
 */
export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as RegisterInput;
  const result = await authService.register({ email, password });
  setAuthCookie(res, result.token);
  res.status(201).json(result);
}

/**
 * POST /api/auth/login
 *
 * Authenticates the user, sets the httpOnly `token` cookie, and
 * returns 200 with `{ email, token }`. The cookie path is the
 * source of truth for the browser; the body token is for
 * non-browser clients.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;
  const result = await authService.login({ email, password });
  setAuthCookie(res, result.token);
  res.status(200).json(result);
}

/**
 * POST /api/auth/logout
 *
 * Clears the httpOnly `token` cookie. The route is mounted behind
 * `requireAuth` so an anonymous caller gets 401, but the underlying
 * `res.clearCookie` is harmless if the cookie isn't present (the
 * browser simply sets an empty value with `Max-Age=0`).
 *
 * Returns 204 No Content on success. The browser drops the cookie
 * before the response body is read.
 */
export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
  res.status(204).send();
}

/**
 * GET /api/auth/me
 *
 * Returns the calling user's `{ id, email }` from the JWT the
 * `authMiddleware` already verified and attached to `req.user`. No
 * DB hit. The route is mounted behind `requireAuth` so an
 * anonymous caller gets 401.
 *
 * This is the replacement for the previous client-side
 * `localStorage.getItem("auth.user")` cache: the SPA can ask the
 * server "who am I?" on first load and on every login/logout, and
 * trust the answer because it came back through the same httpOnly
 * cookie the server uses for every other authenticated call.
 */
export async function me(req: Request, res: Response): Promise<void> {
  // `requireAuth` guarantees `req.user` is set.
  const { id, email } = req.user!;
  res.status(200).json({ id, email });
}
