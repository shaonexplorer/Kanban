# Phase 3 — Columns & Tasks: Validation Criteria

Each requirement (REQ-3.x.x) from `Requirements.md` must be verifiable.
This document provides the validation method and expected outcome for each.

## Validation Environment

- Backend running locally: `cd server && npm run dev` (port 4000, tsx watch).
- PostgreSQL reachable via `DATABASE_URL` from `server/.env`.
- For a clean run, truncate `Task`, `Column`, `BoardInvitation`,
  `BoardUser`, `Board`, and re-create test users. Phase 2's
  `phase2-e2e.ps1` can be used to seed three users; reuse that flow.
- `$T1`, `$T2`, `$T3` are JWTs for three distinct registered users.
  `$T1` is the owner of `$B1`. `$T2` is an accepted member of `$B1`.
  `$T3` is unrelated to `$B1`.
- `$B1` is a board id returned from `POST /api/boards`.
- `$C1`, `$C2` are column ids. `$TK1`, `$TK2`, `$TK3` are task ids.

```bash
# Example login
T1=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"u1@example.com","password":"password123"}' | jq -r .token)
```

> **Reminder:** the server port is **4000** (per CLAUDE.md). The Phase 2
> E2E script (`server/phase2-e2e.ps1`) can be used unchanged to set up
> `$T1`, `$T2`, `$B1`, and the `$T2` membership.

---

## 1. Schema & Existing Models

- **VAL-3.1.1** Confirm `Column` and `Task` models are unchanged.
  - **Method:** Read `server/prisma/schema.prisma`.
  - **Expected:** `Column { id, title, boardId, position, board, tasks }`
    and `Task { id, title, description, columnId, position, createdAt, column }`
    blocks present and unchanged from Phase 1.

- **VAL-3.1.2** Confirm cascade rules are in place.
  - **Method:** Read `server/prisma/schema.prisma`.
  - **Expected:** `Board { ... columns Column[] ... onDelete: Cascade }`
    (or equivalent relational setup) and the same for `Column → Task`.

- **VAL-3.1.3** Confirm no new migration was required.
  - **Method:** `ls server/prisma/migrations/`.
  - **Expected:** No `*_phase03_*` directory exists unless the project
    opted in to add `assigneeId` (out of scope per Plan §1.2).

---

## 2. Access Control Layer (Extension)

- **VAL-3.2.1** Confirm `loadColumn` is exported.
  - **Method:** Read `server/src/common/middleware/access-control.middleware.ts`.
  - **Expected:** `loadColumn` and `loadTask` exported alongside the
    Phase 2 helpers.

- **VAL-3.2.2** Confirm `loadColumn` 404s on a column whose board is
  soft-deleted.
  - **Method:** Create a board, add a column, soft-delete the board,
    then `GET /api/columns/<column-id>`.
  - **Expected:** HTTP 404.

- **VAL-3.2.3** Confirm `loadTask` 404s on a task whose column or board
  is missing/soft-deleted.
  - **Method:** Soft-delete the parent board, then `GET /api/tasks/<task-id>`.
  - **Expected:** HTTP 404.

- **VAL-3.2.4** Confirm `loadColumn` and `loadTask` chain with
  `requireBoardAccess`.
  - **Method:** Read the new `columns.routes.ts` and `tasks.routes.ts`.
  - **Expected:** Every `:id` route in either file has the form
    `requireAuth → validate(...,"params") → loadColumn|loadTask → requireBoardAccess → ...`.

- **VAL-3.2.5** Confirm cross-board access is denied.
  - **Method:** As `T3` (no access to `$B1`), `GET /api/columns/$C1`.
  - **Expected:** HTTP 403.

---

## 3. Column CRUD

### 3.1 Create Column

