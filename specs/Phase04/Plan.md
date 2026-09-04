# Phase 4 — Ordering & Task Movement: Implementation Plan

## Overview

Phase 4 adds the **movement and ordering** layer on top of Phase 3's
content API. By the end of this phase, an authenticated user who has
access to a board can:

- Reorder tasks **within** a single column.
- Move a task **across** columns to a specific position in the target
  column.
- Reorder the **columns** on a board via the existing
  `PATCH /api/boards/:boardId/columns/reorder` endpoint (carried over
  from Phase 3) and a new dedicated column-move endpoint.
- Use a **fractional-indexing** (`position` as `String`) ordering
  strategy so concurrent edits rarely need to re-pack the board, and
  when they do, the re-pack stays small and atomic.
- Drive the movement from a **drag-and-drop frontend** in the Next.js
  client, with **optimistic UI updates** and **rollback** on server
  error.

This phase does **not** introduce a real-time / WebSocket sync layer —
concurrent edits are reconciled by the database's last-write-wins
semantics on the `position` column combined with a defensive
reconciliation pass. (A real-time channel is reserved for a future
post-MVP phase.)

Phase 4 keeps the existing per-feature module layout (`columns`,
`tasks`) — it extends the `tasks` module with a movement endpoint and
swaps the `position Int` columns on `Column` and `Task` for
`position String` (lexicographically sortable fractional indices). It
also adds the first non-trivial frontend work to date: a board view
that renders columns and tasks, plus a drag-and-drop interaction.

---

## Prerequisites (from Phase 1, 2 & 3)

- Phase 3's `tasks` and `columns` modules with full CRUD and the
  intra-board **column** reorder endpoint
  (`PATCH /api/boards/:boardId/columns/reorder`) already in place.
- Phase 3's `loadColumn` / `loadTask` middlewares that resolve the
  parent board and attach `req.board` (and `req.column` where relevant)
  for downstream `requireBoardAccess` checks.
- The Prisma `Column` and `Task` models with
  `position Int @default(0)` from Phase 1 — Phase 4 Step 1 **migrates**
  this to `position String` (lexicographic indices).
- `GET /api/boards/:id` returning the nested
  `{ columns: [{ id, title, position, tasks: [...] }] }` shape from
  Phase 3, sorted by `position` ascending. The frontend will consume
  this as its source of truth.
- The Next.js 16 + React 19 + Tailwind v4 frontend skeleton at
  `client/kanban-board-client/` (Phase 5's polish will harden it; Phase
  4 introduces the first real feature surfaces there).
- `validate(zodSchema, source?)`, `HttpError`, `asyncHandler`, and the
  ESM `.js` import discipline (per `CLAUDE.md`) carry forward.

## Architectural Decisions

