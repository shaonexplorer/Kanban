import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";

/**
 * Generic request-body validator for a zod schema.
 *
 * On success: replaces `req.body` with the parsed (and stripped of unknown
 * fields) data, then calls `next()`.
 * On failure: forwards the `ZodError` to the central error middleware, which
 * responds with 400 + the flattened issues.
 */
export const validate =
  (schema: ZodSchema): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
