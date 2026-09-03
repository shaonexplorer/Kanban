# Phase 3 — Columns & Tasks: Requirements

This document defines the requirements for Phase 3 of the Mini Kanban Board.
Each requirement has a stable ID (`REQ-3.x.x`) referenced from
`Validation.md`.

---

## 1. Schema & Existing Models

> No new tables or columns are required for Phase 3 — the `Column` and
> `Task` models already exist in `server/prisma/schema.prisma` from Phase 1.

- **REQ-3.1.1** The `Column` model must remain:
  - `id` — UUID string, primary key.
  - `title` — string.
  - `boardId` — FK to `Board`.
  - `position` — `Int`, used for ordering columns within a board.
  - `tasks` — one-to-many relation to `Task`.
- **REQ-3.1.2** The `Task` model must remain:
  - `id` — UUID string, primary key.
  - `title` — string.
  - `description` — nullable string.
  - `columnId` — FK to `Column`.
  - `position` — `Int`, used for ordering tasks within a column.
  - `createdAt` — `DateTime`, default `now()`.
- **REQ-3.1.3** The `Column.board` relation must be `onDelete: Cascade`
  from `Board` (already in place from Phase 1) so deleting a board
  removes its columns and their tasks.
- **REQ-3.1.4** The `Task.column` relation must be `onDelete: Cascade`
  from `Column` (already in place from Phase 1) so deleting a column
  removes its tasks.

---

## 2. Access Control Layer (Extension)

- **REQ-3.2.1** A new `loadColumn` middleware in
  `server/src/common/middleware/access-control.middleware.ts` must:
  - Read the column id from `req.params.id` by default (configurable
    source/key).
  - Fetch the column with its `board`.
  - Throw `HttpError(404, ...)` if the column is missing OR the parent
    board is missing OR `board.deletedAt` is non-null.
  - Attach `req.column` (including the loaded `board`) for downstream
    middlewares/handlers.
- **REQ-3.2.2** A new `loadTask` middleware in the same file must:
  - Read the task id from `req.params.id` by default.
  - Fetch the task with `column` (and `column.board`).
  - Throw `HttpError(404, ...)` if the task is missing OR the parent
    column is missing OR `column.board` is missing OR
    `column.board.deletedAt` is non-null.
  - Attach `req.task` (with the column + board chain) for downstream
    middlewares/handlers.
- **REQ-3.2.3** Both loaders must chain cleanly with the existing
  `requireBoardAccess` middleware — i.e. the `loadBoard` / `loadColumn` /
  `loadTask` middlewares all populate `req.board` (directly or via a
  nested include) so `requireBoardAccess` can do its check without
  re-querying.
- **REQ-3.2.4** All column and task routes must require the caller to be
  either the board owner or an accepted `BoardUser` (i.e. pass
  `requireBoardAccess`). Owners-only checks are not used in Phase 3.

---

## 3. Column CRUD

### 3.1 Create Column

- **REQ-3.3.1** **Endpoint:** `POST /api/boards/:boardId/columns`
  (authenticated).
- **REQ-3.3.2** **Request body:** `{ title: string }`. `title` is
  trimmed, must be 1–100 characters.
- **REQ-3.3.3** The `:boardId` path parameter must be a UUID; otherwise
  HTTP 400.
- **REQ-3.3.4** Caller must have access to the board (owner or accepted
  member); otherwise HTTP 403. Missing/soft-deleted board → HTTP 404.
- **REQ-3.3.5** The new column's `position` is set to
  `(max(position) of existing columns on the board) + 1`, or `0` if the
  board has no columns.
- **REQ-3.3.6** On success returns HTTP 201 with
  `{ id, title, boardId, position, createdAt? }` (`createdAt` is not
  on `Column`; omit it from the response — see the response shape in
  REQ-3.3.6.1 below).
- **REQ-3.3.6.1** Response shape: `{ id, title, boardId, position }`.

### 3.2 List Columns

- **REQ-3.4.1** **Endpoint:** `GET /api/boards/:boardId/columns`
  (authenticated).
- **REQ-3.4.2** Returns columns on the board ordered by `position`
  ascending.
