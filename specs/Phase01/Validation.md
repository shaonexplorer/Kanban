# Phase 1 — Foundation: Validation Criteria

## Validation Philosophy

Each requirement (REQ-x.x.x) from `Requirements.md` must be verifiable.
This document provides the validation method and expected outcome for each
requirement in Phase 1.

---

## 1. Project Scaffolding

### 1.1 Monorepo Structure

- **VAL-1.1.1** Confirm `backend/` and `frontend/` directories exist at the
  project root.
  - **Method:** `ls` the project root.
  - **Expected:** Both `backend/` and `frontend/` are present.

- **VAL-1.1.2** Confirm `specs/` directory contains `Plan.md`,
  `Requirements.md`, and `Validation.md`.
  - **Method:** `ls specs/Phase01/`.
  - **Expected:** All three `.md` files exist.

- **VAL-1.1.3** Confirm `docker-compose.yml` exists and defines PostgreSQL.
  - **Method:** Read `docker-compose.yml`.
  - **Expected:** A `services` section includes a `postgres` service with
    environment variables for `POSTGRES_USER`, `POSTGRES_PASSWORD`, and
    `POSTGRES_DB`.

- **VAL-1.1.4** Confirm root `.gitignore` excludes `node_modules/`, `dist/`,
  and `.env`.
  - **Method:** Read `.gitignore`.
  - **Expected:** The listed patterns are present.

### 1.2 Backend Stack

- **VAL-1.2.1** Confirm `backend/package.json` lists `express` as a dependency.
  - **Method:** `cat backend/package.json | jq '.dependencies'`.
  - **Expected:** `"express"` is present.

- **VAL-1.2.2** Confirm `backend/tsconfig.json` has `strict: true`.
  - **Method:** Read `backend/tsconfig.json`.
  - **Expected:** `"strict": true` is set in `compilerOptions`.

- **VAL-1.2.3** Confirm `dotenv` is loaded (e.g., `src/config/env.ts` or
  `src/app.ts`).
  - **Method:** Grep for `dotenv` in `backend/src/`.
  - **Expected:** `require("dotenv").config()` or
    `import "dotenv/config"` is present.

- **VAL-1.2.4** Confirm `cors` and `helmet` middleware are applied.
  - **Method:** Grep for `cors` and `helmet` in `backend/src/app.ts`.
  - **Expected:** Both `app.use(cors())` and `app.use(helmet())` are present.

- **VAL-1.2.5** Confirm `dev` script uses `ts-node-dev`.
  - **Method:** `cat backend/package.json | jq '.scripts.dev'`.
  - **Expected:** `"ts-node-dev --respawn --transpile-only src/index.ts"`.

### 1.3 Frontend Stack

- **VAL-1.3.1** Confirm `frontend/` contains a `next.config.js` or
  `next.config.mjs` and `tsconfig.json`.
  - **Method:** `ls frontend/`.
  - **Expected:** Both config files exist.

- **VAL-1.3.2** Confirm Tailwind CSS is configured and a Tailwind class is
  visible in the default page.
  - **Method:** `grep -r "tailwind" frontend/tailwind.config.js` and
    `grep "className.*bg-" frontend/app/page.tsx` (or `pages/index.tsx`).
  - **Expected:** `tailwind.config.js` has content paths set, and a utility
    class like `bg-gray-100` or similar is present in a component.

- **VAL-1.3.3** Confirm `axios` (or `fetch`) is available.
  - **Method:** `cat frontend/package.json | jq '.dependencies | has("axios")'`
    or grep for `fetch` in source.
  - **Expected:** `axios` is in dependencies, or `fetch` is used in an API
    client file.

### 1.4 Prisma & PostgreSQL

- **VAL-1.4.1** Confirm `prisma` and `@prisma/client` are in
  `backend/package.json`.
  - **Method:** `cat backend/package.json | jq '.dependencies'`.
  - **Expected:** `"prisma"` and `"@prisma/client"` are listed (or dev
    dependencies).

