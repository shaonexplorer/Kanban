import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes";
import healthRouter from "./routes/health.routes";
import { authMiddleware } from "./middleware/auth.middleware";

/**
 * Creates and configures the Express application.
 *
 * Middleware:
 *  - helmet: sets security-related HTTP headers
 *  - cors:   enables cross-origin requests
 *  - express.json(): parses JSON request bodies
 *  - authMiddleware: attaches decoded user to req.user (non-blocking — routes
 *    use requireAuth to enforce it)
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
  // Protected routes use requireAuth() to reject unauthenticated requests.
  app.use(authMiddleware);

  // Routes
  app.use("/health", healthRouter);
  app.use("/api/auth", authRoutes);

  return app;
}

export default createApp;
