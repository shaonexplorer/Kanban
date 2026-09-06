import express, { type Application } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { errorMiddleware } from "./common/errors/error.middleware.js";
import { authMiddleware } from "./common/middleware/auth.middleware.js";
import { config } from "./config/env.js";
import { authRouter } from "./modules/auth/index.js";
import { boardInvitationsRouter } from "./modules/board-invitations/index.js";
import { boardsRouter } from "./modules/boards/index.js";
import { columnsRouter } from "./modules/columns/index.js";
import { healthRouter } from "./modules/health/index.js";
import { tasksRouter } from "./modules/tasks/index.js";

/**
 * Creates and configures the Express application.
 *
 * Middleware:
 *  - helmet:                sets security-related HTTP headers
 *  - cors:                  enables cross-origin requests with
 *                           `credentials: true` so the httpOnly auth
 *                           cookie can travel from the SPA to the API
 *  - cookie-parser:         populates `req.cookies` from the Cookie
 *                           header; required by `authMiddleware`
 *  - express.json():        parses JSON request bodies
 *  - authMiddleware:        attaches decoded user to req.user (non-blocking;
 *                           protected routes use requireAuth to enforce it)
 *  - errorMiddleware:       LAST — catches anything asyncHandler forwarded
 *
 * @returns A configured Express Application instance.
 */
function createApp(): Application {
  const app = express();

  // Security & utility middleware
  app.use(helmet());
  // CORS allowlist is read from `CORS_ORIGIN` (comma-separated). The
  // default `http://localhost:3000` covers the local Next.js dev
  // server. `credentials: true` is required for the httpOnly
  // `token` cookie to round-trip cross-origin.
  const allowedOrigins = config.CORS_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow non-browser requests (curl, server-to-server) where
        // `origin` is undefined. They don't carry cookies anyway.
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    }),
  );
  // Parse the `Cookie` header into `req.cookies`. Must be registered
  // before any route that reads cookies — `authMiddleware` runs
  // immediately after, and it reads `req.cookies.token`.
  app.use(cookieParser());
  app.use(express.json());

  // Authentication middleware — attaches req.user when a valid JWT is present.
  app.use(authMiddleware);

  // Feature module routes
  app.use("/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/boards", boardsRouter);
  app.use("/api/board-invitations", boardInvitationsRouter);
  // The columns router owns BOTH /api/boards/:boardId/columns and
  // /api/columns/:id subtrees — mounted on `/api` so each route defines
  // its own full path. Single mount point, no path collisions.
  app.use("/api", columnsRouter);
  // The tasks router owns BOTH /api/columns/:columnId/tasks and
  // /api/tasks/:id subtrees — same `/api` mount-point pattern as
  // columns. No collisions with the columns router: its task-scoped
  // paths are `/tasks/...` and column-scoped paths share a different
  // URL segment.
  app.use("/api", tasksRouter);

  // Central error handler MUST be registered last.
  app.use(errorMiddleware);

  return app;
}

export default createApp;
