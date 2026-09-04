import type { BoardDetail, Column, Task } from "./types";

/**
 * Pure helpers for moving a task between columns and reordering columns
 * within a board. These are used by the optimistic-update path in the
 * TanStack Query mutations and the dnd-kit `onDragOver` preview — the
 * cache and the React tree should converge on the same shape.
 *
 * All helpers are immutable: they return a new `BoardDetail` rather
 * than mutating the input. The server's `position` numbers are kept
 * unchanged during a drag (the server is the only writer of positions)
 * — the client only reorders the arrays.
 */

function clone<T>(value: T): T {
  // `structuredClone` is available in the browser; if we ever need to
  // support older runtimes, swap to JSON.parse(JSON.stringify(value)).
  return structuredClone(value);
}

/** Insert `item` into `arr` at `index` (clamped to [0, arr.length]). */
export function insertAt<T>(arr: T[], item: T, index: number): T[] {
  const clamped = Math.max(0, Math.min(index, arr.length));
  const next = [...arr];
  next.splice(clamped, 0, item);
  return next;
}

/** Remove the first item from `arr` whose id matches `id`. */
export function removeById<T extends { id: string }>(arr: T[], id: string): T[] {
  return arr.filter((item) => item.id !== id);
}

/** Return the index of the first item whose id matches `id`, or -1. */
export function indexById<T extends { id: string }>(arr: T[], id: string): number {
  return arr.findIndex((item) => item.id === id);
}

/**
 * Move a task from its current column into `toColumnId` at `toIndex`.
 *
 * The task is removed from its source column (if found) and inserted
 * into the destination column. If the source and destination are the
 * same column, the task is reordered in place.
 */
export function moveTaskWithinBoard(
  board: BoardDetail,
  taskId: string,
  toColumnId: string,
  toIndex: number,
): BoardDetail {
  // Find the source column + task. We scan every column so the
  // helper works even if the caller has lost track of the source
  // (e.g. the cache was mutated by `onDragOver`).
  let sourceColumnId: string | null = null;
  let task: Task | null = null;

  for (const col of board.columns) {
    const idx = indexById(col.tasks, taskId);
    if (idx >= 0) {
      sourceColumnId = col.id;
      task = col.tasks[idx];
      break;
    }
  }

  if (!task || !sourceColumnId) {
    // The task isn't on the board. Return the board unchanged — the
    // caller (mutation `onMutate`) will get a "previous" snapshot to
    // roll back to, so an inconsistent state shouldn't reach the UI.
    return board;
  }

  const next: BoardDetail = {
    ...board,
    columns: board.columns.map((col): Column => {
      if (col.id === sourceColumnId && col.id === toColumnId) {
        // Same-column reorder: remove then re-insert at the target
        // index. The remove shifts subsequent indices down by one, so
        // adjust the insertion index if the user dropped a later slot
        // (matters when the target index is *after* the current one).
        const currentIndex = indexById(col.tasks, taskId);
        const without = removeById(col.tasks, taskId);
        const adjustedIndex =
          toIndex > currentIndex ? toIndex - 1 : toIndex;
        return { ...col, tasks: insertAt(without, task, adjustedIndex) };
      }

      if (col.id === sourceColumnId) {
        return { ...col, tasks: removeById(col.tasks, taskId) };
      }

      if (col.id === toColumnId) {
        return { ...col, tasks: insertAt(col.tasks, task, toIndex) };
      }

      return col;
    }),
  };

  return next;
}

/**
 * Reorder the columns array by moving the column at `fromIndex` to
 * `toIndex`. No-op when the indices are out of range or equal.
 */
export function reorderColumnsInBoard(
  board: BoardDetail,
  fromIndex: number,
  toIndex: number,
): BoardDetail {
  if (
    fromIndex < 0 ||
    fromIndex >= board.columns.length ||
    toIndex < 0 ||
    toIndex >= board.columns.length ||
    fromIndex === toIndex
  ) {
    return board;
  }
  const next = [...board.columns];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return { ...board, columns: next };
}

/**
 * Locate the column that contains a given task id. Returns the
 * column or `undefined` if the task isn't on the board.
 */
export function findColumnOfTask(
  board: BoardDetail,
  taskId: string,
): Column | undefined {
  return board.columns.find((c) => c.tasks.some((t) => t.id === taskId));
}

/**
 * Make a deep, structured clone of the board. Used at `onDragStart`
 * time to capture the pre-drag state for rollback.
 */
export function snapshotBoard(board: BoardDetail): BoardDetail {
  return clone(board);
}
