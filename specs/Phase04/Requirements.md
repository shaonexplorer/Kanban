# Phase 4 — Ordering & Task Movement: Requirements

This document defines the requirements for Phase 4 of the Mini Kanban
Board. Each requirement has a stable ID (`REQ-4.x.x`) referenced from
`Validation.md`.

> **Phase 4's two halves.** Phase 4 is the first phase that ships
> non-trivial frontend work. Backend requirements describe the move
> and re-pack semantics; frontend requirements describe the
> drag-and-drop UX and the optimistic-update + rollback contract.

---

## 1. Schema Evolution

- **REQ-4.1.1** The `Column.position` column must be migrated from
  `Int` to `String` (with `@default("a0")`).
- **REQ-4.1.2** The `Task.position` column must be migrated from
  `Int` to `String` (with `@default("a0")`).
- **REQ-4.1.3** Existing data must be preserved through the
  migration. After the migration, every column and every task must
  have a `position` string that is valid input to the
  `lexoPosition` helper.
- **REQ-4.1.4** The migration is generated with
  `prisma migrate dev --name phase04_fractional_positions` and lives
  under `server/prisma/migrations/`.
- **REQ-4.1.5** Cascade rules (`Board → Column → Task`) are
  unchanged.
- **REQ-4.1.6** No other model fields are added, removed, or
  modified in Phase 4.

---

## 2. Lexicographic Position Helper

- **REQ-4.2.1** A new utility `lexoPosition` is exported from
  `server/src/common/utils/lexoPosition.ts`.
- **REQ-4.2.2** `lexoPosition.first(): string` returns the position
  used as the default for an empty scope (e.g. `"a0"`).
- **REQ-4.2.3** `lexoPosition.between(a: string | null, b: string | null): string | null`
  returns a position `p` such that:
  - `a === null` ⇒ `p < b` (or `p` is the only element if `b` is also
    `null`);
  - `b === null` ⇒ `p > a`;
  - `a < p < b` otherwise (lexicographic comparison);
  - or `null` when no such position exists within the helper's
    precision budget (signalling that the caller must re-pack).
- **REQ-4.2.4** The helper is **pure**: no database access, no
  globals, no async. It can be unit-tested without a server.
- **REQ-4.2.5** The helper uses a fixed base-62 alphabet and a fixed
  precision (10 characters by default) that allows ~60 successive
  midpoint operations between any two anchors before the re-pack
  fallback is required.
- **REQ-4.2.6** A smoke script `server/lexoPosition.smoke.mjs`
  exercises the helper against the invariants in REQ-4.2.3 and
  prints PASS/FAIL lines to stdout. The script exits non-zero on
  failure.

---

## 3. Task Move Endpoint

### 3.1 Endpoint

- **REQ-4.3.1** **Endpoint:**
  `POST /api/columns/:columnId/tasks/:taskId/move` (authenticated).
- **REQ-4.3.2** **Request body:** `{ toColumnId: string, toIndex: number }`.
  - `toColumnId` — UUID of the destination column.
  - `toIndex` — zero-based position in the destination column's
    task list **after** the move.
- **REQ-4.3.3** **Response body (200):**
  `{ id, title, description, columnId, position, createdAt }` — the
  full task shape with the post-move `columnId` and `position`.
- **REQ-4.3.4** The `:columnId` and `:taskId` path parameters must
  each be UUIDs; otherwise HTTP 400.
- **REQ-4.3.5** The `toColumnId` body field must be a UUID; the
  `toIndex` field must be a non-negative integer; otherwise HTTP
  400.
- **REQ-4.3.6** HTTP 401 if unauthenticated; HTTP 403 if the caller
  has no access to the **source** column's board; HTTP 404 if the
  source column, the source task, or the destination column is
  missing or lives on a soft-deleted board.
- **REQ-4.3.7** Cross-board moves are forbidden. If
  `destColumn.boardId !== sourceColumn.boardId`, the response is
  HTTP 403 (not 404 — the caller has access to **one** of the boards
  but is trying to mutate a cross-board relationship).
- **REQ-4.3.8** HTTP 200 on success with the moved task.

### 3.2 Semantics

- **REQ-4.3.9** The move is atomic: either both the `columnId` and
  the `position` updates land, or neither does. The DB write runs
  inside a `prisma.$transaction`.
- **REQ-4.3.10** The new `position` is computed by
  `lexoPosition.between(before, after)` where:
  - `before` is the `position` of the task currently at index
    `toIndex - 1` in the destination column (after the move, with
    the task being moved excluded), or `null` if the destination
    index is `0`;
  - `after` is the `position` of the task currently at index
    `toIndex` in the destination column (after the move, with the
    task being moved excluded), or `null` if the destination index
    equals the (post-move) length of the column.
