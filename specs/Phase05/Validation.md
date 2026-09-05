# Phase 5 — Polishing & Polish: Validation Criteria

Each requirement (`REQ-5.x.x`) from `Requirements.md` must be
verifiable. This document provides the validation method and
expected outcome for each.

## Validation Environment

- Backend running locally: `cd server && npm run dev` (port 4000,
  tsx watch).
- PostgreSQL reachable via `DATABASE_URL` from `server/.env`.
- Frontend running locally:
  `cd client/kanban-board-client && npm run dev` (port 3000).
- `server/.env.example` exists; `server/.env` is gitignored and
  contains the real values.
- `LOG_LEVEL=info` (default) or `debug` in development.
- The existing `phase2-e2e.ps1` (48 assertions), `phase4-e2e.ps1`
  (58 assertions), and `phase4-step7-e2e.ps1` (32 assertions)
  all pass against the current dev server. Phase 5's new script
  `phase5-e2e.ps1` (≥ 60 assertions) is the new addition.

### Run order

```bash
cd server
node --experimental-strip-types --no-warnings ./lexoPosition.smoke.mjs
powershell -ExecutionPolicy Bypass -File ./phase2-e2e.ps1
powershell -ExecutionPolicy Bypass -File ./phase4-e2e.ps1
powershell -ExecutionPolicy Bypass -File ./phase4-step7-e2e.ps1
powershell -ExecutionPolicy Bypass -File ./phase5-e2e.ps1
npm test
```

Then in a second terminal:

```bash
cd client/kanban-board-client
npm run lint
npx tsc --noEmit
npm test
```

### Expected outputs

- `lexoPosition.smoke.mjs` → `24 passed, 0 failed`
- `phase2-e2e.ps1` → `Phase 2 end-to-end: 48 passed, 0 failed`
- `phase4-e2e.ps1` → `Phase 4 end-to-end: 58 passed, 0 failed`
- `phase4-step7-e2e.ps1` → `Phase 4 Step 7: 32 passed, 0 failed`
- `phase5-e2e.ps1` → `Phase 5 end-to-end: 60+ passed, 0 failed`
  (the exact count is finalized when the script is written;
  the spec assumes ≥ 60 to leave room for the audit and rate
  limit assertions).
- `server npm test` → `Tests: X passed, X total` (X depends on
  the final count; jest exits 0).
- `client npm test` → `Tests: X passed, X total` (vitest exits
  0).
- `server npm run lint` → exits 0 (includes the
  `audit-routes.mjs` step).
- `client npx tsc --noEmit` → exits 0.

### Variables

- `$T1` is a JWT for a registered user (the board owner).
- `$T2` is a JWT for a second registered user (an accepted
  member of `$B1`).
- `$T3` is a JWT for an unrelated user.
- `$B1` is a board id returned from `POST /api/boards`.
- `$C1`, `$C2`, `$C3` are column ids on `$B1`.
- `$TK1`, `$TK2`, `$TK3` are task ids on `$C1`.

The Phase 5 script uses its own email suffix (e.g. `p5-<random>`)
so the existing `phase2-e2e.ps1` / `phase4-e2e.ps1` /
`phase4-step7-e2e.ps1` runs are unaffected.

> **Reminder:** the server port is **4000** and the client port
> is **3000** (per `CLAUDE.md`).

---

## 1. Already Shipped — Traceability

These validation items confirm the surfaces documented in
`Requirements.md` §1 are present in the working tree, **not**
that Phase 5 re-implemented them. Phase 5's contribution for
each of these surfaces is the wiring (see §6 of `Validation.md`
below).

- **VAL-5.1.0** Confirm the auth surface is present.
  - **Method:** `ls client/kanban-board-client/src/features/auth/`.
  - **Expected:** `AuthContext.tsx`, `AuthScreen.tsx`,
    `useAuth.ts` are all present.

- **VAL-5.1.0a** Confirm the TaskModal is present.
  - **Method:** `ls
    client/kanban-board-client/src/features/board/components/`.
  - **Expected:** `TaskModal.tsx` is present.

- **VAL-5.1.0b** Confirm the ShareBoardModal is present.
  - **Method:** Same as VAL-5.1.0a.
  - **Expected:** `ShareBoardModal.tsx` is present.

- **VAL-5.1.0c** Confirm the CreateBoardDrawer is present.
  - **Method:** Same as VAL-5.1.0a.
  - **Expected:** `CreateBoardDrawer.tsx` is present.

- **VAL-5.1.0d** Confirm the overlay open-state ownership.
  - **Method:** Read
    `client/kanban-board-client/src/features/board/BoardView.tsx`
    for the `shareModalOpen` / `createBoardOpen` flags.
  - **Expected:** Both flags exist; both overlays are
    rendered conditionally on them.

- **VAL-5.1.0e** Confirm the icon and avatar primitives.
  - **Method:** `ls
    client/kanban-board-client/src/features/board/components/`.
  - **Expected:** `Icon.tsx` and `UserAvatar.tsx` are present.

- **VAL-5.2.0** Confirm the central error handling is in
  place.
  - **Method:** Read
    `server/src/common/errors/error.middleware.ts`.
  - **Expected:** It maps `HttpError`, `ZodError`, and
    Prisma's `P2002` / `P2025` codes to the
    `{ error, details? }` envelope.

- **VAL-5.2.0a** Confirm the `validate(...)` middleware is
  in place.
  - **Method:** `ls
    server/src/common/validators/`.
  - **Expected:** `validate.middleware.ts` is present with
    a `validate(schema, source?)` export.

- **VAL-5.2.0b** Confirm the health check works.
  - **Method:** `curl http://localhost:4000/health` (with
    the dev server up).
  - **Expected:** 200 `{status: "ok", timestamp, db: "up"}`.

---

## 2. Frontend UX — Responsive Layout

- **VAL-5.1.1** Confirm a `useMediaQuery` hook exists.
  - **Method:** `find client/kanban-board-client/src -name
    "useMediaQuery*"` (use Grep, not the file finder, to
    also catch inlined hooks — the actual implementation
    is a small custom hook, not a dep).
  - **Expected:** A file exporting `useMediaQuery` exists,
    subscribed to `window.matchMedia`.

- **VAL-5.1.2** Confirm the board view renders the compact
  layout on `< 640px`.
  - **Method:** Open `/boards/:id` in a browser with the
    viewport set to 480×800. Open DevTools and confirm the
    `role="tablist"` tab strip is present and only one
    column is visible at a time.
  - **Expected:** Tab strip present; chevron left / right
    work; drag-and-drop is disabled (the `PointerSensor`
    is still wired but the drop handler short-circuits on
    compact).

- **VAL-5.1.3** Confirm the tablet layout.
  - **Method:** Viewport 800×1024.
  - **Expected:** Sidebar shows icons only; board is a
    horizontal scroll with `min-w-[280px]` columns; drag-
    and-drop works with the `PointerSensor`.

- **VAL-5.1.4** Confirm the desktop layout.
  - **Method:** Viewport 1280×800.
  - **Expected:** Full sidebar (icon + label); board is a
    horizontal scroll with `min-w-[320px]` columns; drag-
    and-drop works with `PointerSensor` and
    `KeyboardSensor`.

- **VAL-5.1.5** Confirm the sidebar chevron collapse.
  - **Method:** On desktop, click the chevron in
    `SidebarHeader`. The sidebar should shrink to
    icons-only over 320ms.
  - **Expected:** Transition is smooth; the board reflows
    to use the new width without a layout jump.

