# Phase 3 — Columns & Tasks: Implementation Plan

## Overview

Phase 3 turns the (currently empty) `Column` and `Task` tables from Phase 1 into
a fully usable content API. By the end of this phase, an authenticated user
who has access to a board can:

- Create, list, rename, reorder, and delete columns on a board they have
  access to.
- Create, list, update, and delete tasks inside any column on a board they
  have access to.
- Have every read or mutation pass through the existing access-control layer
  (board-scoped or column/task-scoped) so cross-board access is impossible.
- See columns and tasks populated in `GET /api/boards/:id` (the nested
  response promised by Phase 2's REQ-2.5.3).

This phase delivers **no reordering-within-column or cross-column movement**
(those are Phase 4, with a fractional-indexing strategy), and **no drag-and-drop
UI** (also Phase 4). Phase 3 is the *content-management* surface that the
ordering layer will later build on.

---

## Prerequisites (from Phase 1 & 2)

- Phase 2's `loadBoard` / `requireBoardAccess` / `requireBoardOwner`
  middlewares in `server/src/common/middleware/access-control.middleware.ts`
  are already in place and are the building blocks for every column/task
  route.
- The Prisma `Column` and `Task` models already exist with `position Int`
  fields — Phase 3 doesn't migrate the schema for them, only for any new
  fields introduced in Step 1.
- The `Board` ↔ `Column` ↔ `Task` one-to-many relations and the cascade
  behavior (`onDelete: Cascade` from `Board` → `Column` → `Task`) are
  already configured per `prisma/schema.prisma`.
- `GET /api/boards/:id` already returns a nested shape with `columns: []` —
  Phase 3 swaps the empty array for the real `position`-ordered columns
  (each with its `position`-ordered `tasks`).
- `validate(zodSchema, source?)` middleware, `HttpError`, `asyncHandler`, and
  the ESM `.js` import discipline (per CLAUDE.md) all carry forward.

## Architectural Decisions

| Decision | Choice | Why |
|---|---|---|
| Module layout | `columns` and `tasks` as separate feature modules | Each is a distinct URL subtree (`/api/boards/:boardId/columns`, `/api/columns/:id/tasks`); matches existing per-feature pattern |
| Column scope | Nested under `/api/boards/:boardId/columns` | Resource is owned by a board; keeps the URL hierarchy intuitive |
| Task scope | Nested under `/api/columns/:columnId/tasks` | Same rationale: tasks belong to a column |
| Per-resource detail routes | `GET/PATCH/DELETE /api/columns/:id` and `/api/tasks/:id` | Per-resource endpoints enable targeted mutations and let Phase 4 reuse `loadColumn` / `loadTask` |
| Authorization on sub-resources | New `loadColumn` / `loadTask` middlewares that resolve the parent board, then chain into `requireBoardAccess` / `requireBoardOwner` | Reuses existing access checks; controllers never re-query the board |
| Position strategy (intra-board, intra-column) | **Integer `position` append to the end of the target scope on create** | Phase 3 doesn't ship a reorder endpoint — that's Phase 4. We just need stable, non-overlapping positions; appending `max(position) + 1` (or `0` for an empty scope) is enough. |
| Reorder endpoints in Phase 3 | **Column reorder (intra-board) ONLY** | The roadmap's Phase 4 §4.1 is "task reordering API" — column reordering is implicit in Phase 3.3 ("Reorder / rename / delete columns"). Task reorder is explicitly Phase 4. |
| Who can mutate | Owners AND members (column + task) | Both should be able to author content on a shared board |
| Soft-delete on column/task | Hard delete | Boards already soft-delete; columns/tasks are sub-resources and the cascade from `Board.deletedAt` (when implemented) handles cleanup. Reordering within a column stays sane because the schema is re-keyed on every mutation. |
| Frontend scope | Backend only in Phase 3 | The frontend (`client/kanban-board-client/`) remains a placeholder; Phase 5's UX + Phase 4's DnD will add UI. |
| New top-level deps | **None** | Prisma, zod, express, `HttpError`, the existing middlewares cover everything |

> **Important constraint on positions:** Phase 3 creates columns/tasks with
> `position = (max existing position in scope) + 1` (or `0` for an empty
> scope). **Gaps are allowed and expected** — Phase 4's fractional indexing
> strategy (or equivalent gap-based approach) can consume them or
> re-pack them in bulk. We do NOT compact on every write.

---

## Step 1 — Schema Evolution (if any)

### 1.1 Confirm the existing `Column` and `Task` shapes

`server/prisma/schema.prisma` (already in place) provides:

```prisma
model Column {
  id       String @id @default(uuid())
  title    String
  boardId  String
  position Int
  board    Board  @relation(fields: [boardId], references: [id])
  tasks    Task[]
}

model Task {
  id          String   @id @default(uuid())
  title       String
  description String?
  columnId    String
  position    Int
  createdAt   DateTime @default(now())
  column      Column   @relation(fields: [columnId], references: [id])
}
```

### 1.2 Recommended addition (project decision required)

The roadmap's Phase 3.2 ("Assign task to a user (optional)") is *optional*
per `specs/Roadmap.md`. **Phase 3 will skip `assigneeId`** — keep the Task
model unchanged. If a future phase needs assignments, the addition is a
nullable `String?` FK to `User`, a back-relation, and a single migration.

> No migration is required for Phase 3 to ship. If the team decides to
> include assignee anyway, add `assigneeId String?` with a back-relation
> and a `prisma migrate dev --name phase03_assignee` migration; the rest of
> this plan is unaffected.

---

## Step 2 — Access Control Layer (extension)

Extend `server/src/common/middleware/access-control.middleware.ts` with two
new helpers that resolve the parent board before delegating to the existing
checks. Reuse, do not duplicate, `requireBoardAccess` / `requireBoardOwner`.

### 2.1 `loadColumn(columnIdSource = "params", key = "id")`

- Reads `columnId = req[columnIdSource][key]`.
- `prisma.column.findUnique({ where: { id: columnId }, include: { board: true } })`.
- If the column is `null` OR its `board.deletedAt != null` → throw
  `HttpError(404, "Column not found")`.
- Attaches `req.column = column` (with `column.board`) and calls `next()`.

### 2.2 `loadTask(taskIdSource = "params", key = "id")`

- Reads `taskId = req[taskIdSource][key]`.
- `prisma.task.findUnique({ where: { id: taskId }, include: { column: { include: { board: true } } } })`.
- If the task is `null` OR `task.column.board.deletedAt != null` → throw
  `HttpError(404, "Task not found")`.
- Attaches `req.task = task` (with the column + board chain) and calls
  `next()`.

### 2.3 Reuse on top

After `loadColumn` or `loadTask`, the route can immediately chain into
`requireBoardAccess` (for read/mutate by owners + members) or
`requireBoardOwner` (for owner-only actions). Both middlewares already
read from `req.board`; the loaders just ensure it's populated.

> Phase 3 reuses `requireBoardAccess` for ALL column and task mutations —
> the roadmap doesn't differentiate between owner and member write access
> in Phase 3. Future phases can swap to `requireBoardOwner` per-route if
> the project later decides owners are the only authors.

---

## Step 3 — Columns Module (`server/src/modules/columns/`)

```
modules/columns/
├── columns.controller.ts
├── columns.service.ts
├── columns.validation.ts
├── columns.routes.ts
└── index.ts
```

### 3.1 `columns.validation.ts`

zod schemas (all use `z.string().uuid()` for IDs):

- `CreateColumnSchema` — `{ title: z.string().trim().min(1).max(100) }`
- `UpdateColumnSchema` — `{ title: z.string().trim().min(1).max(100) }`
- `ReorderColumnsSchema` —
  `{ columnIds: z.array(z.string().uuid()).min(1) }` (full ordered list of
  column ids on the board — the body declares the new ordering)
- `BoardScopedColumnParamSchema` — `{ boardId: z.string().uuid() }`
- `ColumnIdParamSchema` — `{ id: z.string().uuid() }`

Export inferred input types: `CreateColumnInput`, `UpdateColumnInput`,
`ReorderColumnsInput`.

### 3.2 `columns.service.ts`

Pure DB + business rules. Throws `HttpError` on every domain failure.

Public functions:

- `createColumn(userId, boardId, { title })`:
  1. `assertBoardAccess(userId, boardId)` (throws 404 if missing/deleted,
     403 if no access).
  2. Compute `position = (max(position) of columns on this board) + 1`,
     or `0` if the board has no columns.
  3. `prisma.column.create({ data: { title, boardId, position } })`.
  4. Return the created column.

- `listColumns(userId, boardId)`:
  1. `assertBoardAccess(userId, boardId)`.
  2. `prisma.column.findMany({ where: { boardId }, orderBy: { position: "asc" } })`.
  3. Return the array.

- `getColumn(userId, columnId)`:
  1. `assertBoardAccess(userId, column.boardId)` (load via `loadColumn`
     middleware upstream; service just re-checks defensively).
  2. Return the column.

- `updateColumn(userId, columnId, { title })`:
  1. `assertBoardAccess(userId, column.boardId)`.
  2. `prisma.column.update({ where: { id: columnId }, data: { title } })`.
  3. Return the updated column.

- `deleteColumn(userId, columnId)`:
  1. `assertBoardAccess(userId, column.boardId)`.
  2. `prisma.column.delete({ where: { id: columnId } })` (cascades to
     its tasks per the existing schema's `onDelete: Cascade`).
  3. Return `void`.

- `reorderColumns(userId, boardId, { columnIds })`:
  1. `assertBoardAccess(userId, boardId)`.
  2. Fetch all columns on the board. If the returned ids do not match
     `columnIds` exactly (set equality + length), throw
     `HttpError(400, "columnIds must contain every column on the board exactly once")`.
  3. In a single `prisma.$transaction`, reassign positions 0..N-1 in the
     order given. (`update({ where: { id }, data: { position: i } })`.)
  4. Return the reordered list.

Internal helper: `assertBoardAccess(userId, boardId)` — same as in
`boards.service.ts` (we can either import it or duplicate the small helper
locally; the duplicated copy is small enough to keep modules independent).

### 3.3 `columns.controller.ts`

Thin HTTP I/O. Each handler:
1. Reads `req.user.id`, `req.params`, `req.body` (validated upstream).
2. Calls the service.
3. Responds with the documented status (see Requirements.md).

Handlers: `createColumn`, `listColumns`, `getColumn`, `updateColumn`,
`deleteColumn`, `reorderColumns`.

### 3.4 `columns.routes.ts`

Wiring uses `validate()` (body / params) and the access-control middlewares:

| Method | Path | Middleware chain |
|---|---|---|
| `GET`  | `/boards/:boardId/columns`   | `requireAuth` → `validate(BoardScopedColumnParamSchema, "params")` → `loadBoard` → `requireBoardAccess` → `listColumns` |
| `POST` | `/boards/:boardId/columns`   | `requireAuth` → `validate(BoardScopedColumnParamSchema, "params")` → `loadBoard` → `requireBoardAccess` → `validate(CreateColumnSchema)` → `createColumn` |
| `GET`  | `/columns/:id`               | `requireAuth` → `validate(ColumnIdParamSchema, "params")` → `loadColumn` → `requireBoardAccess` → `getColumn` |
| `PATCH`| `/columns/:id`               | `requireAuth` → `validate(ColumnIdParamSchema, "params")` → `loadColumn` → `requireBoardAccess` → `validate(UpdateColumnSchema)` → `updateColumn` |
| `DELETE`| `/columns/:id`              | `requireAuth` → `validate(ColumnIdParamSchema, "params")` → `loadColumn` → `requireBoardAccess` → `deleteColumn` |
| `PATCH`| `/boards/:boardId/columns/reorder` | `requireAuth` → `validate(BoardScopedColumnParamSchema, "params")` → `loadBoard` → `requireBoardAccess` → `validate(ReorderColumnsSchema)` → `reorderColumns` |

### 3.5 `index.ts`

```ts
export { default as columnsRouter } from "./columns.routes.js";
```

### 3.6 Mount in `src/app.ts`

```ts
import { columnsRouter } from "./modules/columns/index.js";
// ...
app.use("/api", columnsRouter);
```

(The router owns the full `/api/boards/:boardId/columns` and
`/api/columns/:id` paths internally — single mount point on `/api`.)

---

## Step 4 — Tasks Module (`server/src/modules/tasks/`)

```
modules/tasks/
├── tasks.controller.ts
├── tasks.service.ts
├── tasks.validation.ts
├── tasks.routes.ts
└── index.ts
```

### 4.1 `tasks.validation.ts`

zod schemas:

- `CreateTaskSchema` —
  `{ title: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).optional() }`
- `UpdateTaskSchema` — partial of CreateTaskSchema (both fields optional,
  but at least one required via `.refine`):
  ```ts
  z.object({
    title:       z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
  }).refine(
    (v) => v.title !== undefined || v.description !== undefined,
    { message: "At least one of title or description must be provided" },
  );
  ```
- `ColumnScopedTaskParamSchema` — `{ columnId: z.string().uuid() }`
- `TaskIdParamSchema` — `{ id: z.string().uuid() }`

Export inferred input types: `CreateTaskInput`, `UpdateTaskInput`.

> **Note:** Task **reordering** (within a column or across columns) is
> Phase 4 — no reorder schema in Phase 3.

### 4.2 `tasks.service.ts`

Public functions:

- `createTask(userId, columnId, { title, description })`:
  1. `assertBoardAccess(userId, column.boardId)` (load via `loadColumn`
     middleware upstream; service re-checks defensively).
  2. Compute `position = (max(position) of tasks in this column) + 1`,
     or `0` if the column is empty.
  3. `prisma.task.create({ data: { title, description, columnId, position } })`.
  4. Return the created task.

- `listTasks(userId, columnId)`:
  1. `assertBoardAccess(userId, column.boardId)`.
  2. `prisma.task.findMany({ where: { columnId }, orderBy: { position: "asc" } })`.
  3. Return the array.

- `getTask(userId, taskId)`:
  1. `assertBoardAccess(userId, task.column.boardId)`.
  2. Return the task.

- `updateTask(userId, taskId, { title?, description? })`:
  1. `assertBoardAccess(userId, task.column.boardId)`.
  2. `prisma.task.update({ where: { id: taskId }, data: { ...only-defined-fields } })`.
  3. Return the updated task.

- `deleteTask(userId, taskId)`:
  1. `assertBoardAccess(userId, task.column.boardId)`.
  2. `prisma.task.delete({ where: { id: taskId } })`.
  3. Return `void`.

Internal helper: `assertBoardAccess(userId, boardId)` — duplicated for
module independence (same pattern as columns).

### 4.3 `tasks.controller.ts`

Thin HTTP I/O. Each handler:
1. Reads `req.user.id`, `req.params`, `req.body` (validated upstream).
2. Calls the service.
3. Responds with the documented status (see Requirements.md).

Handlers: `createTask`, `listTasks`, `getTask`, `updateTask`, `deleteTask`.

### 4.4 `tasks.routes.ts`

Wiring:

| Method | Path | Middleware chain |
|---|---|---|
| `GET`  | `/columns/:columnId/tasks` | `requireAuth` → `validate(ColumnScopedTaskParamSchema, "params")` → `loadColumn` → `requireBoardAccess` → `listTasks` |
| `POST` | `/columns/:columnId/tasks` | `requireAuth` → `validate(ColumnScopedTaskParamSchema, "params")` → `loadColumn` → `requireBoardAccess` → `validate(CreateTaskSchema)` → `createTask` |
| `GET`  | `/tasks/:id`              | `requireAuth` → `validate(TaskIdParamSchema, "params")` → `loadTask` → `requireBoardAccess` → `getTask` |
| `PATCH`| `/tasks/:id`              | `requireAuth` → `validate(TaskIdParamSchema, "params")` → `loadTask` → `requireBoardAccess` → `validate(UpdateTaskSchema)` → `updateTask` |
| `DELETE`| `/tasks/:id`             | `requireAuth` → `validate(TaskIdParamSchema, "params")` → `loadTask` → `requireBoardAccess` → `deleteTask` |

### 4.5 `index.ts`

```ts
export { default as tasksRouter } from "./tasks.routes.js";
```

### 4.6 Mount in `src/app.ts`

```ts
import { tasksRouter } from "./modules/tasks/index.js";
// ...
app.use("/api", tasksRouter);
```

---

## Step 5 — Update `boards.service.ts` to populate nested columns/tasks

`GET /api/boards/:id` already returns `columns: []`. Phase 3 changes the
shape to:

```ts
{
  id, title, ownerId, createdAt,
  columns: [{ id, title, position, tasks: [{ id, title, description, position, createdAt }] }],
  members:  [{ userId, email, role, joinedAt }],
}
```

Implementation in `server/src/modules/boards/boards.service.ts`:

- Update `getBoardById(userId, boardId)` to `include` columns (ordered by
  `position asc`) and, for each column, its tasks (also ordered by
  `position asc`).
- Map to the documented response shape (no internal Prisma artifacts leak).

No new endpoint is needed; the existing `GET /api/boards/:id` already
returns the right shape, just with `columns: []` until this change.

---

## Step 6 — Wiring & Final Touches

- Import `columnsRouter` and `tasksRouter` in `src/app.ts` and mount each
  on `/api`. (Order: boards, board-invitations, columns, tasks, auth,
  health — order doesn't matter functionally, but consistent with how
  Phase 2 documents them in CLAUDE.md.)
- No changes needed to `src/index.ts` (env validation + DB connection are
  already in place).
- No new env vars.
- No new dependencies.
- Optional (out of scope for spec compliance): update the boards section of
  `server/README.md` to note that nested columns/tasks are now populated
  in `GET /api/boards/:id`.

---

## Step 7 — Manual Verification

Executed before declaring Phase 3 complete. See `Validation.md` for the
full checklist.

---

## Execution Order

| # | Task | Estimated Effort | Status |
|---|---|---|---|
| 1 | Add `loadColumn` + `loadTask` middlewares (Step 2) | 25 min | ⬜ To do |
| 2 | `columns` module: validation + service + controller + routes (Step 3) | 90 min | ⬜ To do |
| 3 | `tasks` module: validation + service + controller + routes (Step 4) | 75 min | ⬜ To do |
| 4 | Populate nested columns/tasks in `GET /api/boards/:id` (Step 5) | 15 min | ⬜ To do |
| 5 | Mount routers + tsx reload smoke test (Step 6) | 10 min | ⬜ To do |
| 6 | End-to-end manual verification (Step 7) | 45 min | ⬜ To do |
|   | **Total** | **~4.5 hours** | **Phase 3 to do** |

---

## Out of Scope (Deferred)

- **Task reordering within a column or across columns** — Phase 4 (`specs/Roadmap.md` §4.1). Phase 3 always appends to the end; reorder endpoint is reserved for Phase 4 alongside a fractional-indexing strategy.
- **Drag-and-drop UI on the frontend** — Phase 4.
- **Frontend board view that renders columns and tasks** — Phase 5 / frontend work; the existing `client/kanban-board-client/` remains a placeholder.
- **`Task.assigneeId` (task assignment to a user)** — Optional stretch per `specs/Roadmap.md` §3.2; not implemented in Phase 3.
- **Automated tests** — No test framework yet (Phase 5, per `specs/Roadmap.md`). Phase 3 relies on cURL / Postman checks captured in `Validation.md`.
- **Bulk column creation on board creation** — Could be a stretch in `POST /api/boards` (e.g., create default "Todo / Doing / Done" columns atomically). Out of scope for Phase 3; the current `POST /api/boards` returns an empty `columns: []` (or no `columns` key) and the client creates columns explicitly via the new endpoint.
- **Soft delete on columns/tasks** — Hard delete only; boards already soft-delete and the cascade handles eventual cleanup.
- **Column-level permissions** — All board members can mutate all columns on a board they have access to. Per-column RBAC is out of scope.