- **VAL-3.3.1** Confirm route is registered.
  - **Method:** `grep -n "boards/:boardId/columns" server/src/app.ts`
    (or read `server/src/modules/columns/columns.routes.ts`).
  - **Expected:** `POST /api/boards/:boardId/columns` mapped to
    `createColumn`.

- **VAL-3.3.2** Confirm a valid create returns HTTP 201.
  - **Method:** As `$T1`,
    `POST /api/boards/$B1/columns` with `{"title":"Todo"}`.
  - **Expected:** HTTP 201; body has
    `{ id, title: "Todo", boardId: $B1, position: 0 }`.

- **VAL-3.3.3** Confirm a second column appends with `position: 1`.
  - **Method:** Create another column.
  - **Expected:** New column has `position: 1`; previous is still `0`.

- **VAL-3.3.4** Confirm empty title is rejected.
  - **Method:** POST with `{ "title": "" }`.
  - **Expected:** HTTP 400.

- **VAL-3.3.5** Confirm oversized title is rejected.
  - **Method:** POST with `{ "title": "<101 chars>" }`.
  - **Expected:** HTTP 400.

- **VAL-3.3.6** Confirm non-UUID `:boardId` returns 400.
  - **Method:** `POST /api/boards/not-a-uuid/columns`.
  - **Expected:** HTTP 400.

- **VAL-3.3.7** Confirm member can create.
  - **Method:** As `$T2` (accepted member), create a column.
  - **Expected:** HTTP 201.

- **VAL-3.3.8** Confirm non-member gets 403.
  - **Method:** As `$T3`, create a column.
  - **Expected:** HTTP 403.

### 3.2 List Columns

- **VAL-3.4.1** Confirm list returns position-ordered columns.
  - **Method:** As `$T1`, `GET /api/boards/$B1/columns` after creating
    two columns.
  - **Expected:** HTTP 200; array of length 2; first has `position: 0`,
    second has `position: 1`.

- **VAL-3.4.2** Confirm empty board returns `[]`.
  - **Method:** Create a fresh board as `$T1` (no columns yet);
    `GET /api/boards/<new-id>/columns`.
  - **Expected:** HTTP 200 with `[]`.

- **VAL-3.4.3** Confirm non-member gets 403.
  - **Method:** As `$T3`, GET.
  - **Expected:** HTTP 403.

### 3.3 Get Column

- **VAL-3.5.1** Confirm valid get returns 200.
  - **Method:** As `$T1`, `GET /api/columns/$C1`.
  - **Expected:** HTTP 200; body is `{ id, title, boardId, position }`.

- **VAL-3.5.2** Confirm non-UUID `:id` returns 400.
  - **Method:** `GET /api/columns/not-a-uuid`.
  - **Expected:** HTTP 400.

- **VAL-3.5.3** Confirm missing column returns 404.
  - **Method:** `GET /api/columns/00000000-0000-0000-0000-000000000000`.
  - **Expected:** HTTP 404.

- **VAL-3.5.4** Confirm soft-deleted board's column returns 404.
  - **Method:** Soft-delete `$B1`; `GET /api/columns/$C1`.
  - **Expected:** HTTP 404.

- **VAL-3.5.5** Confirm non-member gets 403.
  - **Method:** As `$T3`, GET.
  - **Expected:** HTTP 403.

### 3.4 Update Column (Rename)

- **VAL-3.6.1** Confirm owner can rename.
  - **Method:** As `$T1`, `PATCH /api/columns/$C1` with
    `{ "title": "Backlog" }`.
  - **Expected:** HTTP 200; body has `title: "Backlog"`.

- **VAL-3.6.2** Confirm member can rename.
  - **Method:** As `$T2`, PATCH.
  - **Expected:** HTTP 200.

- **VAL-3.6.3** Confirm empty title is rejected.
  - **Method:** PATCH with `{ "title": "" }`.
  - **Expected:** HTTP 400.

- **VAL-3.6.4** Confirm non-member gets 403.
  - **Method:** As `$T3`, PATCH.
  - **Expected:** HTTP 403.

