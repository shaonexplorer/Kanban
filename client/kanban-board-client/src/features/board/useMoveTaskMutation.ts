"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import { moveTask } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import { moveTaskWithinBoard } from "./reorderBoard";
import type { BoardDetail, Task } from "./types";

export interface MoveTaskVariables {
  /** The id of the task being moved. */
  taskId: string;
  /** The id of the column the task currently lives in (used in the URL). */
  sourceColumnId: string;
  /** The destination column. May equal `sourceColumnId` for a same-column reorder. */
  toColumnId: string;
  /** Zero-based index in the destination column's task list after the move. */
  toIndex: number;
}

export interface MoveTaskContext {
  /** The pre-`onMutate` board (for the TanStack fallback rollback path). */
  previous: BoardDetail | undefined;
}

/**
 * Move (or reorder) a task on a board.
 *
 * Optimistic update flow:
 *  - `onMutate` cancels in-flight refetches, snapshots the current
 *    `["board", id]` cache value, and writes the post-move shape
 *    into the cache so the UI reflects the move immediately.
 *  - `onError` restores the snapshot. The dnd-kit `onDragStart`
 *    snapshot (held in `snapshotRef`) is preferred because it
 *    captures the board state before any `onDragOver` previews; if
 *    that's `null` (e.g. direct call), the TanStack `previous` is
 *    used.
 *  - `onSettled` invalidates the query so the server's
 *    authoritative ordering reconciles any drift.
 */
export function useMoveTaskMutation(
  boardId: string,
  snapshotRef: RefObject<BoardDetail | null>,
) {
  const qc = useQueryClient();

  return useMutation<Task, Error, MoveTaskVariables, MoveTaskContext>({
    mutationFn: (vars) =>
      moveTask(vars.sourceColumnId, vars.taskId, {
        toColumnId: vars.toColumnId,
        toIndex: vars.toIndex,
      }),

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      if (previous) {
        const optimistic = moveTaskWithinBoard(
          previous,
          vars.taskId,
          vars.toColumnId,
          vars.toIndex,
        );
        qc.setQueryData(boardQueryKey(boardId), optimistic);
      }
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      // Prefer the dnd-kit snapshot — it was captured BEFORE any
      // onDragOver preview edits, so it's the true pre-drag state.
      // Fall back to TanStack's own snapshot for direct callers.
      const snap = snapshotRef.current ?? ctx?.previous ?? null;
      if (snap) {
        qc.setQueryData(boardQueryKey(boardId), snap);
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
    },
  });
}
