import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import {
  loadColumn,
  loadTask,
  requireBoardAccess,
} from "../../common/middleware/access-control.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { validate } from "../../common/validators/validate.middleware.js";
import * as tasksController from "./tasks.controller.js";
import {
  ColumnAndTaskIdParamSchema,
  ColumnScopedTaskParamSchema,
  CreateTaskSchema,
  MoveTaskSchema,
  TaskIdParamSchema,
  UpdateTaskSchema,
} from "./tasks.validation.js";

/**
 * Router for the `tasks` module.
 *
 * Mounts THREE URL subtrees on a single `/api` mount point:
 *   - `/api/columns/:columnId/tasks`            (column-scoped: list, create)
 *   - `/api/columns/:columnId/tasks/:taskId/move` (move, Phase 4 Step 3)
 *   - `/api/tasks/:id`                          (task-scoped: get, update, delete)
 *
 * Middleware chain patterns:
 *  - Column-scoped routes use
 *    `requireAuth → validate(ColumnScopedTaskParamSchema, "params")
 *     → loadColumn() → requireBoardAccess`.
 *  - Task-scoped routes use
 *    `requireAuth → validate(TaskIdParamSchema, "params")
 *     → loadTask() → requireBoardAccess`.
 *  - The move route (Phase 4 Step 3) chains
 *    `requireAuth → validate(ColumnAndTaskIdParamSchema, "params")
 *     → loadColumn("params", "columnId") → loadTask("params", "taskId")
 *     → requireBoardAccess → validate(MoveTaskSchema)`. Both loaders
 *    populate `req.board`; the `requireBoardAccess` check runs against
 *    the source column's board. The destination's board is verified by
 *    the service's defensive check (cross-board moves are 403).
 *  - `loadColumn()` and `loadTask()` both populate `req.board` (and
 *    `req.column` where applicable), so the existing
 *    `requireBoardAccess` middleware chains behind them unchanged.
 *  - Param validation runs BEFORE the resource loader so a non-UUID id
 *    returns 400 instead of 404.
 *
 * Phase 3/4 reuses `requireBoardAccess` for ALL task mutations — both
 * owners and accepted members can author content on a shared board.
 * `position` and `columnId` are only ever changed via the move
 * endpoint; `PATCH /api/tasks/:id` still does not accept them.
 */
const router = Router();

// ---------------------------------------------------------------------------
// Column-scoped: /api/columns/:columnId/tasks
// ---------------------------------------------------------------------------

// List tasks in a column. Param key is `columnId` (not the default `id`),
// so we pass it explicitly to `loadColumn`.
router.get(
  "/columns/:columnId/tasks",
  requireAuth,
  validate(ColumnScopedTaskParamSchema, "params"),
  loadColumn("params", "columnId"),
  requireBoardAccess,
  asyncHandler(tasksController.listTasks)
);

// Create a task in a column.
router.post(
  "/columns/:columnId/tasks",
  requireAuth,
  validate(ColumnScopedTaskParamSchema, "params"),
  loadColumn("params", "columnId"),
  requireBoardAccess,
  validate(CreateTaskSchema),
  asyncHandler(tasksController.createTask)
);

// Move a task — Phase 4 Step 3. Same-column reorder and cross-column
// moves both flow through this endpoint. The middleware chain loads
// the source column AND the source task so `requireBoardAccess` can
// authorize against the source's board. The destination's board is
// verified by the service's defensive check (cross-board → 403).
router.post(
  "/columns/:columnId/tasks/:taskId/move",
  requireAuth,
  validate(ColumnAndTaskIdParamSchema, "params"),
  loadColumn("params", "columnId"),
  loadTask("params", "taskId"),
  requireBoardAccess,
  validate(MoveTaskSchema),
  asyncHandler(tasksController.moveTask)
);

// ---------------------------------------------------------------------------
// Task-scoped: /api/tasks/:id
// ---------------------------------------------------------------------------

// Get a single task.
router.get(
  "/tasks/:id",
  requireAuth,
  validate(TaskIdParamSchema, "params"),
  loadTask(),
  requireBoardAccess,
  asyncHandler(tasksController.getTask)
);

// Update a task's title and/or description.
router.patch(
  "/tasks/:id",
  requireAuth,
  validate(TaskIdParamSchema, "params"),
  loadTask(),
  requireBoardAccess,
  validate(UpdateTaskSchema),
  asyncHandler(tasksController.updateTask)
);

// Delete a task.
router.delete(
  "/tasks/:id",
  requireAuth,
  validate(TaskIdParamSchema, "params"),
  loadTask(),
  requireBoardAccess,
  asyncHandler(tasksController.deleteTask)
);

export default router;