### 3.5 Delete Column

- **VAL-3.7.1** Confirm owner can delete; tasks cascade.
  - **Method:** Add a task to `$C1`; as `$T1`, `DELETE /api/columns/$C1`.
  - **Expected:** HTTP 204; subsequent `GET /api/tasks/<task-id>` returns 404.

- **VAL-3.7.2** Confirm member can delete.
  - **Method:** As `$T2`, DELETE a different column.
  - **Expected:** HTTP 204.

- **VAL-3.7.3** Confirm non-member gets 403.
  - **Method:** As `$T3`, DELETE.
  - **Expected:** HTTP 403.

- **VAL-3.7.4** Confirm deleting on a soft-deleted board returns 404.
  - **Method:** Soft-delete `$B1`; DELETE any column on it.
  - **Expected:** HTTP 404.

### 3.6 Reorder Columns

- **VAL-3.8.1** Confirm a valid reorder returns 200 and new ordering.
  - **Method:** Create `$C1` and `$C2`; as `$T1`,
    `PATCH /api/boards/$B1/columns/reorder` with
    `{ "columnIds": ["$C2", "$C1"] }`.
  - **Expected:** HTTP 200; body is `[$C2 (position: 0), $C1 (position: 1)]`.

- **VAL-3.8.2** Confirm a subsequent `GET` reflects the new order.
  - **Method:** `GET /api/boards/$B1/columns`.
  - **Expected:** `$C2` is first.

- **VAL-3.8.3** Confirm a partial set is rejected.
  - **Method:** Reorder with only one of two column ids.
  - **Expected:** HTTP 400.

- **VAL-3.8.4** Confirm a wrong-set (extra id) is rejected.
  - **Method:** Reorder including an id that isn't on the board.
  - **Expected:** HTTP 400.

- **VAL-3.8.5** Confirm a non-UUID id is rejected.
  - **Method:** Reorder with `columnIds: ["not-a-uuid"]`.
  - **Expected:** HTTP 400.

- **VAL-3.8.6** Confirm empty array is rejected.
  - **Method:** Reorder with `{ "columnIds": [] }`.
  - **Expected:** HTTP 400.

- **VAL-3.8.7** Confirm non-member gets 403.
  - **Method:** As `$T3`, PATCH.
  - **Expected:** HTTP 403.

---

## 4. Task CRUD

### 4.1 Create Task

- **VAL-3.9.1** Confirm route is registered.
  - **Method:** Read `server/src/app.ts` and
    `server/src/modules/tasks/tasks.routes.ts`.
  - **Expected:** `POST /api/columns/:columnId/tasks` mapped to
    `createTask`.

- **VAL-3.9.2** Confirm a valid create returns HTTP 201.
  - **Method:** As `$T1`, `POST /api/columns/$C1/tasks` with
    `{ "title": "First task", "description": "hello" }`.
  - **Expected:** HTTP 201; body has
    `{ id, title, description, columnId, position: 0, createdAt }`.

- **VAL-3.9.3** Confirm optional `description` defaults to `null`.
  - **Method:** POST with `{ "title": "No desc" }` only.
  - **Expected:** HTTP 201; `description: null`.

- **VAL-3.9.4** Confirm second task appends with `position: 1`.
  - **Method:** Create another task.
  - **Expected:** New task has `position: 1`; previous is still `0`.

- **VAL-3.9.5** Confirm empty title is rejected.
  - **Method:** POST with `{ "title": "" }`.
  - **Expected:** HTTP 400.

- **VAL-3.9.6** Confirm oversized title is rejected.
  - **Method:** POST with `{ "title": "<201 chars>" }`.
  - **Expected:** HTTP 400.

- **VAL-3.9.7** Confirm oversized description is rejected.
  - **Method:** POST with `{ "title": "ok", "description": "<2001 chars>" }`.
  - **Expected:** HTTP 400.

