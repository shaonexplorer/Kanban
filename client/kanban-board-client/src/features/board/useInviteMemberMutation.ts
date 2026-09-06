"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  inviteBoardMember,
  type InviteMemberInput,
  type BoardInvitationResult,
} from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail, BoardMember } from "./types";

export interface InviteMemberVariables {
  email: string;
  /** Optional role hint — the server defaults to "MEMBER". */
  role?: "MEMBER" | "ADMIN";
}

export interface InviteMemberContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
  /** The optimistic member row we appended to `board.members`. */
  optimisticRow: BoardMember | null;
}

/**
 * `POST /api/boards/:id/members` (Phase 5 Plan §5.2).
 *
 * Used by the `ShareBoardModal`'s Send Invite button. The hook
 * optimistically appends a `pending`-tagged row to
 * `board.members` so the invite appears in the collaborators
 * list immediately, then swaps it for the server-authoritative
 * invitation on success. On error the optimistic row is
 * removed.
 *
 * Note: the current `BoardMember` shape on the client (mirrored
 * from `server/src/modules/boards/boards.service.ts`) is
 * `{ userId, email, role: "OWNER" | "MEMBER", joinedAt }`. An
 * invitation creates a `BoardInvitation` row, NOT a `BoardUser`
 * row — the invitation is only promoted to a `BoardUser` when
 * the invitee accepts it. Until then, the recipient doesn't
 * appear in `board.members`. The optimistic row uses a
 * placeholder `userId = "pending-<email>"` and a `joinedAt` of
 * the current timestamp so the modal can render a "pending"
 * affordance; the `useBoardQuery` invalidate on `onSettled` will
 * reconcile this once the recipient accepts (the modal will then
 * re-render without the pending row and with the real one).
 */
export function useInviteMemberMutation(
  boardId: string,
): UseMutationResult<
  BoardInvitationResult,
  Error,
  InviteMemberVariables,
  InviteMemberContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }) =>
      inviteBoardMember(
        boardId,
        role !== undefined
          ? ({ email, role } as InviteMemberInput)
          : ({ email } as InviteMemberInput),
      ),

    onMutate: async ({ email }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      const optimisticId = `pending-${email}`;
      let optimisticRow: BoardMember | null = null;
      if (previous) {
        // Defensive: don't double-append if the same email is already
        // pending (or already a member).
        if (
          !previous.members.some(
            (m) => m.email === email || m.userId === optimisticId,
          )
        ) {
          optimisticRow = {
            userId: optimisticId,
            email,
            role: "MEMBER",
            joinedAt: new Date().toISOString(),
          };
          const optimistic: BoardDetail = {
            ...previous,
            members: [...previous.members, optimisticRow],
          };
          qc.setQueryData(boardQueryKey(boardId), optimistic);
        }
      }
      return { previous, optimisticRow };
    },

    onSuccess: (invitation) => {
      // Swap the optimistic row for the real invitation. The
      // `BoardDetail` shape doesn't currently include pending
      // invitations, so the row gets a `userId` derived from the
      // invitation's `inviteeId` — and the `joinedAt` is the
      // invitation's `createdAt`. Once the invitee accepts, the
      // next `useBoardQuery` invalidate will replace this row
      // with the real `BoardUser` entry.
      qc.setQueryData<BoardDetail | undefined>(
        boardQueryKey(boardId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            members: current.members.map((m) =>
              m.userId === `pending-${invitation.inviteeId}` ||
              m.userId === `pending-` ||
              m.email === invitation.inviteeId
                ? {
                    userId: invitation.inviteeId,
                    email: m.email,
                    role: "MEMBER" as const,
                    joinedAt: invitation.createdAt,
                  }
                : m,
            ),
          };
        },
      );
    },

    onError: (_err, _vars, ctx) => {
      // console.log("invite member error", _err, ctx);
      // Prefer the snapshot — it covers the case where the user
      // invited several people in a row.
      if (ctx?.previous) {
        qc.setQueryData(boardQueryKey(boardId), ctx.previous);
      } else if (ctx?.optimisticRow) {
        // Fallback: strip just the placeholder.
        qc.setQueryData<BoardDetail | undefined>(
          boardQueryKey(boardId),
          (current) => {
            if (!current) return current;
            return {
              ...current,
              members: current.members.filter(
                (m) => m.userId !== ctx.optimisticRow!.userId,
              ),
            };
          },
        );
      }
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
    },
  });
}
