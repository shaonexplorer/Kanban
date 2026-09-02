import type { Request, Response } from "express";
import * as healthService from "./health.service.js";

/**
 * GET /health
 *
 * Returns 200 with `{ status: "ok", timestamp }`.
 */
export async function check(_req: Request, res: Response): Promise<void> {
  const status = healthService.getStatus();
  res.status(200).json(status);
}
