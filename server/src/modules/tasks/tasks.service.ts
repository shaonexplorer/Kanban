import { HttpError } from "../../common/errors/HttpError.js";
import { prisma } from "../../lib/prisma.js";
import { between, nextAppend } from "../../common/utils/floatPosition.js";
import type {
  CreateTaskInput,
  MoveTaskInput,
  UpdateTaskInput,
} from "./tasks.validation.js";

/**
 * Service layer for the `tasks` module.
 *
 * Pure DB + business rules. Every domain failure throws an `HttpError` so
 * the central error middleware can shape the JSON response.
 *
 * Authorization is handled by middleware upstream — `loadColumn` /
 * `loadTask` populate `req.board` (and `req.column` where applicable),
 * and `requireBoardAccess` rejects with 403 if the caller doesn't have
 * access. The service still re-checks defensively so it stays
 * self-contained and tolerant of call paths that bypass the middleware.
 *
 * Phase 5 (Float ordering): `position` is now a `Float` (was a
 * lexicographic string in Phase 4). New tasks append at
 * `MAX(existing.position) + 1000`; reorders + cross-column moves pick
 * a position from the four midpoint cases exposed by
 * `floatPosition.between`. See `src/common/utils/floatPosition.ts` for
 * the precision-floor caveat.
 */

// ---------------------------------------------------------------------------
// Result types — kept local to this module so controllers can lean on them
// without re-deriving the Prisma row shape.
// ---------------------------------------------------------------------------

/**
 * The full task shape returned by every read / mutation endpoint.
 * `position` is a Float (Phase 5).
 */
export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  columnId: string;
  position: number;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Access-control helper (kept local for module independence)
// ---------------------------------------------------------------------------

/**
 * Assert the user has access to the board (owner or accepted `BoardUser`).
 * Throws 403 on miss. Assumes the board row has already been fetched
 * and lives on `board`.
 *
 * Mirrors the helper in `columns.service.ts` — duplicated to keep
 * modules decoupled from one another.
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
 * Create a new task in a column the caller has access to.
 *
 * Position is assigned by `floatPosition.nextAppend(MAX(existing))`,
 * which appends to the end of the column with a fresh Float
 * (`max + 1000`). For an empty column, `nextAppend(null)` returns
 * `1000`.
 *
 * The `:columnId` and parent board are normally validated by the
 * `loadColumn` middleware upstream, but this function re-loads the
 * column (with its board) so it's safe to call directly from anywhere
 * — e.g. unit tests, future background jobs.
 */
export async function createTask(
  userId: string,
  columnId: string,
  input: CreateTaskInput
): Promise<TaskItem> {
  const column = await prisma.column.findUnique({
    where: { id: columnId },
    include: { board: { select: { id: true, ownerId: true, deletedAt: true } } },
  });
  if (!column || column.board.deletedAt !== null) {
    throw new HttpError(404, "Column not found");
  }
  await assertBoardAccess(userId, column.board);

  // Existing tasks ordered by `position desc` so the first row is
  // MAX — a single fetch, no aggregate query needed.
  const tail = await prisma.task.findFirst({
    where: { columnId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const nextPosition = nextAppend(tail?.position ?? null);

  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      columnId,
      position: nextPosition,
    },
    select: {
      id: true,
      title: true,
      description: true,
      columnId: true,
      position: true,
      createdAt: true,
    },
  });

  return task;
}

/**
 * List the tasks in a column (ordered by `position` asc).
 */
export async function listTasks(
  userId: string,
  columnId: string
): Promise<TaskItem[]> {
  const column = await prisma.column.findUnique({
    where: { id: columnId },
    include: { board: { select: { id: true, ownerId: true, deletedAt: true } } },
  });
  if (!column || column.board.deletedAt !== null) {
    throw new HttpError(404, "Column not found");
  }
  await assertBoardAccess(userId, column.board);

  return prisma.task.findMany({
    where: { columnId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      columnId: true,
      position: true,
      createdAt: true,
    },
  });
}

/**
 * Fetch a single task. The `loadTask` middleware already exposed the
 * task + column + board on the request, but the service still re-loads
 * to stay self-contained and to defend against call paths that bypass
 * the middleware.
 */
