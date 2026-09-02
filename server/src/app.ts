import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import { errorMiddleware } from "./common/errors/error.middleware.js";
import { authMiddleware } from "./common/middleware/auth.middleware.js";
import { authRouter } from "./modules/auth/index.js";
import { healthRouter } from "./modules/health/index.js";

/**
 * Creates and configures the Express application.
 *
 * Middleware:
 *  - helmet:                sets security-related HTTP headers
 *  - cors:                  enables cross-origin requests
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
  app.use(cors());
  app.use(express.json());

  // Authentication middleware — attaches req.user when a valid JWT is present.
  app.use(authMiddleware);

  // Feature module routes
  app.use("/health", healthRouter);
  app.use("/api/auth", authRouter);

  // Central error handler MUST be registered last.
  app.use(errorMiddleware);

  return app;
}

export default createApp;
