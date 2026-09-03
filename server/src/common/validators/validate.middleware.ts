import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";

/**
 * Where on the Express `Request` object the validator should read input
 * from and write the parsed result back to.
 *
 * - `"body"`   → `req.body`    (default — JSON payloads)
 * - `"params"` → `req.params`  (URL path segments, e.g. `/api/boards/:id`)
 * - `"query"`  → `req.query`   (URL query string)
 */
export type ValidateSource = "body" | "params" | "query";

/**
 * Generic request validator for a zod schema.
 *
 * On success: replaces the chosen field (`req.body` by default) with the
 * parsed (and stripped of unknown fields) data, then calls `next()`.
 * On failure: forwards the `ZodError` to the central error middleware,
 * which responds with 400 + the flattened issues.
 *
 * @param schema  The zod schema to validate against.
 * @param source  Which part of the request to validate. Defaults to `"body"`.
 *                Use `"params"` for path segments and `"query"` for query
 *                strings.
 */
export const validate =
  (schema: ZodSchema, source: ValidateSource = "body"): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    req[source] = result.data;
    next();
  };
