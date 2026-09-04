"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { removeBoardMember } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail } from "./types";

export interface RemoveMemberVariables {
  userId: string;
}

export interface RemoveMemberContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
}

/**
 * `DELETE /api/boards/:id/members/:userId` (Phase 5 Plan §5.2).
 *
 * Used by the `ShareBoardModal`'s per-row remove (X) button. The
 * hook optimistically removes the row from `board.members`; on
 * error the snapshot is restored.
 */
export function useRemoveMemberMutation(
  boardId: string,
): UseMutationResult<
  void,
  Error,
  RemoveMemberVariables,
  RemoveMemberContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }) => removeBoardMember(boardId, userId),

    onMutate: async ({ userId }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      if (previous) {
        const optimistic: BoardDetail = {
          ...previous,
          members: previous.members.filter((m) => m.userId !== userId),
        };
        qc.setQueryData(boardQueryKey(boardId), optimistic);
      }
      return { previous };
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
