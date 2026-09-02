# Phase 1 — Foundation: Requirements

## 1. Project Scaffolding

### 1.1 Monorepo Structure

- **REQ-1.1.1** The project root must contain a `backend/` and `frontend/`
  subdirectory at minimum.
- **REQ-1.1.2** The `specs/` directory must contain phase-level specification
  documents (this file, `Plan.md`, `Validation.md`).
- **REQ-1.1.3** A `docker-compose.yml` must exist to orchestrate PostgreSQL
  (and optionally the app services) for local development.
- **REQ-1.1.4** A root-level `.gitignore` must exclude `node_modules/`,
  `dist/`, `.env`, and the Prisma `dev.db` / migration artifacts if not
  committed.

### 1.2 Backend Stack

- **REQ-1.2.1** The backend must use **Node.js** with **Express** as the web
  framework.
- **REQ-1.2.2** The backend must be written in **TypeScript** with strict
  type checking enabled.
- **REQ-1.2.3** The backend must load configuration from environment variables
  via `dotenv`.
- **REQ-1.2.4** The backend must enable `cors` and `helmet` middleware.
- **REQ-1.2.5** The backend must support hot-reloading during development
  (e.g., `ts-node-dev` with `--respawn`).

### 1.3 Frontend Stack

- **REQ-1.3.1** The frontend must use **Next.js** (App Router or Pages Router)
  with **TypeScript**.
- **REQ-1.3.2** **Tailwind CSS** must be configured and verified working
  (a styled component visible in the default page).
- **REQ-1.3.3** The frontend must use `axios` or a `fetch`-based HTTP client
  for API communication.

### 1.4 Prisma & PostgreSQL

- **REQ-1.4.1** The backend must use **Prisma** as the ORM.
- **REQ-1.4.2** The database must be **PostgreSQL**.
- **REQ-1.4.3** A `DATABASE_URL` environment variable must be configured in
  `.env`.
- **REQ-1.4.4** The Prisma client must be generated successfully
  (`npx prisma generate`).

---

## 2. Database Schema

### 2.1 User Model

- **REQ-2.1.1** The `User` model must have:
  - A unique `id` (UUID string).
  - A unique `email` field.
  - A `passwordHash` field (never stores plaintext).
  - A `createdAt` timestamp with a default of `now()`.

### 2.2 Board Model

- **REQ-2.2.1** The `Board` model must have:
  - A unique `id` (UUID string).
  - A `title` field.
  - An `ownerId` that references the owning `User`.
  - A `createdAt` timestamp with a default of `now()`.
  - A one-to-many relation to `Column`.

### 2.3 BoardUser (Sharing Join Table)

- **REQ-2.3.1** The `BoardUser` model must:
  - Store the association between a `Board` and a `User` (collaborator).
  - Enforce uniqueness on the `(boardId, userId)` pair.
  - Be queryable from both the `Board` and `User` side.

### 2.4 Column Model

- **REQ-2.4.1** The `Column` model must have:
  - A unique `id` (UUID string).
  - A `title` field.
  - A `boardId` referencing the parent `Board`.
  - A `position` integer for ordering columns within a board.
  - A one-to-many relation to `Task`.

### 2.5 Task Model

- **REQ-2.5.1** The `Task` model must have:
  - A unique `id` (UUID string).
  - A `title` field.
  - An optional `description` field (nullable).
  - A `columnId` referencing the parent `Column`.
  - A `position` integer for ordering tasks within a column.
  - A `createdAt` timestamp with a default of `now()`.

### 2.6 Schema Verification

- **REQ-2.6.1** The migration must run successfully without errors.
- **REQ-2.6.2** `prisma.db.pull` or `prisma migrate dev` must produce a
  migration file in `prisma/migrations/`.
- **REQ-2.6.3** The schema must be inspectable in Prisma Studio.

---

## 3. Authentication

### 3.1 Registration

- **REQ-3.1.1** **Endpoint:** `POST /api/auth/register`
- **REQ-3.1.2** **Request body:** `{ email: string, password: string }`
- **REQ-3.1.3** Validate that `email` is a well-formed email address.
- **REQ-3.1.4** Validate that `password` is at least 8 characters.
- **REQ-3.1.5** Hash the password using `bcryptjs` with a salt round of 12.
- **REQ-3.1.6** Create and persist a `User` record with the hashed password.
- **REQ-3.1.7** Return HTTP 201 with `{ id, email, token }` on success.
- **REQ-3.1.8** Return HTTP 409 if the email is already registered.
- **REQ-3.1.9** Return HTTP 400 if input validation fails.

### 3.2 Login

- **REQ-3.2.1** **Endpoint:** `POST /api/auth/login`
- **REQ-3.2.2** **Request body:** `{ email: string, password: string }`
- **REQ-3.2.3** Look up the user by email in the database.
- **REQ-3.2.4** Compare the supplied password against the stored hash using
  `bcrypt.compare`.
- **REQ-3.2.5** If the credentials are valid, return `{ email, token }`.
- **REQ-3.2.6** If the user is not found, return HTTP 401 with a generic error
  message (do not reveal whether the email exists).
- **REQ-3.2.7** If the password does not match, return HTTP 401 with a generic
  error message.

### 3.3 JWT Token

- **REQ-3.3.1** The JWT secret must be stored in `JWT_SECRET` environment
  variable.
- **REQ-3.3.2** The JWT payload must include at minimum `{ userId, email }`.
- **REQ-3.3.3** The token must expire after 7 days.
- **REQ-3.3.4** The signed token must be verifiable using the same secret.

### 3.4 Auth Middleware

- **REQ-3.4.1** **Endpoint:** All protected routes must use the auth middleware.
- **REQ-3.4.2** The middleware must extract the token from the `Authorization`
  header in the `Bearer <token>` format.
- **REQ-3.4.3** If the token is missing, return HTTP 401.
- **REQ-3.4.4** If the token is invalid or expired, return HTTP 401.
- **REQ-3.4.5** On success, attach `req.user = { id, email }` to the request
  object.

### 3.5 Password Reset (Stretch)

- **REQ-3.5.1** Implement a "forgot password" endpoint that accepts an email
  and sends a reset link.
- **REQ-3.5.2** Implement a "reset password" endpoint that accepts a valid
  reset token and a new password.
- **REQ-3.5.3** Reset tokens must expire.

### 3.6 Health Check

- **REQ-3.6.1** **Endpoint:** `GET /health`
- **REQ-3.6.2** Returns HTTP 200 with JSON `{ status: "ok", timestamp }`.
- **REQ-3.6.3** The endpoint must verify database connectivity or at minimum
  confirm the server process is alive.

---

## 4. Non-Functional Requirements

- **REQ-4.1** All source code must use TypeScript with strict mode.
- **REQ-4.2** No plaintext passwords may be stored or logged.
- **REQ-4.3** `.env` files must not be committed to version control.
- **REQ-4.4** All endpoints must return appropriate HTTP status codes.
