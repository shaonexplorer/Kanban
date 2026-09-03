# Phase 4 — Ordering & Task Movement: Validation Criteria

Each requirement (REQ-4.x.x) from `Requirements.md` must be verifiable.
This document provides the validation method and expected outcome for
each.

## Validation Environment

- Backend running locally: `cd server && npm run dev` (port 4000,
  tsx watch).
- PostgreSQL reachable via `DATABASE_URL` from `server/.env`.
- Frontend running locally: `cd client/kanban-board-client && npm run dev`
  (port 3000).
- The Phase 2 E2E script (`server/phase2-e2e.ps1`) is **not** sufficient
  on its own: it was written before the schema migration in Step 1.
  Either:
  - update its `reorder` assertions to compare **position values**
    rather than the input order, OR
  - add a Phase 4 e2e script (`server/phase4-e2e.ps1`) that re-asserts
    the same behaviour against the new ordering semantics.
  The choice must be documented in the PR description.
- The frontend assumes a JWT in `localStorage` under a known key
  (e.g. `kanban.token`). The Phase 4 validation script logs a user
  in via `POST /api/auth/login` and writes the token to
  `localStorage` before loading `/boards/:id`.

### Variables

- `$T1`, `$T2`, `$T3` are JWTs for three distinct registered users.
  `$T1` is the owner of `$B1`. `$T2` is an accepted member of `$B1`.
  `$T3` is unrelated to `$B1`.
- `$B1` is a board id returned from `POST /api/boards`.
- `$C1`, `$C2`, `$C3` are column ids on `$B1`.
- `$TK1`, `$TK2`, `$TK3` are task ids on `$C1`.

```bash
T1=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"u1@example.com","password":"password123"}' | jq -r .token)
```

> **Reminder:** the server port is **4000** and the client port is
> **3000** (per `CLAUDE.md`).

---

## 1. Schema Evolution

- **VAL-4.1.1** Confirm `Column.position` is now `String`.
  - **Method:** Read `server/prisma/schema.prisma`.
  - **Expected:** `position String @default("a0")` on `Column`.

- **VAL-4.1.2** Confirm `Task.position` is now `String`.
  - **Method:** Read `server/prisma/schema.prisma`.
  - **Expected:** `position String @default("a0")` on `Task`.

- **VAL-4.1.3** Confirm the migration is generated and applied.
  - **Method:** `ls server/prisma/migrations/ | grep phase04`.
  - **Expected:** A directory named
    `phase04_fractional_positions` (or similar) is present and has
    been applied (`_prisma_migrations` table contains the row).

- **VAL-4.1.4** Confirm no model fields other than `position` were
  touched.
  - **Method:** `git diff server/prisma/schema.prisma`.
  - **Expected:** Only the two `position` lines differ from the
    Phase 3 commit.

- **VAL-4.1.5** Confirm the Prisma client was regenerated.
  - **Method:** `npx prisma generate` is a no-op; `git status
    server/src/generated/prisma` shows no diff after a clean
    generation.
  - **Expected:** No diff.

---

## 2. Lexicographic Position Helper

- **VAL-4.2.1** Confirm `lexoPosition` is exported.
  - **Method:** Read `server/src/common/utils/lexoPosition.ts`.
  - **Expected:** `first` and `between` are exported.

- **VAL-4.2.2** Confirm the smoke script passes.
  - **Method:** `cd server && node lexoPosition.smoke.mjs`.
  - **Expected:** All assertions print `PASS` and the script exits
    0.

- **VAL-4.2.3** Confirm `lexoPosition.between(null, null)` returns
  `first()`.
  - **Method:** Add a one-liner to the smoke script:
    `console.log(lexoPosition.between(null, null) === lexoPosition.first())`.
  - **Expected:** `true`.

- **VAL-4.2.4** Confirm `lexoPosition.between` is pure.
  - **Method:** Read the source.
  - **Expected:** No imports of `prisma`, no `async`, no I/O. The
    only side effect is the function's return value.

- **VAL-4.2.5** Confirm re-pack threshold is reachable but not
  trivial.
  - **Method:** In the smoke script, halve between `"a0"` and `"a1"`
    60 times and observe when `between` returns `null`.
  - **Expected:** At least 30 successive calls succeed before
    exhaustion (proves the precision budget is reasonable).

---

## 3. Task Move Endpoint

### 3.1 Happy Path

