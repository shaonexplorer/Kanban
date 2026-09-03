import type { NextFunction, RequestHandler } from "express";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../errors/HttpError.js";

/**
 * Source location on the request object where an id can be found.
 * - "params"  → `req.params[key]`     (e.g. `/api/.../:id/...`)
 * - "body"    → `req.body[key]`        (rarely used — included for symmetry)
 */
type IdSource = "params" | "body";

// ---------------------------------------------------------------------------
// loadBoard
// ---------------------------------------------------------------------------

/**
 * Load a board by id and attach it to `req.board`.
 *
 * Treats both "not found" and "soft-deleted" as 404 — callers should not
 * be able to distinguish between the two, and the soft-deleted case is
 * effectively a tombstone.
 *
 * This middleware does NOT authorize the request — use `requireBoardAccess`
 * (or `requireBoardOwner`) after it for that.
 */
export function loadBoard(
  source: IdSource = "params",
  key: string = "id"
): RequestHandler {
  return async (req, _res, next) => {
    try {
      const boardId = req[source]?.[key];
      if (typeof boardId !== "string" || boardId.length === 0) {
        throw new HttpError(400, "Board id is required");
      }

      const board = await prisma.board.findUnique({ where: { id: boardId } });
      if (!board || board.deletedAt !== null) {
        throw new HttpError(404, "Board not found");
      }

      req.board = board;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ---------------------------------------------------------------------------
// requireBoardAccess / requireBoardOwner
// ---------------------------------------------------------------------------

/**
 * Require that the authenticated user has access to the board on `req.board`.
 *
 * Must run after `loadBoard` (which populates `req.board`) and after
 * `requireAuth` (which populates `req.user`).
 *
 * Access is granted if the user is the board owner OR a row in `BoardUser`
 * exists for `(boardId, userId)`.
 */
export const requireBoardAccess: RequestHandler = async (
  req,
  _res,
  next
) => {
  try {
    if (!req.user) {
      throw new HttpError(401, "Authentication required");
    }
    if (!req.board) {
      // Misconfigured route — loadBoard must run first.
      throw new HttpError(500, "Board not loaded");
    }

    if (req.user.id === req.board.ownerId) {
      next();
      return;
    }

    const membership = await prisma.boardUser.findUnique({
      where: {
        boardId_userId: {
          boardId: req.board.id,
          userId: req.user.id,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new HttpError(403, "Forbidden");
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Require that the authenticated user is the owner of the board on `req.board`.
 *
 * Must run after `loadBoard` (which populates `req.board`) and after
 * `requireAuth` (which populates `req.user`).
 */
export const requireBoardOwner: RequestHandler = async (
  req,
  _res,
  next
) => {
  try {
    if (!req.user) {
      throw new HttpError(401, "Authentication required");
    }
    if (!req.board) {
      // Misconfigured route — loadBoard must run first.
      throw new HttpError(500, "Board not loaded");
    }

    if (req.user.id !== req.board.ownerId) {
      throw new HttpError(403, "Forbidden");
    }

    next();
  } catch (err) {
    next(err);
  };
};

// ---------------------------------------------------------------------------
// loadColumn — Phase 3
// ---------------------------------------------------------------------------

/**
 * Load a column by id (with its parent board) and attach the result to
 * `req.column`. The attached shape is `Column & { board: Board }` so
 * downstream code can reach the board without a second query.
 *
 * Treats the column as 404 when:
 *   - the column id doesn't match any row, OR
 *   - the parent board is soft-deleted.
 *
 * This middleware does NOT authorize the request — chain it into
 * `requireBoardAccess` (or `requireBoardOwner`) after it for that.
 * The chained access check reads `req.board` (populated here), so the
 * existing middlewares work without modification.
 */
export function loadColumn(
  source: IdSource = "params",
  key: string = "id"
): RequestHandler {
  return async (req, _res, next) => {
    try {
      const columnId = req[source]?.[key];
      if (typeof columnId !== "string" || columnId.length === 0) {
        throw new HttpError(400, "Column id is required");
      }

      const column = await prisma.column.findUnique({
        where: { id: columnId },
        include: { board: true },
      });
      if (!column || column.board.deletedAt !== null) {
        throw new HttpError(404, "Column not found");
      }

      req.column = column;
      // Expose the board on `req.board` so the existing
      // `requireBoardAccess` / `requireBoardOwner` middlewares — which
      // read from `req.board` — work without changes.
      req.board = column.board;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ---------------------------------------------------------------------------
// loadTask — Phase 3
// ---------------------------------------------------------------------------

/**
 * Load a task by id (with its parent column and that column's board) and
 * attach the result to `req.task`. The attached shape is
 * `Task & { column: Column & { board: Board } }` so downstream code can
 * reach the column and board without a second query.
 *
 * Treats the task as 404 when:
 *   - the task id doesn't match any row, OR
 *   - the parent column doesn't exist (orphaned), OR
 *   - the parent board is soft-deleted.
 *
 * This middleware does NOT authorize the request — chain it into
 * `requireBoardAccess` (or `requireBoardOwner`) after it for that.
 * The chained access check reads `req.board` (populated here).
 */
export function loadTask(
  source: IdSource = "params",
  key: string = "id"
): RequestHandler {
  return async (req, _res, next) => {
    try {
      const taskId = req[source]?.[key];
      if (typeof taskId !== "string" || taskId.length === 0) {
        throw new HttpError(400, "Task id is required");
      }

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { column: { include: { board: true } } },
      });
      if (!task || task.column.board.deletedAt !== null) {
        throw new HttpError(404, "Task not found");
      }

      req.task = task;
      // Expose the board and column on `req.board` / `req.column` so
      // the existing `requireBoardAccess` / `requireBoardOwner`
      // middlewares (and any future column-scoped checks) work without
      // modification.
      req.board = task.column.board;
      req.column = task.column;
      next();
    } catch (err) {
      next(err);
    }
  };
}
