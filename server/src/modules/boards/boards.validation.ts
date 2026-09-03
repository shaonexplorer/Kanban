import { z } from "zod";

/**
 * Zod schemas for the `boards` module.
 *
 * - `CreateBoardSchema`  — body for `POST /api/boards`.
 * - `UpdateBoardSchema`  — body for `PATCH /api/boards/:id`.
 * - `BoardIdParamSchema` — `req.params` for any `/api/boards/:id` route.
 * - `MemberParamsSchema`  — `req.params` for `DELETE /api/boards/:id/members/:userId`.
 * - `InviteMemberSchema` — body for `POST /api/boards/:id/members` —
 *                          exactly one of `userId` (UUID) or `email` must
 *                          be provided; both, or neither, is rejected.
 *
 * All id fields are validated as UUIDs at the edge so the service layer
 * can trust them and we get a clean 400 instead of a Prisma error.
 */

/** A trimmed, non-empty string up to 100 characters — the board title rules. */
const titleSchema = z.string().trim().min(1).max(100);

/**
 * Body for `POST /api/boards`.
 *  - title: 1–100 characters after trim.
 */
export const CreateBoardSchema = z.object({
  title: titleSchema,
});
export type CreateBoardInput = z.infer<typeof CreateBoardSchema>;

/**
 * Body for `PATCH /api/boards/:id`.
 *  - title: 1–100 characters after trim.
 */
export const UpdateBoardSchema = z.object({
  title: titleSchema,
});
export type UpdateBoardInput = z.infer<typeof UpdateBoardSchema>;

/**
 * Path params for any `/api/boards/:id` route.
 *  - id: a UUID.
 */
export const BoardIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type BoardIdParam = z.infer<typeof BoardIdParamSchema>;

/**
 * Path params for `DELETE /api/boards/:id/members/:userId`.
 *  - id:     a UUID (the board).
 *  - userId: a UUID (the target collaborator).
 */
export const MemberParamsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});
export type MemberParams = z.infer<typeof MemberParamsSchema>;

/**
 * Body for `POST /api/boards/:id/members`.
 *
 * Discriminated union: exactly one of `userId` (UUID of an existing user)
 * or `email` (well-formed email of an existing user) must be provided.
 * `.strict()` rejects any additional fields.
 */
export const InviteMemberSchema = z
  .union([
    z.object({ userId: z.string().uuid() }).strict(),
    z.object({ email: z.string().email() }).strict(),
  ])
  // Reject bodies with NEITHER key — only one of the union members carries
  // a value, so any key in the other member must be undefined. Without this
  // refine, `{}` would parse as "valid, no invitee" which is meaningless.
  .refine(
    (value) =>
      ("userId" in value && value.userId !== undefined) ||
      ("email" in value && value.email !== undefined),
    { message: "Provide exactly one of `userId` or `email`" }
  );
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
