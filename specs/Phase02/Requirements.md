# Phase 2 — Boards & Access Control: Requirements

This document defines the requirements for Phase 2 of the Mini Kanban Board.
Each requirement has a stable ID (`REQ-2.x.x`) referenced from
`Validation.md`.

---

## 1. Schema Evolution

### 1.1 Board Soft Delete

- **REQ-2.1.1** The `Board` model must include a nullable `deletedAt`
  `DateTime` field (default `null`).
- **REQ-2.1.2** Soft-deleted boards must be excluded from every read endpoint
  in Phase 2: `GET /api/boards`, `GET /api/boards/:id`,
  `GET /api/boards/:id/members`.
- **REQ-2.1.3** Direct fetch (`GET /api/boards/:id`) of a soft-deleted board
  must return HTTP 404, as if the board never existed.
- **REQ-2.1.4** Mutating routes (`PATCH /api/boards/:id`,
  `DELETE /api/boards/:id`, all member/invitation operations) on a
  soft-deleted board must also return HTTP 404.

### 1.2 Board Sharing — BoardInvitation

- **REQ-2.2.1** A `BoardInvitationStatus` enum must exist with values
  `PENDING`, `ACCEPTED`, `DECLINED`, `REVOKED`.
- **REQ-2.2.2** A `BoardInvitation` model must exist with:
  - `id` — UUID string, primary key.
  - `boardId` — FK to `Board`, cascading delete.
  - `inviterId` — FK to the inviting `User`.
  - `inviteeId` — FK to the invited `User` (must already be registered).
  - `status` — `BoardInvitationStatus`, default `PENDING`.
  - `createdAt` — `DateTime`, default `now()`.
  - `updatedAt` — `DateTime`, auto-updated.
- **REQ-2.2.3** Required indexes for hot lookups:
  - `@@index([inviteeId, status])`
  - `@@index([boardId, status])`
- **REQ-2.2.4** The `BoardUser` model must include a `joinedAt` `DateTime`
  field with default `now()` (used by the members-list response).
- **REQ-2.2.5** Back-relations must exist on `Board` (`invitations`) and
  `User` (`invitationsSent` / `invitationsReceived`) so the typed Prisma
  client lets us navigate the graph without raw SQL.

---

## 2. Board CRUD

### 2.1 Create Board

- **REQ-2.3.1** **Endpoint:** `POST /api/boards` (authenticated).
- **REQ-2.3.2** **Request body:** `{ title: string }`. `title` is trimmed and
  must be 1–100 characters.
- **REQ-2.3.3** The authenticated user is recorded as the board's `ownerId`.
- **REQ-2.3.4** On success returns HTTP 201 with
  `{ id, title, ownerId, createdAt }`.
- **REQ-2.3.5** Returns HTTP 400 if validation fails.
- **REQ-2.3.6** Returns HTTP 401 if unauthenticated.

### 2.2 List My Boards

- **REQ-2.4.1** **Endpoint:** `GET /api/boards` (authenticated).
- **REQ-2.4.2** Returns boards where the caller is owner OR a `BoardUser`
  member, with soft-deleted boards excluded.
- **REQ-2.4.3** Each item must include `id`, `title`, `role`
  (`OWNER` | `MEMBER`), and `createdAt`.
- **REQ-2.4.4** Returns HTTP 200 with an array (empty array when none).

### 2.3 Get Board (Nested)

- **REQ-2.5.1** **Endpoint:** `GET /api/boards/:id` (authenticated).
- **REQ-2.5.2** `id` must be a UUID; otherwise HTTP 400.
- **REQ-2.5.3** Response shape:
  {
    id, title, ownerId, createdAt,
    columns: [{ id, title, position, tasks: [{ id, title, description, position, createdAt }] }],
    members:  [{ userId, email, role: "OWNER" | "MEMBER", joinedAt }]
  }
  Columns and tasks are ordered by `position` ascending.
- **REQ-2.5.4** Returns HTTP 404 if the board doesn't exist or is
  soft-deleted.
- **REQ-2.5.5** Returns HTTP 403 if the caller is neither owner nor member.
- **REQ-2.5.6** Returns HTTP 200 on success.

### 2.4 Update Board

- **REQ-2.6.1** **Endpoint:** `PATCH /api/boards/:id` (authenticated).
- **REQ-2.6.2** **Request body:** `{ title: string }` (1–100 chars).
- **REQ-2.6.3** Only the board owner may update. Members receive HTTP 403.
- **REQ-2.6.4** Returns HTTP 200 with the updated board.
- **REQ-2.6.5** Returns HTTP 404 if missing or soft-deleted.

### 2.5 Delete Board

- **REQ-2.7.1** **Endpoint:** `DELETE /api/boards/:id` (authenticated).
- **REQ-2.7.2** Only the owner may delete (HTTP 403 otherwise).
- **REQ-2.7.3** The delete is **soft**: the row remains, but `deletedAt` is
  set to the current timestamp.
- **REQ-2.7.4** Returns HTTP 204 with no body on success.
- **REQ-2.7.5** Returns HTTP 404 if missing or already soft-deleted.

---

## 3. Board Sharing

### 3.1 Invite a User

- **REQ-2.8.1** **Endpoint:** `POST /api/boards/:id/members`
  (authenticated, owner only).
- **REQ-2.8.2** **Request body:** exactly one of:
  - `{ userId: string }` — UUID of an existing user.
  - `{ email: string }` — well-formed email of an existing user.
  Providing both, or neither, returns HTTP 400.
