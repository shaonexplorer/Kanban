import type { Request, Response } from "express";
import * as invitationsService from "./board-invitations.service.js";
import type { InvitationIdParam } from "./board-invitations.validation.js";

/**
 * Controller layer for the `board-invitations` module.
 *
 * Each handler is a thin shell: it reads the already-validated input
 * (from `req.user` or `req.params`), delegates to the service, and shapes
 * the HTTP response.
 *
 * Errors thrown from the service are caught by `asyncHandler` and
 * forwarded to the central error middleware — controllers do not
 * catch them.
 */

/**
 * GET /api/board-invitations — list the caller's PENDING invitations.
 * Returns 200 with an array.
 */
export async function listInvitations(
  req: Request,
  res: Response
): Promise<void> {
  const { id: userId } = req.user!;
  const invitations = await invitationsService.listMyInvitations(userId);
  res.status(200).json(invitations);
}

/**
 * POST /api/board-invitations/:id/accept — accept a PENDING invitation
 * addressed to the caller. Returns 200 with
 * `{ boardId, invitationId, status: "ACCEPTED" }`.
 */
export async function acceptInvitation(
  req: Request,
  res: Response
): Promise<void> {
  const { id: userId } = req.user!;
  const { id: invitationId } = req.params as InvitationIdParam;
  const result = await invitationsService.acceptInvitation(
    userId,
    invitationId
  );
  res.status(200).json(result);
}

/**
 * POST /api/board-invitations/:id/decline — decline a PENDING invitation
 * addressed to the caller. Returns 200 with
 * `{ invitationId, status: "DECLINED" }`.
 */
export async function declineInvitation(
  req: Request,
  res: Response
): Promise<void> {
  const { id: userId } = req.user!;
  const { id: invitationId } = req.params as InvitationIdParam;
  const result = await invitationsService.declineInvitation(
    userId,
    invitationId
  );
  res.status(200).json(result);
}
