"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { deleteSubtask } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail } from "./types";

export interface DeleteSubtaskVariables {
  taskId: string;
  subtaskId: string;
}

export interface DeleteSubtaskContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
}

/**
 * `DELETE /api/tasks/:id/subtasks/:subtaskId`.
 *
 * Phase 5 Step 10 — the TaskModal's subtask list can remove items.
 * The hook optimistically removes the subtask from the task's
 * `subtasks` array in the board cache.
 */
export function useDeleteSubtaskMutation(
  boardId: string,
): UseMutationResult<void, Error, DeleteSubtaskVariables, DeleteSubtaskContext> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, subtaskId }) => deleteSubtask(taskId, subtaskId),

    onMutate: async ({ taskId, subtaskId }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      if (previous) {
        const optimistic: BoardDetail = {
          ...previous,
          columns: previous.columns.map((c) => ({
            ...c,
            tasks: c.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    subtasks: t.subtasks.filter((s) => s.id !== subtaskId),
                  }
                : t,
            ),
          })),
        };
        qc.setQueryData(boardQueryKey(boardId), optimistic);
      }
      return { previous };
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
