import type { Request, Response } from "express";
import * as tasksService from "./tasks.service.js";
import type {
  ColumnAndTaskIdParam,
  ColumnScopedTaskParam,
  CreateSubtaskInput,
  CreateTaskInput,
  CreateCommentInput,
  SetAssigneesInput,
  MoveTaskInput,
  TaskIdParam,
  TaskSubtaskParams,
  UpdateSubtaskInput,
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
 * (`{ id, title, description, columnId, position, createdAt, starred,
 *   priority, dueDate, storyPoints, labels, assignees }`).
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
 * PATCH /api/tasks/:id — update a task's mutable fields.
 * Returns 200 with the updated task (full shape).
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

// ---------------------------------------------------------------------------
// Move — Phase 4 Step 3
// ---------------------------------------------------------------------------

/**
 * POST /api/columns/:columnId/tasks/:taskId/move — move a task to a
 * new position, either within the same column (reorder) or across
 * columns on the same board. Cross-board moves are rejected with 403.
 *
 * Returns 200 with the moved task (full shape).
 */
export async function moveTask(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const { taskId } = req.params as ColumnAndTaskIdParam;
  const input = req.body as MoveTaskInput;

  const moved = await tasksService.moveTask(userId, taskId, input);
  res.status(200).json(moved);
}

// ---------------------------------------------------------------------------
// Phase 5 Step 10 — subtasks
// ---------------------------------------------------------------------------

/**
 * POST /api/tasks/:id/subtasks — create a new subtask.
 * Returns 201 with the new subtask shape.
 */
export async function createSubtask(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const { id: taskId } = req.params as TaskIdParam;
  const input = req.body as CreateSubtaskInput;

  const subtask = await tasksService.createSubtask(userId, taskId, input);
  res.status(201).json(subtask);
}

/**
 * PATCH /api/tasks/:id/subtasks/:subtaskId — update a subtask's
 * title and/or done state. Returns 200 with the updated subtask.
 */
export async function updateSubtask(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const { id: taskId, subtaskId } = req.params as TaskSubtaskParams;
  const input = req.body as UpdateSubtaskInput;

  const subtask = await tasksService.updateSubtask(userId, taskId, subtaskId, input);
  res.status(200).json(subtask);
}

/**
 * DELETE /api/tasks/:id/subtasks/:subtaskId — delete a subtask.
 * Returns 204 with no body.
 */
export async function deleteSubtask(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const { id: taskId, subtaskId } = req.params as TaskSubtaskParams;

  await tasksService.deleteSubtask(userId, taskId, subtaskId);
  res.status(204).send();
}

// ---------------------------------------------------------------------------
// Phase 5 Step 10 — comments
// ---------------------------------------------------------------------------

/**
 * GET /api/tasks/:id/comments — list the most recent comments on a task.
 * Returns 200 with up to 50 comments, newest first.
 */
export async function listComments(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const { id: taskId } = req.params as TaskIdParam;

  const comments = await tasksService.listComments(userId, taskId);
  res.status(200).json(comments);
}

/**
 * POST /api/tasks/:id/comments — post a comment on a task.
 * Returns 201 with the created comment (with author email).
 */
export async function createComment(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const { id: taskId } = req.params as TaskIdParam;
  const input = req.body as CreateCommentInput;

  const comment = await tasksService.createComment(userId, taskId, input);
  res.status(201).json(comment);
}

// ---------------------------------------------------------------------------
// Phase 5 Step 10 — assignees
// ---------------------------------------------------------------------------

/**
 * PUT /api/tasks/:id/assignees — replace the full assignee set on a task.
 * Returns 200 with the new assignee set (`{ userId, email }[]`).
 */
export async function setAssignees(req: Request, res: Response): Promise<void> {
  const { id: userId } = req.user!;
  const { id: taskId } = req.params as TaskIdParam;
  const input = req.body as SetAssigneesInput;

  const assignees = await tasksService.setAssignees(userId, taskId, input);
  res.status(200).json(assignees);
}
