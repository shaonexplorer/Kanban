"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { setTaskAssignees } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail, TaskAssignee } from "./types";

export interface SetAssigneesVariables {
  taskId: string;
  userIds: string[];
}

export interface SetAssigneesContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
}

/**
 * `PUT /api/tasks/:id/assignees`.
 *
 * Phase 5 Step 10 — replaces the full set of assignees on a task.
 * The hook writes the new assignee list into the board cache optimistically.
 */
export function useSetAssigneesMutation(
  boardId: string,
): UseMutationResult<
  TaskAssignee[],
  Error,
  SetAssigneesVariables,
  SetAssigneesContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, userIds }) =>
      setTaskAssignees(taskId, { userIds }),

    onMutate: async ({ taskId }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      if (previous) {
        const optimistic: BoardDetail = {
          ...previous,
          columns: previous.columns.map((c) => ({
            ...c,
            tasks: c.tasks.map((t) =>
              t.id === taskId ? { ...t, assignees: [] } : t,
            ),
          })),
        };
        qc.setQueryData(boardQueryKey(boardId), optimistic);
      }
      return { previous };
    },

    onSuccess: (assignees, { taskId }) => {
      qc.setQueryData<BoardDetail | undefined>(
        boardQueryKey(boardId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            columns: current.columns.map((c) => ({
              ...c,
              tasks: c.tasks.map((t) =>
                t.id === taskId ? { ...t, assignees } : t,
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
