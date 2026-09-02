import { prisma } from "../../lib/prisma.js";

/**
 * Result of the health check.
 *
 * - `ok`       — server is up AND the database responds to a trivial query.
 * - `degraded` — server is up but the database is unreachable.
 */
export type HealthStatus =
  | { status: "ok"; timestamp: string; db: "up" }
  | { status: "degraded"; timestamp: string; db: "down"; error: string };

/**
 * Verifies the server is running and the database connection is active.
 *
 * Issues `SELECT 1` against the configured Prisma datasource. A failure here
 * means the app is up but cannot serve real traffic — the controller maps
 * that to HTTP 503 so orchestrators (k8s, load balancers) can take action.
 */
export async function getStatus(): Promise<HealthStatus> {
  const timestamp = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", timestamp, db: "up" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown database error";
    return { status: "degraded", timestamp, db: "down", error: message };
  }
}
