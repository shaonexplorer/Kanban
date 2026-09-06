"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { declineInvitationApi } from "./api";
import { myInvitationsQueryKey } from "./useMyInvitationsQuery";
import type {
  BoardInvitation,
  DeclineInvitationResult,
} from "./types";

export interface DeclineInvitationVariables {
  invitationId: string;
}

export interface DeclineInvitationContext {
  previous: BoardInvitation[] | undefined;
  optimisticRemoved: BoardInvitation | null;
}

/**
 * `POST /api/board-invitations/:id/decline`.
 *
 * Same optimistic-remove / snapshot-rollback / invalidate shape as
 * `useAcceptInvitationMutation`. Unlike accept, the caller does not
 * navigate — the row simply disappears from the inbox and the bell
 * badge decrements on the next query settle.
 */
export function useDeclineInvitationMutation(): UseMutationResult<
  DeclineInvitationResult,
  Error,
  DeclineInvitationVariables,
  DeclineInvitationContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invitationId }) =>
      declineInvitationApi(invitationId),

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
          qc.setQueryData(
            myInvitationsQueryKey,
            previous.filter((inv) => inv.id !== invitationId),
          );
        }
      }
      return { previous, optimisticRemoved };
    },

    onError: (_err, _vars, ctx) => {
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
    },
  });
}