- **VAL-5.1.6** Confirm the scroll-to-end affordance.
  - **Method:** With 6+ columns, scroll the board to the
    left so the rightmost column is off-screen. A floating
    right-edge chevron should appear.
  - **Expected:** Clicking it scrolls the board right by
    one column width.

---

## 3. Frontend UX — Column Counters + Quick-Add

- **VAL-5.1.7** Confirm a column counter is rendered.
  - **Method:** Read `ColumnShell.tsx`. Look for a `rounded-full`
    pill containing `{tasks.length}`.
  - **Expected:** The pill is present and reads from the
    in-memory task array.

- **VAL-5.1.8** Confirm the counter updates on a move.
  - **Method:** Drag a task from `$C1` to `$C2`. The
    counter on `$C1` should decrement, the counter on
    `$C2` should increment.
  - **Expected:** Both updates are visible without a
    page refresh.

- **VAL-5.1.9** Confirm the quick-add affordance.
  - **Method:** Open the board, scroll to the bottom of
    any column.
  - **Expected:** A `+ Add task` button is visible. Click
    it; the input expands. Type a title, press Enter.
    The task appears in the column. The input stays open
    for the next add.

- **VAL-5.1.10** Confirm quick-add dispatches
  `useCreateTaskMutation`.
  - **Method:** With the browser's network tab open, add
    a task via quick-add.
  - **Expected:**
    `POST /api/columns/:columnId/tasks` is sent with body
    `{ title }` and a 201 response.

- **VAL-5.1.11** Confirm quick-add rolls back on error.
  - **Method:** Temporarily break the create endpoint
    (add a middleware that returns 500), reload, then
    quick-add a task.
  - **Expected:** The optimistic placeholder is removed
    and the `<Toast />` (or the legacy `role="status"`
    div if the toast is not yet shipped) shows an error
    message. **Revert the change before continuing.**

---

## 4. Frontend UX — Motion Language

- **VAL-5.1.12** Confirm the motion tokens file exists.
  - **Method:** `ls
    client/kanban-board-client/src/design/`.
  - **Expected:** `motion.css` is present alongside
    `tokens.css`.

- **VAL-5.1.13** Confirm the toast component.
  - **Method:** Read
    `client/kanban-board-client/src/features/board/components/Toast.tsx`.
  - **Expected:** The toast slides in from the
    bottom-right over `var(--duration-medium)`, exposes
    `role="status"`, auto-dismisses after 4 seconds.

- **VAL-5.1.14** Confirm the toast pauses on hover.
  - **Method:** Trigger a toast (e.g. force a
    `useMoveTaskMutation` error), hover the toast before
    the 4-second timer fires.
  - **Expected:** The dismiss timer pauses; moving the
    mouse out resumes it.

- **VAL-5.1.15** Confirm the sidebar transition uses
  `--duration-slow`.
  - **Method:** Click the chevron in `SidebarHeader` to
    collapse the sidebar.
  - **Expected:** The collapse takes ~320ms; the easing
    is `cubic-bezier(0.2, 0, 0, 1)`.

- **VAL-5.1.16** Confirm the board view does not animate
  on initial mount.
  - **Method:** Hard-refresh `/boards/:id`.
  - **Expected:** The columns and tasks appear
    immediately; there is no fade-in or slide-in.

- **VAL-5.1.17** Confirm the overlay open animation uses
  the medium token.
  - **Method:** Open the `TaskModal` (or `ShareBoardModal`).
  - **Expected:** The open animation lasts ~200ms
    (the existing `animate-in fade-in zoom-in-95` is
    updated to use the token).

---

## 5. Frontend UX — Loading & Error States

- **VAL-5.1.18** Confirm the skeleton loader.
  - **Method:** Throttle the network to "Slow 3G" in
    DevTools, then reload `/boards/:id`.
  - **Expected:** Three ghost columns with five ghost
    task cards each appear first (with
    `animate-pulse`), then the real board replaces
    them when the fetch lands. The board's chrome
    (header, sidebar, control bar) is visible
    immediately.

- **VAL-5.1.19** Confirm the network error state.
  - **Method:** Stop the backend, then reload
    `/boards/:id`.
  - **Expected:** The full-bleed error card shows
    "Couldn't reach the server. Check your connection
    and try again." with a "Try again" button.

- **VAL-5.1.20** Confirm the 401 (expired session) error
  state.
  - **Method:** Manually expire the JWT (paste a
    malformed token into `localStorage.token`), then
    reload.
  - **Expected:** "Your session expired. Sign in again."
    with a button that routes to `/`.

- **VAL-5.1.21** Confirm the 403 (forbidden) error state.
  - **Method:** As `$T3`, navigate to `/boards/:B1` (a
    board owned by `$T1`).
  - **Expected:** "You don't have access to this board."
    with a "Try again" button.

- **VAL-5.1.22** Confirm the 404 (missing) error state.
  - **Method:** Navigate to `/boards/<random-uuid>`.
  - **Expected:** "This board doesn't exist or has been
    deleted."

- **VAL-5.1.23** Confirm the empty-state (no boards) UI.
  - **Method:** Register a new user, then visit `/`.
  - **Expected:** The empty-state card with a "Create
    your first board" button is shown. Clicking it
    opens the `CreateBoardDrawer`.

- **VAL-5.1.24** Confirm the empty column UI.
  - **Method:** Create a column with no tasks.
  - **Expected:** "No tasks yet — add one to get
    started" is shown with the `+ Add task` affordance
    directly below.

---

## 6. Frontend UX — Wiring the Phase 5 Overlays

These validations confirm the **wiring** that Phase 5 owns. The
visuals (REQ-5.1.0a, REQ-5.1.0b, REQ-5.1.0c) are already
shipped; the wiring turns them into round-tripped surfaces.

### 6.1 TaskModal

- **VAL-5.1.25** Confirm title / description debounce.
  - **Method:** Open the `TaskModal` for a task. Type
    into the title input. Watch the network tab.
  - **Expected:** A single `PATCH /api/tasks/:id` is
    sent 600ms after typing stops. Successive
    keystrokes within 600ms reset the timer.

- **VAL-5.1.26** Confirm the autosave footer.
  - **Method:** While typing, watch the footer.
  - **Expected:** The text cycles `Saving…` →
    `Saved` (or `Failed to save` on error). The "to
    {board}" suffix uses the board title.

- **VAL-5.1.27** Confirm subtask add.
  - **Method:** Add a subtask via the `+ Add subtask`
    button.
  - **Expected:**
    `POST /api/tasks/:id/subtasks` is sent with body
    `{ title }`; a 201 response is returned; the
    subtask appears in the checklist.

- **VAL-5.1.28** Confirm subtask toggle.
  - **Method:** Click the checkbox on a subtask.
  - **Expected:**
    `PATCH /api/tasks/:id/subtasks/:subtaskId` is sent
    with body `{ done: true | false }`.

- **VAL-5.1.29** Confirm comment post.
  - **Method:** Type a comment in the activity feed's
    input, submit.
  - **Expected:** `POST /api/tasks/:id/comments` is
    sent; the new comment appears at the top of the
    feed.

- **VAL-5.1.30** Confirm status / priority / column / due
  date / labels / story points edits.
  - **Method:** Edit each field in the metadata sidebar.
  - **Expected:** Each edit dispatches
    `PATCH /api/tasks/:id` with the relevant partial.
    The column change uses the existing
    `useMoveTaskMutation` (Phase 4) — the new
    `columnId` is sent via the move endpoint, not the
    patch endpoint.

