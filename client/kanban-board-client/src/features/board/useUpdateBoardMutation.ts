"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  myBoardsQueryKey,
  updateBoard,
  type UpdateBoardInput,
  type BoardMutationResult,
} from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail } from "./types";
import type { MyBoardSummary } from "./useMyBoardsQuery";

export interface UpdateBoardVariables {
  patch: UpdateBoardInput;
}

export interface UpdateBoardContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
  /** The pre-`onMutate` sidebar boards snapshot (for `onError`
   *  rollback). Only populated when the patch contains `title` —
   *  `linkSharing` is not modelled on the sidebar summary, so
   *  the list cache is only touched for renames. */
  previousList: MyBoardSummary[] | undefined;
}

/**
 * `PATCH /api/boards/:id` (Phase 5 Plan §5.2 — link-sharing toggle;
 * Phase 5 board-management — rename from the Sidebar).
 *
 * Used by the `ShareBoardModal`'s "Anyone with the link can view"
 * toggle and by the Sidebar's per-row "Rename" affordance. The
 * hook writes the patch into the active board cache optimistically
 * AND — when the patch contains `title` — into the sidebar's
 * `["boards"]` list cache so the row's label updates without
 * waiting for a refetch. On error both snapshots are restored.
 *
 * The `linkSharing` field is accepted server-side (the
 * `UpdateBoardSchema` widens to include it) but persistence
 * lands in Step 10's `phase05_polish` migration. The
 * `onSettled.invalidateQueries` is the safety net that picks up
 * the server's authoritative response shape once the column
 * lands in `BoardDetail`.
 */
export function useUpdateBoardMutation(
  boardId: string,
): UseMutationResult<
  BoardMutationResult,
  Error,
  UpdateBoardVariables,
  UpdateBoardContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ patch }) => updateBoard(boardId, patch),

    onMutate: async ({ patch }) => {
      // Cancel in-flight refetches on both caches so the
      // optimistic write isn't clobbered by a stale background
      // refetch.
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      await qc.cancelQueries({ queryKey: myBoardsQueryKey });

      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      if (previous) {
        const optimistic: BoardDetail = {
          ...previous,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
        };
        qc.setQueryData(boardQueryKey(boardId), optimistic);
      }

      // Mirror the rename into the sidebar's list cache so the
      // per-row label updates without waiting for a refetch.
      // `linkSharing` doesn't appear on the summary type, so we
      // skip the list patch when the patch is link-only.
      let previousList: MyBoardSummary[] | undefined;
      if (patch.title !== undefined) {
        previousList = qc.getQueryData<MyBoardSummary[]>(myBoardsQueryKey);
        if (previousList) {
          const nextList: MyBoardSummary[] = previousList.map((b) =>
            b.id === boardId ? { ...b, title: patch.title! } : b,
          );
          qc.setQueryData(myBoardsQueryKey, nextList);
        }
      }

      return { previous, previousList };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(boardQueryKey(boardId), ctx.previous);
      }
      if (ctx?.previousList) {
        qc.setQueryData(myBoardsQueryKey, ctx.previousList);
      }
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
      void qc.invalidateQueries({ queryKey: myBoardsQueryKey });
    },
  });
}
