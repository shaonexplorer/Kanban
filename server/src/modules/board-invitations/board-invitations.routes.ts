import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { validate } from "../../common/validators/validate.middleware.js";
import * as invitationsController from "./board-invitations.controller.js";
import { InvitationIdParamSchema } from "./board-invitations.validation.js";

/**
 * Router for the `board-invitations` module.
 *
 * All routes are scoped to the caller's own PENDING invitations — there
 * is no `:boardId` in the path, so no `loadBoard` is needed. Authorization
 * (only the invitee may accept/decline) is enforced inside the service.
 */
const router = Router();

// List the caller's pending invitations. No params, no body.
router.get("/", requireAuth, asyncHandler(invitationsController.listInvitations));

// Accept / decline a specific invitation. Param validation runs before
// the service so a bad UUID returns 400 instead of a 404 from Prisma.
router.post(
  "/:id/accept",
  requireAuth,
  validate(InvitationIdParamSchema, "params"),
  asyncHandler(invitationsController.acceptInvitation)
);

router.post(
  "/:id/decline",
  requireAuth,
  validate(InvitationIdParamSchema, "params"),
  asyncHandler(invitationsController.declineInvitation)
);

export default router;
