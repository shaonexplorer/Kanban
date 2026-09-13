import { HttpError } from "../../common/errors/HttpError.js";
import { prisma } from "../../lib/prisma.js";
import type { BoardRole, ColorIdentity, TaskPriority, Template } from "../../generated/prisma/client.js";
import type {
  CreateBoardInput,
  InviteMemberInput,
  UpdateBoardInput,
  UpdateMemberRoleInput,
} from "./boards.validation.js";

/**
 * Service layer for the `boards` module.
 *
 * Pure DB + business rules. Every domain failure throws an `HttpError` so
 * the central error middleware can shape the JSON response.
 *
 * The two `assertBoard*` helpers are also re-exported for use in other
 * modules (e.g. column/task controllers in Phase 3).
 *
 * Phase 5 Step 10 widens the surface with:
 *  - `Board.listMyBoards` + `Board.getBoardById` + `Board.listMembers`:
 *    `role` is now a `BoardRole` enum (OWNER / ADMIN / MEMBER) instead
 *    of a free-form string literal.
 *  - `Board.createBoard`: persists `projectKey`, `colorIdentity`, `template`.
 *  - `Board.updateBoard`: persists `linkSharing`.
 *  - `Board.getBoardById`: nested tasks include the new Step 10 fields.
 *  - `Board.updateMemberRole`: new — changes a member's non-owner role.
 */

// ---------------------------------------------------------------------------
// Result types — kept local to this module so controllers can lean on them
// without re-deriving the Prisma row shape.
// ---------------------------------------------------------------------------

/** A single item in the `GET /api/boards` response. */
export interface BoardListItem {
  id: string;
  title: string;
  role: BoardRole;
  createdAt: Date;
}

/** The shape of `GET /api/boards/:id`'s response body. */
export interface BoardDetail {
  id: string;
  title: string;
  ownerId: string;
  createdAt: Date;
  columns: Array<{
    id: string;
    title: string;
    position: number;
    tasks: Array<{
      id: string;
      title: string;
      description: string | null;
      position: number;
      createdAt: Date;
      starred: boolean;
      priority: TaskPriority | null;
      dueDate: Date | null;
      storyPoints: number | null;
      labels: string[];
      assignees: Array<{ userId: string; email: string }>;
      subtasks: Array<{
        id: string;
        taskId: string;
        title: string;
        done: boolean;
        position: number;
        createdAt: Date;
      }>;
    }>;
  }>;
  members: Array<{
    userId: string;
    email: string;
    role: BoardRole;
    joinedAt: Date;
  }>;
}

/** A single item in the `GET /api/boards/:id/members` response. */
export interface BoardMemberItem {
  userId: string;
  email: string;
  role: BoardRole;
  joinedAt: Date;
}

// ---------------------------------------------------------------------------
// Access-control helpers
// ---------------------------------------------------------------------------

/**
 * Throw 404 if the board doesn't exist or is soft-deleted. Returns the
 * (non-deleted) board on success.
 *
 * Used by routes that need the board row but where the caller hasn't
 * necessarily been authorized yet — e.g. the access middlewares do this
 * for us, but service-level helpers that run from inside controllers
 * (where `loadBoard` already ran) can call it as a defensive double-check.
 */
async function loadActiveBoard(boardId: string) {
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board || board.deletedAt !== null) {
    throw new HttpError(404, "Board not found");
  }
  return board;
}

/**
 * Assert the user has access to the board (owner or accepted `BoardUser`).
 * Throws 403 on miss. Assumes the board row has already been fetched
 * and lives on `board`.
 */
async function assertBoardAccess(
  userId: string,
  board: { id: string; ownerId: string }
): Promise<void> {
  if (board.ownerId === userId) return;

  const membership = await prisma.boardUser.findUnique({
    where: { boardId_userId: { boardId: board.id, userId } },
    select: { id: true },
  });
  if (!membership) {
    throw new HttpError(403, "Forbidden");
  }
}

/**
 * Assert the user is the board owner. Throws 403 on miss.
 */
function assertBoardOwner(
  userId: string,
  board: { ownerId: string }
): void {
  if (board.ownerId !== userId) {
    throw new HttpError(403, "Forbidden");
  }
}

// Re-exported so other modules (e.g. future column/task controllers) can
// reuse the same authorization decisions.
export { assertBoardAccess, assertBoardOwner, loadActiveBoard };

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new board owned by `ownerId`.
 *
 * Phase 5 Step 10 persists the optional `projectKey`, `colorIdentity`,
 * and `template` fields (which were accepted on the wire since Step 5
 * but dropped at the Prisma write until now).
 */