| Decision                                       | Choice                                                                                                                                                                                                                                  | Why                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Position type                                  | `position String` (lexicographic sortable) on both `Column` and `Task`                                                                                                                                                                  | Fractional indexing avoids re-packing the list on every move. Two adjacent items always have a midpoint. Collision risk grows as moves concentrate; the resolver handles re-packs atomically when the midpoint is exhausted.                                                            |
| Library vs. hand-rolled fractional indices     | **Hand-rolled** `lexoPosition` helper (≈ 30 lines) using a fixed base-62 alphabet                                                                                                                                                       | The library landscape (`fractional-indexing`, `fractional-indexing-jittered`) is reasonable, but adding a dependency for one helper is overkill. The algorithm is small, well-documented, and trivial to test.                                                                     |
| Movement endpoint shape                        | `POST /api/columns/:columnId/tasks/:taskId/move` (action on a specific task)                                                                                                                                                            | Action-shaped endpoint makes the URL describe the operation, not a property of the resource. The body declares the destination column and index. Reuses `loadColumn` + `loadTask` to validate access to both source and destination in a single request.                       |
| Column movement                                | `POST /api/columns/:columnId/move` (action-shaped) with a body of `{ position: number }` (or `{ beforeColumnId?, afterColumnId? }`) — re-keys via the existing transaction                                                                 | Matches the task-move UX and reuses the same `lexoPosition` helper. The existing `PATCH /api/boards/:boardId/columns/reorder` continues to exist for the "drag-many" case.                                                                                                       |
| Atomicity                                      | A single `prisma.$transaction` per move                                                                                                                                                                                                 | The "read current neighbor, compute midpoint, write" race is the only consistency hazard. Serializing it inside a transaction row-locks the affected rows and prevents two clients from picking the same midpoint.                                                                    |
| Re-pack trigger                                | When `lexoPosition` returns `null` (midpoint exhausted between two neighbors), re-pack **only the affected column's tasks** in a separate transaction inside the same handler.                                                          | A full-board re-pack is unnecessary and expensive. Triggering it only when fractional indices are exhausted keeps the happy path O(1) writes.                                                                                                                                    |
| Authorization on moves                        | `loadColumn` (source) + `loadColumn` (target) + `loadTask` (the task being moved) — all chain through `requireBoardAccess`                                                                                                               | A user can only move a task to a column on a board they have access to. Cross-board moves must be rejected. The same chain works for cross-column moves on the **same** board (same `req.board` either way).                                                                       |
| Soft delete handling                           | Same as Phase 3 — missing/soft-deleted board is 404, missing column/task is 404.                                                                                                                                                        | Reuse the existing loaders.                                                                                                                                                                                                                                                      |
| Optimistic UI on the frontend                  | Yes — local state is mutated immediately on drop, then reconciled with the server response. On error, the previous snapshot is restored and a toast is shown.                                                                          | Standard kanban-DnD pattern; keeps the UI snappy even on slow networks. The reconciliation step ensures the local state converges to the server's source of truth.                                                                                                                |
| Drag-and-drop library                          | **`@dnd-kit/core` + `@dnd-kit/sortable`** (sortable for columns, draggable for tasks between sortables)                                                                                                                                  | The project's `specs/Techstack.md` lists `react-dnd` *or* `@dnd-kit/core` as the planned option. `@dnd-kit` is the more actively maintained choice in 2026, has a smaller bundle, and handles the "between sortables" case (cross-column) out of the box.                        |
| Server state on the frontend                   | **TanStack Query** (`@tanstack/react-query`) for fetching the board and posting mutations                                                                                                                                                | Already listed in `specs/Techstack.md`. Handles loading/error states, refetching, and integrates well with optimistic updates.                                                                                                                                                     |
| Local UI state (column order during a drag)    | React component state via the dnd-kit `useSortable` / `DndContext` callbacks                                                                                                                                                            | No global state library needed for this scope. The dnd-kit sensors own the drag state; React Query owns the server cache.                                                                                                                                                        |
| New top-level deps (server)                    | **None**                                                                                                                                                                                                                                 | The `lexoPosition` helper is local; Prisma, zod, express, `HttpError`, and the existing middlewares cover everything.                                                                                                                                                              |
| New top-level deps (client)                    | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@tanstack/react-query`                                                                                                                                                     | Listed as "Planned Frontend Libraries" in `specs/Techstack.md`; adding them now keeps us aligned with the spec.                                                                                                                                                                    |
| **No** real-time / WebSocket sync              | Out of scope                                                                                                                                                                                                                            | Two clients editing the same board at the same time will both submit moves; the database's last-write-wins on `position` (combined with the resolver's re-pack) will keep the state consistent. A WebSocket layer is a post-MVP enhancement, not a Phase 4 requirement.            |

> **Important constraint on fractional indices:** Lexicographic ordering
> assumes a fixed alphabet (e.g. base-62) and a fixed precision
> (e.g. 10 characters). When two adjacent indices differ by a single
> character, the midpoint can run out of usable values. Phase 4 handles
> this by triggering a column-local re-pack (re-key 0..N-1 from the
> current `position` order) inside the same handler. A **board-wide**
> re-pack is reserved for the column reorder endpoint and is
> deliberately not part of the task-move happy path.

---

## Step 1 — Schema Evolution (fractional indices)

### 1.1 Update `server/prisma/schema.prisma`

- `Column.position`: `Int` → `String @default("a0")`.
- `Task.position`: `Int` → `String @default("a0")`.
- Drop any `@default(0)` from the integer fields; the string default
  is the "start of the lexicographic range" and is the position used
  when a scope is empty.

The cascade rules from Phase 1/3 (`Board → Column` cascade,
`Column → Task` cascade) are **unchanged**.

### 1.2 Generate & apply migration

```bash
cd server
npx prisma migrate dev --name phase04_fractional_positions
```

The migration will:

1. `ALTER TABLE "Column" ALTER COLUMN "position" TYPE TEXT USING ("position"::text);`
2. `ALTER TABLE "Task"   ALTER COLUMN "position" TYPE TEXT USING ("position"::text);`

Because the migration is purely a type change, no data backfill is
needed — `0` cast to text becomes `"0"`, which sorts **after** every
`a0`-style index, so existing columns/tasks will sort to the end. We
intentionally accept this one-time reorder; subsequent writes go
through the new helper and use proper lexo indices. A simple
follow-up `UPDATE` can rewrite the existing positions to lexo
indices, but is **not** required for correctness (the resort is
cosmetic).

> **Optional polish (recommended):** add a follow-up SQL block to the
> migration that re-keys the existing positions to lexo indices in
> row order, e.g.:
>
> ```sql
> WITH ordered AS (
>   SELECT id, ROW_NUMBER() OVER (PARTITION BY "boardId" ORDER BY "position") AS rn
>   FROM "Column"
> )
> UPDATE "Column" c SET "position" = 'a' || rn::text FROM ordered o WHERE c.id = o.id;
> -- (and the same for "Task" partitioned by "columnId")
> ```
>
> This makes the post-migration snapshot immediately consistent with
> the new ordering. **It's a one-line `WITH RECURSIVE` away** from being
> clean; without it, fresh creates will sort correctly but old rows
> will be bunched at the end. Include or skip based on team preference.

### 1.3 Regenerate the Prisma client

```bash
npx prisma generate
```

The regenerated client now exposes `position: string` on `Column` and
`Task` — every existing call site that reads `position` and every new
call site that **writes** `position` must be updated to use the
`lexoPosition` helper.

---

## Step 2 — Shared Lexicographic Position Helper

### 2.1 `server/src/common/utils/lexoPosition.ts`

A new shared utility (cross-cutting, not in a feature module):

- Alphabet: a fixed base-62 string `"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"`.
- Exports:
  - `first(): string` — the lexo position used for an empty scope's
    first element (e.g. `"a0"`).
  - `between(a: string | null, b: string | null): string | null` —
    returns a lexo position strictly between `a` and `b`, or `null`
    if no such position exists within the alphabet's precision.
- Implementation: standard midpoint-by-lexicographic-numerals. Both
  inputs are padded to the same length; for each digit, the midpoint
  between the two characters is chosen; if no midpoint exists (the
  two characters are adjacent and the smaller has no in-between
  character), recurse one digit deeper, then append a fallback. If
  the recursion exhausts the precision, return `null` so the caller
  can re-pack.
- Documented as a "pure" function: no DB, no async, no globals.

### 2.2 Tests (lightweight, manual)

The helper is the one place where a wrong implementation silently
corrupts ordering. A small `server/lexoPosition.smoke.mjs` script (run
via `node`, not committed as a framework test) prints a few hundred
`between(...)` calls and asserts a handful of invariants:

- `a < between(a, b) < b` for random `a, b`.
- `between(null, null) === first()`.
- `between("a0", "a1")` returns a valid in-between string.
- Repeatedly halving between two anchors never runs out of room
  within 10 characters (the design budget).

This isn't an automated test framework — it ships as a debug script
that's safe to delete in Phase 5 once `jest` lands. **Phase 5 should
promote these to a real test suite** under `server/src/__tests__/`.

---

## Step 3 — `tasks` Module: Move Endpoint

### 3.1 `tasks.validation.ts` (additions)

zod schemas:

- `MoveTaskSchema` —
  ```ts
  z.object({
    toColumnId: z.string().uuid(),
    toIndex:    z.number().int().min(0),
  })
  ```
  - `toColumnId` — destination column (must be on the same board as
    the source column; the service checks this defensively).
  - `toIndex` — the **client's intended** zero-based position in the
    destination column's task list **after** the move. The server
    uses this only to pick the right pair of neighbors; the actual
    position is computed by `lexoPosition.between`.
  - `.refine(...)` is not required (both fields are non-optional and
    fully typed).

- `ColumnIdParamSchemaForTaskMove` — the existing `TaskIdParamSchema`
  is `{ id: z.string().uuid() }`; the move route uses
  `/:columnId` and `/:taskId` together, so add a
  `ColumnAndTaskIdParamSchema` —
  `{ columnId: z.string().uuid(), taskId: z.string().uuid() }`.

Export inferred input type: `MoveTaskInput`.

### 3.2 `tasks.service.ts` (additions)

New public function:

- `moveTask(userId, taskId, { toColumnId, toIndex })`:
  1. The route's middleware chain has already run
     `loadColumn("params", "columnId") → loadTask → requireBoardAccess`
     on the **source** column + task. Re-assert defensively:
     `assertBoardAccess(userId, sourceColumn.boardId)`.
  2. Fetch the **destination** column; if missing or its board is
     soft-deleted → `HttpError(404, "Destination column not found")`.
  3. Re-assert access on the destination board:
     `assertBoardAccess(userId, destColumn.boardId)`. If the
     destination is on a **different** board than the source → 403
     (Phase 4 explicitly forbids cross-board moves).
  4. Inside `prisma.$transaction`:
     - List the destination column's tasks (excluding the task being
       moved, in case it's a same-column reorder), ordered by
       `position asc`.
     - Pick neighbors: `before = tasks[toIndex - 1]`, `after = tasks[toIndex]`
       (with `undefined` when out of range; the index is clamped to
       the destination's length).
     - Compute `newPosition = lexoPosition.between(before?.position ?? null, after?.position ?? null)`.
     - If `newPosition === null` → re-pack: in a **nested** transaction
       (or a follow-up `tx` call inside the same outer transaction),
       re-key the destination column's tasks (now including the
       moved one, inserted at `toIndex`) to fresh lexo positions in
       row order, then re-derive the moved task's final position from
       the re-packed list.
     - Otherwise update the task with
       `prisma.task.update({ where: { id: taskId }, data: { columnId: toColumnId, position: newPosition } })`.
  5. Return the moved task (with `columnId` and `position` reflecting
     the final state).

  Throw `HttpError(400, ...)` for any input that the zod schema
  allowed but that the service can prove is nonsensical (e.g. an
  impossible `toIndex` after clamping — should not happen in
  practice, but a safety net is cheap).

### 3.3 `tasks.controller.ts` (addition)

Thin handler `moveTask`:

1. Reads `req.params.taskId`, `req.body` (validated upstream).
2. Calls `tasksService.moveTask(req.user.id, req.params.taskId, req.body)`.
3. Returns HTTP 200 with the moved task (full shape:
   `{ id, title, description, columnId, position, createdAt }`).

### 3.4 `tasks.routes.ts` (additions)

New route mounted on `/api`:

| Method | Path                                          | Middleware chain                                                                                                                                                                                                                                       |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/columns/:columnId/tasks/:taskId/move`       | `requireAuth` → `validate(ColumnAndTaskIdParamSchema, "params")` → `loadColumn("params", "columnId")` → `loadTask("params", "taskId")` → `requireBoardAccess` → `validate(MoveTaskSchema)` → `asyncHandler(moveTask)`                                    |

