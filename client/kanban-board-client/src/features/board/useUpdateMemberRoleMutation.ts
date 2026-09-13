"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { updateBoardMemberRole } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail, BoardMember } from "./types";

export interface UpdateMemberRoleVariables {
  userId: string;
  role: "ADMIN" | "MEMBER";
}

export interface UpdateMemberRoleContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
}

/**
 * `PATCH /api/boards/:id/members/:userId`.
 *
 * Phase 5 Step 10 — the ShareBoardModal's per-row role selector
 * calls this hook. The hook optimistically updates the member's
 * `role` in the board cache.
 */
export function useUpdateMemberRoleMutation(
  boardId: string,
): UseMutationResult<
  BoardMember,
  Error,
  UpdateMemberRoleVariables,
  UpdateMemberRoleContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }) =>
      updateBoardMemberRole(boardId, userId, role),

    onMutate: async ({ userId, role }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      if (previous) {
        const optimistic: BoardDetail = {
          ...previous,
          members: previous.members.map((m) =>
            m.userId === userId ? { ...m, role: role as "ADMIN" | "OWNER" | "MEMBER" } : m,
          ),
        };
        qc.setQueryData(boardQueryKey(boardId), optimistic);
      }
      return { previous };
    },

    onSuccess: (updated, { userId }) => {
      qc.setQueryData<BoardDetail | undefined>(
        boardQueryKey(boardId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            members: current.members.map((m) =>
              m.userId === userId ? updated : m,
            ),
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
