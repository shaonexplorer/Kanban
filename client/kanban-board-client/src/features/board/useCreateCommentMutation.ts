"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  createComment,
  taskCommentsQueryKey,
} from "./api";
import type { TaskComment } from "./types";

export interface CreateCommentVariables {
  taskId: string;
  body: string;
}

export interface CreateCommentContext {
  /** The pre-`onMutate` comments snapshot (for `onError` rollback). */
  previous: TaskComment[] | undefined;
}

/**
 * `POST /api/tasks/:id/comments`.
 *
 * Phase 5 Step 10 — the TaskModal's comment box calls this hook.
 * Comments are fetched via the separate `useTaskCommentsQuery(taskId)`
 * query (they're not part of the board cache), so this hook
 * optimistically prepends to the `["task-comments", taskId]` cache
 * slot. The `taskId` comes from the mutation *variables* (not the
 * hook parameter) so the same hook instance can be reused across
 * tasks without being re-created.
 */
export function useCreateCommentMutation(): UseMutationResult<
  TaskComment,
  Error,
  CreateCommentVariables,
  CreateCommentContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, body }) => createComment(taskId, { body }),

    onMutate: async ({ taskId, body }) => {
      const queryKey = taskCommentsQueryKey(taskId);
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<TaskComment[]>(queryKey);
      if (previous) {
        const optimistic: TaskComment = {
          id: `optimistic-${crypto.randomUUID()}`,
          taskId,
          body,
          createdAt: new Date().toISOString(),
          author: { id: "me", email: "You" },
        };
        qc.setQueryData(queryKey, [optimistic, ...previous]);
      }
      return { previous };
    },

    onSuccess: (created, { taskId }) => {
      const queryKey = taskCommentsQueryKey(taskId);
      qc.setQueryData<TaskComment[] | undefined>(
        queryKey,
        (current) => {
          if (!current) return current;
          // Replace the optimistic placeholder with the server's row.
          return current.map((c) =>
            c.id.startsWith("optimistic-") ? created : c,
          );
        },
      );
    },

    onError: (_err, vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(
          taskCommentsQueryKey(vars.taskId),
          ctx.previous,
        );
      }
    },

    onSettled: (_data, _err, vars: CreateCommentVariables) => {
      void qc.invalidateQueries({ queryKey: taskCommentsQueryKey(vars.taskId) });
    },
  });
}
