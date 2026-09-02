import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../../config/env.js";
import { HttpError } from "../../common/errors/HttpError.js";
import { prisma } from "../../lib/prisma.js";
import type { LoginInput, RegisterInput } from "./auth.validation.js";

/**
 * Result returned by `register` on success.
 */
export interface RegisterResult {
  id: string;
  email: string;
  token: string;
}

/**
 * Result returned by `login` on success.
 */
export interface LoginResult {
  email: string;
  token: string;
}

/**
 * Signs a JWT for the given user payload using the configured secret and
 * expiration. Centralized so both `register` and `login` produce tokens
 * with the exact same shape.
 */
function issueToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Register a new user.
 *  - Rejects with 409 if the email is already taken.
 *  - Hashes the password with bcrypt (configured salt rounds).
 *  - Returns the created user's id, email, and a signed JWT.
 */
export async function register(input: RegisterInput): Promise<RegisterResult> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw new HttpError(409, "Email already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
    },
  });

  const token = issueToken(user.id, user.email);

  return { id: user.id, email: user.email, token };
}

/**
 * Authenticate an existing user.
 *  - Returns the same generic 401 error whether the email is missing or
 *    the password is wrong, to prevent email enumeration.
 *  - Returns the user's email and a signed JWT on success.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    throw new HttpError(401, "Invalid credentials");
  }

  const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordValid) {
    throw new HttpError(401, "Invalid credentials");
  }

  const token = issueToken(user.id, user.email);

  return { email: user.email, token };
}
