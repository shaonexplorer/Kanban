# Phase 1 — Foundation: Implementation Plan

## Overview

Phase 1 establishes the foundational architecture for the Mini Kanban Board:
project scaffolding, database schema, and authentication. By the end of this
phase, a developer should be able to register, log in, and receive a signed JWT.

---

## Step 1 — Project Scaffolding ✅ DONE

**Completion status:**
- [x] 1.1 Bootstrap the Monorepo – directories, README.md
- [x] 1.2 Backend Setup (Node.js + Express + TypeScript)
- [x] 1.3 Frontend Setup (Next.js + Tailwind)
- [x] 1.4 Prisma Configuration with initial migration applied

### 1.1 Bootstrap the Monorepo

- Create the top-level project directory layout:

  ```
  Mini Kanban Board/
  ├── backend/
  ├── frontend/
  ├── specs/
  ├── .gitignore
  └── README.md
  ```

### 1.2 Backend Setup (Node.js + Express + TypeScript)

- Inside `backend/`:
  - Run `npm init -y`.
  - Install dependencies:
    - Runtime: `express`, `cors`, `helmet`, `dotenv`
    - Auth: `bcryptjs`, `jsonwebtoken`
    - Dev: `typescript`, `@types/node`, `@types/express`, `@types/cors`,
      `@types/bcryptjs`, `@types/jsonwebtoken`, `ts-node-dev`, `prisma`,
      `@prisma/client`
  - Initialize `tsconfig.json` (target: ES2022, module: commonjs, strict mode).
  - Create `src/index.ts`, `src/app.ts`, `src/config/` directory.
  - Create `src/routes/auth.routes.ts`, `src/middleware/` directory.
  - Verify TypeScript compiles with `npx tsc --noEmit`.

### 1.3 Frontend Setup (Next.js + React + TypeScript)

- Inside `frontend/`:
  - Run `npx create-next-app@latest --typescript`.
  - Install dependencies:
    - `tailwindcss`, `postcss`, `autoprefixer`
    - `axios` (or `fetch` wrapper)
  - Run `npx tailwindcss init -p`.
  - Configure `tailwind.config.js` and `globals.css`.
  - Verify development server starts with `npm run dev`.

### 1.4 Prisma Configuration

- In `backend/`, run `npx prisma init`.
- Configure `DATABASE_URL` in `.env` pointing to a local PostgreSQL instance:

  ```
  DATABASE_URL="postgresql://USER:PASS@localhost:5432/kanban?schema=public"
  ```

- Ensure `prisma/schema.prisma` uses the `postgresql` provider.

## Step 2 — Database Schema Design

### 2.1 Define the Prisma Schema

File: `backend/prisma/schema.prisma`

- **User model:**
  - `id` — `String @id @default(uuid())`
  - `email` — `String @unique`
  - `passwordHash` — `String`
  - `createdAt` — `DateTime @default(now())`
  - Relation: `posts` — `Board[]` (boards owned by this user)

- **Board model:**
  - `id` — `String @id @default(uuid())`
  - `title` — `String`
  - `ownerId` — `String @relation(fields: [ownerId], references: [id])`
  - `createdAt` — `DateTime @default(now())`
  - Relations: `owner` — `User`, `columns` — `Column[]`, `sharedWith` — `BoardUser[]`

- **BoardUser (join table for board sharing):**
  - `id` — `String @id @default(uuid())`
  - `boardId` — `String @relation(fields: [boardId], references: [id])`
  - `userId` — `String @relation(fields: [userId], references: [id])`
  - `@@unique([boardId, userId])` — no duplicate memberships

- **Column model:**
  - `id` — `String @id @default(uuid())`
  - `title` — `String`
  - `boardId` — `String @relation(fields: [boardId], references: [id])`
  - `position` — `Int` (ordering within the board)
  - Relations: `board` — `Board`, `tasks` — `Task[]`

- **Task model:**
  - `id` — `String @id @default(uuid())`
  - `title` — `String`
  - `description` — `String?` (optional)
  - `columnId` — `String @relation(fields: [columnId], references: [id])`
  - `position` — `Int` (ordering within the column)
  - `createdAt` — `DateTime @default(now())`
  - Relations: `column` — `Column`

### 2.2 Run Migrations

- Run `npx prisma migrate dev --name init` to generate and apply the first migration.
- Verify the migration SQL in `prisma/migrations/`.
- Use `npx prisma studio` to visually inspect the tables and confirm the schema.

---

## Step 3 — Authentication

### 3.1 Registration Endpoint

- Route: `POST /api/auth/register`
- Request body: `{ email: string, password: string }`
- Logic:
  1. Validate input (email format, password length ≥ 8).
  2. Hash the password with `bcryptjs` (`bcrypt.hash(password, 12)`).
  3. Create a `User` record in the database.
  4. Return `{ id, email, token }` where `token` is a signed JWT.

### 3.2 Login Endpoint

- Route: `POST /api/auth/login`
- Request body: `{ email: string, password: string }`
- Logic:
  1. Find the user by email.
  2. Compare the password with the stored hash (`bcrypt.compare`).
  3. If valid, sign and return a JWT: `{ email, token }`.

### 3.3 JWT Configuration

- Secret key stored in `.env` as `JWT_SECRET`.
- Token payload: `{ userId, email }`.
- Expiration: 7 days (`expiresIn: "7d"`).
- Use `jwt.sign()` for issuance and `jwt.verify()` for verification.

### 3.4 Auth Middleware

- File: `src/middleware/auth.middleware.ts`
- Logic:
  1. Extract the `Authorization` header (`Bearer <token>`).
  2. Verify the token with `jwt.verify()`.
  3. Attach `req.user = { id, email }` on success.
  4. Return 401 if the token is missing or invalid.

### 3.5 Password Reset (Stretch)

- If time permits, implement:
  - `POST /api/auth/forgot-password` — generates a reset token and emails it.
  - `POST /api/auth/reset-password` — validates the token and sets a new password.

---

## Step 4 — Health Check Endpoint

- Route: `GET /health`
- Returns `{ status: "ok", timestamp: <ISO string> }` with HTTP 200.
- Verifies the server is running and the database connection is active.

---

## Execution Order

| Order | Task                                  | Estimated Effort |
|-------|---------------------------------------|------------------|
| 1     | Create directory structure            | 5 min            |
| 2     | Initialize backend (Express + TS)     | 15 min           |
| 3     | Initialize frontend (Next.js + Tailwind) | 15 min         |
| 4     | Configure Prisma schema               | 20 min           |
| 5     | Run migrations & verify schema        | 15 min           |
| 6     | Implement registration endpoint       | 20 min           |
| 7     | Implement login endpoint              | 15 min           |
| 8     | Implement auth middleware             | 15 min           |
| 9     | Add health check endpoint             | 5 min            |
| 10    | Write integration tests for auth      | 20 min           |
|       | **Total**                             | **~2.5 hours**   |
