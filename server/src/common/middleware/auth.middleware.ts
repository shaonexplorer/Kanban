import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config/env.js";

/**
 * Authentication middleware.
 *
 * Extracts the JWT from the httpOnly `token` cookie set by
 * `POST /api/auth/register` and `/login`, verifies it, and attaches
 * the decoded user payload to `req.user`.
 *
 * The cookie path is the **only** token source — the previous
 * `Authorization: Bearer` header path was removed when the auth
 * storage moved from `localStorage` to an httpOnly cookie (see the
 * `phase05` Step 8 plan). Setting the cookie + using
 * `cookie-parser` is the responsibility of the upstream routes
 * (see `setAuthCookie` in `modules/auth/auth.controller.ts`).
 *
 * If the token is missing or invalid, `req.user` is left undefined
 * and the request is allowed to continue. Use `requireAuth` on
 * protected routes to actually reject unauthenticated requests.
 */
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = req.cookies?.token;

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as {
      userId: string;
      email: string;
    };

    req.user = { id: decoded.userId, email: decoded.email };
    next();
  } catch (_err) {
    // Token is invalid or expired — req.user remains undefined.
    // Callers should check req.user and return 401 if absent.
    next();
  }
}

/**
 * Middleware that requires authentication.
 *
 * Returns 401 with `{ error: "Authentication required" }` if no valid
 * user is attached to the request.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