Notes:
- `loadTask` reads from `req.params.taskId` (not the default `id`),
  so the existing overload signature (`loadTask(source?, key?)`) is
  reused.
- The handler additionally verifies destination-board access via the
  service's defensive check (Step 3.2, items 2–3) because the
  middleware chain only authorizes the **source** side.

### 3.5 No other `tasks` files change

The existing CRUD endpoints are unchanged. The `UpdateTaskSchema`
already forbids `columnId` and `position` in the body (zod's
`.strict()` semantics via the inferred type); the move endpoint is
the **only** way to change either in Phase 4.

---

## Step 4 — `columns` Module: Move Endpoint

The existing `PATCH /api/boards/:boardId/columns/reorder` already
handles the "drag many" case by accepting the full ordered id list.
Add a **single-column-move** endpoint that uses the same
`lexoPosition` helper for symmetry with task moves. This is a
thin extension — most of the work was already done in Phase 3.

### 4.1 `columns.validation.ts` (additions)

- `MoveColumnSchema` —
  `{ toIndex: z.number().int().min(0) }`
  (no `toColumnId` — a column is moved within its own board, so the
  board is already on the URL).

- `ColumnIdParamSchemaForMove` — the existing
  `ColumnIdParamSchema` is `{ id: z.string().uuid() }` and is reused
  for the move route as well.

