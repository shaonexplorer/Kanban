import type { Request, Response } from "express";
import * as healthService from "./health.service.js";

/**
 * GET /health
 *
 * Returns 200 with `{ status: "ok", timestamp, db: "up" }` when both the
 * server and the database are reachable. If the database is unreachable,
 * returns 503 with `{ status: "degraded", timestamp, db: "down", error }`
 * so orchestrators can take the instance out of rotation.
 */
export async function check(_req: Request, res: Response): Promise<void> {
  const result = await healthService.getStatus();
  const statusCode = result.status === "ok" ? 200 : 503;
  res.status(statusCode).json(result);
}
