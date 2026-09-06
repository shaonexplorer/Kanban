import api from "@/lib/api";
import type {
  AcceptInvitationResult,
  BoardInvitation,
  DeclineInvitationResult,
} from "./types";

/**
 * Tiny typed wrappers around the existing axios instance.
 *
 * The instance already attaches the httpOnly `token` cookie to every
 * request (see `src/lib/api.ts`). We re-use it instead of pulling in
 * `fetch` so there is exactly one place in the codebase that talks
 * to the backend.
 *
 * The board-invitations endpoints live at
 * `GET /api/board-invitations`, `POST /api/board-invitations/:id/accept`,
 * and `POST /api/board-invitations/:id/decline` (Phase 2, mounted in
 * `server/src/modules/board-invitations/board-invitations.routes.ts`).
 * Each route chains `requireAuth → validate("params")` (on the
 * accept / decline paths) so non-UUID ids return 400 before the
 * service is called.
 */

/**
 * Fetch the caller's PENDING invitations. Returns an array (empty
 * array when the user has no pending invites).
 */
export function fetchMyInvitations(): Promise<BoardInvitation[]> {
  return api.get<BoardInvitation[]>("/board-invitations").then((r) => r.data);
}

/** Accept a PENDING invitation by id. Returns the new boardId so
 *  the caller can navigate to the just-joined board. */
export function acceptInvitationApi(
  invitationId: string,
): Promise<AcceptInvitationResult> {
  return api
    .post<AcceptInvitationResult>(
      `/board-invitations/${invitationId}/accept`,
      {},
    )
    .then((r) => r.data);
}

/** Decline a PENDING invitation by id. The invitation is marked
 *  `DECLINED` server-side and won't surface in the next
 *  `fetchMyInvitations()` call. */
export function declineInvitationApi(
  invitationId: string,
): Promise<DeclineInvitationResult> {
  return api
    .post<DeclineInvitationResult>(
      `/board-invitations/${invitationId}/decline`,
      {},
    )
    .then((r) => r.data);
}
