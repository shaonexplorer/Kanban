"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { deleteBoard, myBoardsQueryKey } from "./api";
import type { MyBoardSummary } from "./useMyBoardsQuery";

export interface DeleteBoardVariables {
  boardId: string;
}

export interface DeleteBoardContext {
  /** The pre-`onMutate` sidebar boards snapshot (for `onError` rollback). */
  previous: MyBoardSummary[] | undefined;
  /** The deleted board summary, captured at `onMutate`. Mirrors
   *  `useDeleteColumnMutation`'s `deleted` field — captured but
   *  intentionally unused. The board-delete UX does NOT surface
   *  an Undo affordance (the backend cascade wipes all child
   *  columns and tasks; re-creating the tree from a snapshot would
   *  be expensive and race-prone), so this field is preserved for
   *  symmetry and a future soft-delete-with-trash-window pass. */
  deleted: MyBoardSummary | null;
}

/**
 * `DELETE /api/boards/:id`.
 *
 * Used by the Sidebar's per-row "Delete" affordance (the
 * `more_horiz` → "Delete" menu in `Sidebar.tsx`). The hook
 * filters the board out of the cached `["boards"]` list
 * optimistically. The backend's `softDeleteBoard` stamps
 * `deletedAt = now()`, so subsequent reads of the deleted
 * board return 404.
 *
 * The hook does NOT touch `boardQueryKey(["board", id])` —
 * the caller is expected to `router.push("/")` on success,
 * which unmounts `BoardView` (the only consumer of that key)
 * before the cache reconciler runs. The home page reads
 * `fetchMyBoards()` directly in a `useEffect`, so the
 * invalidated list query refetches on next mount.
 *
 * Optimistic update flow (mirrors `useDeleteColumnMutation`):
 *  - `onMutate` cancels in-flight refetches, snapshots the
 *    `["boards"]` cache, and removes the row from the list.
 *  - `onError` restores the snapshot.
 *  - `onSettled` invalidates the query so the server's
 *    authoritative shape (no deleted board) is reconciled
 *    with the optimistic cache.
 *
 * No `onSuccess` cache write is needed because the optimistic
 * removal is the terminal state. There is no `Undo` toast
 * surface — see the `deleted` field note above.
 */
export function useDeleteBoardMutation(): UseMutationResult<
  void,
  Error,
  DeleteBoardVariables,
  DeleteBoardContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ boardId }) => deleteBoard(boardId),

    onMutate: async ({ boardId }) => {
      await qc.cancelQueries({ queryKey: myBoardsQueryKey });
      const previous = qc.getQueryData<MyBoardSummary[]>(myBoardsQueryKey);
      let deleted: MyBoardSummary | null = null;
      if (previous) {
        const found = previous.find((b) => b.id === boardId);
        if (found) {
          deleted = found;
          const optimistic: MyBoardSummary[] = previous.filter(
            (b) => b.id !== boardId,
          );
          qc.setQueryData(myBoardsQueryKey, optimistic);
        }
      }
      return { previous, deleted };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(myBoardsQueryKey, ctx.previous);
      }
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: myBoardsQueryKey });
    },
  });
}
