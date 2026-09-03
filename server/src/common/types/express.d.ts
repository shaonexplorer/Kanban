/**
 * Module augmentation: extends Express's `Request` type with the
 * authenticated user payload set by `authMiddleware` and the resource
 * rows loaded by the access-control middlewares.
 *
 * This lets any controller or middleware access `req.user`, `req.board`,
 * `req.column`, or `req.task` without defining a custom `AuthRequest`
 * interface everywhere.
 */
import "express";
import type { Board, Column, Task } from "../../generated/prisma/client.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
      board?: Board;
      // Phase 3 — loaded by `loadColumn` (also includes the parent board).
      column?: Column & { board: Board };
      // Phase 3 — loaded by `loadTask` (also includes the parent column
      // and that column's parent board).
      task?: Task & { column: Column & { board: Board } };
    }
  }
}

export {};