- **VAL-5.1.31** Confirm trash confirm + delete + undo.
  - **Method:** Click the trash button. Within 3
    seconds, click it again.
  - **Expected:** `DELETE /api/tasks/:id` is sent. The
    modal closes. A toast "Task deleted" with an
    "Undo" button appears. Clicking Undo within 5
    seconds re-creates the task from the cached shape
    and the task reappears.

- **VAL-5.1.32** Confirm star toggle.
  - **Method:** Click the star icon in the header.
  - **Expected:** `PATCH /api/tasks/:id` with
    `{ starred: true | false }` is sent. The icon
    fills / un-fills.

### 6.2 ShareBoardModal

- **VAL-5.1.33** Confirm Send Invite.
  - **Method:** Open the `ShareBoardModal`, type an
    email, click Send Invite.
  - **Expected:** `POST /api/boards/:id/members` with
    `{ email, role: "MEMBER" }` is sent. The new
    member appears in the collaborators list with a
    "pending" badge; the badge clears once the
    invitation is accepted on the recipient side.

- **VAL-5.1.34** Confirm member remove.
  - **Method:** Click the X on a member row.
  - **Expected:** `DELETE /api/boards/:id/members/:userId`
    is sent. The row disappears.

- **VAL-5.1.35** Confirm member role change.
  - **Method:** Change a member's role via the per-row
    `<select>`, then click Save Changes.
  - **Expected:** The role change is staged in the
    modal. On Save Changes,
    `PATCH /api/boards/:id/members/:userId` with
    `{ role: "MEMBER" | "ADMIN" }` is sent for each
    staged row.

- **VAL-5.1.36** Confirm the "Anyone with the link can
  view" toggle (or the known gap).
  - **Method:** Toggle the switch.
  - **Expected (if shipped):** `PATCH /api/boards/:id`
    with `{ linkSharing: "VIEW" }` is sent. The toggle
    stays on. **If not shipped:** the toggle is a
    no-op and a "Coming soon" toast appears. The known
    gap is documented in this file under §12.

- **VAL-5.1.37** Confirm Cancel.
  - **Method:** Stage a role change, then click Cancel.
  - **Expected:** The modal closes; no PATCH is sent;
    the next open of the modal shows the un-staged
    state.

### 6.3 CreateBoardDrawer

- **VAL-5.1.38** Confirm Create & Launch Board.
  - **Method:** Open the `CreateBoardDrawer`, fill in
    title + project key + color + template, click
    Create & Launch Board.
  - **Expected:** `POST /api/boards` with the new
    fields is sent; a 201 response returns; the
    drawer closes; the user is navigated to
    `/boards/:newId`.

- **VAL-5.1.39** Confirm the lead-coordinator avatar.
  - **Method:** Open the drawer.
  - **Expected:** The avatar shows the current user's
    email (or the email-derived initials).

### 6.4 Lifted overlay state

- **VAL-5.1.40** Confirm `useOverlayState` exists.
  - **Method:** `find client/kanban-board-client/src
    -name "useOverlayState*"` (or grep for the export).
  - **Expected:** The context exists and is read by
    `BoardView` and written by both
    `BoardControlBar` and `page.tsx`.

---

## 7. Frontend UX — Quick-Add Keyboard Shortcut

- **VAL-5.1.41** Confirm the `c` shortcut opens
  `QuickAddTaskModal`.
  - **Method:** With no input focused, type `c`.
  - **Expected:** A centered modal appears with a
    single input + a column selector.

- **VAL-5.1.42** Confirm the shortcut is suppressed in
  inputs.
  - **Method:** Focus the column-quick-add input, type
    `c`.
  - **Expected:** The character is typed into the input;
    the modal does not open.

- **VAL-5.1.43** Confirm the help button.
  - **Method:** Click the `?` button in
    `BoardControlBar`.
  - **Expected:** A one-screen shortcut list appears
    with the documented shortcuts.

- **VAL-5.1.44 (stretch)** Confirm the `b` and `m`
  shortcuts.
  - **Method:** Type `b` (should open
    `CreateBoardDrawer`); type `m` (should open
    `ShareBoardModal`).
  - **Expected:** Both overlays open. **If the stretch
  is dropped, this is a no-op and is documented as
  such.**

---

## 8. Backend Quality — Input Validation Audit

- **VAL-5.2.1** Confirm the audit script exists.
  - **Method:** `ls server/scripts/audit-routes.mjs`.
  - **Expected:** The file exists.

- **VAL-5.2.2** Confirm the audit script passes.
  - **Method:** `cd server && node scripts/audit-routes.mjs`.
  - **Expected:** Exits 0; prints "All routes pass the
    validate() audit."

- **VAL-5.2.3** Confirm the audit is wired into
  `npm run lint`.
  - **Method:** Read `server/package.json` `scripts.lint`.
  - **Expected:** The script is `tsc --noEmit && node
    scripts/audit-routes.mjs` (or equivalent that
    chains the audit).

- **VAL-5.2.4** Confirm the response envelope.
  - **Method:** Issue a request that triggers a 4xx
    (e.g. an unauthenticated request) and read the
    response body.
  - **Expected:** The body is
    `{ error: "...", details?: {...} }`. The shape is
    consistent across all routes.

- **VAL-5.2.5** Confirm UUID validation on path segments.
  - **Method:** Issue a request with a non-UUID `:id`,
    e.g. `GET /api/boards/not-a-uuid`.
  - **Expected:** 400 (not 404). The error is caught
    by `validate(BoardIdParamSchema, "params")` before
    `loadBoard` runs.

---

## 9. Backend Quality — Structured API Logging

- **VAL-5.2.6** Confirm `pino` and `pino-http` are
  installed.
  - **Method:** `cat server/package.json | grep pino`.
  - **Expected:** Both packages are in
    `dependencies`.

- **VAL-5.2.7** Confirm the logger middleware exists.
  - **Method:** `ls
    server/src/common/middleware/logger.middleware.ts`.
  - **Expected:** The file exists and exports
    `requestLogger` and `logger`.

- **VAL-5.2.8** Confirm `X-Request-Id` is set.
  - **Method:** `curl -i
    http://localhost:4000/health` (or any route).
  - **Expected:** The response includes
    `X-Request-Id: <uuid>`.

- **VAL-5.2.9** Confirm every request logs.
  - **Method:** With the dev server up, issue a few
    requests. Inspect the dev log (with
    `pino-pretty`).
  - **Expected:** Each request produces a log line with
    method, URL, status, response time, request id,
    user id (if authenticated).

- **VAL-5.2.10** Confirm body redaction.
  - **Method:** Issue `POST /api/auth/login` with body
    `{ email, password }`. Read the log line.
  - **Expected:** The `password` field is redacted
    (`[Redacted]`). The `authorization` header is
    redacted in every log line.

- **VAL-5.2.11** Confirm JSON log format in production.
  - **Method:** `LOG_LEVEL=info NODE_ENV=production npm
    start` in `server/`. Issue a request. Read the log
    line.
  - **Expected:** The log line is JSON (no `pino-pretty`
    transport). The fields are present and parseable.

