import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import {
  loadBoard,
  loadColumn,
  requireBoardAccess,
} from "../../common/middleware/access-control.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { validate } from "../../common/validators/validate.middleware.js";
import * as columnsController from "./columns.controller.js";
import {
  BoardScopedColumnParamSchema,
  ColumnIdParamSchema,
  CreateColumnSchema,
  ReorderColumnsSchema,
  UpdateColumnSchema,
} from "./columns.validation.js";

/**
 * Router for the `columns` module.
 *
 * Mounts TWO URL subtrees on a single `/api` mount point:
 *   - `/api/boards/:boardId/columns`   (board-scoped: list, create, reorder)
 *   - `/api/columns/:id`               (column-scoped: get, update, delete)
 *
 * Middleware chain patterns:
 *  - Board-scoped routes use
 *    `requireAuth → validate(BoardScopedColumnParamSchema, "params")
 *     → loadBoard() → requireBoardAccess`.
 *  - Column-scoped routes use
 *    `requireAuth → validate(ColumnIdParamSchema, "params")
 *     → loadColumn() → requireBoardAccess`.
 *  - `loadColumn()` populates both `req.column` and `req.board`, so the
 *    existing `requireBoardAccess` middleware chains behind it unchanged.
 *  - Param validation runs BEFORE the resource loader so a non-UUID id
 *    returns 400 instead of 404.
 *
 * Phase 3 reuses `requireBoardAccess` for ALL column mutations — both
 * owners and accepted members can author content on a shared board.
 */
const router = Router();

// ---------------------------------------------------------------------------
// Board-scoped: /api/boards/:boardId/columns
// ---------------------------------------------------------------------------

// List columns on a board. Param key is `boardId` (not the default `id`),
// so we pass it explicitly to `loadBoard`.
router.get(
  "/boards/:boardId/columns",
  requireAuth,
  validate(BoardScopedColumnParamSchema, "params"),
  loadBoard("params", "boardId"),
  requireBoardAccess,
  asyncHandler(columnsController.listColumns)
);

// Create a column on a board.
router.post(
  "/boards/:boardId/columns",
  requireAuth,
  validate(BoardScopedColumnParamSchema, "params"),
  loadBoard("params", "boardId"),
  requireBoardAccess,
  validate(CreateColumnSchema),
  asyncHandler(columnsController.createColumn)
);

// Reorder the columns on a board. Note the `/reorder` suffix comes
// BEFORE the `:id`-style routes so it isn't shadowed.
router.patch(
  "/boards/:boardId/columns/reorder",
  requireAuth,
  validate(BoardScopedColumnParamSchema, "params"),
  loadBoard("params", "boardId"),
  requireBoardAccess,
  validate(ReorderColumnsSchema),
  asyncHandler(columnsController.reorderColumns)
);

// ---------------------------------------------------------------------------
// Column-scoped: /api/columns/:id
// ---------------------------------------------------------------------------

// Get a single column.
router.get(
  "/columns/:id",
  requireAuth,
  validate(ColumnIdParamSchema, "params"),
  loadColumn(),
  requireBoardAccess,
  asyncHandler(columnsController.getColumn)
);

// Rename a column.
router.patch(
  "/columns/:id",
  requireAuth,
  validate(ColumnIdParamSchema, "params"),
  loadColumn(),
  requireBoardAccess,
  validate(UpdateColumnSchema),
  asyncHandler(columnsController.updateColumn)
);

// Delete a column (cascades to its tasks).
router.delete(
  "/columns/:id",
  requireAuth,
  validate(ColumnIdParamSchema, "params"),
  loadColumn(),
  requireBoardAccess,
  asyncHandler(columnsController.deleteColumn)
);

export default router;
