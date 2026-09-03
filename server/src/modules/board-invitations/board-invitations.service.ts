import { HttpError } from "../../common/errors/HttpError.js";
import { prisma } from "../../lib/prisma.js";

/**
 * Service layer for the `board-invitations` module.
 *
 * Pure DB + business rules. Every domain failure throws an `HttpError` so
 * the central error middleware can shape the JSON response.
 *
 * All per-invitation actions (accept, decline) enforce that
 * `req.user.id === invitation.inviteeId` — only the addressee may
 * transition their own invitation.
 */

// ---------------------------------------------------------------------------
// Result types — kept local to this module so controllers can lean on them
// without re-deriving the Prisma row shape.
// ---------------------------------------------------------------------------

/** A single item in the `GET /api/board-invitations` response. */
export interface InvitationListItem {
  id: string;
  boardId: string;
  boardTitle: string;
  inviterEmail: string;
  status: "PENDING";
  createdAt: Date;
}

/** The shape of `POST /api/board-invitations/:id/accept`'s response body. */
export interface AcceptInvitationResult {
  boardId: string;
  invitationId: string;
  status: "ACCEPTED";
}

/** The shape of `POST /api/board-invitations/:id/decline`'s response body. */
export interface DeclineInvitationResult {
  invitationId: string;
  status: "DECLINED";
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List the caller's PENDING invitations, newest first. Each item is
 * joined with the board's title and the inviter's email so the client
 * doesn't need a follow-up request to render a useful notification.
 */
export async function listMyInvitations(
  userId: string
): Promise<InvitationListItem[]> {
  const rows = await prisma.boardInvitation.findMany({
    where: {
      inviteeId: userId,
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      boardId: true,
      createdAt: true,
      board: { select: { title: true } },
      inviter: { select: { email: true } },
    },
  });

  // Filter out rows whose board has been soft-deleted — they should not
  // surface as actionable invites. We do this in JS so the SQL stays a
  // simple index-friendly lookup; soft-deleted boards are rare in the
  // pending-invites result set.
  return rows
    .filter((row) => row.board !== null)
    .map((row) => ({
      id: row.id,
      boardId: row.boardId,
      boardTitle: row.board.title,
      inviterEmail: row.inviter.email,
      status: "PENDING" as const,
      createdAt: row.createdAt,
    }));
}

// ---------------------------------------------------------------------------
// Accept
// ---------------------------------------------------------------------------

/**
 * Accept a PENDING invitation addressed to `userId`.
 *
 * Steps (all inside one transaction — REQ-2.12.5):
 *  1. Load the invitation + its board.
 *  2. Reject if missing, board soft-deleted (404), not addressed to the
 *     caller (403), or not PENDING (409).
 *  3. Upsert the `BoardUser` row (idempotent — REQ-2.11.4 says "if one
 *     already exists, do nothing").
 *  4. Flip the invitation's status to `ACCEPTED`.
 */
export async function acceptInvitation(
  userId: string,
  invitationId: string
): Promise<AcceptInvitationResult> {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.boardInvitation.findUnique({
      where: { id: invitationId },
      include: { board: true },
    });

    if (!inv || inv.board.deletedAt !== null) {
      throw new HttpError(404, "Invitation not found");
    }
    if (inv.inviteeId !== userId) {
      throw new HttpError(403, "Forbidden");
    }
    if (inv.status !== "PENDING") {
      throw new HttpError(409, "Invitation is no longer pending");
    }

    // Idempotent insert: if a BoardUser row already exists for this
    // (boardId, userId) pair, `upsert` with `update: {}` is a no-op.
    await tx.boardUser.upsert({
      where: {
        boardId_userId: { boardId: inv.boardId, userId },
      },
      update: {},
      create: { boardId: inv.boardId, userId },
    });

    const updated = await tx.boardInvitation.update({
      where: { id: invitationId },
      data: { status: "ACCEPTED" },
      select: { id: true, boardId: true },
    });

    return {
      boardId: updated.boardId,
      invitationId: updated.id,
      status: "ACCEPTED" as const,
    };
  });
}

// ---------------------------------------------------------------------------
// Decline
// ---------------------------------------------------------------------------

/**
 * Decline a PENDING invitation addressed to `userId`. Same authz checks
 * as accept, but writes the `DECLINED` status outside a transaction
 * (single write — no need to atomically pair it with anything).
 */
export async function declineInvitation(
  userId: string,
  invitationId: string
): Promise<DeclineInvitationResult> {
  const inv = await prisma.boardInvitation.findUnique({
    where: { id: invitationId },
    include: { board: true },
  });

  if (!inv || inv.board.deletedAt !== null) {
    throw new HttpError(404, "Invitation not found");
  }
  if (inv.inviteeId !== userId) {
    throw new HttpError(403, "Forbidden");
  }
  if (inv.status !== "PENDING") {
    throw new HttpError(409, "Invitation is no longer pending");
  }

  const updated = await prisma.boardInvitation.update({
    where: { id: invitationId },
    data: { status: "DECLINED" },
    select: { id: true },
  });

  return {
    invitationId: updated.id,
    status: "DECLINED" as const,
  };
}
