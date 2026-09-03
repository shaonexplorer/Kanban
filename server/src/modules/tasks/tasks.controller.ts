import type { Request, Response } from "express";
import * as tasksService from "./tasks.service.js";
import type {
  ColumnScopedTaskParam,
  CreateTaskInput,
  TaskIdParam,
  UpdateTaskInput,
} from "./tasks.validation.js";

/**
 * Controller layer for the `tasks` module.
 *
 * Each handler is a thin shell: it reads the already-validated input
 * (from `req.user`, `req.params`, `req.body`, `req.board`, or
 * `req.task`), delegates to the service, and shapes the HTTP response.
 *
 * Errors thrown from the service are caught by `asyncHandler` and
 * forwarded to the central error middleware — controllers do not
 * catch them.
 */

// ---------------------------------------------------------------------------
// Column-scoped endpoints
// ---------------------------------------------------------------------------

/**
 * POST /api/columns/:columnId/tasks — create a new task in a column.
 * Returns 201 with the full task shape
 * (`{ id, title, description, columnId, position, createdAt }`).
 */
export async function createTask(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const { columnId } = req.params as ColumnScopedTaskParam;
  const input = req.body as CreateTaskInput;

  const task = await tasksService.createTask(userId, columnId, input);
  res.status(201).json(task);
}

/**
 * GET /api/columns/:columnId/tasks — list the tasks in a column.
 * Returns 200 with an array (possibly empty) of the full task shape.
 */
export async function listTasks(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const { columnId } = req.params as ColumnScopedTaskParam;

  const tasks = await tasksService.listTasks(userId, columnId);
  res.status(200).json(tasks);
}

// ---------------------------------------------------------------------------
// Task-scoped endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/tasks/:id — fetch a single task.
 * Returns 200 with the full task shape.
 */
export async function getTask(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const { id: taskId } = req.params as TaskIdParam;

  const task = await tasksService.getTask(userId, taskId);
  res.status(200).json(task);
}

/**
 * PATCH /api/tasks/:id — update a task's title and/or description.
 * Returns 200 with the updated task (full shape including `createdAt`).
 */
export async function updateTask(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const { id: taskId } = req.params as TaskIdParam;
  const input = req.body as UpdateTaskInput;

  const task = await tasksService.updateTask(userId, taskId, input);
  res.status(200).json(task);
}

/**
 * DELETE /api/tasks/:id — hard-delete a task.
 * Returns 204 with no body.
 */
export async function deleteTask(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const { id: taskId } = req.params as TaskIdParam;

  await tasksService.deleteTask(userId, taskId);
  res.status(204).send();
}
