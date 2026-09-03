import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import {
  loadBoard,
  requireBoardAccess,
  requireBoardOwner,
} from "../../common/middleware/access-control.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { validate } from "../../common/validators/validate.middleware.js";
import * as boardsController from "./boards.controller.js";
import {
  BoardIdParamSchema,
  CreateBoardSchema,
  InviteMemberSchema,
  MemberParamsSchema,
  UpdateBoardSchema,
} from "./boards.validation.js";

/**
 * Router for the `boards` module.
 *
 * Middleware chain patterns:
 *  - Read-only endpoints that need the board row use
 *    `requireAuth → loadBoard → requireBoardAccess`.
 *  - Owner-only mutations add `requireBoardOwner` after the access check.
 *  - Param / body validation is layered with `validate(schema, source)`
 *    before the resource is loaded so a bad UUID returns 400 instead
 *    of a 404 from `loadBoard`.
 */
const router = Router();

// List the caller's boards / create a new board.
router.get("/", requireAuth, asyncHandler(boardsController.listBoards));
router.post(
  "/",
  requireAuth,
  validate(CreateBoardSchema),
  asyncHandler(boardsController.createBoard)
);

// Single-board read & mutation. Param validation runs BEFORE loadBoard so
// malformed UUIDs get a clean 400.
router.get(
  "/:id",
  requireAuth,
  validate(BoardIdParamSchema, "params"),
  loadBoard(),
  requireBoardAccess,
  asyncHandler(boardsController.getBoard)
);

router.patch(
  "/:id",
  requireAuth,
  validate(BoardIdParamSchema, "params"),
  validate(UpdateBoardSchema),
  loadBoard(),
  requireBoardOwner,
  asyncHandler(boardsController.updateBoard)
);

router.delete(
  "/:id",
  requireAuth,
  validate(BoardIdParamSchema, "params"),
  loadBoard(),
  requireBoardOwner,
  asyncHandler(boardsController.deleteBoard)
);

// Members — read requires access; mutations require owner.
router.get(
  "/:id/members",
  requireAuth,
  validate(BoardIdParamSchema, "params"),
  loadBoard(),
  requireBoardAccess,
  asyncHandler(boardsController.listMembers)
);

router.post(
  "/:id/members",
  requireAuth,
  validate(BoardIdParamSchema, "params"),
  loadBoard(),
  requireBoardOwner,
  validate(InviteMemberSchema),
  asyncHandler(boardsController.inviteMember)
);

router.delete(
  "/:id/members/:userId",
  requireAuth,
  validate(MemberParamsSchema, "params"),
  loadBoard(),
  requireBoardOwner,
  asyncHandler(boardsController.removeMember)
);

export default router;