- **REQ-2.8.3** Only the board owner may invite. Members receive HTTP 403.
- **REQ-2.8.4** Inviting the board's owner is rejected with HTTP 400.
- **REQ-2.8.5** If `email` is supplied and no `User` exists with that email,
  return HTTP 404.
- **REQ-2.8.6** If a `PENDING` invitation already exists for the same
  `(boardId, userId)` pair, return HTTP 409.
- **REQ-2.8.7** If the invitee is already an accepted collaborator (a
  `BoardUser` row exists), return HTTP 409.
- **REQ-2.8.8** On success returns HTTP 201 with the created invitation:
  `{ id, boardId, inviterId, inviteeId, status: "PENDING", createdAt }`.

### 3.2 List Members

- **REQ-2.9.1** **Endpoint:** `GET /api/boards/:id/members` (authenticated).
- **REQ-2.9.2** Visible to owner and accepted members. Anyone else receives
  HTTP 403.
- **REQ-2.9.3** The owner appears first with `role: "OWNER"` and
  `joinedAt = board.createdAt`. Accepted `BoardUser` rows follow,
  newest-first by `joinedAt`.
- **REQ-2.9.4** Each item: `{ userId, email, role: "OWNER" | "MEMBER", joinedAt }`.
- **REQ-2.9.5** Returns HTTP 404 if the board is missing or soft-deleted.

### 3.3 Remove a Member

- **REQ-2.10.1** **Endpoint:** `DELETE /api/boards/:id/members/:userId`
  (authenticated, owner only).
- **REQ-2.10.2** Deletes the `BoardUser` row matching `(boardId, userId)`.
- **REQ-2.10.3** Removing the owner is rejected with HTTP 400 (use
  `DELETE /api/boards/:id` to delete the board itself).
- **REQ-2.10.4** Returns HTTP 204 on success, HTTP 404 if no `BoardUser` row
  exists, HTTP 403 if the caller isn't owner.

### 3.4 Invitations

- **REQ-2.11.1** **Endpoint:** `GET /api/board-invitations` (authenticated).
  Returns all invitations where `inviteeId = req.user.id` AND
  `status = "PENDING"`, newest first.
- **REQ-2.11.2** Each item must include `id`, `boardId`, `boardTitle`,
  `inviterEmail`, and `createdAt`.
- **REQ-2.11.3** **Endpoint:** `POST /api/board-invitations/:id/accept`.
  Only the `inviteeId` may accept (HTTP 403 otherwise). HTTP 409 if the
  invitation is no longer `PENDING`. HTTP 404 if missing or board
  soft-deleted.
- **REQ-2.11.4** On accept: a `BoardUser` row is created (idempotently — if
  one already exists, do nothing), and the invitation's `status` is set to
  `ACCEPTED`. Both writes happen in a single Prisma transaction.
- **REQ-2.11.5** Success response: HTTP 200 with
  `{ boardId, invitationId, status: "ACCEPTED" }`.
- **REQ-2.11.6** **Endpoint:** `POST /api/board-invitations/:id/decline`.
  Same authz rules as accept. On success: `status = "DECLINED"`; no
  `BoardUser` is created. Returns HTTP 200 with
  `{ invitationId, status: "DECLINED" }`.

---

## 4. Access Control Layer

- **REQ-2.12.1** All routes under `/api/boards/*` and
  `/api/board-invitations/*` must be reachable only by authenticated users.
  Use the existing `requireAuth` middleware.
- **REQ-2.12.2** A reusable `loadBoard` middleware must:
  - Read the board id from `req.params` (configurable source/key).
  - Fetch the board (excluding soft-deleted).
  - Throw `HttpError(404, ...)` when missing.
  - Attach `req.board` for downstream handlers/middlewares.
- **REQ-2.12.3** A reusable `requireBoardAccess` middleware must reject with
  HTTP 403 if the caller is not the owner AND has no `BoardUser` row for the
  board.
- **REQ-2.12.4** A reusable `requireBoardOwner` middleware must reject with
  HTTP 403 unless `req.user.id === req.board.ownerId`.
- **REQ-2.12.5** The invitation accept flow must be atomic: the `BoardUser`
  insert and the invitation `status` update must succeed together or roll
  back together (use `prisma.$transaction`).
- **REQ-2.12.6** Invitation accept/decline must verify that the target board
  isn't soft-deleted; otherwise return HTTP 404.

---

## 5. Non-Functional Requirements

- **REQ-2.13.1** All new code is TypeScript with strict mode (existing
  project setting).
- **REQ-2.13.2** All new endpoints return correct HTTP status codes
  (400, 401, 403, 404, 409, 200, 201, 204).
- **REQ-2.13.3** Domain errors are surfaced via `HttpError(status, message)`
  and handled by the central error middleware
  (`src/common/errors/errorMiddleware.ts`).
- **REQ-2.13.4** Request validation is performed by zod schemas run through
  the existing `validate(schema, source?)` middleware
  (`src/common/validators/validate.middleware.ts`).
- **REQ-2.13.5** The codebase remains ESM-native: relative imports use
  `.js` extensions even when the source file is `.ts`
  (`module: NodeNext`, `verbatimModuleSyntax: true`).
- **REQ-2.13.6** No new top-level dependencies are introduced — Prisma, zod,
  express, `HttpError`, and the existing middleware cover everything.
- **REQ-2.13.7** The Prisma 7 client is imported from
  `src/generated/prisma/client.js` and constructed with the existing
  `PrismaPg` adapter from `src/lib/prisma.ts` (no parallel client instances).
- **REQ-2.13.8** No column or task business logic is implemented in Phase 2 —
  `columns: []` and empty task arrays in `GET /api/boards/:id` responses are
  expected and reserved for Phase 3.