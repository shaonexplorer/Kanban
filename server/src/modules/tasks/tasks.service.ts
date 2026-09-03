import { HttpError } from "../../common/errors/HttpError.js";
import { prisma } from "../../lib/prisma.js";
import type {
  CreateTaskInput,
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
 * Phase 3 only appends to the end of a column — no reorder endpoints,
 * no cross-column move. Position is computed as
 * `(max(position) of existing tasks in the column) + 1`, or `0` for an
 * empty column. Gaps are allowed; Phase 4's fractional-indexing
 * strategy will consume them.
 */

// ---------------------------------------------------------------------------
// Result types — kept local to this module so controllers can lean on them
// without re-deriving the Prisma row shape.
// ---------------------------------------------------------------------------

/**
 * The full task shape returned by every read / mutation endpoint.
 * Matches the documented response contract in Requirements §4.
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
 * Position is computed as `(max(position) of existing tasks in the
 * column) + 1`, or `0` if the column is empty. Gaps are allowed —
 * Phase 4's fractional-indexing strategy (or equivalent gap-based
 * approach) will consume them.
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

  // Compute the next position: max(existing) + 1, or 0 if the column is empty.
  const maxRow = await prisma.task.aggregate({
    where: { columnId },
    _max: { position: true },
  });
  const nextPosition = (maxRow._max.position ?? -1) + 1;

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
 * mutable in Phase 3 — `position` and `columnId` are reserved for
 * Phase 4 (reorder / cross-column move).
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