- **VAL-5.2.12** Confirm the central error middleware
  uses `logger.error`.
  - **Method:** Read
    `server/src/common/errors/error.middleware.ts`.
  - **Expected:** The `console.error` call is replaced
    with `logger.error({ err, reqId }, ...)`.

---

## 10. Backend Quality — Rate Limiting

- **VAL-5.2.13** Confirm `express-rate-limit` is
  installed.
  - **Method:** `cat server/package.json | grep
    express-rate-limit`.
  - **Expected:** Present in `dependencies`.

- **VAL-5.2.14** Confirm the login rate limiter.
  - **Method:** Issue 11 `POST /api/auth/login` requests
    from the same IP within 15 minutes (with random
    wrong passwords so the requests don't all return
    401 early).
  - **Expected:** Requests 1–10 return 401; request 11
    returns 429 with body
    `{ error: "Too many requests, try again later." }`
    and a `Retry-After` header.

- **VAL-5.2.15** Confirm the register rate limiter.
  - **Method:** Issue 6 `POST /api/auth/register`
    requests from the same IP within an hour (with
    random new emails).
  - **Expected:** Requests 1–5 return 201; request 6
    returns 429.

- **VAL-5.2.16** Confirm the rate limiters don't apply
  globally.
  - **Method:** Issue 11 `GET /api/boards` requests
    within 15 minutes.
  - **Expected:** All 11 return their normal status
    codes (200 / 401 / etc.); none return 429.

- **VAL-5.2.17** Confirm `trust proxy` is configurable.
  - **Method:** Read `server/src/app.ts` and
    `server/src/config/env.ts`.
  - **Expected:** The default is `app.set("trust proxy",
    false)`. The deployment readme documents how to
    enable it for known proxies.

---

## 11. Backend Quality — Schema Additions

- **VAL-5.2.18** Confirm the new Task fields.
  - **Method:** `prisma migrate status` (or read the
    migration file).
  - **Expected:** A migration named
    `phase05_polish` is applied; `Task` has
    `starred`, `priority`, `dueDate`, `storyPoints`,
    `labels`, and a many-to-many `assignees`
    relation.

- **VAL-5.2.19** Confirm the new Board fields.
  - **Method:** Same as VAL-5.2.18.
  - **Expected:** `Board` has `linkSharing`,
    `projectKey`, `colorIdentity`, `template`.

- **VAL-5.2.20** Confirm the BoardRole enum.
  - **Method:** Same as VAL-5.2.18.
  - **Expected:** `BoardUser.role` is now an enum
    `BoardRole { OWNER, ADMIN, MEMBER }`. Existing
    owner rows are correctly set to `OWNER` (per the
    migration-time UPDATE).

- **VAL-5.2.21** Confirm the new models.
  - **Method:** Same as VAL-5.2.18.
  - **Expected:** `TaskSubtask` and `TaskComment` are
    present. The cascade rules from
    `Task → Subtasks`, `Task → Comments`,
    `Task → Assignees` are `onDelete: Cascade`.

### 11.1 New endpoint happy paths

- **VAL-5.2.22** Confirm `POST /api/tasks/:id/subtasks`.
  - **Method:** Issue a `POST` with body `{ title }`.
  - **Expected:** 201 with the new subtask shape.
    Subsequent `GET /api/tasks/:id/comments` (Phase 5)
    does **not** include the subtask; subtasks live
    in a separate collection.

- **VAL-5.2.23** Confirm `PATCH /api/tasks/:id/subtasks/:subtaskId`.
  - **Method:** Toggle `done` on an existing subtask.
  - **Expected:** 200 with the updated subtask.

- **VAL-5.2.24** Confirm `DELETE /api/tasks/:id/subtasks/:subtaskId`.
  - **Method:** Delete a subtask.
  - **Expected:** 204; the subtask is gone.

- **VAL-5.2.25** Confirm `POST /api/tasks/:id/comments`.
  - **Method:** Post a comment with body
    `{ body: "Hello, world!" }`.
  - **Expected:** 201 with the new comment shape.

- **VAL-5.2.26** Confirm `GET /api/tasks/:id/comments`.
  - **Method:** Get the comments after posting two.
  - **Expected:** 200 with the two comments, newest
    first. Each comment has `authorId` joined to
    `authorEmail`.

- **VAL-5.2.27** Confirm `PUT /api/tasks/:id/assignees`.
  - **Method:** Replace the full set with
    `{ userIds: ["<T1-id>", "<T2-id>"] }`.
  - **Expected:** 200 with the new assignees list.

- **VAL-5.2.28** Confirm widened `POST /api/boards` body.
  - **Method:** Issue a `POST` with
    `{ title, projectKey, colorIdentity, template }`.
  - **Expected:** 201 with the new board; subsequent
    `GET /api/boards/:id` returns the new fields.

- **VAL-5.2.29** Confirm widened `PATCH /api/boards/:id`
  body.
  - **Method:** Issue a `PATCH` with
    `{ linkSharing: "VIEW" }`.
  - **Expected:** 200; the board's `linkSharing` is
    now `VIEW`.

- **VAL-5.2.30** Confirm
  `PATCH /api/boards/:id/members/:userId`.
  - **Method:** As the owner, change a member's role
    to `ADMIN`.
  - **Expected:** 200; the role is updated.

- **VAL-5.2.31** Confirm owner role is immutable.
  - **Method:** As the owner, attempt to change the
    owner's role on a board.
  - **Expected:** 400 with body
    `{ error: "Cannot change the owner's role." }`.

- **VAL-5.2.32** Confirm widened `PATCH /api/tasks/:id`
  body.
  - **Method:** Issue a `PATCH` with
    `{ starred: true, priority: "HIGH", dueDate:
    "2026-12-31", storyPoints: 5, labels: ["frontend",
    "bug"] }`.
  - **Expected:** 200; subsequent `GET /api/tasks/:id`
    returns the new fields.

### 11.2 New endpoint validation & errors

- **VAL-5.2.33** Confirm `assignees` is rejected on the
  tasks patch.
  - **Method:** `PATCH /api/tasks/:id` with
    `{ assignees: ["..."] }`.
  - **Expected:** 400 (the dedicated PUT owns
    assignees).

- **VAL-5.2.34** Confirm the new endpoints reject
  non-UUID path segments.
  - **Method:** `POST /api/tasks/not-a-uuid/subtasks`.
  - **Expected:** 400.

- **VAL-5.2.35** Confirm the new endpoints enforce
  access control.
  - **Method:** As `$T3`, attempt a mutation on a
    board they don't have access to.
  - **Expected:** 403 (or 404 if the board is
    soft-deleted).

### 11.3 Subtask position

- **VAL-5.2.36** Confirm `TaskSubtask.position` uses
  `lexoPosition`.
  - **Method:** `grep -RE 'position: "a" \+ i'
    server/src/modules/tasks`.
  - **Expected:** No matches — every position string
    goes through the helper.

---

## 12. Testing — Backend `jest` Suite

- **VAL-5.3.1** Confirm `jest` is installed.
  - **Method:** `cat server/package.json | grep
    "jest\|ts-jest\|supertest"`.
  - **Expected:** All four packages are in
    `devDependencies`.

- **VAL-5.3.2** Confirm `jest.config.cjs` exists.
  - **Method:** `ls server/jest.config.cjs`.
  - **Expected:** The file exists and configures
    `ts-jest` for ESM.

- **VAL-5.3.3** Confirm the per-module service tests.
  - **Method:** `ls server/src/modules/*/__tests__/`.
  - **Expected:** Each module has a
    `<name>.service.test.ts` file.