- **REQ-4.3.11** When `lexoPosition.between` returns `null`
  (precision exhausted between two adjacent tasks), the service
  performs a **column-local re-pack** of the destination column's
  tasks, assigning fresh lexo positions in row order, then
  re-derives the moved task's position from the re-packed list.
  The re-pack is also atomic (it runs inside the same outer
  transaction or a nested one).
- **REQ-4.3.12** The `toIndex` value is **clamped** to the
  destination column's task count after excluding the task being
  moved (i.e. a value larger than the column length is treated as
  "append to the end" rather than rejected). HTTP 400 is only
  returned for **negative** values.
- **REQ-4.3.13** A same-column move is allowed: `toColumnId` may
  equal the source `columnId`. The semantics are equivalent to
  reordering within the column; the task's `columnId` is left
  unchanged.

### 3.3 Authorization

- **REQ-4.3.14** The route's middleware chain is
  `requireAuth → validate(ColumnAndTaskIdParamSchema, "params")
   → loadColumn("params", "columnId") → loadTask("params", "taskId")
   → requireBoardAccess → validate(MoveTaskSchema)`.
- **REQ-4.3.15** The destination column's board access is verified
  by the service (defensive check), not by middleware, because the
  middleware chain only authorizes the source side. If the
  destination is on a different board, the service throws 403
  (per REQ-4.3.7).
- **REQ-4.3.16** Soft-deleted boards (either source or destination)
  result in HTTP 404 — the same rule as Phase 3 reads.

---

## 4. Column Move Endpoint

- **REQ-4.4.1** **Endpoint:** `POST /api/columns/:id/move`
  (authenticated).
- **REQ-4.4.2** **Request body:** `{ toIndex: number }`. `toIndex`
  is a non-negative integer; HTTP 400 otherwise.
- **REQ-4.4.3** The `:id` path parameter must be a UUID; otherwise
  HTTP 400.
- **REQ-4.4.4** HTTP 401 if unauthenticated; HTTP 403 if the caller
  has no access to the column's board; HTTP 404 if the column is
  missing or its board is soft-deleted.
- **REQ-4.4.5** HTTP 200 on success, returning the moved column:
  `{ id, title, boardId, position }`.
- **REQ-4.4.6** The new `position` is computed by
  `lexoPosition.between(before, after)` using the board's other
  columns, ordered by `position asc`, with the column being moved
  excluded. The same re-pack fallback (REQ-4.3.11) applies on the
  board level when the helper returns `null`.
- **REQ-4.4.7** The move is atomic (`prisma.$transaction`).
- **REQ-4.4.8** The route's middleware chain is
  `requireAuth → validate(ColumnIdParamSchema, "params")
   → loadColumn() → requireBoardAccess → validate(MoveColumnSchema)`.
- **REQ-4.4.9** The existing
  `PATCH /api/boards/:boardId/columns/reorder` endpoint (Phase 3) is
  preserved unchanged. Both endpoints are valid: the new
  `POST /api/columns/:id/move` is for single-column moves, and the
  reorder endpoint is for the "client already has the full new
  order" case.

---

## 5. Frontend Board View

- **REQ-4.5.1** A new route `client/kanban-board-client/src/app/boards/[id]/page.tsx`
  renders a board view for the URL `/boards/:id`.
- **REQ-4.5.2** The page fetches `GET /api/boards/:id` on mount using
  TanStack Query (`useQuery`) and renders a loading state while the
  fetch is in flight and an error state on failure.
- **REQ-4.5.3** Columns are rendered in `position asc` order. Each
  column lists its tasks in `position asc` order.
- **REQ-4.5.4** The JWT is read from a `localStorage` key (Phase 4's
  placeholder auth) and sent as `Authorization: Bearer <token>` on
  every API call. If no token is present, the page redirects to a
  placeholder `/login` route that is **out of scope** for Phase 4
  (any redirect target is acceptable; Phase 5 implements the real
  auth UI).

### 5.1 Drag-and-Drop

- **REQ-4.5.5** The board view uses `@dnd-kit/core` and
  `@dnd-kit/sortable` for drag-and-drop interactions.
- **REQ-4.5.6** Tasks are draggable within a column (reorder) and
  across columns (move). Columns are draggable within a board
  (reorder) but not across boards (a single board is the unit of
  interaction).
- **REQ-4.5.7** On drop, the client captures a **snapshot of the
  current board state** at `onDragStart` time, then computes the
  new local state synchronously (task moves to a new index; column
  reorders likewise), and applies that local state to the React
  Query cache **before** the network call returns.
