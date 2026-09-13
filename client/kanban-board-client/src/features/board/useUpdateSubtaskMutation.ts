"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { updateSubtask, type UpdateSubtaskInput } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail, TaskSubtask } from "./types";

export interface UpdateSubtaskVariables {
  taskId: string;
  subtaskId: string;
  patch: UpdateSubtaskInput;
}

export interface UpdateSubtaskContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
}

/**
 * `PATCH /api/tasks/:id/subtasks/:subtaskId`.
 *
 * Phase 5 Step 10 — the TaskModal's subtask checkbox toggles `done`
 * (and can also patch `title`). The hook writes the patch into the
 * task's `subtasks` array in the board cache optimistically.
 */
export function useUpdateSubtaskMutation(
  boardId: string,
): UseMutationResult<
  TaskSubtask,
  Error,
  UpdateSubtaskVariables,
  UpdateSubtaskContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, subtaskId, patch }) =>
      updateSubtask(taskId, subtaskId, patch),

    onMutate: async ({ taskId, subtaskId, patch }) => {
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
                    subtasks: t.subtasks.map((s) =>
                      s.id === subtaskId
                        ? { ...s, ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.done !== undefined ? { done: patch.done } : {}) }
                        : s,
                    ),
                  }
                : t,
            ),
          })),
        };
        qc.setQueryData(boardQueryKey(boardId), optimistic);
      }
      return { previous };
    },

    onSuccess: (updated, { taskId, subtaskId }) => {
      qc.setQueryData<BoardDetail | undefined>(
        boardQueryKey(boardId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            columns: current.columns.map((c) => ({
              ...c,
              tasks: c.tasks.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      subtasks: t.subtasks.map((s) =>
                        s.id === subtaskId ? updated : s,
                      ),
                    }
                  : t,
              ),
            })),
          };
        },
      );
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