- **REQ-3.4.3** Each item: `{ id, title, boardId, position }`.
- **REQ-3.4.4** HTTP 403 if the caller has no access; HTTP 404 if
  missing/soft-deleted; HTTP 200 with `[]` if the board has no columns.

### 3.3 Get Column

- **REQ-3.5.1** **Endpoint:** `GET /api/columns/:id` (authenticated).
- **REQ-3.5.2** Returns `{ id, title, boardId, position }`.
- **REQ-3.5.3** HTTP 400 if `:id` is not a UUID; HTTP 404 if missing or
  parent board is soft-deleted; HTTP 403 if the caller has no access to
  the parent board.

### 3.4 Update Column (Rename)

- **REQ-3.6.1** **Endpoint:** `PATCH /api/columns/:id` (authenticated).
- **REQ-3.6.2** **Request body:** `{ title: string }` (1–100 chars).
- **REQ-3.6.3** HTTP 200 on success, returning the updated column.
- **REQ-3.6.4** HTTP 400 on validation failure; HTTP 403/404 per the
  same rules as `GET /api/columns/:id`.
- **REQ-3.6.5** Only `title` may be changed in Phase 3. `position` is
  changed only via the reorder endpoint (REQ-3.8.x).

### 3.5 Delete Column

- **REQ-3.7.1** **Endpoint:** `DELETE /api/columns/:id` (authenticated).
- **REQ-3.7.2** The column is **hard-deleted**; its tasks are removed
  via the existing `onDelete: Cascade` from `Column` → `Task`.
- **REQ-3.7.3** HTTP 204 on success, no body.
- **REQ-3.7.4** HTTP 400 if `:id` is not a UUID; HTTP 403/404 per the
  same rules as `GET /api/columns/:id`.

### 3.6 Reorder Columns

- **REQ-3.8.1** **Endpoint:** `PATCH /api/boards/:boardId/columns/reorder`
  (authenticated).
- **REQ-3.8.2** **Request body:** `{ columnIds: string[] }` — the full
  ordered list of column ids on the board. Length must equal the
  number of columns on the board; the set must be identical to the
  board's current column ids.
- **REQ-3.8.3** Each id in `columnIds` must be a UUID; the array must
  contain at least 1 id. HTTP 400 otherwise.
- **REQ-3.8.4** The reorder is performed atomically inside a single
  `prisma.$transaction` — all `position` updates succeed together or
  roll back together.
- **REQ-3.8.5** After reorder, columns are assigned positions
  `0, 1, 2, ..., n-1` in the order given.
- **REQ-3.8.6** HTTP 200 on success, returning the reordered columns
  (same shape as `GET /api/boards/:boardId/columns`).
- **REQ-3.8.7** HTTP 403/404 per the same rules as the list endpoint.

---

## 4. Task CRUD

### 4.1 Create Task

- **REQ-3.9.1** **Endpoint:** `POST /api/columns/:columnId/tasks`
  (authenticated).
- **REQ-3.9.2** **Request body:** `{ title: string, description?: string }`.
  - `title` — trimmed, 1–200 characters.
  - `description` — optional, trimmed if provided, ≤ 2000 characters.
- **REQ-3.9.3** The `:columnId` path parameter must be a UUID; otherwise
  HTTP 400.
- **REQ-3.9.4** Caller must have access to the parent board; otherwise
  HTTP 403. Missing column / soft-deleted board → HTTP 404.
- **REQ-3.9.5** The new task's `position` is set to
  `(max(position) of existing tasks in this column) + 1`, or `0` if the
  column is empty.
- **REQ-3.9.6** On success returns HTTP 201 with
  `{ id, title, description, columnId, position, createdAt }`.

### 4.2 List Tasks

- **REQ-3.10.1** **Endpoint:** `GET /api/columns/:columnId/tasks`
  (authenticated).
- **REQ-3.10.2** Returns tasks in the column ordered by `position`
  ascending.
- **REQ-3.10.3** Each item: `{ id, title, description, columnId, position, createdAt }`.
- **REQ-3.10.4** HTTP 200 with `[]` if the column is empty. HTTP 403/404
  per the same rules as the create endpoint.

### 4.3 Get Task

