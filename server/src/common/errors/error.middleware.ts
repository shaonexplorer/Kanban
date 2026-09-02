import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "./HttpError.js";

/**
 * Central Express error handler.
 *
 * Recognizes:
 *  - HttpError          → uses its `statusCode` + `message`
 *  - ZodError           → 400 with flattened field issues
 *  - Prisma known codes → mapped to 400 / 404 / 409 as appropriate
 *  - everything else    → 500 with a generic message (no leak of internals)
 *
 * The response shape is always `{ error: string, ...details? }` so callers
 * can rely on a consistent envelope.
 */
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Domain errors with an explicit status code
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  // Zod validation errors from the validate() middleware
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.flatten(),
    });
    return;
  }

  // Prisma known request errors — keep the wire format simple
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const code = (err as { code?: string }).code;
    // P2002: unique constraint violation (e.g. duplicate email)
    if (code === "P2002") {
      res.status(409).json({ error: "Resource already exists" });
      return;
    }
    // P2025: record not found
    if (code === "P2025") {
      res.status(404).json({ error: "Resource not found" });
      return;
    }
  }

  // Unknown error — log full detail server-side, return a generic message
  console.error("[error.middleware] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
}
