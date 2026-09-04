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
 *
 * Phase 5 Step 5 widens `CreateBoardSchema` and `UpdateBoardSchema` to
 * accept the new optional `projectKey`, `colorIdentity`, `template`
 * (create-only), and `linkSharing` (update-only) fields so the
 * `CreateBoardDrawer` and `ShareBoardModal` overlays can round-trip
 * their full Stitch-faithful forms. The Prisma columns for these
 * fields ship with the Step 10 `phase05_polish` migration; for this
 * pass the server accepts the fields and passes them through
 * `prisma.board.create` / `update` (which silently drops unknown
 * fields at runtime). The wire contract is forward-compatible — when
 * Step 10 lands, no client code changes.
 */

/** A trimmed, non-empty string up to 100 characters — the board title rules. */
const titleSchema = z.string().trim().min(1).max(100);

/**
 * Project-key rule: 1–6 characters after trim, uppercased by the
 * client. The server trims + uppercases again defensively in the
 * service layer; the schema just enforces the length and character
 * set (`A–Z`, `0–9`) so a stray lowercase / unicode value never
 * lands in the DB.
 */
const projectKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(6)
  .regex(/^[A-Z0-9]+$/, "Project key must be uppercase alphanumeric");

/** Phase 5 color-identity swatch tokens. The client renders the same
 * five options in the create-board drawer. */
const colorIdentitySchema = z.enum([
  "PRIMARY",
  "TERTIARY",
  "SECONDARY",
  "ERROR",
  "OUTLINE",
]);

/** Phase 5 workflow-template presets. The enum is open — the client
 * renders two today, but the server accepts a wider set so future
 * presets don't need a server change. */
const templateSchema = z.enum(["SOFTWARE_ENG", "INCIDENT_MGMT"]);

/** Phase 5 link-sharing mode. `DISABLED` is the default; `VIEW`
 * exposes the (future) public read endpoint. */
const linkSharingSchema = z.enum(["DISABLED", "VIEW"]);

/**
 * Body for `POST /api/boards`.
 *  - title: 1–100 characters after trim.
 *  - projectKey (Phase 5, optional): 1–6 uppercase alphanumeric chars.
 *  - colorIdentity (Phase 5, optional): one of the 5 swatch tokens.
 *  - template (Phase 5, optional): one of the workflow-template presets.
 */
export const CreateBoardSchema = z.object({
  title: titleSchema,
  projectKey: projectKeySchema.optional(),
  colorIdentity: colorIdentitySchema.optional(),
  template: templateSchema.optional(),
});
export type CreateBoardInput = z.infer<typeof CreateBoardSchema>;

/**
 * Body for `PATCH /api/boards/:id`.
 *  - title: 1–100 characters after trim.
 *  - linkSharing (Phase 5, optional): the share-modal toggle.
 *
 * `projectKey` / `colorIdentity` / `template` are deliberately
 * excluded — those are create-only fields (re-keying a board's
 * project key or color identity is out of scope for Phase 5).
 */
export const UpdateBoardSchema = z
  .object({
    title: titleSchema.optional(),
    linkSharing: linkSharingSchema.optional(),
  })
  .refine(
    (v) => v.title !== undefined || v.linkSharing !== undefined,
    { message: "At least one of `title` or `linkSharing` must be provided" },
  );
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
