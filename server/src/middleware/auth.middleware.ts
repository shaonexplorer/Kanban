import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";

/**
 * Extended request interface that includes the authenticated user.
 */
export interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

/**
 * Authentication middleware.
 *
 * Extracts the JWT from the `Authorization: Bearer <token>` header,
 * verifies it, and attaches the decoded user payload to `req.user`.
 *
 * Returns 401 if the token is missing or invalid.
 */
export function authMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      userId: string;
      email: string;
    };

    req.user = { id: decoded.userId, email: decoded.email };
    next();
  } catch (_err) {
    // Token is invalid or expired — req.user remains undefined.
    // Callers should check req.user and return 401 if absent.
  }
}

/**
 * Middleware factory that requires authentication.
 *
 * Use this on routes that should be protected. Returns 401 if no valid
 * user is attached to the request.
 */
export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
