import createApp from "./app";
import { config, validateEnv } from "./config";
import prisma from "./lib/prisma";

/**
 * Application entry point.
 *
 * On startup:
 *  1. Validates required environment variables.
 *  2. Verifies the database connection.
 *  3. Starts the Express server on the configured port.
 */
async function bootstrap(): Promise<void> {
  validateEnv();

  const app = createApp();

  // Verify database connectivity before accepting requests.
  try {
    await prisma.$connect();
    console.info("✅ Database connection established");
  } catch (err) {
    console.error("❌ Failed to connect to the database:", err);
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.info(`🚀 Server listening on http://localhost:${config.port}`);
  });
}

void bootstrap();
