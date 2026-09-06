"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { deleteColumn } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail, Column } from "./types";

export interface DeleteColumnVariables {
  columnId: string;
}

export interface DeleteColumnContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
  /** The deleted column, captured at `onMutate` for symmetry
   *  with `useDeleteTaskMutation`. The column-delete UX does
   *  NOT surface an Undo affordance (the backend cascade
   *  wipes all child tasks; re-creating them from a snapshot
   *  would be expensive and unreliable), so this field is
   *  captured but intentionally unused. The next pass that
   *  adds a soft-delete with a server-side trash window can
   *  wire an Undo without changing the hook shape. */
  deleted: Column | null;
}

/**
 * `DELETE /api/columns/:id`.
 *
 * Used by the column header's "Delete" affordance (the
 * `more_horiz` → "Delete" menu in `ColumnShell`). The hook
 * filters the column out of the cache optimistically. The
 * backend's `onDelete: Cascade` on `Task → Column` (see
 * `prisma/schema.prisma`) wipes all child tasks in the same
 * transaction, so the cache write is the terminal state on
 * the client too.
 *
 * Optimistic update flow (mirrors `useDeleteTaskMutation`):
 *  - `onMutate` cancels in-flight refetches, snapshots the
 *    current `["board", id]` cache value, and removes the
 *    column from `board.columns`. Its tasks go with it.
 *  - `onError` restores the snapshot.
 *  - `onSettled` invalidates the query so the server's
 *    authoritative shape (no deleted column) is reconciled
 *    with the optimistic cache.
 *
 * No `onSuccess` cache write is needed because the optimistic
 * removal is the terminal state. There is no `Undo` toast
 * surface (see the `deleted` field note above).
 */
export function useDeleteColumnMutation(
  boardId: string,
): UseMutationResult<
  void,
  Error,
  DeleteColumnVariables,
  DeleteColumnContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ columnId }) => deleteColumn(columnId),

    onMutate: async ({ columnId }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      let deleted: Column | null = null;
      if (previous) {
        const found = previous.columns.find((c) => c.id === columnId);
        if (found) {
          deleted = found;
          const optimistic: BoardDetail = {
            ...previous,
            columns: previous.columns.filter((c) => c.id !== columnId),
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