- **REQ-4.5.8** The client posts to the move endpoint
  (`POST /api/columns/:columnId/tasks/:taskId/move` for tasks,
  `POST /api/columns/:id/move` for columns) with the
  `{ toColumnId, toIndex }` or `{ toIndex }` body derived from the
  drop target.
- **REQ-4.5.9** On a successful response, the client invalidates
  the `["board", id]` query so a refetch reconciles the local state
  with the server's authoritative ordering.
- **REQ-4.5.10** On an error response (any non-2xx), the client
  restores the snapshot from REQ-4.5.7 and surfaces a non-blocking
  error indicator (a `<div role="status">` is acceptable for Phase
  4; Phase 5 promotes it to a real toast).
- **REQ-4.5.11** While a move is in flight, the moved task or
  column is visually distinguishable (e.g. reduced opacity) so the
  user does not double-drag the same item.
- **REQ-4.5.12** The board view does not block the UI on move
  responses — the optimistic update renders immediately and the
  network call runs in the background.

### 5.2 State Management

- **REQ-4.5.13** Server state (the board's columns, tasks, and
  members) is owned by TanStack Query.
- **REQ-4.5.14** Local UI state (which column is being dragged,
  the in-flight moves, the snapshot for rollback) lives in React
  component state via dnd-kit callbacks. No global state library
  (zustand / redux) is introduced in Phase 4.
- **REQ-4.5.15** The `<QueryClientProvider>` is mounted at the root
  of the Next.js app (in `src/app/layout.tsx` or a thin client
  wrapper) so every page can use TanStack Query.

### 5.3 Styling & Accessibility (minimal)

- **REQ-4.5.16** Tailwind v4 utility classes only — no custom CSS
  files, no `tailwind.config.js` extensions.
- **REQ-4.5.17** The board view is desktop-first (horizontal
  scroll for narrow viewports). Phase 5 adds responsive polish.
- **REQ-4.5.18** The board view is **keyboard-accessible** through
  dnd-kit's `KeyboardSensor` (the tasks and columns can be moved
  with the arrow keys + space/enter to pick up and drop). Phase 5
  may extend the keyboard shortcuts; Phase 4 ships the baseline.
- **REQ-4.5.19** The board view **does not** ship animations or
  transitions beyond dnd-kit's built-in `DragOverlay` default
  (Phase 5 introduces the intentional motion language).

---

## 6. Non-Functional Requirements

- **REQ-4.6.1** All new backend code is TypeScript with strict
  mode (existing project setting). `npx tsc --noEmit` passes.
- **REQ-4.6.2** The codebase remains ESM-native: every relative
  import in new server code uses the `.js` extension
  (`module: NodeNext`, `verbatimModuleSyntax: true`).
- **REQ-4.6.3** No new top-level **server** dependencies are
  introduced. The `lexoPosition` helper is local.
- **REQ-4.6.4** The new client dependencies are exactly:
  `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, and
  `@tanstack/react-query`. They are added to
  `client/kanban-board-client/package.json` (not to the server's
  `package.json`).
- **REQ-4.6.5** Domain errors on the server are surfaced via
  `HttpError(status, message)` and handled by the central error
  middleware (`src/common/errors/errorMiddleware.ts`).
- **REQ-4.6.6** Controllers remain thin: all business logic and DB
  access lives in the service layer. Controllers read `req` and
  call the service.
- **REQ-4.6.7** `lexoPosition` is the only place on the server that
  produces or consumes position strings. Services **never** compute
  positions inline (e.g. `position: "a" + i.toString()`) — they
  always go through the helper.
- **REQ-4.6.8** Move endpoints use `prisma.$transaction` for their
  writes. Re-packs (when triggered) are nested inside the same
  transaction or run as a follow-up step inside the same handler
  with the same atomicity guarantees.
- **REQ-4.6.9** No new top-level routes are added that bypass the
  existing access-control layer. Every move route uses
  `loadColumn` / `loadTask` + `requireBoardAccess` (or successor)
  on the source side and a service-level defensive check on the
  destination side.
- **REQ-4.6.10** Phase 4 introduces no schema-level soft delete on
  columns or tasks. Hard delete from Phase 3 is preserved.
- **REQ-4.6.11** Phase 4 introduces no real-time / WebSocket sync.
  Concurrent edits are reconciled by last-write-wins on `position`
  combined with the resolver's re-pack fallback.
- **REQ-4.6.12** Phase 4 ships no automated test framework. The
  `lexoPosition` smoke script (REQ-4.2.6) is the only test
  artifact; Phase 5 promotes it to a real `jest` suite.
- **REQ-4.6.13** The Phase 4 frontend does not implement the login
  / register flow. A hard-coded or `localStorage`-stored JWT is
  acceptable for the demo. Phase 5 implements the real auth UI.