export async function getTask(
  userId: string,
  taskId: string
): Promise<TaskItem> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      column: { include: { board: { select: { id: true, ownerId: true, deletedAt: true } } } },
    },
  });
  if (!task || task.column.board.deletedAt !== null) {
    throw new HttpError(404, "Task not found");
  }
  await assertBoardAccess(userId, task.column.board);

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    columnId: task.columnId,
    position: task.position,
    createdAt: task.createdAt,
  };
}

/**
 * Update a task's mutable fields. Only `title` and `description` are
 * mutable here — `position` and `columnId` are reserved for the
 * `moveTask` endpoint and cannot be patched via `PATCH /api/tasks/:id`.
 *
 * The input is already pre-validated by the `UpdateTaskSchema`'s
 * `.refine()`, which guarantees at least one field is present. We
 * still build the `data` object from the defined keys so we never
 * push an `undefined` to Prisma (which would otherwise write NULL).
 */
export async function updateTask(
  userId: string,
  taskId: string,
  input: UpdateTaskInput
): Promise<TaskItem> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      column: { include: { board: { select: { id: true, ownerId: true, deletedAt: true } } } },
    },
  });
  if (!task || task.column.board.deletedAt !== null) {
    throw new HttpError(404, "Task not found");
  }
  await assertBoardAccess(userId, task.column.board);

  // Build the patch from defined keys only — never pass `undefined`
  // through to Prisma's `data`.
  const data: { title?: string; description?: string | null } = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;

  const updated = await prisma.task.update({
    where: { id: taskId },
    data,
    select: {
      id: true,
      title: true,
      description: true,
      columnId: true,
      position: true,
      createdAt: true,
    },
  });

  return updated;
}

/**
 * Hard-delete a task. Tasks have no soft-delete column, and deleting a
 * column already cascades to its tasks (per `onDelete: Cascade` on
 * `Task.column`), so this is a single-row delete.
 */
