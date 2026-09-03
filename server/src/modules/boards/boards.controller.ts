import type { Request, Response } from "express";
import * as boardsService from "./boards.service.js";
import type {
  CreateBoardInput,
  InviteMemberInput,
  MemberParams,
  UpdateBoardInput,
} from "./boards.validation.js";

/**
 * Controller layer for the `boards` module.
 *
 * Each handler is a thin shell: it reads the already-validated input
 * (from `req.user`, `req.params`, `req.body`, or `req.board`), delegates
 * to the service, and shapes the HTTP response.
 *
 * Errors thrown from the service are caught by `asyncHandler` and
 * forwarded to the central error middleware — controllers do not
 * catch them.
 */

// ---------------------------------------------------------------------------
// Board CRUD
// ---------------------------------------------------------------------------

/**
 * POST /api/boards — create a new board owned by the caller.
 * Returns 201 with `{ id, title, ownerId, createdAt }`.
 */
export async function createBoard(req: Request, res: Response): Promise<void> {
  // requireAuth guarantees `req.user`; the validate() middleware has
  // already replaced `req.body` with the parsed CreateBoardInput.
  const { id: userId } = req.user!;
  const input = req.body as CreateBoardInput;

  const board = await boardsService.createBoard(userId, input);
  res.status(201).json(board);
}

/**
 * GET /api/boards — list every board the caller can see.
 * Returns 200 with an array.
 */
export async function listBoards(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const boards = await boardsService.listMyBoards(userId);
  res.status(200).json(boards);
}

/**
 * GET /api/boards/:id — nested board detail.
 * Returns 200 with the full BoardDetail payload.
 */
export async function getBoard(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const board = await boardsService.getBoardById(userId, req.board!.id);
  res.status(200).json(board);
}

/**
 * PATCH /api/boards/:id — rename a board (owner only).
 * Returns 200 with the updated board.
 */
export async function updateBoard(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const input = req.body as UpdateBoardInput;
  const updated = await boardsService.updateBoard(userId, req.board!.id, input);
  res.status(200).json(updated);
}

/**
 * DELETE /api/boards/:id — soft-delete a board (owner only).
 * Returns 204 with no body.
 */
export async function deleteBoard(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  await boardsService.softDeleteBoard(userId, req.board!.id);
  res.status(204).send();
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/**
 * GET /api/boards/:id/members — list members (owner + accepted collaborators).
 * Returns 200 with an array of `{ userId, email, role, joinedAt }`.
 */
export async function listMembers(
  req: Request,
  res: Response
): Promise<void> {
  const { id: userId } = req.user!;
  const members = await boardsService.listMembers(userId, req.board!.id);
  res.status(200).json(members);
}

/**
 * POST /api/boards/:id/members — invite a registered user to collaborate.
 * Returns 201 with the created PENDING invitation.
 */
export async function inviteMember(
  req: Request,
  res: Response
): Promise<void> {
  const { id: inviterId } = req.user!;
  const input = req.body as InviteMemberInput;
  const invitation = await boardsService.inviteMember(
    inviterId,
    req.board!.id,
    input
  );
  res.status(201).json(invitation);
}

/**
 * DELETE /api/boards/:id/members/:userId — remove an accepted collaborator.
 * Returns 204 with no body.
 */
export async function removeMember(
  req: Request,
  res: Response
): Promise<void> {
  const { id: userId } = req.user!;
  const { userId: targetUserId } = req.params as MemberParams;
  await boardsService.removeMember(userId, req.board!.id, targetUserId);
  res.status(204).send();
}
