/**
 * Module augmentation: extends Express's `Request` type with the
 * authenticated user payload set by `authMiddleware` and the board
 * resource loaded by `loadBoard` (Phase 2 access-control middleware).
 *
 * This lets any controller or middleware access `req.user` / `req.board`
 * without defining a custom `AuthRequest` interface everywhere.
 */
import "express";
import type { Board } from "../../generated/prisma/client.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
      board?: Board;
    }
  }
}

export {};
