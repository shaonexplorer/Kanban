import { HttpError } from "../../common/errors/HttpError.js";
import { prisma } from "../../lib/prisma.js";
import type {
  CreateColumnInput,
  ReorderColumnsInput,
  UpdateColumnInput,
} from "./columns.validation.js";

/**
 * Service layer for the `columns` module.
 *
 * Pure DB + business rules. Every domain failure throws an `HttpError` so
 * the central error middleware can shape the JSON response.
 *
 * Authorization is handled by middleware upstream — `loadBoard` /
 * `loadColumn` populate `req.board`, and `requireBoardAccess` rejects
 * with 403 if the caller doesn't have access. The service still re-checks
 * defensively (the route may have used `loadColumn` + access check, but
 * service-level helpers keep modules decoupled from one another).
 */

// ---------------------------------------------------------------------------
// Result types — kept local to this module so controllers can lean on them
// without re-deriving the Prisma row shape.
// ---------------------------------------------------------------------------

/** A single item in the column list / create / get / update response. */
export interface ColumnItem {
  id: string;
  title: string;
  boardId: string;
  position: number;
}

// ---------------------------------------------------------------------------
// Access-control helper (kept local for module independence)
// ---------------------------------------------------------------------------

/**
 * Assert the user has access to the board (owner or accepted `BoardUser`).
 * Throws 403 on miss. Assumes the board row has already been fetched
 * and lives on `board`.
 */
async function assertBoardAccess(
  userId: string,
  board: { id: string; ownerId: string }
): Promise<void> {
  if (board.ownerId === userId) return;

  const membership = await prisma.boardUser.findUnique({
    where: { boardId_userId: { boardId: board.id, userId } },
    select: { id: true },
  });
  if (!membership) {
    throw new HttpError(403, "Forbidden");
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new column on a board the caller has access to.
 *
 * Position is computed as `(max(position) of existing columns on the
 * board) + 1`, or `0` if the board has no columns. Gaps are allowed —
 * Phase 4's fractional-indexing strategy (or equivalent gap-based
 * approach) will consume them.
 */
export async function createColumn(
  userId: string,
  boardId: string,
  input: CreateColumnInput
): Promise<ColumnItem> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, ownerId: true, deletedAt: true },
  });
  if (!board || board.deletedAt !== null) {
    throw new HttpError(404, "Board not found");
  }
  await assertBoardAccess(userId, board);

  // Compute the next position: max(existing) + 1, or 0 if the board is empty.
  const maxRow = await prisma.column.aggregate({
    where: { boardId },
    _max: { position: true },
  });
  const nextPosition = (maxRow._max.position ?? -1) + 1;

  const column = await prisma.column.create({
    data: {
      title: input.title,
      boardId,
      position: nextPosition,
    },
    select: {
      id: true,
      title: true,
      boardId: true,
      position: true,
    },
  });

  return column;
}

/**
 * List the columns on a board (ordered by `position` asc).
 */
export async function listColumns(
  userId: string,
  boardId: string
): Promise<ColumnItem[]> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, ownerId: true, deletedAt: true },
  });
  if (!board || board.deletedAt !== null) {
    throw new HttpError(404, "Board not found");
  }
  await assertBoardAccess(userId, board);

  return prisma.column.findMany({
    where: { boardId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      boardId: true,
      position: true,
    },
  });
}

/**
 * Fetch a single column. The `loadColumn` middleware already exposed
 * the column + board on the request, but the service still re-loads to
 * stay self-contained and to defend against call paths that bypass the
 * middleware.
 */
export async function getColumn(
  userId: string,
  columnId: string
): Promise<ColumnItem> {
  const column = await prisma.column.findUnique({
    where: { id: columnId },
    include: { board: { select: { id: true, ownerId: true, deletedAt: true } } },
  });
  if (!column || column.board.deletedAt !== null) {
    throw new HttpError(404, "Column not found");
  }
  await assertBoardAccess(userId, column.board);

  return {
    id: column.id,
    title: column.title,
    boardId: column.boardId,
    position: column.position,
  };
}

/**
 * Rename a column. Only `title` is mutable in Phase 3 — `position` is
 * changed via the reorder endpoint.
 */
export async function updateColumn(
  userId: string,
  columnId: string,
  input: UpdateColumnInput
): Promise<ColumnItem> {
  const column = await prisma.column.findUnique({
    where: { id: columnId },
    include: { board: { select: { id: true, ownerId: true, deletedAt: true } } },
  });
  if (!column || column.board.deletedAt !== null) {
    throw new HttpError(404, "Column not found");
  }
  await assertBoardAccess(userId, column.board);

  const updated = await prisma.column.update({
    where: { id: columnId },
    data: { title: input.title },
    select: {
      id: true,
      title: true,
      boardId: true,
      position: true,
    },
  });

  return updated;
}

/**
 * Hard-delete a column. Its tasks are removed via the existing
 * `onDelete: Cascade` from `Column` → `Task` in the schema.
 */
export async function deleteColumn(
  userId: string,
  columnId: string
): Promise<void> {
  const column = await prisma.column.findUnique({
    where: { id: columnId },
    include: { board: { select: { id: true, ownerId: true, deletedAt: true } } },
  });
  if (!column || column.board.deletedAt !== null) {
    throw new HttpError(404, "Column not found");
  }
  await assertBoardAccess(userId, column.board);

  // Map Prisma's P2025 (row not found) to 404, even though the existence
  // check above should make this unreachable in practice — keeps the
  // wire format consistent with the other read endpoints.
  try {
    await prisma.column.delete({ where: { id: columnId } });
  } catch (err) {
    if (
      err !== null &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      throw new HttpError(404, "Column not found");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------

/**
 * Reorder the columns on a board atomically.
 *
 * The body declares the FULL new ordering (`columnIds` is a permutation
 * of every column on the board). Set equality with the board's current
 * column ids is enforced before any writes; the `prisma.$transaction`
 * keeps the position re-key consistent — either every column moves to
 * its new position or none do.
 */
export async function reorderColumns(
  userId: string,
  boardId: string,
  input: ReorderColumnsInput
): Promise<ColumnItem[]> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, ownerId: true, deletedAt: true },
  });
  if (!board || board.deletedAt !== null) {
    throw new HttpError(404, "Board not found");
  }
  await assertBoardAccess(userId, board);

  // Fetch the current columns and validate set equality.
  const current = await prisma.column.findMany({
    where: { boardId },
    select: { id: true },
  });

  if (current.length !== input.columnIds.length) {
    throw new HttpError(
      400,
      "columnIds must contain every column on the board exactly once"
    );
  }

  const currentSet = new Set(current.map((c) => c.id));
  const providedSet = new Set(input.columnIds);
  if (currentSet.size !== providedSet.size) {
    throw new HttpError(
      400,
      "columnIds must contain every column on the board exactly once"
    );
  }
  for (const id of providedSet) {
    if (!currentSet.has(id)) {
      throw new HttpError(
        400,
        "columnIds must contain every column on the board exactly once"
      );
    }
  }

  // Reassign positions 0..N-1 in the order given — atomically.
  await prisma.$transaction(
    input.columnIds.map((id, index) =>
      prisma.column.update({
        where: { id },
        data: { position: index },
        select: { id: true },
      })
    )
  );

  // Return the new ordering in the same shape as the list endpoint.
  return prisma.column.findMany({
    where: { boardId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      boardId: true,
      position: true,
    },
  });
}