export async function createBoard(
  ownerId: string,
  input: CreateBoardInput
): Promise<{ id: string; title: string; ownerId: string; createdAt: Date }> {
  type CreateBoardData = {
    title: string;
    ownerId: string;
    projectKey?: string;
    colorIdentity?: ColorIdentity;
    template?: Template;
  };
  const data: CreateBoardData = { title: input.title, ownerId };
  if (input.projectKey !== undefined) {
    // Defensive upper-case — the schema already enforces A-Z / 0-9 only.
    data.projectKey = input.projectKey.toUpperCase();
  }
  if (input.colorIdentity !== undefined) data.colorIdentity = input.colorIdentity;
  if (input.template !== undefined) data.template = input.template;

  const board = await prisma.board.create({
    data,
    select: {
      id: true,
      title: true,
      ownerId: true,
      createdAt: true,
    },
  });
  return board;
}

/**
 * List every board the user can see — both boards they own and boards
 * they collaborate on. Soft-deleted boards are excluded. Each item is
 * tagged with the caller's role on that board.
 *
 * We run two queries and merge in JS rather than relying on a single
 * `OR` filter against `BoardUser`, because the role tag depends on which
 * side matched. Both queries are scoped by `deletedAt: null`.
 */
export async function listMyBoards(userId: string): Promise<BoardListItem[]> {
  const [owned, memberships] = await Promise.all([
    prisma.board.findMany({
      where: { ownerId: userId, deletedAt: null },
      select: { id: true, title: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.boardUser.findMany({
      where: { userId, board: { deletedAt: null } },
      select: {
        role: true,
        board: { select: { id: true, title: true, createdAt: true } },
      },
      orderBy: { joinedAt: "desc" },
    }),
  ]);

  const items: BoardListItem[] = [
    ...owned.map((b) => ({ ...b, role: "OWNER" as BoardRole })),
    ...memberships
      .map((m) => ({ ...m.board, role: m.role as BoardRole }))
      // Defensive de-dup in case a user is somehow both owner and member.
      .filter((b) => !owned.some((o) => o.id === b.id)),
  ];

  return items;
}

/**
 * Fetch a single board with its columns/tasks and members, then assert the
 * caller has access. Returns the nested response shape documented in
 * Requirements §2.3.
 *
 * Phase 5 Step 10: nested tasks include the new fields
 * (starred, priority, dueDate, storyPoints, labels, assignees);
 * member roles are the `BoardRole` enum (OWNER / ADMIN / MEMBER).
 */
export async function getBoardById(
  userId: string,
  boardId: string
): Promise<BoardDetail> {
  const board = await loadActiveBoard(boardId);
  await assertBoardAccess(userId, board);

  const [columns, members, memberships] = await Promise.all([
    prisma.column.findMany({
      where: { boardId },
      orderBy: { position: "asc" },
      select: {
        id: true,
        title: true,
        position: true,
        tasks: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            title: true,
            description: true,
            position: true,
            createdAt: true,
            starred: true,
            priority: true,
            dueDate: true,
            storyPoints: true,
            labels: true,
            assignees: {
              select: {
                userId: true,
                user: { select: { email: true } },
              },
              orderBy: { userId: "asc" },
            },
            subtasks: {
              select: {
                id: true,
                taskId: true,
                title: true,
                done: true,
                position: true,
                createdAt: true,
              },
              orderBy: { position: "asc" },
            },
          },
        },
      },
    }),
    // Owner's user record (we already have the board; we just need their email).
    prisma.user.findUnique({
      where: { id: board.ownerId },
      select: { email: true },
    }),
    prisma.boardUser.findMany({
      where: { boardId },
      orderBy: { joinedAt: "desc" },
      select: {
        joinedAt: true,
        role: true,
        user: { select: { id: true, email: true } },
      },
    }),
  ]);

  const memberList: BoardMemberItem[] = [
    {
      userId: board.ownerId,
      email: members?.email ?? "",
      role: "OWNER",
      // REQ-2.9.3 — owner appears with joinedAt = board.createdAt.
      joinedAt: board.createdAt,
    },
    ...memberships.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      role: m.role as BoardRole,
      joinedAt: m.joinedAt,
    })),
  ];

  // Flatten the nested `assignees[].user.email` into `assignees[].email`
  // so the wire shape matches the `BoardDetail` contract. The Prisma
  // select traverses the `user` relation to get the email; we inline
  // it into the assignee object for a clean API response.
  const flatColumns = columns.map((col) => ({
    id: col.id,
    title: col.title,
    position: col.position,
    tasks: col.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      position: task.position,
      createdAt: task.createdAt,
      starred: task.starred,
      priority: task.priority,
      dueDate: task.dueDate,
      storyPoints: task.storyPoints,
      labels: task.labels,
      assignees: task.assignees.map((a) => ({
        userId: a.userId,
        email: a.user.email,
      })),
      subtasks: task.subtasks,
    })),
  }));

  return {
    id: board.id,
    title: board.title,
    ownerId: board.ownerId,
    createdAt: board.createdAt,
    columns: flatColumns,
    members: memberList,
  };
}