- **VAL-5.3.4** Confirm the per-route integration tests.
  - **Method:** `ls server/src/__tests__/integration/`.
  - **Expected:** One file per route group listed in
    REQ-5.3.2, including
    `phase5-extensions.test.ts`.

- **VAL-5.3.5** Confirm `lexoPosition` jest tests.
  - **Method:** `ls
    server/src/common/utils/__tests__/lexoPosition.test.ts`.
  - **Expected:** The file exists with at least the
    24 invariants from the smoke script (now as
    formal `describe` / `it` cases).

- **VAL-5.3.6** Confirm coverage targets.
  - **Method:** `cd server && npm test -- --coverage`.
  - **Expected:** Lines ≥ 80%; branches ≥ 70%. The
    Phase 5 modules (`subtasks`, `comments`,
    `assignees`, `role-change`) are 100% covered.

- **VAL-5.3.7** Confirm `npm test` exits 0.
  - **Method:** `cd server && npm test`.
  - **Expected:** All tests pass; exit code 0.

---

## 13. Testing — Frontend `vitest` Suite

- **VAL-5.3.8** Confirm `vitest` and the testing
  libraries are installed.
  - **Method:** `cat
    client/kanban-board-client/package.json | grep -E
    "vitest|@testing-library|jsdom"`.
  - **Expected:** All five packages are in
    `devDependencies`.

- **VAL-5.3.9** Confirm `vitest.config.ts` exists.
  - **Method:** `ls
    client/kanban-board-client/vitest.config.ts`.
  - **Expected:** The file exists and configures
    `jsdom`.

- **VAL-5.3.10** Confirm the per-feature test files.
  - **Method:** `find
    client/kanban-board-client/src/features -name
    "*.test.tsx"`.
  - **Expected:** A test file exists for each
    component listed in REQ-5.3.9 through
    REQ-5.3.13.

- **VAL-5.3.11** Confirm `useAuth` tests.
  - **Method:** Read
    `client/kanban-board-client/src/features/auth/__tests__/useAuth.test.tsx`.
  - **Expected:** At least one test asserts that
    `getUserSnapshot` returns the same object
    reference for the same raw `localStorage` string
    (the `Object.is` memoization from
    `AuthContext.tsx` lines 65–99).

- **VAL-5.3.12** Confirm the mutation hook tests.
  - **Method:** Same as VAL-5.3.10.
  - **Expected:** Each of the new mutation hooks
    (REQ-5.3.14) has at least one test covering
    `onMutate` and `onError`.

- **VAL-5.3.13** Confirm coverage target.
  - **Method:**
    `cd client/kanban-board-client && npx vitest
    --coverage`.
  - **Expected:** Lines ≥ 60%.

- **VAL-5.3.14** Confirm `npm test` exits 0.
  - **Method:** `cd client/kanban-board-client && npm
    test`.
  - **Expected:** All tests pass; exit code 0.

---

## 14. Testing — PowerShell Phase 5 E2E

- **VAL-5.3.15** Confirm `server/phase5-e2e.ps1` exists.
  - **Method:** `ls server/phase5-e2e.ps1`.
  - **Expected:** The file exists.

- **VAL-5.3.16** Confirm Section A (auth rate limiting).
  - **Method:** Run the script.
  - **Expected:** ~10 assertions pass, including the
    11th login attempt returning 429 and the 6th
    register attempt returning 429.

- **VAL-5.3.17** Confirm Section B (Phase 5 schema).
  - **Method:** Run the script.
  - **Expected:** ~25 assertions pass, covering the
    new fields, the new endpoints, the 4xx validation
    cases, and the cross-board / soft-deleted guards.

- **VAL-5.3.18** Confirm Section C (non-functional).
  - **Method:** Run the script.
  - **Expected:** ~15 assertions pass, covering
    `tsc --noEmit`, `npm run lint`, the audit
    script, the `X-Request-Id` header, the 4xx
    envelope, the pino log format, and the
    `lexoPosition` invariants.

- **VAL-5.3.19** Confirm Section D (frontend static
  analysis).
  - **Method:** Run the script.
  - **Expected:** ~10 assertions pass, covering the
    new client deps, the new mutation hooks, the
    `Toast` component, the `motion.css` tokens, the
    `useOverlayState` context, and the
    `useMediaQuery` hook.

- **VAL-5.3.20** Confirm the script's overall pass
  count.
  - **Method:** Run the script and read the final
    line.
  - **Expected:** `Phase 5 end-to-end: 60+ passed, 0
    failed`.

---

## 15. Deployment Readiness

- **VAL-5.4.1** Confirm `server/.env.example` exists.
  - **Method:** `ls server/.env.example`.
  - **Expected:** The file exists and lists
    `DATABASE_URL`, `JWT_SECRET`, `PORT`,
    `BCRYPT_SALT_ROUNDS`, `JWT_EXPIRES_IN`,
    `LOG_LEVEL`.

- **VAL-5.4.2** Confirm the `.env.example` is exhaustive.
  - **Method:** `grep -E 'process\.env\.[A-Z_]+'
    server/src` (filter out `NODE_ENV` etc.) and
    cross-check against the example file.
  - **Expected:** Every `process.env.<X>` in `src/`
    has a corresponding entry in `.env.example`.

- **VAL-5.4.3** Confirm the health check contract.
  - **Method:** `curl
    http://localhost:4000/health` (with the dev
    server up).
  - **Expected:** 200
    `{status: "ok", timestamp, db: "up"}`.

- **VAL-5.4.4** Confirm the CI workflow.
  - **Method:** `ls .github/workflows/ci.yml`.
  - **Expected:** The file exists with the
    `lint-and-typecheck` and `e2e` jobs.

- **VAL-5.4.5** Confirm the CI runs the expected
  scripts.
  - **Method:** Read
    `.github/workflows/ci.yml`.
  - **Expected:** The `e2e` job runs all three
    `phase*-e2e.ps1` scripts and the
    `lexoPosition` smoke script.

- **VAL-5.4.6** Confirm the Husky pre-commit hook.
  - **Method:** `ls .husky/pre-commit`.
  - **Expected:** The file exists and runs
    `npx lint-staged`.

- **VAL-5.4.7** Confirm `lint-staged` is configured.
  - **Method:** `grep -A 10 'lint-staged'
    package.json`.
  - **Expected:** A `lint-staged` block exists with
    entries for both `server/src/**/*.ts` and
    `client/kanban-board-client/src/**/*.{ts,tsx}`.

---

## 16. Non-Functional Requirements

- **VAL-5.5.1** Confirm strict-mode typecheck passes.
  - **Method:** `cd server && npx tsc --noEmit` and
    `cd client/kanban-board-client && npx tsc
    --noEmit`.
  - **Expected:** No errors in either project.

- **VAL-5.5.2** Confirm ESM `.js` extensions on new
  server relative imports.
  - **Method:**
    `grep -RE "from '\.\.?/[^']+'" server/src/common/middleware/logger.middleware.ts server/src/common/middleware/rate-limit.middleware.ts server/scripts/audit-routes.mjs | grep -v "\.js['\"]"`.
  - **Expected:** No matches.

- **VAL-5.5.3** Confirm no new top-level **client**
  dependencies were added beyond the Phase 5 list.
  - **Method:** `git diff
    client/kanban-board-client/package.json`.
  - **Expected:** Only `vitest`,
    `@vitest/coverage-v8`,
    `@testing-library/react`,
    `@testing-library/jest-dom`,
    `@testing-library/user-event`, `jsdom` are
    added.

