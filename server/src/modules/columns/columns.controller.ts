import type { Request, Response } from "express";
import * as columnsService from "./columns.service.js";
import type {
  BoardScopedColumnParam,
  ColumnIdParam,
  CreateColumnInput,
  ReorderColumnsInput,
  UpdateColumnInput,
} from "./columns.validation.js";

/**
 * Controller layer for the `columns` module.
 *
 * Each handler is a thin shell: it reads the already-validated input
 * (from `req.user`, `req.params`, `req.body`, `req.board`, or `req.column`),
 * delegates to the service, and shapes the HTTP response.
 *
 * Errors thrown from the service are caught by `asyncHandler` and
 * forwarded to the central error middleware — controllers do not
 * catch them.
 */

// ---------------------------------------------------------------------------
// Board-scoped endpoints
// ---------------------------------------------------------------------------

/**
 * POST /api/boards/:boardId/columns — create a new column on a board.
 * Returns 201 with `{ id, title, boardId, position }`.
 */
export async function createColumn(
  req: Request,
  res: Response
): Promise<void> {
  const { id: userId } = req.user!;
  const { boardId } = req.params as BoardScopedColumnParam;
  const input = req.body as CreateColumnInput;

  const column = await columnsService.createColumn(userId, boardId, input);
  res.status(201).json(column);
}

/**
 * GET /api/boards/:boardId/columns — list the columns on a board.
 * Returns 200 with an array of `{ id, title, boardId, position }`.
 */
export async function listColumns(
  req: Request,
  res: Response
): Promise<void> {
  const { id: userId } = req.user!;
  const { boardId } = req.params as BoardScopedColumnParam;

  const columns = await columnsService.listColumns(userId, boardId);
  res.status(200).json(columns);
}

/**
 * PATCH /api/boards/:boardId/columns/reorder — reorder the columns on a board.
 * Returns 200 with the reordered array (same shape as the list endpoint).
 */
export async function reorderColumns(
  req: Request,
  res: Response
): Promise<void> {
  const { id: userId } = req.user!;
  const { boardId } = req.params as BoardScopedColumnParam;
  const input = req.body as ReorderColumnsInput;

  const columns = await columnsService.reorderColumns(
    userId,
    boardId,
    input
  );
  res.status(200).json(columns);
}

// ---------------------------------------------------------------------------
// Column-scoped endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/columns/:id — fetch a single column.
 * Returns 200 with `{ id, title, boardId, position }`.
 */
export async function getColumn(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const { id: columnId } = req.params as ColumnIdParam;

  const column = await columnsService.getColumn(userId, columnId);
  res.status(200).json(column);
}

/**
 * PATCH /api/columns/:id — rename a column.
 * Returns 200 with the updated column.
 */
export async function updateColumn(
  req: Request,
  res: Response
): Promise<void> {
  const { id: userId } = req.user!;
  const { id: columnId } = req.params as ColumnIdParam;
  const input = req.body as UpdateColumnInput;

  const column = await columnsService.updateColumn(
    userId,
    columnId,
    input
  );
  res.status(200).json(column);
}

/**
 * DELETE /api/columns/:id — hard-delete a column (cascades to its tasks).
 * Returns 204 with no body.
 */
export async function deleteColumn(
  req: Request,
  res: Response
): Promise<void> {
  const { id: userId } = req.user!;
  const { id: columnId } = req.params as ColumnIdParam;

  await columnsService.deleteColumn(userId, columnId);
  res.status(204).send();
}