export async function deleteTask(
  userId: string,
  taskId: string
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      column: { include: { board: { select: { id: true, ownerId: true, deletedAt: true } } } },
    },
  });
  if (!task || task.column.board.deletedAt !== null) {
    throw new HttpError(404, "Task not found");
  }
  await assertBoardAccess(userId, task.column.board);

  // Map Prisma's P2025 (row not found) to 404, even though the existence
  // check above should make this unreachable in practice — keeps the
  // wire format consistent with the other read endpoints.
  try {
    await prisma.task.delete({ where: { id: taskId } });
  } catch (err) {
    if (
      err !== null &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      throw new HttpError(404, "Task not found");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Move — Phase 4 Step 3, rewritten for Float in Phase 5
// ---------------------------------------------------------------------------

/**
 * Move a task to a new position, either within the same column
 * (reorder) or across columns on the SAME board. Cross-board moves
 * are rejected with 403.
 *
 * Flow:
 *  1. Defensive checks: load the source task (with column + board),
 *     the destination column (with board), and verify:
 *       - source + destination exist and live on non-deleted boards,
 *       - caller has access to BOTH boards,
 *       - source and destination boards are the SAME (else 403).
 *  2. Inside a single `prisma.$transaction`:
 *     a. List the destination column's tasks (excluding the task being
 *        moved, in case this is a same-column reorder) ordered by
 *        `position asc`.
 *     b. Pick neighbors: `before = tasks[toIndex - 1]`,
 *        `after = tasks[toIndex]` (with `undefined` when out of range
 *        — `toIndex` is clamped to the destination's task count, so
 *        `tasks[toIndex]` is `undefined` only when appending past the
 *        end).
 *     c. Compute `newPosition = floatPosition.between(before, after)`.
 *        The helper handles all four cases (between, append, prepend,
 *        empty) and is O(1) — no iteration over the column.
 *     d. Update the task with both the new `columnId` and the new
 *        `position` in one Prisma call.
 *  3. Return the moved task in the full task shape.
 *
 * KNOWN LIMITATION: Float precision floor. After ~50 midpoint inserts
 * between two neighbors, `between(prev, next)` returns `prev` because
 * the gap is smaller than `Number.EPSILON * prev`. The move still
 * returns 200, but the card lands on the wrong neighbor. Workaround:
 * call `PATCH /api/boards/:id/columns/reorder` (which re-keys to fresh
 * 1000-step Floats in row order via `floatPosition.rePack`) to reset
 * the precision budget.
 *
 * The route's middleware chain (`loadColumn` on `:columnId` + `loadTask`
 * on `:taskId` + `requireBoardAccess`) has already authorized the
 * source side; the destination's board is verified defensively here
 * because the middleware chain doesn't see it.
 *
 * @throws HttpError 404 — source task, source column, or destination
 *   column is missing or its board is soft-deleted.
 * @throws HttpError 403 — cross-board move, or caller lacks access
 *   to the source / destination board.
 * @throws HttpError 400 — `toIndex` is negative (zod should have
 *   caught it, but a safety net stays cheap).
 */
export async function moveTask(
  userId: string,
  taskId: string,
  input: MoveTaskInput
): Promise<TaskItem> {
  // 1. Load + defensive authorization.
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      column: {
        include: {
          board: { select: { id: true, ownerId: true, deletedAt: true } },
        },
      },
    },
  });
  if (!task || task.column.board.deletedAt !== null) {
    throw new HttpError(404, "Task not found");
  }
  await assertBoardAccess(userId, task.column.board);

  // Defensive clamp: `zod` already rejects negative `toIndex`, so
  // reaching a non-integer or negative value here is a programmer
  // error. The clamp below is the documented behaviour for
  // "toIndex larger than the column length".
  if (!Number.isInteger(input.toIndex) || input.toIndex < 0) {
    throw new HttpError(400, "toIndex must be a non-negative integer");
  }

  const destColumn = await prisma.column.findUnique({
    where: { id: input.toColumnId },
    include: {
      board: { select: { id: true, ownerId: true, deletedAt: true } },
    },
  });
  if (!destColumn || destColumn.board.deletedAt !== null) {
    throw new HttpError(404, "Destination column not found");
  }
  await assertBoardAccess(userId, destColumn.board);

  // Cross-board moves are forbidden. 403, not 404 — the caller has
  // access to one of the boards and is asking to mutate a cross-board
  // relationship that doesn't exist.
  if (task.column.boardId !== destColumn.boardId) {
    throw new HttpError(403, "Cross-board moves are not allowed");
  }

  // 2. Atomic move. The Float midpoint is O(1) — no transaction needed
  // for a single-row update, but we still wrap in $transaction so
  // the read-then-write is consistent under concurrent moves.
  return prisma.$transaction(async (tx) => {
    // 2a. List the destination column's tasks EXCLUDING the task
    // being moved (so a same-column reorder picks the right
    // neighbors). Order by `position asc` so indexes map directly
    // to the requested `toIndex`.
    const destTasks = await tx.task.findMany({
      where: { columnId: destColumn.id, NOT: { id: taskId } },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });

    // 2b. Clamp `toIndex` to [0, destTasks.length]. A same-column
    // move to "append" lands at destTasks.length (the last position
    // in the post-exclusion list).
    const clampedIndex = Math.min(input.toIndex, destTasks.length);
    const beforeTask = clampedIndex > 0 ? destTasks[clampedIndex - 1] : undefined;
    const afterTask =
      clampedIndex < destTasks.length ? destTasks[clampedIndex] : undefined;

    // 2c. Ask the helper for a position strictly between the
    // neighbours (or at the open end). The four cases (between /
    // append / prepend / empty) collapse to one O(1) call.
    const newPosition = between(
      beforeTask?.position ?? null,
      afterTask?.position ?? null
    );

    // 2d. Persist the move. Same-column moves are fine: updating
    // `columnId` to the same value is a no-op but cheap.
    const moved = await tx.task.update({
      where: { id: taskId },
      data: { columnId: destColumn.id, position: newPosition },
      select: {
        id: true,
        title: true,
        description: true,
        columnId: true,
        position: true,
        createdAt: true,
      },
    });

    return moved;
  });
}
