"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { deleteTask } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail, Task } from "./types";

export interface DeleteTaskVariables {
  taskId: string;
  columnId: string;
}

export interface DeleteTaskContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
  /** The deleted task, captured at `onMutate` so the caller can
   *  render an "Undo" toast that re-creates the task via
   *  `useCreateTaskMutation` (Phase 5 Plan §5.1 trash + undo). */
  deleted: Task | null;
}

/**
 * `DELETE /api/tasks/:id`.
 *
 * Phase 5 Plan §5.1 — the TaskModal's trash confirm flow goes
 * through this hook. The hook removes the task from the column
 * in the cache optimistically; the TaskModal's caller captures
 * the pre-delete task so an "Undo" toast can re-create it via
 * `useCreateTaskMutation` within the 5-second undo window.
 *
 * Optimistic update flow (mirrors `useCreateTaskMutation`):
 *  - `onMutate` cancels in-flight refetches, snapshots the current
 *    `["board", id]` cache value, and removes the task from the
 *    matching column.
 *  - `onSuccess` clears the modal's `selectedTaskId` (the
 *    caller is expected to call `closeTask()` in the `onSuccess`
 *    callback) and invalidates the query.
 *  - `onError` restores the snapshot.
 *  - `onSettled` invalidates the query so any drift between the
 *    server and the optimistic shape is reconciled.
 *
 * The hook returns the deleted task via the third argument to the
 * caller's `onSuccess` (the `data` field) — but in TanStack the
 * standard pattern is to capture the deleted task inside the
 * `onMutate` `context` instead, so the caller reads it via
 * `onSuccess: (_data, _vars, ctx) => { ctx.deleted }`. Both work;
 * we surface it via the context so the field is type-safe.
 */
export function useDeleteTaskMutation(
  boardId: string,
): UseMutationResult<
  void,
  Error,
  DeleteTaskVariables,
  DeleteTaskContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId }) => deleteTask(taskId),

    onMutate: async ({ taskId, columnId }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      let deleted: Task | null = null;
      if (previous) {
        const column = previous.columns.find((c) => c.id === columnId);
        const found = column?.tasks.find((t) => t.id === taskId);
        if (column && found) {
          deleted = found;
          const optimistic: BoardDetail = {
            ...previous,
            columns: previous.columns.map((c) =>
              c.id === columnId
                ? { ...c, tasks: c.tasks.filter((t) => t.id !== taskId) }
                : c,
            ),
          };
          qc.setQueryData(boardQueryKey(boardId), optimistic);
        }
      }
      return { previous, deleted };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(boardQueryKey(boardId), ctx.previous);
      }
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
    },
  });
}
