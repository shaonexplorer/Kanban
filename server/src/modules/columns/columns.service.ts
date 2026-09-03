import { HttpError } from "../../common/errors/HttpError.js";
import { prisma } from "../../lib/prisma.js";
import { between, rePackKey } from "../../common/utils/lexoPosition.js";
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
 * Phase 4 (Step 4) introduces the single-column `moveColumn` operation:
 * re-position a column to a specific index on its own board using a
 * lexicographic fractional index. The `position` column is now a lexo
 * string (per Phase 4 Step 1), and the helper `lexoPosition`
 * (`src/common/utils/lexoPosition.ts`) is the **only** place on the
 * server that produces or consumes these strings. A `null` return from
 * `lexoPosition.between` triggers a board-level re-pack (assigning
 * fresh positions in row order) inside the same transaction.
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
  position: string;
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
 * Position is assigned by `lexoPosition.between(max(existing), null)`,
 * which appends to the end of the board with a fresh lexo string. For
 * an empty board, `lexoPosition.first()` is used directly.
 *
 * If the helper's open-ended append exhausts the precision budget
 * (returns `null`), we re-pack the board's existing columns to fresh
 * lexo positions in row order, then take the new column's position
 * from the repacked tail. The create + re-pack happen inside a single
 * `prisma.$transaction` so the board is never observably inconsistent.
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

  return prisma.$transaction(async (tx) => {
    // Existing columns on the board, ordered by `position asc` so
    // the re-pack below can reuse this ordering verbatim.
    const existing = await tx.column.findMany({
      where: { boardId },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });

    // Try the open-ended append: `between(max, null)`. For an empty
    // board, `between(null, null)` returns `first()`.
    const lastCol = existing.length > 0 ? existing[existing.length - 1] : undefined;
    let nextPosition = between(lastCol?.position ?? null, null);

    // Re-pack fallback: the helper has exhausted its precision budget
    // at the open upper end. Re-key every existing column PLUS the
    // new one to fresh `rePackKey` positions in row order. `rePackKey`
    // is the dense V-tail sequence (a0, a0V, a0VV, ..., b0, b0V, ...,
    // c0, ...), which has guaranteed headroom for `between` on the
    // next user append and is unbounded in size.
    if (nextPosition === null) {
      // Re-key existing columns at rePackKey(0..N-1).
      for (let i = 0; i < existing.length; i += 1) {
        await tx.column.update({
          where: { id: existing[i].id },
          data: { position: rePackKey(i) },
        });
      }
      // The new column gets rePackKey(N) — the position immediately
      // after the re-packed tail. This sits below the budget and
      // leaves room for one more user append.
      nextPosition = rePackKey(existing.length);
    }

    const column = await tx.column.create({
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
  });
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
 * Rename a column. Only `title` is mutable in Phase 3/4 — `position` is
 * changed via the `reorderColumns` or `moveColumn` endpoints.
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
 * Phase 4 re-keys with fresh lexo positions (`first()`, then
 * `between(prev, null)` for each subsequent column) instead of
 * integer indices 0..N-1. The result is the same logical ordering, but
 * the writes are now compatible with the lexo scheme used elsewhere.
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

  // Reassign lexo positions in the order given — atomically. The
  // i-th column (0-indexed) gets `rePackKey(i)` from the dense
  // V-tail sequence (a0, a0V, a0VV, ..., b0, b0V, ..., c0, ...).
  // `rePackKey` is the headroom-bearing re-pack helper: each
  // successive position is strictly greater than the previous one,
  // and every adjacent pair has a midpoint that `between` can find
  // (so future moves have room). The sequence is unbounded; large
  // re-packs spread across multiple tiers.
  const updates = input.columnIds.map((id, i) =>
    prisma.column.update({
      where: { id },
      data: { position: rePackKey(i) },
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
// Move — Phase 4 Step 4 (single-column move within a board)
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
 *        `after = columns[toIndex]` (with `undefined` when out of range
 *        — `toIndex` is clamped to the board's column count, so
 *        `columns[toIndex]` is `undefined` only when appending past the
 *        end).
 *     c. Compute `newPosition = lexoPosition.between(before?.position
 *        ?? null, after?.position ?? null)`.
 *     d. If `newPosition === null` (midpoint exhausted), re-pack the
 *        board's columns to fresh lexo positions in row order
 *        (with the moved column inserted at the clamped index), then
 *        read the moved column's final position from the re-packed
 *        list. The re-pack is inside the same transaction so it's
 *        atomic with the move.
 *     e. Otherwise update the column with the new `position`.
 *  3. Return the moved column in the full `ColumnItem` shape.
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
  // "toIndex larger than the board's column count" (REQ-4.4.x).
  if (!Number.isInteger(input.toIndex) || input.toIndex < 0) {
    throw new HttpError(400, "toIndex must be a non-negative integer");
  }

  // 2. Atomic move + (optional) re-pack.
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
    let newPosition = between(
      beforeCol?.position ?? null,
      afterCol?.position ?? null
    );

    // 2d. Re-pack fallback: the helper has exhausted its precision
    // budget between two adjacent positions. Re-key the board
    // (now INCLUDING the moved column, inserted at `clampedIndex`)
    // to fresh `rePackKey` positions in row order, then read the
    // moved column's final position off the re-packed list.
    // `rePackKey` is the dense V-tail sequence with guaranteed
    // headroom, so the re-pack doesn't itself hit the precision
    // budget. Still inside the same transaction.
    if (newPosition === null) {
      // Build the in-memory re-keyed order: existing siblings
      // (already in the right order with the moved column excluded)
      // + the moved column at `clampedIndex`.
      const ordered: { id: string }[] = siblings.map((c) => ({ id: c.id }));
      ordered.splice(clampedIndex, 0, { id: columnId });
      // Re-key in row order using `rePackKey(i)`. This is O(n)
      // writes, still atomic at the outer `tx` boundary.
      const newPositions = new Map<string, string>();
      for (let i = 0; i < ordered.length; i += 1) {
        newPositions.set(ordered[i].id, rePackKey(i));
      }
      for (const [id, pos] of newPositions) {
        await tx.column.update({ where: { id }, data: { position: pos } });
      }
      // The moved column now lives on the board with a fresh
      // position. Reflect that here so the returned shape is
      // consistent with the post-move state.
      newPosition = newPositions.get(columnId) ?? null;
      if (newPosition === null) {
        // Defensive: shouldn't happen — we just inserted the id
        // into the map above.
        throw new HttpError(500, "Failed to compute new position after re-pack");
      }
    }

    // 2e. Persist the move. Position is the only mutable column
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
