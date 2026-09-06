/**
 * Frontend types that mirror the server's response shape for the
 * `board-invitations` module.
 *
 * The server is the source of truth (see
 * `server/src/modules/board-invitations/board-invitations.service.ts`).
 * Dates are serialised to ISO strings over the wire, so we keep them
 * as `string` on the client to avoid accidental `Date` comparisons on
 * unsanitised cache data.
 */

/**
 * A single pending invitation addressed to the current user. Returned
 * by `GET /api/board-invitations`. The list is newest-first (per the
 * server's `orderBy: { createdAt: "desc" }`).
 */
export interface BoardInvitation {
  id: string;
  boardId: string;
  /** The board's title, joined from the `Board` table server-side so
   *  the client can render a useful row without a follow-up fetch. */
  boardTitle: string;
  /** The inviter's email, joined from the `User` table server-side. */
  inviterEmail: string;
  status: "PENDING";
  createdAt: string;
}

/** Response from `POST /api/board-invitations/:id/accept`. The
 *  `boardId` is what the inbox uses to navigate the user to the
 *  newly-joined board. */
export interface AcceptInvitationResult {
  boardId: string;
  invitationId: string;
  status: "ACCEPTED";
}

/** Response from `POST /api/board-invitations/:id/decline`. */
export interface DeclineInvitationResult {
  invitationId: string;
  status: "DECLINED";
}
