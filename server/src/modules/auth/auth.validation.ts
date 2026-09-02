import { z } from "zod";

/**
 * Zod schema for `POST /api/auth/register`.
 *  - email must be a valid address
 *  - password must be at least 8 characters
 */
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/**
 * Zod schema for `POST /api/auth/login`.
 *  - email must be a valid address
 *  - password must be present (no minimum length — wrong passwords are
 *    caught by the service via bcrypt comparison)
 */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
