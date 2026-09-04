import "dotenv/config";
import { z } from "zod";

/**
 * Zod schema for the environment variables the server depends on.
 *
 * - DATABASE_URL: required connection string for PostgreSQL
 * - JWT_SECRET:   required secret used to sign/verify auth tokens
 * - PORT:         optional, defaults to 4000
 * - BCRYPT_SALT_ROUNDS: optional, defaults to 12
 * - JWT_EXPIRES_IN:     optional, defaults to "7d"
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  PORT: z.coerce.number().int().positive().default(4000),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().positive().default(12),
  JWT_EXPIRES_IN: z.string().default("7d"),
  // The origin the SPA runs on. Used to scope the CORS allowlist so
  // the httpOnly auth cookie can travel cross-origin in dev
  // (localhost:3000 → localhost:4000) and production. Comma-separated
  // for multiple allowed origins.
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  // Toggles `Secure` on the auth cookie. In dev (HTTP) we leave it
  // off because browsers ignore `Secure` cookies on plain HTTP. In
  // production / staging behind HTTPS it must be `production`.
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type AppEnv = z.infer<typeof EnvSchema>;

/**
 * Validated configuration object. Importing this module eagerly
 * parses `process.env`; the parse throws if anything required is missing.
 */
export const config: AppEnv = EnvSchema.parse(process.env);

/**
 * Explicit env-validation entry point — useful from `src/index.ts` so
 * the bootstrap can fail loudly on misconfiguration.
 */
export function validateEnv(): void {
  EnvSchema.parse(process.env);
}