- **REQ-3.11.1** **Endpoint:** `GET /api/tasks/:id` (authenticated).
- **REQ-3.11.2** Returns `{ id, title, description, columnId, position, createdAt }`.
- **REQ-3.11.3** HTTP 400 if `:id` is not a UUID; HTTP 404 if missing or
  the chain (task → column → board) is broken or the board is
  soft-deleted; HTTP 403 if the caller has no access to the parent
  board.

### 4.4 Update Task

- **REQ-3.12.1** **Endpoint:** `PATCH /api/tasks/:id` (authenticated).
- **REQ-3.12.2** **Request body:** partial of
  `{ title?: string, description?: string }`. At least one of `title`
  or `description` must be present; HTTP 400 otherwise. Same per-field
  length rules as create.
- **REQ-3.12.3** On success returns HTTP 200 with the updated task
  (full shape including `createdAt`).
- **REQ-3.12.4** HTTP 400 on validation failure; HTTP 403/404 per the
  same rules as `GET /api/tasks/:id`.
- **REQ-3.12.5** Only `title` and `description` may be changed in
  Phase 3. `position` and `columnId` are immutable here — moving tasks
  between columns or reordering within a column is Phase 4.

### 4.5 Delete Task

- **REQ-3.13.1** **Endpoint:** `DELETE /api/tasks/:id` (authenticated).
- **REQ-3.13.2** The task is **hard-deleted** (no `deletedAt` on Task).
- **REQ-3.13.3** HTTP 204 on success, no body.
- **REQ-3.13.4** HTTP 400 if `:id` is not a UUID; HTTP 403/404 per the
  same rules as `GET /api/tasks/:id`.

---

## 5. Nested Board Response

- **REQ-3.14.1** `GET /api/boards/:id` must return
  `{ id, title, ownerId, createdAt, columns: [...], members: [...] }`
  with `columns` populated (not the Phase 2 `columns: []` placeholder).
- **REQ-3.14.2** Each entry in `columns` must be
  `{ id, title, position, tasks: [...] }`, ordered by `position` asc.
- **REQ-3.14.3** Each entry in `tasks` (per column) must be
  `{ id, title, description, position, createdAt }`, ordered by
  `position` asc.
- **REQ-3.14.4** `members` ordering, access rules, and shape are
  unchanged from Phase 2 (REQ-2.9.x).

---

## 6. Non-Functional Requirements

- **REQ-3.15.1** All new code is TypeScript with strict mode (existing
  project setting).
- **REQ-3.15.2** All new endpoints return correct HTTP status codes
  (400, 401, 403, 404, 200, 201, 204).
- **REQ-3.15.3** Domain errors are surfaced via `HttpError(status, message)`
  and handled by the central error middleware
  (`src/common/errors/errorMiddleware.ts`).
- **REQ-3.15.4** Request validation is performed by zod schemas run
  through the existing `validate(schema, source?)` middleware
  (`src/common/validators/validate.middleware.ts`).
- **REQ-3.15.5** The codebase remains ESM-native: relative imports use
  `.js` extensions even when the source file is `.ts`
  (`module: NodeNext`, `verbatimModuleSyntax: true`).
- **REQ-3.15.6** No new top-level dependencies are introduced — Prisma,
  zod, express, `HttpError`, and the existing middlewares cover
  everything.
- **REQ-3.15.7** The Prisma 7 client is imported from
  `src/generated/prisma/client.js` and constructed with the existing
  `PrismaPg` adapter from `src/lib/prisma.ts` (no parallel client
  instances).
- **REQ-3.15.8** Controllers remain thin: all business logic and DB
  access lives in the service layer. Controllers read `req` and call
  the service.
- **REQ-3.15.9** Every column and task route that resolves a board via
  `loadColumn` or `loadTask` must use the existing `requireBoardAccess`
  middleware (or successor) to enforce authorization — never re-query
  the board in the controller just to check access.
- **REQ-3.15.10** Phase 3 introduces no frontend work; the existing
  Next.js client remains a placeholder.
- **REQ-3.15.11** Phase 3 implements no task reorder / cross-column move
  endpoints — those are reserved for Phase 4 per `specs/Roadmap.md`
  §4.1.