- **VAL-1.4.2** Confirm `prisma/schema.prisma` uses `postgresql` provider.
  - **Method:** Read `backend/prisma/schema.prisma`.
  - **Expected:** `datasource db { provider = "postgresql" }`.

- **VAL-1.4.3** Confirm `DATABASE_URL` is in backend `.env`.
  - **Method:** `grep DATABASE_URL backend/.env`.
  - **Expected:** `DATABASE_URL="postgresql://..."`.

- **VAL-1.4.4** Confirm `npx prisma generate` runs without error.
  - **Method:** Run `cd backend && npx prisma generate`.
  - **Expected:** Output includes `✔ Generated Prisma Client`.

---

## 2. Database Schema

### 2.1–2.5 Model Verification

- **VAL-2.1** Confirm `User` model exists with `id`, `email`, `passwordHash`,
  and `createdAt`.
  - **Method:** Read `backend/prisma/schema.prisma`.
  - **Expected:** `model User { ... }` block contains all listed fields.

- **VAL-2.2** Confirm `Board` model exists with `id`, `title`, `ownerId`,
  and `createdAt`.
  - **Method:** Read `backend/prisma/schema.prisma`.
  - **Expected:** `model Board { ... }` block contains all listed fields.

- **VAL-2.3** Confirm `BoardUser` join table enforces `@@unique([boardId,
  userId])`.
  - **Method:** Read `backend/prisma/schema.prisma`.
  - **Expected:** `model BoardUser { ... @@unique([boardId, userId]) }`.

- **VAL-2.4** Confirm `Column` model exists with `id`, `title`, `boardId`,
  and `position`.
  - **Method:** Read `backend/prisma/schema.prisma`.
  - **Expected:** `model Column { ... }` block contains all listed fields.

- **VAL-2.5** Confirm `Task` model exists with `id`, `title`, `description`,
  `columnId`, `position`, and `createdAt`.
  - **Method:** Read `backend/prisma/schema.prisma`.
  - **Expected:** `model Task { ... }` block contains all listed fields.

### 2.6 Schema Verification

- **VAL-2.6.1** Confirm migration was applied successfully.
  - **Method:** Run `cd backend && npx prisma migrate dev --name init`.
  - **Expected:** Migration succeeds with no errors.

- **VAL-2.6.2** Confirm a migration file was created.
  - **Method:** `ls backend/prisma/migrations/`.
  - **Expected:** A timestamped directory exists containing
    `migration.sql`.

- **VAL-2.6.3** Confirm Prisma Studio can display records.
  - **Method:** Run `npx prisma studio` and open the UI.
  - **Expected:** All five tables (`User`, `Board`, `BoardUser`, `Column`,
    `Task`) are visible in the sidebar.

---

## 3. Authentication

### 3.1 Registration

- **VAL-3.1.1** Confirm the route is registered.
  - **Method:** Grep for `register` in `backend/src/routes/`.
  - **Expected:** A route maps `POST /api/auth/register` to a controller.

- **VAL-3.1.2** Confirm `POST /api/auth/register` accepts `{ email, password }`.
  - **Method:** Send a cURL request:
    ```bash
    curl -X POST http://localhost:3000/api/auth/register \
      -H "Content-Type: application/json" \
      -d '{"email":"test@example.com","password":"password123"}'
    ```
  - **Expected:** HTTP 201 with `{ id, email, token }`.

- **VAL-3.1.3** Confirm password is hashed (not stored in plaintext).
  - **Method:** Inspect the database after registration.
  - **Expected:** The `passwordHash` column contains a bcrypt hash, not the
    raw password.

- **VAL-3.1.4** Confirm duplicate email returns HTTP 409.
  - **Method:** Send a second registration with the same email.
  - **Expected:** HTTP 409 with an error message.

- **VAL-3.1.5** Confirm weak input returns HTTP 400.
  - **Method:** Send `POST /api/auth/register` with
    `{"email":"bad-email","password":"short"}`.
  - **Expected:** HTTP 400 with a validation error.

