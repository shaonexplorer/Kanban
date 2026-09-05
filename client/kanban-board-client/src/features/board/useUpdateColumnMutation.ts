"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { updateColumn } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail, Column } from "./types";

export interface UpdateColumnVariables {
  /** The id of the column being renamed. */
  columnId: string;
  /** The partial body sent to `PATCH /api/columns/:id`. The
   *  server's `UpdateColumnSchema` currently only accepts
   *  `title`; the partial-patch shape is kept for symmetry with
   *  `useUpdateTaskMutation` so future fields (color, position
   *  bump, etc.) can land here without a hook-shape change. */
  patch: { title: string };
}

export interface UpdateColumnContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
  /** The column's tasks at the moment of `onMutate`, captured
   *  so the server's wire response (which does NOT include
   *  `tasks`) can be merged back into the cache as a full
   *  `Column` shape on `onSuccess`. */
  preservedTasks: import("./types").Task[];
}

/**
 * `PATCH /api/columns/:id` with a partial body.
 *
 * Used by the column header's "Rename" affordance (the
 * `more_horiz` → "Rename" menu in `ColumnShell`). The hook
 * writes the new `title` into the matching column in the cache
 * so the user sees the rename land immediately.
 *
 * Optimistic update flow (mirrors `useUpdateTaskMutation`):
 *  - `onMutate` cancels in-flight refetches, snapshots the
 *    current `["board", id]` cache value, and writes the new
 *    `title` into the matching column. `position` and `tasks`
 *    are preserved (server only mutates `title`).
 *  - `onSuccess` swaps the optimistic column for the
 *    server-authoritative shape so the real `id` (unchanged)
 *    and any server-side normalization (e.g. trimming) lands
 *    in the cache without a refetch.
 *  - `onError` restores the snapshot.
 *  - `onSettled` invalidates the query so any drift between
 *    the server and the optimistic shape is reconciled.
 *
 * The server's wire response is `ColumnMutationResult` (no
 * `tasks` field — see `api.ts:154-159`). The `mutationFn`
 * merges the response with the pre-mutation `tasks` from the
 * `onMutate` context, exposed via the `previous` snapshot
 * fallback (the `tasks` field on the matching column is
 * unchanged across a rename, so reading it from the snapshot
 * is equivalent to reading it from the current cache).
 */
export function useUpdateColumnMutation(
  boardId: string,
): UseMutationResult<
  Column,
  Error,
  UpdateColumnVariables,
  UpdateColumnContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ columnId, patch }) => {
      const server = await updateColumn(columnId, patch);
      // Map the wire shape (`{ id, title, boardId, position }`)
      // to the full `Column` (`{ ..., tasks }`) by preserving
      // the existing tasks from the current cache. We read the
      // current cache here (not the snapshot) so a concurrent
      // task mutation interleaving with the rename still
      // converges correctly.
      const current = qc.getQueryData<BoardDetail>(
        boardQueryKey(boardId),
      );
      const tasks =
        current?.columns.find((c) => c.id === columnId)?.tasks ?? [];
      return { ...server, tasks };
    },

    onMutate: async ({ columnId, patch }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      let preservedTasks: import("./types").Task[] = [];
      if (previous) {
        const target = previous.columns.find((c) => c.id === columnId);
        preservedTasks = target?.tasks ?? [];
        const optimistic: BoardDetail = {
          ...previous,
          columns: previous.columns.map((c) =>
            c.id === columnId ? { ...c, title: patch.title } : c,
          ),
        };
        qc.setQueryData(boardQueryKey(boardId), optimistic);
      }
      return { previous, preservedTasks };
    },

    onSuccess: (server, vars) => {
      qc.setQueryData<BoardDetail | undefined>(
        boardQueryKey(boardId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            columns: current.columns.map((c) => {
              if (c.id !== vars.columnId) return c;
              // Merge the server's wire shape into the existing
              // column. `tasks` is preserved from the
              // `mutationFn` mapping, but we re-read from the
              // current cache here in case a task mutation
              // landed in the meantime (last-write-wins, which
              // matches the existing `useUpdateTaskMutation`
              // behaviour for the same scenario).
              return { ...c, ...server, tasks: server.tasks };
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