- **VAL-4.3.1** Confirm a same-column reorder updates the
  intermediate task's position.
  - **Method:** Create `$C1` with three tasks `$TK1, $TK2, $TK3`
    (positions `a0, a1, a2`). As `$T1`,
    `POST /api/columns/$C1/tasks/$TK1/move` with
    `{ "toColumnId": "$C1", "toIndex": 2 }`.
  - **Expected:** HTTP 200; response body has
    `columnId: $C1, position: <some string>`; subsequent
    `GET /api/columns/$C1/tasks` returns
    `[$TK2, $TK3, $TK1]` in that order (positions sorted asc).

- **VAL-4.3.2** Confirm a cross-column move updates `columnId` and
  `position`.
  - **Method:** Create `$C2` with no tasks. As `$T1`,
    `POST /api/columns/$C1/tasks/$TK1/move` with
    `{ "toColumnId": "$C2", "toIndex": 0 }`.
  - **Expected:** HTTP 200; response body has
    `columnId: $C2, position: <some string starting with "a">`;
    `GET /api/columns/$C1/tasks` no longer includes `$TK1`;
    `GET /api/columns/$C2/tasks` includes `$TK1` at index 0.

- **VAL-4.3.3** Confirm `toIndex` clamps to column length.
  - **Method:** With `$C2` containing two tasks, move `$TK3` from
    `$C1` to `$C2` with `toIndex: 999`.
  - **Expected:** HTTP 200; `$TK3` is the **last** task in `$C2`,
    not at index 999 (which would be out of bounds).

- **VAL-4.3.4** Confirm a move that lands between two existing
  tasks produces a `position` string that is
  lexicographically between the neighbours' `position` strings.
  - **Method:** Read the response of VAL-4.3.1; compare the new
    `position` with the positions of `$TK2` and `$TK3` after the
    move.
  - **Expected:** `$TK2.position < $TK1.position < $TK3.position`.

### 3.2 Validation & Errors

- **VAL-4.3.5** Confirm a non-UUID `toColumnId` returns 400.
  - **Method:** `POST /api/columns/$C1/tasks/$TK1/move` with
    `{ "toColumnId": "not-a-uuid", "toIndex": 0 }`.
  - **Expected:** HTTP 400.

- **VAL-4.3.6** Confirm a negative `toIndex` returns 400.
  - **Method:** `POST .../move` with
    `{ "toColumnId": "$C1", "toIndex": -1 }`.
  - **Expected:** HTTP 400.

- **VAL-4.3.7** Confirm a non-integer `toIndex` returns 400.
  - **Method:** `POST .../move` with
    `{ "toColumnId": "$C1", "toIndex": "two" }`.
  - **Expected:** HTTP 400.

- **VAL-4.3.8** Confirm a missing field returns 400.
  - **Method:** `POST .../move` with `{ "toColumnId": "$C1" }`.
  - **Expected:** HTTP 400.

- **VAL-4.3.9** Confirm a non-UUID `:columnId` or `:taskId` returns
  400.
  - **Method:** `POST /api/columns/not-a-uuid/tasks/$TK1/move` and
    `POST /api/columns/$C1/tasks/not-a-uuid/move`.
  - **Expected:** HTTP 400 for both.

- **VAL-4.3.10** Confirm an unauthenticated request returns 401.
  - **Method:** `POST .../move` without `Authorization` header.
  - **Expected:** HTTP 401.

- **VAL-4.3.11** Confirm a non-member gets 403.
  - **Method:** As `$T3`, `POST .../move` on a task in `$B1`.
  - **Expected:** HTTP 403.

### 3.3 Cross-Board & Soft-Delete

- **VAL-4.3.12** Confirm a cross-board move is rejected.
  - **Method:** Create a second board `$B2` (as `$T1`); create
    `$C2` on `$B2`. As `$T1`,
    `POST /api/columns/$C1/tasks/$TK1/move` with
    `{ "toColumnId": "$C2", "toIndex": 0 }`.
  - **Expected:** HTTP 403 (the caller has access to **both**
    boards, but cross-board moves are forbidden).

- **VAL-4.3.13** Confirm a move to a missing column returns 404.
  - **Method:** As `$T1`,
    `POST /api/columns/$C1/tasks/$TK1/move` with
    `{ "toColumnId": "00000000-0000-0000-0000-000000000000", "toIndex": 0 }`.
  - **Expected:** HTTP 404.

- **VAL-4.3.14** Confirm a move to a column on a soft-deleted board
  returns 404.
  - **Method:** Soft-delete `$B1`; attempt the move.
  - **Expected:** HTTP 404 (the destination column's board is
    soft-deleted; per REQ-4.3.16).

### 3.4 Atomicity & Re-pack

