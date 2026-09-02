/**
 * HttpError — a typed error that carries an HTTP status code.
 *
 * Throw it from services or controllers; the central error middleware
 * (`error.middleware.ts`) reads `statusCode` and `message` to shape the
 * JSON response.
 */
export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.details = details;
  }
}
