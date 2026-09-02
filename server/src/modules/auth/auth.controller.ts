import type { Request, Response } from "express";
import * as authService from "./auth.service.js";
import type { LoginInput, RegisterInput } from "./auth.validation.js";

/**
 * POST /api/auth/register
 *
 * Validates the request body via the zod schema, registers a new user via
 * the service, and returns 201 with `{ id, email, token }`.
 *
 * Errors (duplicate email, validation failure) are thrown and forwarded to
 * the central error middleware by `asyncHandler`.
 */
export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as RegisterInput;
  const result = await authService.register({ email, password });
  res.status(201).json(result);
}

/**
 * POST /api/auth/login
 *
 * Authenticates the user and returns 200 with `{ email, token }`.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;
  const result = await authService.login({ email, password });
  res.status(200).json(result);
}