/**
 * Update the board's title and/or link-sharing setting. Owner only.
 *
 * Phase 5 Step 10 persists `linkSharing` (previously accepted on the wire
 * but dropped at the Prisma write).
 */
export async function updateBoard(
  userId: string,
  boardId: string,
  input: UpdateBoardInput
): Promise<{ id: string; title: string; ownerId: string; createdAt: Date }> {
  const board = await loadActiveBoard(boardId);
  assertBoardOwner(userId, board);

  // Build the patch from defined keys only — never pass `undefined`
  // through to Prisma's `data` (which would otherwise overwrite the
  // column with NULL).
  type UpdateBoardData = {
    title?: string;
    linkSharing?: "DISABLED" | "VIEW";
  };
  const data: UpdateBoardData = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.linkSharing !== undefined) data.linkSharing = input.linkSharing;

  const updated = await prisma.board.update({
    where: { id: boardId },
    data,
    select: { id: true, title: true, ownerId: true, createdAt: true },
  });
  return updated;
}

/**
 * Soft-delete the board by stamping `deletedAt`. Owner only. Subsequent
 * reads (including the next `getBoardById` / `listMyBoards` call) will
 * treat the board as if it never existed.
 */
export async function softDeleteBoard(
  userId: string,
  boardId: string
): Promise<void> {
  const board = await loadActiveBoard(boardId);
  assertBoardOwner(userId, board);

  await prisma.board.update({
    where: { id: boardId },
    data: { deletedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/**
 * List the members of a board, owner first with `joinedAt = board.createdAt`,
 * then accepted collaborators newest-first by `joinedAt`.
 *
 * Phase 5 Step 10: member roles are the `BoardRole` enum.
 */
export async function listMembers(
  userId: string,
  boardId: string
): Promise<BoardMemberItem[]> {
  const board = await loadActiveBoard(boardId);
  await assertBoardAccess(userId, board);

  const [owner, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: board.ownerId },
      select: { email: true },
    }),
    prisma.boardUser.findMany({
      where: { boardId },
      orderBy: { joinedAt: "desc" },
      select: {
        joinedAt: true,
        role: true,
        user: { select: { id: true, email: true } },
      },
    }),
  ]);

  return [
    {
      userId: board.ownerId,
      email: owner?.email ?? "",
      role: "OWNER",
      joinedAt: board.createdAt,
    },
    ...memberships.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      role: m.role as BoardRole,
      joinedAt: m.joinedAt,
    })),
  ];
}

/**
 * Invite a user (already registered) to collaborate on a board. The
 * caller must be the owner. Resolves the invitee by `userId` or `email`.
 *
 * Errors:
 *  - 400 — inviting the owner themselves
 *  - 400 — invitee body is invalid (defensive; the schema already
 *          enforces this)
 *  - 404 — no `User` matches the supplied `email`
 *  - 409 — invitee is already an accepted collaborator, or a PENDING
 *          invitation already exists for `(boardId, userId)`
 */
