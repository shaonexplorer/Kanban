import { z } from "zod";

/**
 * Zod schemas for the `board-invitations` module.
 *
 * - `InvitationIdParamSchema` — `req.params` for any
 *   `/api/board-invitations/:id/...` route.
 *
 * The list endpoint takes no body, so no body schema is required.
 *
 * All id fields are validated as UUIDs at the edge so the service layer
 * can trust them and we get a clean 400 instead of a Prisma error.
 */

/**
 * Path params for any `/api/board-invitations/:id` route.
 *  - id: a UUID.
 */
export const InvitationIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type InvitationIdParam = z.infer<typeof InvitationIdParamSchema>;
