import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../lib/prisma";

const router = Router();

/**
 * POST /api/auth/register
 *
 * Registers a new user.
 * - Validates email format and password length (≥ 8).
 * - Hashes the password with bcrypt (12 salt rounds).
 * - Creates a User record in the database.
 * - Returns HTTP 201 with { id, email, token } on success.
 * - Returns HTTP 409 if the email is already registered.
 * - Returns HTTP 400 if input validation fails.
 */
router.post("/register", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // --- Input validation ---
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }

  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "Password is required" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  // --- Check for existing user ---
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  // --- Hash password ---
  const passwordHash = await bcrypt.hash(
    password,
    config.bcryptSaltRounds
  );

  // --- Create user ---
  const user = await prisma.user.create({
    data: { email, passwordHash },
  });

  // --- Issue JWT ---
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  res.status(201).json({
    id: user.id,
    email: user.email,
    token,
  });
});

/**
 * POST /api/auth/login
 *
 * Authenticates a user and returns a signed JWT.
 * - Looks up the user by email.
 * - Compares the supplied password against the stored hash.
 * - Returns { email, token } on success.
 * - Returns HTTP 401 with a generic message if credentials are invalid
 *   (does not reveal whether the email exists).
 */
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  // Use a consistent error message to prevent email enumeration.
  const genericError = { error: "Invalid credentials" };

  if (!user) {
    res.status(401).json(genericError);
    return;
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);

  if (!passwordValid) {
    res.status(401).json(genericError);
    return;
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  res.status(200).json({
    email: user.email,
    token,
  });
});

export default router;