export async function inviteMember(
  inviterId: string,
  boardId: string,
  input: InviteMemberInput
): Promise<{
  id: string;
  boardId: string;
  inviterId: string;
  inviteeId: string;
  status: "PENDING";
  createdAt: Date;
}> {
  const board = await loadActiveBoard(boardId);
  assertBoardOwner(inviterId, board);

  // Resolve the invitee by userId or email.
  const invitee = await (async () => {
    if ("userId" in input && input.userId !== undefined) {
      return prisma.user.findUnique({ where: { id: input.userId } });
    }
    if ("email" in input && input.email !== undefined) {
      return prisma.user.findUnique({ where: { email: input.email } });
    }
    // The schema already rejects this, but a defensive throw makes the
    // 400 explicit at the service boundary.
    throw new HttpError(400, "Provide either `userId` or `email`");
  })();

  if (!invitee) {
    throw new HttpError(404, "Invitee not found");
  }

  // REQ-2.8.4 — cannot invite the board owner.
  if (invitee.id === board.ownerId) {
    throw new HttpError(400, "Cannot invite the board owner");
  }

  // REQ-2.8.7 — already an accepted collaborator.
  const existingMembership = await prisma.boardUser.findUnique({
    where: { boardId_userId: { boardId, userId: invitee.id } },
    select: { id: true },
  });
  if (existingMembership) {
    throw new HttpError(409, "User is already a member of this board");
  }

  // REQ-2.8.6 — pending duplicate.
  const existingInvite = await prisma.boardInvitation.findFirst({
    where: {
      boardId,
      inviteeId: invitee.id,
      status: "PENDING",
    },
    select: { id: true },
  });
  if (existingInvite) {
    throw new HttpError(409, "A pending invitation already exists");
  }

  // Phase 5 Step 10: the optional `role` field is accepted on the wire so
  // the ShareBoardModal's role select can ship unchanged. It is not
  // persisted on `BoardInvitation` (no column — see schema); instead the
  // role defaults to `MEMBER` at the DB layer when the invitee accepts and
  // becomes a `BoardUser`. Promoting a member to ADMIN is handled by
  // `PATCH /api/boards/:id/members/:userId` after they've joined.
  const invitation = await prisma.boardInvitation.create({
    data: {
      boardId,
      inviterId,
      inviteeId: invitee.id,
      status: "PENDING",
    },
    select: {
      id: true,
      boardId: true,
      inviterId: true,
      inviteeId: true,
      status: true,
      createdAt: true,
    },
  });

  // Cast: the schema's default is PENDING, but Prisma's select returns
  // the enum type, which TypeScript narrows correctly to "PENDING" here.
  return { ...invitation, status: "PENDING" as const };
}

/**
 * Remove an accepted collaborator. Owner only. Removing the owner is
 * rejected with 400 (the owner deletes the whole board instead).
 */
export async function removeMember(
  userId: string,
  boardId: string,
  targetUserId: string
): Promise<void> {
  const board = await loadActiveBoard(boardId);
  assertBoardOwner(userId, board);

  // REQ-2.10.3 — can't remove the owner via this endpoint.
  if (targetUserId === board.ownerId) {
    throw new HttpError(400, "Cannot remove the board owner");
  }

  // Try to delete; if no row matches, `delete` throws a Prisma
  // P2025 — map that to 404 so the wire format is consistent with
  // the other read endpoints.
  try {
    await prisma.boardUser.delete({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });
  } catch (err) {
    if (
      err !== null &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      throw new HttpError(404, "Member not found");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Phase 5 Step 10 — member role change
// ---------------------------------------------------------------------------

/**
 * Change a member's non-owner role. Owner only.
 *
 * Rules:
 *  - OWNER rows are immutable (the owner IS the board's `ownerId`).
 *    Attempting to change the owner's role returns 400.
 *  - Only ADMIN or MEMBER can be set (OWNER is reserved).
 *  - The target user must be a current member of the board.
 *
 * @returns The updated member item with the new role.
 */
export async function updateMemberRole(
  userId: string,
  boardId: string,
  targetUserId: string,
  input: UpdateMemberRoleInput
): Promise<BoardMemberItem> {
  const board = await loadActiveBoard(boardId);
  assertBoardOwner(userId, board);

  // The board owner cannot have their role changed.
  if (targetUserId === board.ownerId) {
    throw new HttpError(400, "Cannot change the owner's role");
  }

  // Find the target member row.
  const membership = await prisma.boardUser.findUnique({
    where: { boardId_userId: { boardId, userId: targetUserId } },
    select: { id: true, role: true, joinedAt: true, user: { select: { email: true } } },
  });
  if (!membership) {
    throw new HttpError(404, "Member not found");
  }

  // The existing role is OWNER (shouldn't happen given the check above, but
  // belt-and-suspenders).
  if (membership.role === "OWNER") {
    throw new HttpError(400, "Cannot change the owner's role");
  }

  // Apply the new role.
  const updated = await prisma.boardUser.update({
    where: { boardId_userId: { boardId, userId: targetUserId } },
    data: { role: input.role },
    select: {
      role: true,
      joinedAt: true,
      user: { select: { id: true, email: true } },
    },
  });

  return {
    userId: targetUserId,
    email: updated.user.email,
    role: updated.role as BoardRole,
    joinedAt: updated.joinedAt,
  };
}
