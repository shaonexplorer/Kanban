import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config/env.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Shared Prisma client instance.
 *
 * In development, reuse the same client across hot-reloads to prevent
 * creating excessive database connections.
 */
const adapter = new PrismaPg({ connectionString: config.DATABASE_URL });

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: ["query"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
