import type { NextFunction, Request, RequestHandler } from "express";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../errors/HttpError.js";

/**
 * Source location on the request object where the board id can be found.
 * - "params"  → `req.params[key]`     (e.g. `/api/boards/:id/...`)
 * - "body"    → `req.body[key]`        (rarely used — included for symmetry)
 */
type BoardIdSource = "params" | "body";

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
  source: BoardIdSource = "params",
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
  }
};
