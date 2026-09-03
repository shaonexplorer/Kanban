import { z } from "zod";

/**
 * Zod schemas for the `columns` module.
 *
 * - `CreateColumnSchema`             — body for `POST /api/boards/:boardId/columns`.
 * - `UpdateColumnSchema`             — body for `PATCH /api/columns/:id`.
 * - `ReorderColumnsSchema`           — body for `PATCH /api/boards/:boardId/columns/reorder`.
 * - `BoardScopedColumnParamSchema`   — `req.params` for any `/api/boards/:boardId/columns/...` route.
 * - `ColumnIdParamSchema`            — `req.params` for any `/api/columns/:id` route.
 *
 * All id fields are validated as UUIDs at the edge so the service layer
 * can trust them and we get a clean 400 instead of a Prisma error.
 */

/** A trimmed, non-empty string up to 100 characters — the column title rules. */
const titleSchema = z.string().trim().min(1).max(100);

/**
 * Body for `POST /api/boards/:boardId/columns`.
 *  - title: 1–100 characters after trim.
 */
export const CreateColumnSchema = z.object({
  title: titleSchema,
});
export type CreateColumnInput = z.infer<typeof CreateColumnSchema>;

/**
 * Body for `PATCH /api/columns/:id`.
 *  - title: 1–100 characters after trim.
 */
export const UpdateColumnSchema = z.object({
  title: titleSchema,
});
export type UpdateColumnInput = z.infer<typeof UpdateColumnSchema>;

/**
 * Body for `PATCH /api/boards/:boardId/columns/reorder`.
 *  - columnIds: a non-empty array of UUIDs that, taken as a SET, must be
 *    identical to the board's current column ids. The ORDER of the array
 *    is the new ordering (positions 0..N-1).
 */
export const ReorderColumnsSchema = z.object({
  columnIds: z.array(z.string().uuid()).min(1),
});
export type ReorderColumnsInput = z.infer<typeof ReorderColumnsSchema>;

/**
 * Path params for any `/api/boards/:boardId/columns/...` route.
 *  - boardId: a UUID.
 */
export const BoardScopedColumnParamSchema = z.object({
  boardId: z.string().uuid(),
});
export type BoardScopedColumnParam = z.infer<typeof BoardScopedColumnParamSchema>;

/**
 * Path params for any `/api/columns/:id` route.
 *  - id: a UUID.
 */
export const ColumnIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type ColumnIdParam = z.infer<typeof ColumnIdParamSchema>;
