"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import api from "@/lib/api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail, Task } from "./types";

export interface CreateTaskArgs {
  columnId: string;
  title: string;
}

export interface CreateTaskContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
  /** The id we used for the optimistic placeholder task, so the
   *  rollback can find and remove it. */
  optimisticId: string;
}

/**
 * `POST /api/columns/:columnId/tasks` with `{ title }`.
 *
 * Optimistic update flow (per Phase 5 Plan §2.2):
 *  - `onMutate` cancels in-flight refetches, snapshots the current
 *    `["board", id]` cache value, and appends a placeholder task to
 *    the target column so the card appears immediately. A temporary
 *    `clientId` is used so the rollback can find and remove the
 *    exact row.
 *  - `onSuccess` replaces the placeholder with the server's
 *    authoritative task (so the real `id`, `position`, `createdAt`
 *    land in the cache without a refetch).
 *  - `onError` restores the snapshot AND removes the placeholder,
 *    whichever is preferred by the caller (the snapshot wins — it
 *    covers the edge case where the user added *another* task
 *    while this one was in flight).
 *  - `onSettled` invalidates the query so any drift between the
 *    server and the optimistic shape is reconciled.
 */
export function useCreateTaskMutation(
  boardId: string,
): UseMutationResult<Task, Error, CreateTaskArgs, CreateTaskContext> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ columnId, title }) => {
      const { data } = await api.post<Task>(
        `/columns/${columnId}/tasks`,
        { title },
      );
      return data;
    },

    onMutate: async ({ columnId, title }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      if (previous) {
        const placeholder: Task = {
          id: optimisticId,
          title,
          description: null,
          position: "a0",
          columnId,
          createdAt: new Date().toISOString(),
        };
        const optimistic: BoardDetail = {
          ...previous,
          columns: previous.columns.map((c) =>
            c.id === columnId
              ? { ...c, tasks: [...c.tasks, placeholder] }
              : c,
          ),
        };
        qc.setQueryData(boardQueryKey(boardId), optimistic);
      }
      return { previous, optimisticId };
    },

    onSuccess: (created, _vars, ctx) => {
      qc.setQueryData<BoardDetail | undefined>(
        boardQueryKey(boardId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            columns: current.columns.map((c) => {
              if (c.id !== created.columnId) return c;
              // Swap the placeholder (if still present) for the
              // real task. Append at the end if the placeholder
              // is gone (e.g. another optimistic add raced).
              const withoutPlaceholder = ctx
                ? c.tasks.filter((t) => t.id !== ctx.optimisticId)
                : c.tasks;
              return { ...c, tasks: [...withoutPlaceholder, created] };
            }),
          };
        },
      );
    },

    onError: (_err, _vars, ctx) => {
      // Prefer the snapshot — it covers the case where the user
      // has already typed + submitted another task while this one
      // was in flight. Falling back to "remove just the placeholder"
      // would still be correct in the simple case, but the snapshot
      // is unambiguously the right rollback.
      if (ctx?.previous) {
        qc.setQueryData(boardQueryKey(boardId), ctx.previous);
      }
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
    },
  });
}
