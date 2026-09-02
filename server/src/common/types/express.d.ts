/**
 * Module augmentation: extends Express's `Request` type with the
 * authenticated user payload set by `authMiddleware`.
 *
 * This lets any controller or middleware access `req.user` without
 * defining a custom `AuthRequest` interface everywhere.
 */
import "express";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
    }
  }
}

export {};
