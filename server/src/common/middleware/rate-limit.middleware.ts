import { rateLimit } from "express-rate-limit";
import type { Request, Response } from "express";

/**
 * Shared 429 handler — every limiter on the auth surface responds with the
 * same `{ error: ... }` envelope the rest of the API uses. The `Retry-After`
 * header is set automatically by express-rate-limit before `handler` runs.
 */
function tooManyRequests(_req: Request, res: Response): void {
  res.status(429).json({ error: "Too many requests, try again later." });
}

/**
 * Rate limiter for POST /api/auth/login.
 *
 * 10 login attempts per IP per 15 minutes (sliding window).
 *
 * The auth surface is the primary target for credential-stuffing attacks,
 * so the limit is tight enough to blunt a dictionary attack but loose
 * enough that a developer hitting the API repeatedly during local e2e
 * testing won't trip it in normal flow.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  handler: tooManyRequests,
  // Express 4/5 send `RateLimit-Remaining`, `RateLimit-Limit`, and
  // `RateLimit-Reset` (draft-6). Useful for clients that want to back
  // off intelligently; the deprecated `X-RateLimit-*` headers are
  // disabled.
  standardHeaders: "draft-6",
  legacyHeaders: false,
  // Suppress the "trust proxy" warning in dev — the proxy-awareness
  // gap is documented in the plan (§9.3) and is a deployment-time
  // decision, not a dev-time one.
  validate: { xForwardedForHeader: false },
});

/**
 * Rate limiter for POST /api/auth/register.
 *
 * 5 registration attempts per IP per hour (sliding window).
 *
 * Registration is even more abuse-prone than login (spam accounts,
 * credential-stuffing with fresh emails), so the window is an hour and
 * the budget is tight. A legit developer who needs to register a handful
 * of test accounts during e2e is unaffected.
 */
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  handler: tooManyRequests,
  standardHeaders: "draft-6",
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});