- **VAL-3.9.8** Confirm non-UUID `:columnId` returns 400.
  - **Method:** `POST /api/columns/not-a-uuid/tasks`.
  - **Expected:** HTTP 400.

- **VAL-3.9.9** Confirm non-member gets 403.
  - **Method:** As `$T3`, POST.
  - **Expected:** HTTP 403.

### 4.2 List Tasks

- **VAL-3.10.1** Confirm list returns position-ordered tasks.
  - **Method:** After creating two tasks, as `$T1`,
    `GET /api/columns/$C1/tasks`.
  - **Expected:** HTTP 200; array of length 2; first has `position: 0`,
    second has `position: 1`.

- **VAL-3.10.2** Confirm empty column returns `[]`.
  - **Method:** Create a fresh column; GET its tasks.
  - **Expected:** HTTP 200 with `[]`.

- **VAL-3.10.3** Confirm non-member gets 403.
  - **Method:** As `$T3`, GET.
  - **Expected:** HTTP 403.

### 4.3 Get Task

- **VAL-3.11.1** Confirm valid get returns 200.
  - **Method:** As `$T1`, `GET /api/tasks/$TK1`.
  - **Expected:** HTTP 200; full task shape including `createdAt`.

- **VAL-3.11.2** Confirm non-UUID `:id` returns 400.
  - **Method:** `GET /api/tasks/not-a-uuid`.
  - **Expected:** HTTP 400.

- **VAL-3.11.3** Confirm missing task returns 404.
  - **Method:** `GET /api/tasks/00000000-0000-0000-0000-000000000000`.
  - **Expected:** HTTP 404.

- **VAL-3.11.4** Confirm soft-deleted board's task returns 404.
  - **Method:** Soft-delete the parent board; GET a task on it.
  - **Expected:** HTTP 404.

- **VAL-3.11.5** Confirm non-member gets 403.
  - **Method:** As `$T3`, GET.
  - **Expected:** HTTP 403.

### 4.4 Update Task

- **VAL-3.12.1** Confirm updating `title` only.
  - **Method:** As `$T1`, `PATCH /api/tasks/$TK1` with
    `{ "title": "Renamed" }`.
  - **Expected:** HTTP 200; `title: "Renamed"`, `description` unchanged.

- **VAL-3.12.2** Confirm updating `description` only.
  - **Method:** PATCH with `{ "description": "new" }`.
  - **Expected:** HTTP 200; `description: "new"`, `title` unchanged.

- **VAL-3.12.3** Confirm updating both.
  - **Method:** PATCH with `{ "title": "X", "description": "Y" }`.
  - **Expected:** HTTP 200; both updated.

- **VAL-3.12.4** Confirm empty body is rejected.
  - **Method:** PATCH with `{}`.
  - **Expected:** HTTP 400.

- **VAL-3.12.5** Confirm oversized fields are rejected.
  - **Method:** PATCH with `{ "title": "<201 chars>" }`.
  - **Expected:** HTTP 400.

- **VAL-3.12.6** Confirm non-member gets 403.
  - **Method:** As `$T3`, PATCH.
  - **Expected:** HTTP 403.

- **VAL-3.12.7** Confirm `columnId` cannot be changed via this endpoint.
  - **Method:** PATCH with `{ "columnId": "<other-column>" }`.
  - **Expected:** HTTP 400 (extra fields rejected by the zod schema).

### 4.5 Delete Task

- **VAL-3.13.1** Confirm owner can delete.
  - **Method:** As `$T1`, `DELETE /api/tasks/$TK1`.
  - **Expected:** HTTP 204; subsequent GET returns 404.

- **VAL-3.13.2** Confirm member can delete.
  - **Method:** As `$T2`, DELETE another task.
  - **Expected:** HTTP 204.