### 3.2 Login

- **VAL-3.2.1** Confirm `POST /api/auth/login` accepts `{ email, password }`.
  - **Method:** Send a cURL request:
    ```bash
    curl -X POST http://localhost:3000/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email":"test@example.com","password":"password123"}'
    ```
  - **Expected:** HTTP 200 with `{ email, token }`.

- **VAL-3.2.2** Confirm wrong password returns HTTP 401.
  - **Method:** Send login with `password: "wrong"`.
  - **Expected:** HTTP 401 with a generic error message.

- **VAL-3.2.3** Confirm nonexistent user returns HTTP 401 (same message).
  - **Method:** Send login with `email: "nonexistent@example.com"`.
  - **Expected:** HTTP 401 with the same generic error as wrong password
    (no email enumeration).

### 3.3 JWT Token

- **VAL-3.3.1** Confirm `JWT_SECRET` is set in `.env`.
  - **Method:** `grep JWT_SECRET backend/.env`.
  - **Expected:** `JWT_SECRET=<some-value>`.

- **VAL-3.3.2** Confirm the token contains `userId` and `email` claims.
  - **Method:** Decode the token using `jwt.io` or
    `node -e "console.log(require('jsonwebtoken').verify(TOKEN, SECRET))"`.
  - **Expected:** Payload has `userId` and `email`.

- **VAL-3.3.3** Confirm the token expires in 7 days.
  - **Method:** Decode the token and inspect the `exp` claim.
  - **Expected:** `exp` is approximately 7 days after `iat`.

### 3.4 Auth Middleware

- **VAL-3.4.1** Confirm protected routes exist (e.g., a test or board route
  using the middleware).
  - **Method:** Grep for `authMiddleware` or `requireAuth` in
    `backend/src/middleware/`.
  - **Expected:** Middleware file exists and is applied to at least one
    route via `router.use(authMiddleware)`.

- **VAL-3.4.2** Confirm a request without a token returns HTTP 401.
  - **Method:** Send a request to a protected route with no
    `Authorization` header.
  - **Expected:** HTTP 401.

- **VAL-3.4.3** Confirm a request with an invalid token returns HTTP 401.
  - **Method:** Send a request with `Authorization: Bearer garbage`.
  - **Expected:** HTTP 401.

- **VAL-3.4.4** Confirm a request with a valid token succeeds.
  - **Method:** First register/login to get a token, then send it with a
    protected route request.
  - **Expected:** HTTP 200 (or the expected response for that route).

### 3.5 Password Reset (Stretch)

- **VAL-3.5.1** (If implemented) Confirm `POST /api/auth/forgot-password`
  accepts an email.
  - **Method:** Send a cURL request.
  - **Expected:** HTTP 200 with a confirmation message.

- **VAL-3.5.2** (If implemented) Confirm `POST /api/auth/reset-password`
  accepts a token and new password.
  - **Method:** Send a cURL request.
  - **Expected:** HTTP 200 with a success message; database password is
    updated.

### 3.6 Health Check

- **VAL-3.6.1** Confirm `GET /health` returns HTTP 200.
  - **Method:** `curl http://localhost:3000/health`.
  - **Expected:** HTTP 200.

- **VAL-3.6.2** Confirm the response body has `{ status, timestamp }`.
  - **Method:** Inspect the response body from the above request.
  - **Expected:** JSON with `status: "ok"` and a valid ISO timestamp.

- **VAL-3.6.3** Confirm the response indicates the server is alive.
  - **Method:** Verify the response includes a real, current timestamp.
  - **Expected:** The `timestamp` field is within a few seconds of the
    current time.

---

## 4. Non-Functional Requirements

- **VAL-4.1** Confirm TypeScript strict mode compiles.
  - **Method:** Run `cd backend && npx tsc --noEmit`.
  - **Expected:** No type errors.