- **VAL-5.5.4** Confirm the new server dependencies.
  - **Method:** `git diff server/package.json`.
  - **Expected:** `pino`, `pino-http`,
    `express-rate-limit` are in `dependencies`.
    `jest`, `ts-jest`, `@types/jest`, `supertest`,
    `@types/supertest`, `pino-pretty` are in
    `devDependencies`.

- **VAL-5.5.5** Confirm the new endpoints use
  `HttpError` for domain errors.
  - **Method:** `grep -RE "throw new HttpError"
    server/src/modules/tasks server/src/modules/boards`
    (filtered to the new files added in Phase 5).
  - **Expected:** All domain errors use `HttpError`;
    no `throw new Error(...)` in the new code.

- **VAL-5.5.6** Confirm the new mutation hooks follow
  the `onMutate` / `onError` / `onSettled` pattern.
  - **Method:** `grep -RE 'onMutate\|onError\|onSettled'
    client/kanban-board-client/src/features/board/use*Mutation.ts`.
  - **Expected:** Every new mutation hook has all
    three callbacks.

- **VAL-5.5.7** Confirm the new endpoints chain the
  access-control middleware.
  - **Method:** Read the new
  `*.routes.ts` files.
  - **Expected:** Every new route uses
    `requireAuth → validate(...) → loadBoard |
    loadColumn | loadTask → requireBoardAccess |
    requireBoardOwner`.

- **VAL-5.5.8** Confirm no real-time / WebSocket layer
  was introduced.
  - **Method:** `grep -RE 'socket\.io|ws\.\s*\('
    server/src client/kanban-board-client/src`.
  - **Expected:** No matches.

---

## Summary Checklist

| Requirement ID | Description | Status | Where validated |
| --- | --- | --- | --- |
| REQ-5.1.0, REQ-5.1.0a–e | Auth surface, TaskModal, ShareBoardModal, CreateBoardDrawer, overlay state, Icon / UserAvatar | ✅ Shipped (earlier passes) | §1 |
| REQ-5.1.1–7 | Responsive layout (compact / tablet / desktop) | ⬜ Pending | §2; `phase5-e2e.ps1` §D |
| REQ-5.1.8–15 | Column counters + quick-add | ⬜ Pending | §3; `phase5-e2e.ps1` §D |
| REQ-5.1.16–20 | Motion language (tokens + toast + sidebar / overlay) | ⬜ Pending | §4; `phase5-e2e.ps1` §D |
| REQ-5.1.21–24 | Loading / error / empty states | ⬜ Pending | §5 |
| REQ-5.1.25–40 | Wiring the Phase 5 overlays (TaskModal, ShareBoardModal, CreateBoardDrawer, lifted state) | ⬜ Pending | §6; `phase5-e2e.ps1` §B |
| REQ-5.1.41–44 | Quick-add keyboard shortcut (`c`, `?`, stretch `b` / `m`) | ⬜ Pending | §7 |
| REQ-5.1.45–50 | Board invitation inbox (bell + accept + decline) | ✅ Shipped (Step 9a) | §7a |
| REQ-5.2.1–5 | Input validation audit | ⬜ Pending | §8; `phase5-e2e.ps1` §C |
| REQ-5.2.6–12 | Structured API logging (pino + pino-http + X-Request-Id) | ⬜ Pending | §9; `phase5-e2e.ps1` §C |
| REQ-5.2.20–24 | Rate limiting on auth (login + register) | ⬜ Pending | §10; `phase5-e2e.ps1` §A |
| REQ-5.2.25–28 | Schema additions (Task / Board fields, BoardRole enum) | ⬜ Pending | §11; `phase5-e2e.ps1` §B |
| REQ-5.2.29–30 | New models (TaskSubtask, TaskComment) | ⬜ Pending | §11; `phase5-e2e.ps1` §B |
| REQ-5.2.31–40 | New endpoints (subtasks, comments, assignees, link sharing, role change) | ⬜ Pending | §11; `phase5-e2e.ps1` §B |
| REQ-5.2.41 | Authorization on the new endpoints | ⬜ Pending | §11.4; `phase5-e2e.ps1` §B |
| REQ-5.3.1–7 | Backend `jest` suite (80% line, 70% branch) | ⬜ Pending | §12 |
| REQ-5.3.8–17 | Frontend `vitest` suite (60% line) | ⬜ Pending | §13 |
| REQ-5.3.18–24 | PowerShell `phase5-e2e.ps1` (≥ 60 assertions) | ⬜ Pending | §14 |
| REQ-5.4.1–6 | Deployment readiness (env example, CI, Husky + lint-staged) | ⬜ Pending | §15 |
| REQ-5.5.1–12 | Non-functional (TS, ESM, no extra client deps, no realtime) | ⬜ Pending | §16; `phase5-e2e.ps1` §C |

> **Phase 5 is complete when every pending row in the table above
> is ✅, the `phase5-e2e.ps1` script reports `60+ passed, 0
> failed`, the backend `npm test` and frontend `npm test` both
> exit 0, every box in the "Phase 5 — Step 14 Manual Verification"
> section below is ticked, and the existing `phase2-e2e.ps1` (48),
> `phase4-e2e.ps1` (58), and `phase4-step7-e2e.ps1` (32) all
> continue to pass.**

---

## End-to-End Manual Scenarios

### Backend (automated)

The scenarios below are encoded as `server/phase5-e2e.ps1` (≥ 60
assertions). Run it after `npm run dev` is up on port 4000:

```bash
cd server
powershell -ExecutionPolicy Bypass -File ./phase5-e2e.ps1
```

Expected: `Phase 5 end-to-end: 60+ passed, 0 failed`.

### Backend (cURL)

A single happy-path run that exercises every Phase 5 backend
requirement (assume `phase4-e2e.ps1` has produced `$T1`, `$T2`,
`$T3`, `$B1`, `$C1`, `$C2`, `$C3`, `$TK1`, `$TK2`, `$TK3`):

1. As `$T1`, `PATCH /api/tasks/$TK1` with
   `{ starred: true, priority: "HIGH", dueDate: "2026-12-31",
   storyPoints: 5, labels: ["frontend", "bug"] }` — expect 200;
   the new fields round-trip in `GET /api/tasks/$TK1`.
2. As `$T1`, `POST /api/tasks/$TK1/subtasks` with
   `{ title: "Write tests" }` — expect 201; the subtask appears
   in the response.
3. As `$T1`, `PATCH /api/tasks/$TK1/subtasks/<subtaskId>` with
   `{ done: true }` — expect 200.
4. As `$T1`, `DELETE /api/tasks/$TK1/subtasks/<subtaskId>` —
   expect 204.
5. As `$T1`, `POST /api/tasks/$TK1/comments` with
   `{ body: "Hello, world!" }` — expect 201; the new comment
   is at the top of `GET /api/tasks/$TK1/comments`.
6. As `$T1`, `PUT /api/tasks/$TK1/assignees` with
   `{ userIds: ["<T1-id>", "<T2-id>"] }` — expect 200 with the
   new list.
7. As `$T1`, `POST /api/boards` with
   `{ title: "Phase 5 demo", projectKey: "P5DEMO",
   colorIdentity: "PRIMARY", template: "SOFTWARE_ENG" }` —
   expect 201.