- **VAL-4.3.15** Confirm a move is atomic (no half-applied state).
  - **Method:** Trigger a move and immediately read the task and
    its source + destination columns. The task must be visible in
    exactly one column.
  - **Expected:** The task is in **either** the source **or** the
    destination, never both, never neither.

- **VAL-4.3.16** Confirm a re-pack triggers when the midpoint is
  exhausted.
  - **Method:** Drive a sequence of moves between two tasks whose
    `position` values are adjacent. The exact number depends on
    the helper's precision; the smoke script (VAL-4.2.5) reports
    it. Then verify the column's tasks have been re-keyed to
    fresh lexo positions in row order and the moved task sits at
    the requested `toIndex`.
  - **Expected:** All tasks in the column have fresh
    `position` strings (no `null` or out-of-range values);
    `GET /api/columns/$C1/tasks` returns them in the expected
    order.

- **VAL-4.3.17** Confirm the re-pack doesn't affect other columns.
  - **Method:** Trigger a re-pack in `$C1`; read `$C2` and
    `$C3`'s task positions.
  - **Expected:** Unchanged from before the re-pack (only
    `$C1`'s positions are rewritten).

---

## 4. Column Move Endpoint

- **VAL-4.4.1** Confirm a single-column move updates its `position`.
  - **Method:** Create three columns `$C1, $C2, $C3` on `$B1`
    (positions `a0, a1, a2`). As `$T1`,
    `POST /api/columns/$C1/move` with `{ "toIndex": 2 }`.
  - **Expected:** HTTP 200; response body has
    `id: $C1, position: <some string>`;
    `GET /api/boards/$B1/columns` returns
    `[$C2, $C3, $C1]` in that order.

- **VAL-4.4.2** Confirm a non-UUID `:id` returns 400.
  - **Method:** `POST /api/columns/not-a-uuid/move`.
  - **Expected:** HTTP 400.

- **VAL-4.4.3** Confirm a non-member gets 403.
  - **Method:** As `$T3`, `POST /api/columns/$C1/move`.
  - **Expected:** HTTP 403.

- **VAL-4.4.4** Confirm a soft-deleted board's column returns 404.
  - **Method:** Soft-delete `$B1`; attempt the move.
  - **Expected:** HTTP 404.

- **VAL-4.4.5** Confirm the existing
  `PATCH /api/boards/:boardId/columns/reorder` still works.
  - **Method:** `PATCH /api/boards/$B1/columns/reorder` with
    `{ "columnIds": ["$C2", "$C1", "$C3"] }`.
  - **Expected:** HTTP 200; columns returned in that order.

- **VAL-4.4.6** Confirm a column-move re-pack triggers when the
  midpoint is exhausted.
  - **Method:** Drive moves between two adjacent columns until
    `lexoPosition.between` returns `null`; verify the board's
    columns are re-keyed to fresh lexo positions and the moved
    column sits at the requested `toIndex`.
  - **Expected:** All columns on the board have fresh
    `position` strings; ordering is correct.

---

## 5. Frontend Board View

### 5.1 Fetch & Render

- **VAL-4.5.1** Confirm the page loads the board.
  - **Method:** Open `/boards/:id` in a browser (with a JWT in
    `localStorage`).
  - **Expected:** Columns and tasks render. Each task card shows
    its title and description. A loading indicator is visible
    during the fetch.

- **VAL-4.5.2** Confirm unauthenticated users are redirected.
  - **Method:** Open `/boards/:id` with no JWT in `localStorage`.
  - **Expected:** Redirected to a placeholder `/login` route
    (the destination is Phase 5's concern; any redirect counts).

- **VAL-4.5.3** Confirm a network error renders an error state.
  - **Method:** With a valid JWT, point the API base URL at an
    unreachable host and reload.
  - **Expected:** An error message renders in place of the board.

### 5.2 Drag-and-Drop (Tasks)

- **VAL-4.5.4** Confirm a within-column reorder optimistically
  updates the UI.
  - **Method:** Drag `$TK2` between `$TK1` and `$TK3` in `$C1`.
  - **Expected:** The UI re-orders **immediately**; the moved
    card visibly drops into the new slot before the network
    call returns.

- **VAL-4.5.5** Confirm a within-column reorder calls the move
  endpoint.
  - **Method:** Open the browser's network tab; perform the drag.
  - **Expected:** `POST /api/columns/$C1/tasks/$TK2/move` is
    sent with the correct body and a 200 response.

- **VAL-4.5.6** Confirm a cross-column move optimistically
  updates the UI.
  - **Method:** Drag a task from `$C1` into `$C2`.
  - **Expected:** The task disappears from `$C1` and appears
    in `$C2` immediately, in the dropped slot.

- **VAL-4.5.7** Confirm a server error rolls back the optimistic
  update.
  - **Method:** Temporarily break the move endpoint (e.g. add
    a middleware that returns 500), then perform a drag.
  - **Expected:** The UI snaps back to the pre-drag state and
    a `<div role="status">` becomes visible with an error
    message.

- **VAL-4.5.8** Confirm a successful move is reconciled with the
  server.
  - **Method:** After a successful drag, inspect the React Query
    Devtools (or the network tab) for a follow-up `GET
    /api/boards/$B1`.
  - **Expected:** The board query is invalidated and refetched
    after the mutation settles.

- **VAL-4.5.9** Confirm the in-flight task is visually
  distinguishable.
  - **Method:** Initiate a drag, then attempt a second drag on
    the same task before the first move's response lands.
  - **Expected:** The task has reduced opacity (or equivalent
    visual cue) and the second drag is rejected by dnd-kit.

### 5.3 Drag-and-Drop (Columns)

- **VAL-4.5.10** Confirm a column reorder optimistically updates
  the UI.
  - **Method:** Drag `$C1` to the right of `$C2`.
  - **Expected:** The columns re-order immediately; the new
    ordering matches the drag.

- **VAL-4.5.11** Confirm a column reorder calls the column-move
  endpoint.
  - **Method:** Inspect the network tab.
  - **Expected:** `POST /api/columns/$C1/move` is sent with the
    correct `toIndex` body and a 200 response.

### 5.4 State & Dependencies

- **VAL-4.5.12** Confirm the new client dependencies are installed.
  - **Method:** `cat client/kanban-board-client/package.json`.
  - **Expected:** `@dnd-kit/core`, `@dnd-kit/sortable`,
    `@dnd-kit/utilities`, `@tanstack/react-query` are present in
    `dependencies`.

- **VAL-4.5.13** Confirm `<QueryClientProvider>` is mounted at
  the root.
  - **Method:** Read `client/kanban-board-client/src/app/layout.tsx`
    (or the client wrapper that hosts the provider).
  - **Expected:** A `QueryClient` is created and provided to the
    app tree.

- **VAL-4.5.14** Confirm no global state library was added.
  - **Method:** `git diff client/kanban-board-client/package.json`.
  - **Expected:** No `zustand`, `redux`, `jotai`, or similar.

### 5.5 Keyboard Accessibility

- **VAL-4.5.15** Confirm tasks are keyboard-draggable.
  - **Method:** Tab to a task card, press space to pick it up,
    arrow keys to move it, space to drop.
  - **Expected:** The task moves to the new position and the
    move endpoint is called.

- **VAL-4.5.16** Confirm columns are keyboard-draggable.
  - **Method:** Same as VAL-4.5.15, but starting on a column
    header.
  - **Expected:** The column reorders.

---

## 6. Non-Functional Requirements

- **VAL-4.6.1** Confirm strict-mode typecheck passes.
  - **Method:** `cd server && npx tsc --noEmit` and
    `cd client/kanban-board-client && npx tsc --noEmit`.
  - **Expected:** No errors in either project.

- **VAL-4.6.2** Confirm ESM `.js` extensions on new server
  relative imports.
  - **Method:**
    ```bash
    grep -RE "from '\\.\\.?/[^']+'" server/src/common/utils/lexoPosition.ts \
      server/src/modules/columns server/src/modules/tasks \
      | grep -v "\\.js['\"]"
    ```
  - **Expected:** No matches — every relative import in new
    server code ends in `.js`.

- **VAL-4.6.3** Confirm no new top-level **server** dependencies.
  - **Method:** `git diff server/package.json`.
  - **Expected:** No new entries in `dependencies` or
    `devDependencies`.

- **VAL-4.6.4** Confirm the new client dependencies are exactly
  the four listed in REQ-4.6.4.
  - **Method:** `git diff client/kanban-board-client/package.json`.
  - **Expected:** No other additions.

- **VAL-4.6.5** Confirm `lexoPosition` is the only place on the
  server that produces or consumes position strings.
  - **Method:** `grep -RE '"position":\s*"' server/src/modules`.
  - **Expected:** No matches — services only ever read or write
    `position` through the helper.

- **VAL-4.6.6** Confirm the new endpoints are wrapped in
  `prisma.$transaction`.
  - **Method:** Read `server/src/modules/tasks/tasks.service.ts`
    and `server/src/modules/columns/columns.service.ts`.
  - **Expected:** `moveTask` and `moveColumn` use
    `prisma.$transaction` (or `tx` callbacks) for their writes.

- **VAL-4.6.7** Confirm no real-time / WebSocket layer was
  introduced.
  - **Method:** `grep -RE 'socket\.io|ws\\.\\s*\\(' server/src`.
  - **Expected:** No matches.

- **VAL-4.6.8** Confirm no automated test framework was added.
  - **Method:** `git diff server/package.json
    client/kanban-board-client/package.json | grep -E "jest|vitest|playwright"`.
  - **Expected:** No matches.

- **VAL-4.6.9** Confirm no Tailwind config extensions were added
  in Phase 4.
  - **Method:** `git status client/kanban-board-client/` — look
    for new `tailwind.config.*` or `postcss.config.*` files.
  - **Expected:** No new config files (the existing
    `postcss.config.mjs` is unchanged).

- **VAL-4.6.10** Confirm the move routes' middleware chains match
  REQ-4.3.14 and REQ-4.4.8.
  - **Method:** Read `server/src/modules/tasks/tasks.routes.ts`
    and `server/src/modules/columns/columns.routes.ts`.
  - **Expected:** Each new route uses the documented chain.

---

## Summary Checklist

| Requirement ID | Description | Status |
|---|---|---|
| REQ-4.1.1–6 | Schema migration to `position String` | |
| REQ-4.2.1–6 | `lexoPosition` helper + smoke script | |
| REQ-4.3.1–16 | Task move endpoint (happy path, errors, atomicity, re-pack) | |
| REQ-4.4.1–9 | Column move endpoint + existing reorder preserved | |
| REQ-4.5.1–19 | Frontend board view + DnD + optimistic updates | |
| REQ-4.6.1–13 | Non-functional (TS, ESM, no new server deps, no realtime, no test framework) | |

> **Phase 4 is complete when all REQ-4.x items are marked ✅ and the
> end-to-end manual scenarios below pass.**

## End-to-End Manual Scenarios

### Backend (cURL)

A single happy-path run that exercises every backend requirement
(assume `phase2-e2e.ps1` has produced `$T1`, `$T2`, `$T3`, `$B1`,
with `$T2` accepted as a member):

1. Run `node server/lexoPosition.smoke.mjs` — expect exit 0 and
   every assertion `PASS`.
2. As `$T1`, create three columns `$C1`, `$C2`, `$C3` on `$B1` (each
   appended with `position = N` for N = 0, 1, 2 — server-side values
   are lexo strings but the test reads them back).
3. As `$T1`, create three tasks `$TK1, $TK2, $TK3` in `$C1` — expect
   positions `a0`-ish, in order.
4. As `$T1`, `POST /api/columns/$C1/tasks/$TK1/move` with
   `{ "toColumnId": "$C1", "toIndex": 2 }` — expect 200; subsequent
   `GET /api/columns/$C1/tasks` shows `$TK1` at index 2.
5. As `$T1`, `POST /api/columns/$C1/tasks/$TK1/move` with
   `{ "toColumnId": "$C2", "toIndex": 0 }` — expect 200; `$TK1` is
   now in `$C2`, at index 0.
6. As `$T1`, `POST /api/columns/$C1/move` with `{ "toIndex": 1 }` —
   expect 200; `$C1` is now between `$C2` and `$C3` in
   `GET /api/boards/$B1/columns`.
7. As `$T2`, repeat step 5 — expect 200 (members can move).
8. As `$T3`, repeat step 5 — expect 403 (non-member).
9. As `$T1`, attempt step 5 with a `toColumnId` on a different
   board — expect 403.
10. Drive repeated moves between two adjacent tasks until the
    re-pack triggers (the smoke script reports the count); verify
    the column's tasks are re-keyed to fresh lexo positions and the
    moved task is at the requested `toIndex`.

### Frontend (browser)

1. Log a user in via `POST /api/auth/login`; write the token to
   `localStorage.kanban.token`.
2. Navigate to `/boards/$B1` — expect columns and tasks to render.
3. Drag `$TK1` from `$C1` into `$C2` — expect the task to move
   immediately and the network call to fire.
4. Refresh the page — expect the new ordering to persist.
5. Drag `$C3` to the left of `$C1` — expect the column to reorder
   immediately and persist after a refresh.
6. Temporarily break the move endpoint (e.g. add a middleware that
   returns 500), reload, then drag again — expect the UI to snap
   back and a status message to appear.
7. Tab to a task card, press space, arrow keys, space — expect the
   task to move via the keyboard and the move endpoint to fire.
8. Remove the JWT from `localStorage` and reload `/boards/$B1` —
   expect a redirect to the placeholder `/login` route.
