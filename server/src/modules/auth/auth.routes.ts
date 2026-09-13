import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import { loginRateLimiter, registerRateLimiter } from "../../common/middleware/rate-limit.middleware.js";
import { validate } from "../../common/validators/validate.middleware.js";
import * as authController from "./auth.controller.js";
import { loginSchema, registerSchema } from "./auth.validation.js";

const router = Router();

// Rate limit the auth surface (§9.3 / Phase 5 plan) to blunt
// credential-stuffing and registration abuse. The limiters run BEFORE
// the validate() middleware so a flood of malformed payloads can't
// exhaust the bcrypt comparison path.
router.post(
  "/register",
  registerRateLimiter,
  validate(registerSchema),
  asyncHandler(authController.register)
);

router.post(
  "/login",
  loginRateLimiter,
  validate(loginSchema),
  asyncHandler(authController.login)
);

// `GET /me` — returns the calling user's `{ id, email }` from the
// verified JWT. No body/params/query input, so no `validate(...)`
// is needed (and the audit script's PUBLIC_ROUTES allowlist
// includes this entry).
router.get("/me", requireAuth, asyncHandler(authController.me));

// `POST /logout` — clears the httpOnly `token` cookie. Mounted
// behind `requireAuth` so an anonymous caller gets 401; the
// `res.clearCookie` call is a no-op when no cookie is present, so
// the route is safe to expose either way. No body, no params, no
// query — also in the audit's PUBLIC_ROUTES allowlist.
router.post("/logout", requireAuth, asyncHandler(authController.logout));

export default router;