8. As `$T1`, `PATCH /api/boards/$B1` with
   `{ linkSharing: "VIEW" }` — expect 200.
9. As `$T1`, `PATCH /api/boards/$B1/members/<T2-id>` with
   `{ role: "ADMIN" }` — expect 200.
10. Attempt the role change on the owner — expect 400.
11. Issue 11 failed `POST /api/auth/login` from the same IP —
    expect 429 on the 11th.
12. Reset and issue 6 `POST /api/auth/register` from the same
    IP — expect 429 on the 6th.

### Frontend (browser)

1. With the dev server up, log in via `AuthScreen`. Confirm
   the JWT is stored and the home page redirects to
   `/boards/:firstId`.
2. Resize the window to 480px wide. Confirm the compact
   "lane focus" tab view is rendered.
3. Resize to 800px wide. Confirm the tablet layout (icons-
   only sidebar, horizontal scroll board).
4. Resize to 1280px wide. Confirm the desktop layout.
5. Click the `+ Add task` button at the bottom of a column.
   Type a title, press Enter. Confirm the task appears.
6. Click the column quick-add button, type `c` — confirm
   nothing happens (the `c` is captured by the input).
7. Press Esc to close any open input. Type `c` outside an
   input — confirm `QuickAddTaskModal` opens.
8. Open a task, edit the title. Watch the network tab — a
   single `PATCH /api/tasks/:id` fires 600ms after typing
   stops.
9. Add a subtask in the `TaskModal`. Confirm
   `POST /api/tasks/:id/subtasks` is sent.
10. Toggle a subtask. Confirm
    `PATCH /api/tasks/:id/subtasks/:subtaskId` is sent.
11. Post a comment. Confirm `POST /api/tasks/:id/comments`
    is sent.
12. Trash a task (two clicks within 3s). Confirm the toast
    "Task deleted" with "Undo" appears; click Undo and the
    task reappears.
13. Open `ShareBoardModal`, send an invite, change a role,
    click Save Changes. Confirm the three PATCHes fire.
14. Open `CreateBoardDrawer`, fill in the fields, click
    Create & Launch Board. Confirm the drawer closes and
    you land on `/boards/:newId`.
15. Hover a toast. Confirm the 4-second dismiss timer
    pauses; moving the mouse out resumes it.
16. Force an error (break the move endpoint), drag a task.
    Confirm the UI snaps back and a toast surfaces the
    error.

---

## Phase 5 — Step 14 Manual Verification

Step 14 closes out Phase 5. The script
`server/phase5-e2e.ps1` (≥ 60 assertions) automates the parts of
the validation surface that don't need a browser. The
**browser-driven** checks (responsive layout, motion language,
overlay wiring in a real browser) remain manual because the
project has no E2E test framework yet. This section is the
human-driven checklist that completes the verification.

**Prerequisites (asserted by `phase5-e2e.ps1`):**

- The dev server is up on `http://localhost:4000`.
- The Next.js dev server is up on `http://localhost:3000`.
- `cd server && npx tsc --noEmit` and
  `cd client/kanban-board-client && npx tsc --noEmit` both
  exit 0.
- `cd server && npm run lint` and
  `cd client/kanban-board-client && npm run lint` both
  exit 0.
- `cd server && node scripts/audit-routes.mjs` exits 0.
- `cd server && npm test` and
  `cd client/kanban-board-client && npm test` both exit 0.
- The four expected server deps are installed (`pino`,
  `pino-http`, `express-rate-limit`, `jest`).
