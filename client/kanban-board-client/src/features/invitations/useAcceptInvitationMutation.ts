"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { acceptInvitationApi } from "./api";
import { myInvitationsQueryKey } from "./useMyInvitationsQuery";
import { myBoardsQueryKey } from "@/features/board/api";
import type {
  AcceptInvitationResult,
  BoardInvitation,
} from "./types";

export interface AcceptInvitationVariables {
  invitationId: string;
}

export interface AcceptInvitationContext {
  /** The pre-`onMutate` invitation list (for `onError` rollback). */
  previous: BoardInvitation[] | undefined;
  /** The invitation we optimistically removed, so `onError` can
   *  restore it precisely. */
  optimisticRemoved: BoardInvitation | null;
}

/**
 * `POST /api/board-invitations/:id/accept`.
 *
 * Used by `<InvitationsInbox />`'s `Accept` button. The hook
 * optimistically removes the matching row from the cached
 * `["my-invitations"]` list so the inbox updates immediately, then
 * invalidates the list + the boards list on settle. On error the
 * row is restored.
 *
 * The accept endpoint atomically promotes the invitation to a
 * `BoardUser` row (see
 * `server/src/modules/board-invitations/board-invitations.service.ts:101`
 * — the `prisma.$transaction` wraps the upsert + status flip). So
 * once the server returns 200, the new board is visible in
 * `GET /api/boards` and the bell badge will reflect the new state
 * after the `["my-boards"]` invalidate.
 *
 * The mutation does NOT navigate to the new board on its own —
 * navigation is the caller's responsibility (the inbox closes
 * first, then `BoardView` / `page.tsx` calls `router.push` via
 * the `onAccepted?: (boardId) => void` prop the parent passes
 * in). This keeps the hook router-agnostic and easy to reuse
 * from a future entry point.
 *
 * **Cache key note for the implementer:** `myBoardsQueryKey` is
 * imported from `features/board/api.ts` (the `["my-boards"]`
 * symbol), not from `features/board/useMyBoardsQuery.ts` (which
 * is a dead-code duplicate under the key `["boards"]`). This
 * matters: the create-board flow already invalidates
 * `["my-boards"]`, and we want accept to share the same key so
 * the new board shows up in the sidebar on next visit.
 */
export function useAcceptInvitationMutation(): UseMutationResult<
  AcceptInvitationResult,
  Error,
  AcceptInvitationVariables,
  AcceptInvitationContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invitationId }) =>
      acceptInvitationApi(invitationId),

    onMutate: async ({ invitationId }) => {
      await qc.cancelQueries({ queryKey: myInvitationsQueryKey });
      const previous = qc.getQueryData<BoardInvitation[]>(
        myInvitationsQueryKey,
      );
      let optimisticRemoved: BoardInvitation | null = null;
      if (previous) {
        const idx = previous.findIndex((inv) => inv.id === invitationId);
        if (idx >= 0) {
          optimisticRemoved = previous[idx];
          const next = previous.filter((inv) => inv.id !== invitationId);
          qc.setQueryData(myInvitationsQueryKey, next);
        }
      }
      return { previous, optimisticRemoved };
    },

    onError: (_err, _vars, ctx) => {
      // Prefer the snapshot — covers the case where the user
      // accepted several in a row.
      if (ctx?.previous) {
        qc.setQueryData(myInvitationsQueryKey, ctx.previous);
      } else if (ctx?.optimisticRemoved) {
        qc.setQueryData<BoardInvitation[] | undefined>(
          myInvitationsQueryKey,
          (current) => {
            if (!current) return current;
            return [...current, ctx.optimisticRemoved!];
          },
        );
      }
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: myInvitationsQueryKey });
      void qc.invalidateQueries({ queryKey: myBoardsQueryKey });
    },
  });
}