Export inferred input type: `MoveColumnInput`.

### 4.2 `columns.service.ts` (additions)

New public function:

- `moveColumn(userId, columnId, { toIndex })`:
  1. The route's middleware chain has already run
     `loadColumn → requireBoardAccess` and `loadBoard` on the URL.
     Re-assert defensively: `assertBoardAccess(userId, column.boardId)`.
  2. Inside `prisma.$transaction`:
     - List the board's columns, ordered by `position asc`, excluding
       the column being moved.
     - Pick neighbors: `before = columns[toIndex - 1]`,
       `after = columns[toIndex]` (clamped to array length).
     - Compute `newPosition = lexoPosition.between(before?.position ?? null, after?.position ?? null)`.
     - If `newPosition === null` → re-pack the board's columns to
       fresh lexo positions in row order (with the moved column
       inserted at `toIndex`) in a nested transaction, and read off
       the moved column's final position.
     - Otherwise update the column with
       `prisma.column.update({ where: { id: columnId }, data: { position: newPosition } })`.
  3. Return the moved column.

### 4.3 `columns.controller.ts` (addition)

Thin handler `moveColumn` returning 200 with the updated column.

### 4.4 `columns.routes.ts` (additions)

New route:

| Method | Path                  | Middleware chain                                                                                                                                                                                                                            |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/columns/:id/move`   | `requireAuth` → `validate(ColumnIdParamSchema, "params")` → `loadColumn()` → `requireBoardAccess` → `validate(MoveColumnSchema)` → `asyncHandler(moveColumn)`                                                                                |

The existing `PATCH /api/boards/:boardId/columns/reorder` remains —
both endpoints are valid; the reorder endpoint stays for the
"client already has the full new order, just commit it" case.

---

## Step 5 — Frontend: Board View + Drag-and-Drop

This is the first real frontend feature in the project. All work
happens inside `client/kanban-board-client/`.

### 5.1 New dependencies

```bash
cd client/kanban-board-client
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @tanstack/react-query
```

Add a `<QueryClientProvider>` at the root of `src/app/layout.tsx` so
the rest of the app can use `useQuery` / `useMutation`. (Keep
`LayoutProps` from Next.js 16 untouched — wrap the children in a
client component if needed.)

### 5.2 New files

```
client/kanban-board-client/src/
├── app/
│   ├── layout.tsx                       # Wrap in <QueryClientProvider>
│   └── boards/[id]/page.tsx             # Board view: route + data fetch
├── features/
│   └── board/
│       ├── BoardView.tsx                # Top-level: columns + dnd context
│       ├── Column.tsx                   # Sortable column
│       ├── TaskCard.tsx                 # Draggable task
│       ├── useBoardQuery.ts             # useQuery: GET /api/boards/:id
│       ├── useMoveTaskMutation.ts       # useMutation: POST /api/.../move
│       ├── useMoveColumnMutation.ts     # useMutation: POST /api/columns/:id/move
│       ├── reorderBoard.ts              # Pure: insert into an array at an index
│       └── api.ts                       # Tiny fetch wrapper (no axios; matches the existing client)
```

The folder layout keeps the board view self-contained — Phase 5's
polish (responsive layout, counters, keyboard shortcuts) will land
alongside it without rewriting the tree.

### 5.3 Behaviour

- On mount, `useBoardQuery` calls `GET /api/boards/:id` (auth token
  in `Authorization: Bearer ...` from the existing auth context).
- `BoardView` renders columns in `position asc` order. Each column
  is a `<SortableContext>` over its tasks.
- `DndContext` wraps the whole board with a single
  `closestCorners` collision strategy.
- On drop inside a column: `onDragEnd` computes the destination
  index, calls `useMoveTaskMutation.mutate(...)` with the **previous
  snapshot** captured at `onDragStart` time.
  - **Optimistic update:** the `onMutate` callback in
    `useMoveTaskMutation` updates the React Query cache
    (`queryClient.setQueryData(["board", id], ...)`) with the
    re-ordered array BEFORE the network call returns. The UI sees
    the move immediately.
  - **Rollback on error:** the `onError` callback restores the
    previous snapshot and shows a toast (any lightweight toast
    implementation; a single `<div role="status">` is acceptable
    for Phase 4 — Phase 5 polishes it).
  - **Reconcile on success:** the `onSuccess` callback
    invalidates the `["board", id]` query so the next refetch
    pulls the authoritative server state.
- On drop into a different column: same flow, but the optimistic
  update must also move the task from the source column's array to
  the destination column's array, recompute the destination's
  `position` ordering, and set the task's `columnId` in the cache
  shape.
- Column drags use the same machinery, calling
  `useMoveColumnMutation` with `{ toIndex }` only.

### 5.4 TypeScript types

Re-export the response shape from a single `api.ts` so React Query's
generic parameters stay strict. Mirror the backend's `Column` and
`Task` shapes (with `id: string`, `position: string`, etc.) — no
`null` `description` surprises.

### 5.5 Auth wiring (lightweight)

The Phase 4 frontend assumes an `AuthContext` (or equivalent) that
exposes the JWT and the current user's id. If one doesn't exist
yet, the minimal addition is:

```tsx
// client/kanban-board-client/src/features/auth/AuthContext.tsx
const AuthContext = createContext<{ token: string | null }>({ token: null });
```

…and a one-line `localStorage` read on mount. **A full auth flow
(login / register / token refresh) is Phase 5** per the roadmap;
Phase 4's `useBoardQuery` is the only consumer, and a hard-coded
token in `localStorage` is acceptable for the demo. Document this
clearly in `Validation.md`.

### 5.6 Styling

Tailwind v4 utility classes only (per the existing project setup).
Phase 4 deliberately uses a minimal, neutral palette — Phase 5's
`/frontend-design` skill pass will add the intentional visual
language. **Do not** introduce custom CSS files or
`tailwind.config.js` extensions in this phase.

---

## Step 6 — Wiring & Final Touches

- Import the `lexoPosition` helper from
  `src/common/utils/lexoPosition.js` in the two services that use it.
- Update `boards.service.ts` (`getBoardById`) ordering to use
  `orderBy: { position: "asc" }` on the new `String` field —
  Prisma's `orderBy` works the same way for `String` columns as for
  `Int` columns.
- The existing `phase2-e2e.ps1` script **will break** on the Phase 3
  reorder tests because it uses `columnIds` ordering assertions.
  Either:
  - Update the assertions to compare the **position values** rather
    than the input order, OR
  - Add a Phase 4 e2e script (`server/phase4-e2e.ps1`) that
    re-asserts the same behaviour against the new ordering
    semantics.
  Pick one and document the choice in `Validation.md`.
- No changes to `src/index.ts` (env validation + DB connection stay
  the same).
- No new env vars on the server.
- The frontend's `package.json` gains the four new dev/runtime
  deps listed in Step 5.1.

---

## Step 7 — Manual Verification

Executed before declaring Phase 4 complete. See `Validation.md` for
the full checklist.

---

## Execution Order

| #   | Task                                                                       | Estimated Effort | Status         |
| --- | -------------------------------------------------------------------------- | ---------------- | -------------- |
| 1   | Schema migration: `position Int → String` + backfill (Step 1)              | 45 min           | ✅ Done         |
| 2   | `lexoPosition` helper + smoke script (Step 2)                              | 60 min           | ✅ Done         |
| 3   | `tasks` module: move endpoint (Step 3)                                     | 90 min           | ✅ Done         |
| 4   | `columns` module: single-column move endpoint (Step 4)                     | 45 min           | ✅ Done         |
| 5   | Frontend deps + `QueryClientProvider` + AuthContext (Step 5, base)         | 45 min           | ✅ Done         |
| 6   | Frontend board view + dnd-kit wiring (Step 5)                              | 180 min          | ✅ Done         |
| 7   | End-to-end manual verification, both APIs and DnD UI (Step 7)              | 90 min (codification only — no source-code changes) | ✅ Done         |
|     | **Total**                                                                  | **~9.5 hours**   | **Steps 1–7 done; Phase 4 closed out** |

---

## Out of Scope (Deferred)

- **Real-time sync / WebSockets** — Last-write-wins on `position` is
  the Phase 4 reconciliation strategy. A push channel (WebSocket or
  Server-Sent Events) is a future enhancement; it is **not** required
  for Phase 4's "consistent, conflict-free ordering" goal because
  the server is the only writer of authoritative state.
- **`Task.assigneeId` (task assignment to a user)** — Still optional
  per `specs/Roadmap.md` §3.2; not implemented in Phase 4.
- **Per-column move (atomic batch re-pack across multiple columns at
  once)** — Not a real Kanban UX. Phase 4 supports dragging one
  column at a time and bulk reordering via the existing
  `PATCH /api/boards/:boardId/columns/reorder` endpoint.
- **Soft delete on columns/tasks** — Hard delete only; boards
  already soft-delete and the cascade handles eventual cleanup.
- **Mobile drag-and-drop polish** — `@dnd-kit` supports touch via
  its `PointerSensor`, but the Phase 4 layout is desktop-first
  (horizontal scroll for narrow viewports). Phase 5 adds the
  responsive polish.
- **Optimistic-update visual feedback (drag overlay)** — Phase 4
  uses the default `@dnd-kit` `DragOverlay` with the task card
  itself; Phase 5 swaps in a designed overlay.
- **Automated tests** — Still no test framework yet (Phase 5). The
  `lexoPosition` smoke script in Step 2.2 is the only test artifact
  in this phase; Phase 5 promotes it to a real jest suite.
- **Auth/registration UI on the frontend** — Phase 4 assumes a JWT
  is available in `localStorage`; a real login flow is Phase 5.
- **Conflict resolution UI** — If two clients move the same task in
  conflicting directions, the last write wins on the server and the
  losing client re-fetches and renders the server's view. There is
  no "merge" UI in Phase 4.
