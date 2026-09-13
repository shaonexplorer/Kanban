"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { createSubtask } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail, TaskSubtask } from "./types";

export interface CreateSubtaskVariables {
  taskId: string;
  title: string;
}

export interface CreateSubtaskContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
  /** The optimistic id used for the placeholder, so `onSuccess` can
   *  swap it for the server's authoritative row. */
  optimisticId: string;
}

/**
 * `POST /api/tasks/:id/subtasks`.
 *
 * Phase 5 Step 10 — the TaskModal's "+ Add a new item…" input calls
 * this hook. The subtask is appended to the task's `subtasks` array in
 * the board cache optimistically; on success the placeholder is swapped
 * for the server's authoritative row.
 */
export function useCreateSubtaskMutation(
  boardId: string,
): UseMutationResult<
  TaskSubtask,
  Error,
  CreateSubtaskVariables,
  CreateSubtaskContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, title }) =>
      createSubtask(taskId, { title }),

    onMutate: async ({ taskId, title }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      const optimisticId = `optimistic-subtask-${crypto.randomUUID()}`;
      if (previous) {
        const optimistic: BoardDetail = {
          ...previous,
          columns: previous.columns.map((c) => ({
            ...c,
            tasks: c.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    subtasks: [
                      ...t.subtasks,
                      {
                        id: optimisticId,
                        taskId,
                        title,
                        done: false,
                        position: Number.MAX_SAFE_INTEGER,
                        createdAt: new Date().toISOString(),
                      },
                    ],
                  }
                : t,
            ),
          })),
        };
        qc.setQueryData(boardQueryKey(boardId), optimistic);
      }
      return { previous, optimisticId };
    },

    onSuccess: (created, { taskId }, ctx) => {
      const optimisticId = ctx?.optimisticId;
      qc.setQueryData<BoardDetail | undefined>(
        boardQueryKey(boardId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            columns: current.columns.map((c) => ({
              ...c,
              tasks: c.tasks.map((t) =>
                t.id === taskId && optimisticId
                  ? {
                      ...t,
                      subtasks: [
                        ...t.subtasks.filter((s) => s.id !== optimisticId),
                        created,
                      ],
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