- **VAL-4.2** Confirm no plaintext passwords are stored or logged.
  - **Method:** Grep the codebase for raw password logging; inspect the
    database after registration.
  - **Expected:** No `console.log(password)` or similar; the `passwordHash`
    field contains a hash.

- **VAL-4.3** Confirm `.env` is in `.gitignore`.
  - **Method:** `grep ".env" .gitignore`.
  - **Expected:** `.env` is listed.

- **VAL-4.4** Confirm all endpoints return appropriate HTTP status codes.
  - **Method:** Execute all VAL-3.x.x test cases and review responses.
  - **Expected:** Each test confirms the expected status code (201, 409, 400,
    200, 401, etc.).

---

## Summary Checklist

| Requirement ID | Description                              | Status |
|----------------|------------------------------------------|--------|
| REQ-1.1.1      | `backend/` and `frontend/` directories   |        |
| REQ-1.1.2      | `specs/` contains all 3 docs            |        |
| REQ-1.1.3      | `docker-compose.yml` with PostgreSQL     |        |
| REQ-1.1.4      | Root `.gitignore` excludes key files   |        |
| REQ-1.2.1      | Backend uses Express                    |        |
| REQ-1.2.2      | Backend uses TypeScript (strict)        |        |
| REQ-1.2.3      | Backend loads env vars via dotenv       |        |
| REQ-1.2.4      | Backend uses cors + helmet              |        |
| REQ-1.2.5      | Backend hot-reloads with ts-node-dev    |        |
| REQ-1.3.1      | Frontend uses Next.js + TypeScript      |        |
| REQ-1.3.2      | Tailwind CSS configured and working     |        |
| REQ-1.3.3      | Frontend has HTTP client (axios/fetch)  |        |
| REQ-1.4.1      | Prisma installed in backend             |        |
| REQ-1.4.2      | PostgreSQL configured in schema         |        |
| REQ-1.4.3      | `DATABASE_URL` in `.env`                |        |
| REQ-1.4.4      | `prisma generate` succeeds              |        |
| REQ-2.1.1      | `User` model with all fields            |        |
| REQ-2.2.1      | `Board` model with all fields           |        |
| REQ-2.3.1      | `BoardUser` join table                  |        |
| REQ-2.4.1      | `Column` model with all fields          |        |
| REQ-2.5.1      | `Task` model with all fields            |        |
| REQ-2.6.1      | Migration runs successfully             |        |
| REQ-2.6.2      | Migration file exists                   |        |
| REQ-2.6.3      | Prisma Studio shows all tables          |        |
| REQ-3.1.1      | `POST /api/auth/register` route exists  |        |
| REQ-3.1.3      | Password is hashed with bcrypt          |        |
| REQ-3.1.4      | Duplicate email → HTTP 409              |        |
| REQ-3.1.5      | Invalid input → HTTP 400                |        |
| REQ-3.2.1      | `POST /api/auth/login` works            |        |
| REQ-3.2.2      | Wrong password → HTTP 401               |        |
| REQ-3.2.3      | Nonexistent user → HTTP 401 (generic)   |        |
| REQ-3.3.1      | `JWT_SECRET` in `.env`                  |        |
| REQ-3.3.2      | Token has `userId` + `email` claims     |        |
| REQ-3.3.3      | Token expires in 7 days                 |        |
| REQ-3.4.1      | Auth middleware exists & applied        |        |
| REQ-3.4.2      | No token → HTTP 401                     |        |
| REQ-3.4.3      | Invalid token → HTTP 401                |        |
| REQ-3.4.4      | Valid token → protected route succeeds  |        |
| REQ-3.6.1      | `GET /health` → HTTP 200                |        |
| REQ-3.6.2      | Health returns `{ status, timestamp }`  |        |
| REQ-4.1        | TypeScript strict compiles              |        |
| REQ-4.2        | No plaintext passwords stored/logged    |        |
| REQ-4.3        | `.env` in `.gitignore`                  |        |
| REQ-4.4        | All endpoints return correct status     |        |

> **Phase 1 is complete when all REQ-* items are marked ✅.**
