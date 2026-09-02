/**
 * Result of the health check.
 */
export interface HealthStatus {
  status: "ok";
  timestamp: string;
}

/**
 * Returns a snapshot of the server's health — a static status plus the
 * current ISO timestamp. Kept in a service so future health checks
 * (DB ping, dependency checks) have an obvious home.
 */
export function getStatus(): HealthStatus {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
  };
}
