import { HttpError } from "../../common/errors/HttpError.js";
import { prisma } from "../../lib/prisma.js";
import { between, nextAppend, rePack } from "../../common/utils/floatPosition.js";
import type {
  CreateColumnInput,
  MoveColumnInput,
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
 *
 * Phase 5 (Float ordering): `position` is now a `Float` (was a
 * lexicographic string in Phase 4). New columns append at
 * `MAX(existing.position) + 1000`; reorders + moves pick a position from
 * the four midpoint cases exposed by `floatPosition.between` (or use
 * `floatPosition.rePack` for the full-board reorder endpoint). See
 * `src/common/utils/floatPosition.ts` for the precision-floor caveat.
 */

// ---------------------------------------------------------------------------
// Result types — kept local to this module so controllers can lean on them
// without re-deriving the Prisma row shape.
// ---------------------------------------------------------------------------

/** A single item in the column list / create / get / update / move response. */
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
 * Position is assigned by `floatPosition.nextAppend(MAX(existing))`,
 * which appends to the end of the board with a fresh Float
 * (`max + 1000`). For an empty board, `nextAppend(null)` returns
 * `1000`.
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

  // Tail column on the board, ordered by `position desc` so the
  // first row is MAX — a single fetch, no aggregate query needed.
  const tail = await prisma.column.findFirst({
    where: { boardId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const nextPosition = nextAppend(tail?.position ?? null);

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
 * Fetch a single column. The `loadColumn` middleware already exposed the
 * column + board on the request, but the service still re-loads to stay
 * self-contained and to defend against call paths that bypass the
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
 * Rename a column. Only `title` is mutable — `position` is changed via
 * the `reorderColumns` or `moveColumn` endpoints.
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
// Reorder — Phase 3 (full board reorder)
// ---------------------------------------------------------------------------

/**
 * Reorder the columns on a board atomically.
 *
 * The body declares the FULL new ordering (`columnIds` is a permutation
 * of every column on the board). Set equality with the board's current
 * column ids is enforced before any writes; the `prisma.$transaction`
 * keeps the position re-key consistent — either every column moves to
 * its new position or none do.
 *
 * Phase 5 re-keys with fresh Float positions from `floatPosition.rePack`
 * (which is just `(i + 1) * 1000`) instead of the Phase 4 base-62
 * sequence. The result is the same logical ordering, but with cleaner
 * integer values that have headroom for many midpoint inserts.
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

  // Reassign Float positions in the order given — atomically. The
  // i-th column (0-indexed) gets `(i + 1) * 1000`, giving 1000-step
  // spacing with guaranteed headroom for `between` on the next
  // user-driven append. Wrapped in a single transaction.
  const updates = input.columnIds.map((id, i) =>
    prisma.column.update({
      where: { id },
      data: { position: rePack(i) },
      select: { id: true },
    })
  );
  await prisma.$transaction(updates);

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

// ---------------------------------------------------------------------------
// Move — Phase 4 Step 4, rewritten for Float in Phase 5
// ---------------------------------------------------------------------------

/**
 * Move a column to a new index on its own board. The board is already
 * established by the middleware chain (`loadColumn → requireBoardAccess`)
 * which has also authorized the caller; the service re-asserts access
 * defensively so it stays self-contained.
 *
 * Flow:
 *  1. Defensive checks: load the column (with its board) and verify
 *     the caller has access.
 *  2. Inside a single `prisma.$transaction`:
 *     a. List the board's columns (excluding the column being moved)
 *        ordered by `position asc`.
 *     b. Pick neighbors: `before = columns[toIndex - 1]`,
 *        `after = columns[toIndex]` (with `undefined` when out of
 *        range — `toIndex` is clamped to the board's column count, so
 *        `columns[toIndex]` is `undefined` only when appending past
 *        the end).
 *     c. Compute `newPosition = floatPosition.between(before, after)`.
 *        The four cases (between / append / prepend / empty) collapse
 *        to one O(1) call.
 *     d. Update the column with the new `position`.
 *  3. Return the moved column in the full `ColumnItem` shape.
 *
 * KNOWN LIMITATION: Float precision floor. After ~50 midpoint inserts
 * between two neighbors, `between(prev, next)` returns `prev` because
 * the gap is smaller than `Number.EPSILON * prev`. The move still
 * returns 200, but the column lands on the wrong neighbor. Workaround:
 * `PATCH /reorder` re-keys the board to fresh 1000-step Floats, which
 * resets the precision budget.
 *
 * @throws HttpError 404 — column is missing or its board is soft-deleted.
 * @throws HttpError 403 — caller lacks access to the column's board.
 * @throws HttpError 400 — `toIndex` is negative or not an integer (zod
 *   should have caught it, but a safety net stays cheap).
 */
export async function moveColumn(
  userId: string,
  columnId: string,
  input: MoveColumnInput
): Promise<ColumnItem> {
  // 1. Load + defensive authorization.
  const column = await prisma.column.findUnique({
    where: { id: columnId },
    include: { board: { select: { id: true, ownerId: true, deletedAt: true } } },
  });
  if (!column || column.board.deletedAt !== null) {
    throw new HttpError(404, "Column not found");
  }
  await assertBoardAccess(userId, column.board);

  // Defensive clamp: `zod` already rejects negative `toIndex`, so
  // reaching a non-integer or negative value here is a programmer
  // error. The clamp below is the documented behaviour for
  // "toIndex larger than the board's column count".
  if (!Number.isInteger(input.toIndex) || input.toIndex < 0) {
    throw new HttpError(400, "toIndex must be a non-negative integer");
  }

  // 2. Atomic move. The Float midpoint is O(1) — no transaction needed
  // for a single-row update, but we still wrap in $transaction so
  // the read-then-write is consistent under concurrent moves.
  return prisma.$transaction(async (tx) => {
    // 2a. List the board's columns EXCLUDING the column being moved
    // (so the post-move neighbor-pick is correct). Order by
    // `position asc` so indexes map directly to the requested
    // `toIndex`.
    const siblings = await tx.column.findMany({
      where: { boardId: column.boardId, NOT: { id: columnId } },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });

    // 2b. Clamp `toIndex` to [0, siblings.length]. "Append" lands at
    // siblings.length (the last position in the post-exclusion list).
    const clampedIndex = Math.min(input.toIndex, siblings.length);
    const beforeCol =
      clampedIndex > 0 ? siblings[clampedIndex - 1] : undefined;
    const afterCol =
      clampedIndex < siblings.length ? siblings[clampedIndex] : undefined;

    // 2c. Ask the helper for a position strictly between the
    // neighbours (or at the open end).
    const newPosition = between(
      beforeCol?.position ?? null,
      afterCol?.position ?? null
    );

    // 2d. Persist the move. Position is the only mutable column
    // here — `boardId` doesn't change because a column is moved
    // within its own board.
    const moved = await tx.column.update({
      where: { id: columnId },
      data: { position: newPosition },
      select: {
        id: true,
        title: true,
        boardId: true,
        position: true,
      },
    });

    return moved;
  });
}