- The five expected client devDeps are installed
  (`vitest`, `@vitest/coverage-v8`,
  `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `jsdom`).
- The new endpoints exist and return the documented status
  codes.
- The new mutation hooks exist and follow the
  `onMutate` / `onError` / `onSettled` pattern.

**Run the automated Step 14 script first:**

```bash
cd server
powershell -ExecutionPolicy Bypass -File ./phase5-e2e.ps1
```

Expected: `Phase 5 end-to-end: 60+ passed, 0 failed`. Any
failure here must be resolved before ticking the manual
boxes below — the prerequisites are what those checks
depend on.

**Then perform the manual browser checks (one reviewer):**

> *Tip:* all checks below assume the server (`npm run dev`
> on :4000) and the client (`npm run dev` on :3000) are
> running, that you have a JWT in `localStorage` (the
> `AuthScreen` issues one on a successful sign-in or
> registration), and that you've created at least one
> board with 2+ columns and 2+ tasks per column.

### Responsive Layout

- [ ] **(VAL-5.1.2)** Set the viewport to 480×800. Open
  `/boards/:id`. Confirm the compact "lane focus" tab view
  is rendered (one column at a time, tab strip at the top,
  chevron left / right for navigation).
- [ ] **(VAL-5.1.3)** Set the viewport to 800×1024. Confirm
  the tablet layout (icons-only sidebar, horizontal scroll
  board with `min-w-[280px]` columns).
- [ ] **(VAL-5.1.4)** Set the viewport to 1280×800. Confirm
  the desktop layout (full sidebar, `min-w-[320px]`
  columns, both `PointerSensor` and `KeyboardSensor`
  work).
- [ ] **(VAL-5.1.5)** On desktop, click the chevron in
  `SidebarHeader`. Confirm the sidebar shrinks to
  icons-only over 320ms.
- [ ] **(VAL-5.1.6)** With 6+ columns, scroll the board
  left so the rightmost column is off-screen. Confirm the
  floating right-edge chevron appears; clicking it
  scrolls the board right by one column width.

### Column Counters + Quick-Add

- [ ] **(VAL-5.1.7)** Confirm each column header has a
  `{n}` chip. Verify the chip reads from
  `tasks.length`.
- [ ] **(VAL-5.1.8)** Drag a task from `$C1` to `$C2`.
  Confirm the counter on `$C1` decrements and the counter
  on `$C2` increments.
- [ ] **(VAL-5.1.9)** Click the `+ Add task` button at the
  bottom of a column. Confirm the input expands. Type a
  title, press Enter. Confirm the task appears and the
  input stays open.
- [ ] **(VAL-5.1.10)** With the network tab open, quick-
  add a task. Confirm
  `POST /api/columns/:columnId/tasks` is sent with body
  `{ title }` and a 201 response.
- [ ] **(VAL-5.1.11)** Temporarily break the create
  endpoint (add a middleware that returns 500), reload,
  then quick-add a task. Confirm the optimistic
  placeholder is removed and a toast shows the error.
  **Remember to revert the change before continuing.**

### Motion Language

- [ ] **(VAL-5.1.13)** Force a toast (e.g. break a mutation
  to fail). Confirm the toast slides in from the
  bottom-right over ~200ms and auto-dismisses after 4
  seconds.
- [ ] **(VAL-5.1.14)** Force a toast, then hover the toast
  before the 4-second timer fires. Confirm the dismiss
  timer pauses; moving the mouse out resumes it.
- [ ] **(VAL-5.1.15)** Click the chevron in `SidebarHeader`
  to collapse the sidebar. Confirm the collapse takes
  ~320ms; the easing is `cubic-bezier(0.2, 0, 0, 1)`.
- [ ] **(VAL-5.1.16)** Hard-refresh `/boards/:id`. Confirm
  the columns and tasks appear immediately (no fade-in
  or slide-in).
- [ ] **(VAL-5.1.17)** Open the `TaskModal` (or
  `ShareBoardModal`). Confirm the open animation lasts
  ~200ms.

### Loading & Error States

- [ ] **(VAL-5.1.18)** Throttle the network to "Slow 3G"
  in DevTools, then reload `/boards/:id`. Confirm three
  ghost columns with five ghost task cards each appear
  first, then the real board replaces them.
- [ ] **(VAL-5.1.19)** Stop the backend, then reload
  `/boards/:id`. Confirm the full-bleed error card
  shows "Couldn't reach the server. Check your
  connection and try again." with a "Try again"
  button.
- [ ] **(VAL-5.1.20)** Manually expire the JWT (paste a
  malformed token into `localStorage.token`), then
  reload. Confirm "Your session expired. Sign in
  again." with a button that routes to `/`.
- [ ] **(VAL-5.1.21)** As `$T3`, navigate to
  `/boards/:B1`. Confirm "You don't have access to
  this board."
- [ ] **(VAL-5.1.22)** Navigate to `/boards/<random-uuid>`.
  Confirm "This board doesn't exist or has been
  deleted."
- [ ] **(VAL-5.1.23)** Register a new user, then visit
  `/`. Confirm the empty-state card with a "Create
  your first board" button. Click it; the
  `CreateBoardDrawer` opens.
- [ ] **(VAL-5.1.24)** Create a column with no tasks.
  Confirm "No tasks yet — add one to get started" is
  shown with the `+ Add task` affordance below.

### Wiring the Phase 5 Overlays

#### TaskModal

- [ ] **(VAL-5.1.25)** Open the `TaskModal` for a task.
  Type into the title input. Watch the network tab —
  confirm a single `PATCH /api/tasks/:id` is sent
  600ms after typing stops.
- [ ] **(VAL-5.1.26)** While typing, watch the footer.
  Confirm the text cycles `Saving…` → `Saved`.
- [ ] **(VAL-5.1.27)** Add a subtask. Confirm
  `POST /api/tasks/:id/subtasks` is sent and the
  subtask appears in the checklist.
- [ ] **(VAL-5.1.28)** Toggle a subtask. Confirm
  `PATCH /api/tasks/:id/subtasks/:subtaskId` is sent.
- [ ] **(VAL-5.1.29)** Post a comment. Confirm
  `POST /api/tasks/:id/comments` is sent and the
  comment appears at the top of the feed.
- [ ] **(VAL-5.1.30)** Edit each metadata field. Confirm
  the expected network calls fire.
- [ ] **(VAL-5.1.31)** Click the trash button, then
  click it again within 3 seconds. Confirm the modal
  closes, a toast "Task deleted" with "Undo" appears,
  and clicking Undo re-creates the task.
- [ ] **(VAL-5.1.32)** Click the star icon. Confirm
  `PATCH /api/tasks/:id` with `{ starred: true }` is
  sent and the icon fills.

#### ShareBoardModal

- [ ] **(VAL-5.1.33)** Open the `ShareBoardModal`, type
  an email, click Send Invite. Confirm
  `POST /api/boards/:id/members` is sent and the new
  member appears.
- [ ] **(VAL-5.1.34)** Click the X on a member row.
  Confirm `DELETE /api/boards/:id/members/:userId` is
  sent and the row disappears.
- [ ] **(VAL-5.1.35)** Change a member's role, then
  click Save Changes. Confirm
  `PATCH /api/boards/:id/members/:userId` is sent.
- [ ] **(VAL-5.1.36)** Toggle the "Anyone with the link
  can view" switch. If the backend change ships, the
  toggle persists; if not, a "Coming soon" toast
  appears. (Either is acceptable; document the actual
  behavior above.)
- [ ] **(VAL-5.1.37)** Stage a role change, then click
  Cancel. Confirm the modal closes and no PATCH is
  sent.

#### CreateBoardDrawer

- [ ] **(VAL-5.1.38)** Open the `CreateBoardDrawer`,
  fill in the fields, click Create & Launch Board.
  Confirm `POST /api/boards` is sent, the drawer
  closes, and you land on `/boards/:newId`.
- [ ] **(VAL-5.1.39)** Open the drawer. Confirm the
  lead-coordinator avatar shows the current user's
  email.

### Quick-Add Keyboard Shortcut

- [ ] **(VAL-5.1.41)** With no input focused, type `c`.
  Confirm `QuickAddTaskModal` opens.
- [ ] **(VAL-5.1.42)** Focus the column-quick-add input,
  type `c`. Confirm the character is typed into the
  input and the modal does not open.
- [ ] **(VAL-5.1.43)** Click the `?` button in
  `BoardControlBar`. Confirm the shortcut list
  appears.
- [ ] **(VAL-5.1.44, stretch)** Type `b` — confirm
  `CreateBoardDrawer` opens. Type `m` — confirm
  `ShareBoardModal` opens. (Skip if the stretch is
  dropped.)

### Board Invitation Inbox

- [ ] **(VAL-5.1.45)** Confirm the bell button badge.
  As an invited user, the bell in `<BoardHeader />`
  renders a count pill matching the number of PENDING
  invitations. Sign in as a user with zero pending
  invites; the pill is hidden.
- [ ] **(VAL-5.1.46)** Confirm the bell opens the inbox.
  Click the bell — the centered `<InvitationsInbox />`
  modal opens. Each row shows the board title, the
  inviter's email, and a relative-time string.
- [ ] **(VAL-5.1.47)** Confirm `Accept` navigates and
  caches. Click `Accept` on a row — the modal closes,
  the user is navigated to `/boards/<joinedBoardId>`,
  and on next visit the home page's boards list
  includes the new board.
- [ ] **(VAL-5.1.48)** Confirm the decline confirm
  step. Click `Decline` once — the button flips to
  "Click to confirm" for ~3s. Click again within the
  window — the row is removed. After 3s with no second
  click, the button reverts to "Decline".
- [ ] **(VAL-5.1.49)** Confirm optimistic + rollback.
  Kill the backend, click `Accept` — the row is
  removed immediately, then restored with a
  `"Couldn't accept invitation — please retry."` error
  toast once the request fails. **Revert the backend
  change before continuing.**
- [ ] **(VAL-5.1.50)** Confirm the empty-state hint.
  As a user with no boards but one or more pending
  invitations, visit `/`. The empty-state card
  renders the "You have N pending invitations" line
  + a View button above the create CTA. Clicking
  View opens the same inbox modal.
- [ ] **(VAL-5.1.51)** Confirm the inbox Esc + backdrop
  close. Open the inbox, press Esc — closes. Open
  again, click outside the card — closes. The body
  scroll-lock is active while the modal is open.
- [ ] **(VAL-5.1.52)** Confirm the cache invalidation.
  Accept an invitation; the bell badge decrements
  without a page refresh (the
  `["my-invitations"]` invalidate fires on settle).
  Navigate to the new board; the new board appears
  in the sidebar.

### Persistence

- [ ] Perform every wiring scenario above, then refresh
  the page. Confirm the new state persists (the
  optimistic UI was the source of truth; the server's
  response is the next truth).

**Step 14 is complete when every box above is ticked AND
`server/phase5-e2e.ps1` reports `60+ passed, 0 failed` AND
`server/phase4-e2e.ps1` reports `58 passed, 0 failed` AND
`server/phase2-e2e.ps1` reports `48 passed, 0 failed` AND
`server/lexoPosition.smoke.mjs` reports `24/24 passed` AND
`server npm test` and `client/kanban-board-client npm test`
both exit 0.**
