/**
 * API response envelope (Phase 5 Step 7).
 *
 * The server's wire contract is intentionally loose on success and
 * strict on failure. This helper exists to document that contract
 * in one place without forcing a breaking change to existing
 * handlers that already return their data directly (e.g.
 * `res.status(201).json(board)`).
 *
 * Two shapes only:
 *
 *   - Success:  `<resource>`  or  `[<resource>, ...]`
 *               (whatever the controller's data is, at the root)
 *
 *   - Failure:  `{ error: string, details?: <any> }`
 *               (always; the central error middleware produces this
 *               shape — see `src/common/errors/error.middleware.ts`).
 *
 * The `envelope` helper is provided for new endpoints that want to
 * be explicit about the shape; existing endpoints are left alone
 * because the failure envelope is enforced centrally and a v1
 * client already understands both shapes.
 *
 * See `specs/Phase05/Plan.md` §7.2.
 */

/**
 * Wraps a successful response body in the documented envelope.
 * Use this only for new endpoints that want to be explicit. Most
 * Phase 1–4 handlers can keep their current shape (`res.json(data)`)
 * — the failure side is enforced centrally.
 */
export function envelope<T>(data: T): { data: T } {
  return { data };
}

/**
 * Builds a failure response body. Matches the shape the central
 * error middleware emits for `HttpError` and `ZodError`, so a
 * handler that throws a typed error gets the same envelope as a
 * handler that responds with a hand-built error body.
 */
export function errorEnvelope(error: string, details?: unknown): { error: string; details?: unknown } {
  if (details === undefined) return { error };
  return { error, details };
}
