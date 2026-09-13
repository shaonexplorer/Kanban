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
 * - `CreateSubtaskSchema`           — body for `POST /api/tasks/:id/subtasks`.
 * - `UpdateSubtaskSchema`           — body for `PATCH /api/tasks/:id/subtasks/:subtaskId`.
 * - `TaskSubtaskParamsSchema`       — `req.params` for subtask routes.
 * - `CreateCommentSchema`           — body for `POST /api/tasks/:id/comments`.
 * - `TaskCommentParamsSchema`       — `req.params` for comment routes (shares the taskId param).
 * - `SetAssigneesSchema`            — body for `PUT /api/tasks/:id/assignees`.
 * - `TaskAssigneesParamsSchema`      — `req.params` for the assignees route.
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
 *  - starred (Phase 5 Step 10): optional boolean.
 *  - priority (Phase 5 Step 10): optional LOW | MEDIUM | HIGH | URGENT.
 *  - dueDate (Phase 5 Step 10): optional ISO-8601 datetime string.
 *  - storyPoints (Phase 5 Step 10): optional positive integer.
 *  - labels (Phase 5 Step 10): optional string array; each label ≤ 100 chars.
 *  - At least one of the above must be supplied — `.refine()` enforces that
 *    here so the service never has to second-guess an empty patch.
 *  - `assignees` is intentionally excluded — the dedicated
 *    `PUT /api/tasks/:id/assignees` endpoint owns that relation.
 */
export const UpdateTaskSchema = z
  .object({
    title: taskTitleSchema.optional(),
    description: taskDescriptionSchema.optional(),
    starred: z.boolean().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    dueDate: z.string().datetime({ offset: true }).optional(),
    storyPoints: z.number().int().positive().optional(),
    labels: z.array(z.string().trim().max(100)).optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.starred !== undefined ||
      v.priority !== undefined ||
      v.dueDate !== undefined ||
      v.storyPoints !== undefined ||
      v.labels !== undefined,
    { message: "At least one field must be provided" }
  );
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

// ---------------------------------------------------------------------------
// Phase 5 Step 10 — subtasks
// ---------------------------------------------------------------------------

/**
 * Body for `POST /api/tasks/:id/subtasks`.
 *  - title: 1–200 characters after trim.
 */
export const CreateSubtaskSchema = z.object({
  title: taskTitleSchema,
});
export type CreateSubtaskInput = z.infer<typeof CreateSubtaskSchema>;

/**
 * Body for `PATCH /api/tasks/:id/subtasks/:subtaskId`.
 *  - title: optional, 1–200 characters after trim.
 *  - done:   optional boolean.
 *  - At least one of `title` or `done` must be supplied.
 */
export const UpdateSubtaskSchema = z
  .object({
    title: taskTitleSchema.optional(),
    done: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.done !== undefined, {
    message: "At least one of `title` or `done` must be provided",
  });
export type UpdateSubtaskInput = z.infer<typeof UpdateSubtaskSchema>;

/**
 * Path params for any `/api/tasks/:id/subtasks/...` route.
 *  - id:        UUID of the parent task.
 *  - subtaskId: UUID of the subtask.
 */
export const TaskSubtaskParamsSchema = z.object({
  id: z.string().uuid(),
  subtaskId: z.string().uuid(),
});
export type TaskSubtaskParams = z.infer<typeof TaskSubtaskParamsSchema>;

// ---------------------------------------------------------------------------
// Phase 5 Step 10 — comments
// ---------------------------------------------------------------------------

/**
 * Body for `POST /api/tasks/:id/comments`.
 *  - body: 1–5000 characters after trim.
 */
export const CreateCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

// ---------------------------------------------------------------------------
// Phase 5 Step 10 — assignees
// ---------------------------------------------------------------------------

/**
 * Body for `PUT /api/tasks/:id/assignees`.
 * Replaces the full assignee set with the supplied `userIds`.
 * Empty array clears all assignees.
 * Each `userId` must be a valid UUID; the service verifies the user
 * exists and is a member of the task's board (403 if not).
 */
export const SetAssigneesSchema = z.object({
  userIds: z.array(z.string().uuid()).default([]),
});
export type SetAssigneesInput = z.infer<typeof SetAssigneesSchema>;