- **VAL-3.13.3** Confirm non-member gets 403.
  - **Method:** As `$T3`, DELETE.
  - **Expected:** HTTP 403.

- **VAL-3.13.4** Confirm deleting on a soft-deleted board returns 404.
  - **Method:** Soft-delete the parent board; DELETE a task on it.
  - **Expected:** HTTP 404.

---

## 5. Nested Board Response

- **VAL-3.14.1** Confirm `GET /api/boards/:id` populates `columns`.
  - **Method:** As `$T1`, `GET /api/boards/$B1` after creating columns
    and tasks.
  - **Expected:** HTTP 200; `columns` array is non-empty; each column
    has `id, title, position, tasks: [...]`.

- **VAL-3.14.2** Confirm columns are ordered by `position` asc.
  - **Method:** Inspect response.
  - **Expected:** `columns[0].position < columns[1].position < ...`.

- **VAL-3.14.3** Confirm tasks within each column are ordered by
  `position` asc.
  - **Method:** Inspect response.
  - **Expected:** For each column, `tasks[0].position < tasks[1].position < ...`.

- **VAL-3.14.4** Confirm task fields match the documented shape.
  - **Method:** Inspect response.
  - **Expected:** Each task has exactly
    `{ id, title, description, position, createdAt }` (no Prisma
    artifacts like `columnId` leaking — column membership is implied
    by being inside that column's `tasks` array).

- **VAL-3.14.5** Confirm `members` ordering and shape is unchanged from
  Phase 2.
  - **Method:** Inspect response.
  - **Expected:** Owner first, then members newest-first by `joinedAt`,
    with `{ userId, email, role, joinedAt }`.

---

## 6. Non-Functional Requirements

- **VAL-3.15.1** Confirm strict-mode typecheck passes.
  - **Method:** `cd server && npx tsc --noEmit`.
  - **Expected:** No errors.

- **VAL-3.15.2** Confirm ESM `.js` extensions on new relative imports.
  - **Method:**
    ```bash
    grep -RE "from '\\.\\.?/[^']+'" server/src/modules/columns \
      server/src/modules/tasks \
      server/src/common/middleware/access-control.middleware.ts \
      | grep -v "\\.js['\"]"
    ```
  - **Expected:** No matches — every relative import in new code ends
    in `.js`.

- **VAL-3.15.3** Confirm no new top-level dependencies.
  - **Method:** `git diff server/package.json`.
  - **Expected:** No new entries in `dependencies` or
    `devDependencies`.

- **VAL-3.15.4** Confirm Prisma client usage is consistent with the
  existing singleton.
  - **Method:** Read new services.
  - **Expected:** They import the shared `prisma` from
    `../../lib/prisma.js` (or use the same `PrismaPg` adapter pattern).

- **VAL-3.15.5** Confirm `HttpError` is the only error type thrown from
  services for expected domain failures.
  - **Method:** Grep for `throw new` in
    `server/src/modules/columns/columns.service.ts` and
    `server/src/modules/tasks/tasks.service.ts`.
  - **Expected:** All domain errors are `HttpError(status, message)`.

- **VAL-3.15.6** Confirm controllers contain no direct Prisma calls.
  - **Method:** Grep for `prisma.` in
    `server/src/modules/columns/columns.controller.ts` and
    `server/src/modules/tasks/tasks.controller.ts`.
  - **Expected:** No matches.

- **VAL-3.15.7** Confirm no frontend changes were made.
  - **Method:** `git status` in `client/kanban-board-client/` and at the
    repo root.
  - **Expected:** No tracked file changes in the client (Phase 3 is
    backend-only).

- **VAL-3.15.8** Confirm no task reorder or cross-column-move endpoints
  exist.
  - **Method:** Grep for `reorder` and `move` in
    `server/src/modules/tasks/`.
  - **Expected:** No matches — these are reserved for Phase 4.

---

## Summary Checklist

| Requirement ID | Description | Status |
|---|---|---|
| REQ-3.1.1–4 | Column/Task model fields and cascades unchanged | |
| REQ-3.2.1–4 | `loadColumn` / `loadTask` middlewares; chains with `requireBoardAccess` | |
| REQ-3.3.1–6.1 | Create column (auth, validation, position append, 201) | |
| REQ-3.4.1–4 | List columns (ordered, auth) | |
| REQ-3.5.1–3 | Get column (auth, 400/403/404) | |
| REQ-3.6.1–5 | Update column (rename only) | |
| REQ-3.7.1–4 | Delete column (cascade) | |
| REQ-3.8.1–7 | Reorder columns (transactional, full set) | |
| REQ-3.9.1–6 | Create task (auth, validation, position append, 201) | |
| REQ-3.10.1–4 | List tasks (ordered, auth) | |
| REQ-3.11.1–3 | Get task (auth, 400/403/404) | |
| REQ-3.12.1–7 | Update task (title/description only) | |
| REQ-3.13.1–4 | Delete task (hard delete) | |
| REQ-3.14.1–5 | Nested board response populates columns and tasks | |
| REQ-3.15.1–11 | Non-functional (strict TS, ESM, no new deps, no frontend, no reorder) | |

> **Phase 3 is complete when all REQ-3.x items are marked ✅ and the
> end-to-end manual scenario below passes.**

## End-to-End Manual Scenario

A single happy-path run that exercises every requirement (assume
`phase2-e2e.ps1` has already produced `$T1`, `$T2`, `$T3`, and `$B1`
with `$T2` accepted as a member):

1. As `$T1`, `POST /api/boards/$B1/columns` with `{"title":"Todo"}` →
   capture `$C1` (expect position 0, 201).
2. As `$T1`, `POST /api/boards/$B1/columns` with `{"title":"Done"}` →
   capture `$C2` (expect position 1, 201).
3. As `$T2`, `GET /api/boards/$B1/columns` — expect 200 with
   `[$C1, $C2]`.
4. As `$T3`, `POST /api/boards/$B1/columns` with `{"title":"X"}` —
   expect 403.
5. As `$T1`, `POST /api/columns/$C1/tasks` with
   `{"title":"First","description":"a"}` → capture `$TK1` (201, pos 0).
6. As `$T1`, `POST /api/columns/$C1/tasks` with `{"title":"Second"}` →
   capture `$TK2` (201, pos 1).
7. As `$T2`, `PATCH /api/tasks/$TK1` with `{"title":"Renamed"}` —
   expect 200.
8. As `$T1`, `GET /api/tasks/$TK1` — expect `title: "Renamed"`.
9. As `$T1`, `GET /api/boards/$B1` — expect
   `columns: [{$C1, tasks: [{$TK1, $TK2}]}, {$C2, tasks: []}]`,
   both ordered by position.
10. As `$T1`, `PATCH /api/boards/$B1/columns/reorder` with
    `{"columnIds":["$C2","$C1"]}` — expect 200; `$C2` now first.
11. As `$T1`, `GET /api/boards/$B1/columns` — expect `[$C2, $C1]`.
12. As `$T1`, `PATCH /api/columns/$C1` with `{"title":"Backlog"}` —
    expect 200.
13. As `$T1`, `DELETE /api/tasks/$TK2` — expect 204; subsequent GET
    returns 404.
14. As `$T1`, `DELETE /api/columns/$C1` — expect 204; `$TK1` is also
    gone (cascade).
15. As `$T1`, `GET /api/boards/$B1` — expect
    `columns: [{$C2, tasks: []}]`.
16. As `$T1`, `DELETE /api/boards/$B1` — expect 204 (soft-delete).
17. As `$T2`, `GET /api/columns/$C2` — expect 404 (board soft-deleted).
18. As `$T2`, `GET /api/tasks/00000000-0000-0000-0000-000000000000` —
    expect 404.
