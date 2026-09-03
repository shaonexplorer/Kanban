import { z } from "zod";

/**
 * Zod schemas for the `tasks` module.
 *
 * - `CreateTaskSchema`              — body for `POST /api/columns/:columnId/tasks`.
 * - `UpdateTaskSchema`              — body for `PATCH /api/tasks/:id`.
 * - `MoveTaskSchema`                — body for `POST /api/columns/:columnId/tasks/:taskId/move`.
 * - `ColumnScopedTaskParamSchema`   — `req.params` for `/api/columns/:columnId/tasks/...`.
 * - `ColumnAndTaskIdParamSchema`    — `req.params` for the move route.
 * - `TaskIdParamSchema`             — `req.params` for `/api/tasks/:id`.
 *
 * All id fields are validated as UUIDs at the edge so the service layer
 * can trust them and we get a clean 400 instead of a Prisma error.
 */

/**
 * Title rule shared by create + update: trimmed, 1–200 characters.
 * Mirrors the column-title rule in spirit but a longer bound since
 * tasks commonly carry a short heading.
 */
const taskTitleSchema = z.string().trim().min(1).max(200);

/**
 * Description rule shared by create + update: trimmed, ≤ 2000 characters.
 * `optional()` on the create schema, but on the update schema the empty
 * string is allowed to make "clear the description" a valid mutation.
 */
const taskDescriptionSchema = z.string().trim().max(2000);

/**
 * Body for `POST /api/columns/:columnId/tasks`.
 *  - title: 1–200 characters after trim.
 *  - description: optional, ≤ 2000 characters after trim.
 */
export const CreateTaskSchema = z.object({
  title: taskTitleSchema,
  description: taskDescriptionSchema.optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

/**
 * Body for `PATCH /api/tasks/:id`.
 *  - title: optional, 1–200 characters after trim.
 *  - description: optional, ≤ 2000 characters after trim.
 *  - At least one of `title` / `description` must be supplied — otherwise
 *    there's nothing to update. `.refine()` enforces that here so the
 *    service never has to second-guess an empty patch.
 */
export const UpdateTaskSchema = z
  .object({
    title: taskTitleSchema.optional(),
    description: taskDescriptionSchema.optional(),
  })
  .refine((v) => v.title !== undefined || v.description !== undefined, {
    message: "At least one of title or description must be provided",
  });
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

/**
 * Path params for any `/api/columns/:columnId/tasks/...` route.
 *  - columnId: a UUID.
 */
export const ColumnScopedTaskParamSchema = z.object({
  columnId: z.string().uuid(),
});
export type ColumnScopedTaskParam = z.infer<typeof ColumnScopedTaskParamSchema>;

/**
 * Path params for any `/api/tasks/:id` route.
 *  - id: a UUID.
 */
export const TaskIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type TaskIdParam = z.infer<typeof TaskIdParamSchema>;

/**
 * Path params for `POST /api/columns/:columnId/tasks/:taskId/move`.
 *  - columnId: UUID of the source column.
 *  - taskId:   UUID of the task being moved.
 *
 * The route nests both ids in the URL so the middleware chain can
 * authorize the source column, the source task, and (transitively,
 * via the service's defensive check) the destination column in a
 * single request.
 */
export const ColumnAndTaskIdParamSchema = z.object({
  columnId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type ColumnAndTaskIdParam = z.infer<typeof ColumnAndTaskIdParamSchema>;

/**
 * Body for `POST /api/columns/:columnId/tasks/:taskId/move`.
 *  - toColumnId: UUID of the destination column. The service verifies
 *    that the destination column lives on the SAME board as the source
 *    (cross-board moves are forbidden — REQ-4.3.7).
 *  - toIndex:    zero-based index in the destination column's task list
 *    AFTER the move. Values larger than the destination's length are
 *    clamped to "append to the end" (REQ-4.3.12); negative values are
 *    rejected with 400.
 */
export const MoveTaskSchema = z.object({
  toColumnId: z.string().uuid(),
  toIndex: z.number().int().min(0),
});
export type MoveTaskInput = z.infer<typeof MoveTaskSchema>;
