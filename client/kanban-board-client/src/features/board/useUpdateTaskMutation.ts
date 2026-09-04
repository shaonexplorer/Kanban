"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { updateTask, type UpdateTaskInput } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail, Task } from "./types";

export interface UpdateTaskVariables {
  /** The id of the task being updated. */
  taskId: string;
  /** The column the task lives in — needed by `onSuccess` so the
   *  cache write knows which column to update. Optional but
   *  recommended; if omitted, the success path scans every column
   *  to find the matching task id. */
  columnId?: string;
  /** The partial body sent to `PATCH /api/tasks/:id`. */
  patch: UpdateTaskInput;
}

export interface UpdateTaskContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
}

/**
 * `PATCH /api/tasks/:id` with a partial body.
 *
 * Phase 5 Plan §5.1 — the TaskModal's title / description edits,
 * the star toggle, and any future field edits (priority / due
 * date / labels — those land in Step 10) all flow through this
 * hook. The autosave footer of the TaskModal debounces title
 * typing at the call site (600ms) and calls this hook with the
 * trimmed value.
 *
 * Optimistic update flow (mirrors `useCreateTaskMutation`):
 *  - `onMutate` cancels in-flight refetches, snapshots the current
 *    `["board", id]` cache value, and writes the patch into the
 *    matching column's task so the UI reflects the change
 *    immediately.
 *  - `onSuccess` swaps the optimistic task for the server's
 *    authoritative shape (so the real `updatedAt` / any
 *    server-side normalization lands in the cache without a
 *    refetch).
 *  - `onError` restores the snapshot.
 *  - `onSettled` invalidates the query so any drift between the
 *    server and the optimistic shape is reconciled.
 *
 * The `BoardDetail` shape currently returned by `GET /api/boards/:id`
 * doesn't include the new Phase 5 fields (starred, priority, …) —
 * Step 10 widens the select. Until then, a star toggle will be
 * optimistically visible in the cache (because we write the patch
 * directly) but a refetch would clobber it; this is the documented
 * Step 5 limitation, and the existing `onSettled.invalidateQueries`
 * is the safety net that picks up the server state once the column
 * lands in the response shape.
 */
export function useUpdateTaskMutation(
  boardId: string,
): UseMutationResult<
  Task,
  Error,
  UpdateTaskVariables,
  UpdateTaskContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, patch }) => updateTask(taskId, patch),

    onMutate: async ({ taskId, columnId, patch }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      if (previous) {
        const optimistic: BoardDetail = {
          ...previous,
          columns: previous.columns.map((c) => {
            if (columnId !== undefined && c.id !== columnId) return c;
            return {
              ...c,
              tasks: c.tasks.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      ...(patch.title !== undefined
                        ? { title: patch.title }
                        : {}),
                      ...(patch.description !== undefined
                        ? { description: patch.description }
                        : {}),
                    }
                  : t,
              ),
            };
          }),
        };
        qc.setQueryData(boardQueryKey(boardId), optimistic);
      }
      return { previous };
    },

    onSuccess: (server, vars) => {
      qc.setQueryData<BoardDetail | undefined>(
        boardQueryKey(boardId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            columns: current.columns.map((c) => {
              if (vars.columnId !== undefined && c.id !== vars.columnId) {
                return c;
              }
              return {
                ...c,
                tasks: c.tasks.map((t) =>
                  t.id === server.id ? server : t,
                ),
              };
            }),
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
