# Phase 5 — Polishing & Polish: Requirements

This document defines the requirements for Phase 5 of the Mini
Kanban Board. Each requirement has a stable ID (`REQ-5.x.x`)
referenced from `Validation.md`.

> **Phase 5's scope.** Phase 5 is the *polish* phase per
> `specs/Roadmap.md` §5. The roadmap lists four work-streams:
> **5.1 Frontend UX** (responsive layout, column counters, keyboard
> shortcuts / quick-add, loading + error states); **5.2 Backend
> quality** (input validation, central error handling — already
> in place from Phase 1 — API logging, rate limiting); **5.3
> Testing** (backend + frontend unit / integration, e2e); **5.4
> Deployment readiness** (env config, health check — already in
> place from Phase 1 — CI / git hooks). This document maps the
> requirements to those work-streams, **explicitly noting which
> items are already shipped** in earlier passes so the team knows
> what Phase 5 owns vs. what is already done.

---

## 1. Already Shipped (documented for traceability)

These are referenced from `CLAUDE.md` and exist in the working
tree. Phase 5 plans the **wiring** that turns them from
local-state surfaces into round-tripped ones, but does not
re-author them. They are listed here so the Phase 5 requirements
are honest about the starting state.

- **REQ-5.1.0 (auth surface, shipped)** — `AuthScreen`
  (`src/features/auth/AuthScreen.tsx`) is the real sign-in /
  create-account form. Tabs are `Sign in` and `Create account`.
  SSO buttons (GitHub / Google) are rendered but **disabled** (the
  spec'd auth surface is email + password only). The home page
  (`src/app/page.tsx`) renders `<AuthScreen />` on logged-out
  visits and auto-redirects logged-in visitors to their first
  board via `useEffect`. `AuthContext` (`AuthContext.tsx`)
  exposes `registerWithEmail` and `loginWithEmail`, both wired
  to the existing `POST /api/auth/register` and
  `POST /api/auth/login` endpoints; the JWT is persisted to
  `localStorage` under the `token` key and the cached user under
  `auth.user`. The `getUserSnapshot` helper memoizes the parsed
  user object so `useSyncExternalStore`'s `Object.is` comparison
  sees a stable reference (lines 65–99 of `AuthContext.tsx`).
- **REQ-5.1.0a (TaskModal, shipped as local-state surface)** —
  `TaskModal` (`src/features/board/components/TaskModal.tsx`) is
  a ~760px modal with a two-column body (description with
  Preview / Raw tabs, subtasks checklist, activity feed) and a
  metadata sidebar (status, priority, assignees, move-to-column,
  due date, labels, story points). Header has breadcrumb +
  copy-link / star / trash / close actions. Footer pulses
  "Autosaved live to {board}" with an Esc-to-dismiss hint.
  Backdrop has ambient radial glows. Local state only — title
  edit, subtask add / toggle, and comment post are all
  `useState` setters. Phase 5 replaces them with mutations
  (see §3.5).
- **REQ-5.1.0b (ShareBoardModal, shipped as local-state surface)**
  — `ShareBoardModal`
  (`src/features/board/components/ShareBoardModal.tsx`) is a
  faithful port of `.stitch-cache/share.html#shareModal`. Max-w
  620px, rounded-xl shell, scrollable body. Invite row + role
  `<select>` + Send Invite, "Anyone with the link can view"
  toggle + URL preview + Copy / QR buttons, collaborators list
  (owner is a non-editable shield pill; members are email rows
  with a per-row role `<select>` + remove X). Footer shows
  `{n} of {seatCap} member seats utilized` + Cancel + Save
  Changes. Esc / backdrop close; body-scroll lock while open.
- **REQ-5.1.0c (CreateBoardDrawer, shipped as local-state
  surface)** — `CreateBoardDrawer`
  (`src/features/board/components/CreateBoardDrawer.tsx`) is a
  right-side slide-in drawer (max-w 480px). Board-name input,
  project-key (uppercased, maxlength 6) + lead-coordinator grid,
  5-swatch color-identity row, two workflow-template cards,
  auto-archive toggle card. Footer: Cancel + Create & Launch
  Board. Esc / backdrop close; body-scroll lock matches the
  modal.
- **REQ-5.1.0d (overlay open-state, shipped)** — `BoardView`
  (`src/features/board/BoardView.tsx`) owns the
  `shareModalOpen` and `createBoardOpen` flags, the body-scroll
  lock, and the Esc / backdrop close handlers. It passes opener
  callbacks down to `BoardControlBar` (`BoardControlBar.tsx`).
  Phase 5 lifts the open state into a tiny context
  (`useOverlayState`) so the `page.tsx` empty state can also
  open `CreateBoardDrawer`.
- **REQ-5.1.0e (icon + avatar primitives, shipped)** — `Icon`
  (`Icon.tsx`) and `UserAvatar` (`UserAvatar.tsx`) are the
  shared visual primitives used by every Phase 5 surface. The
  `IconName` union covers all the glyphs the surfaces need
  (board chrome, auth screen, task modal, share modal, create
  drawer). Icon size is driven by `w-* h-*` Tailwind utilities
  (not the `text-[Npx]` hack from the Stitch HTML — the inline
  SVG component doesn't read font-size).
- **REQ-5.2.0 (central error handling, shipped)** — The central
  error middleware
  (`server/src/common/errors/error.middleware.ts`) maps
  `HttpError`, `ZodError`, and Prisma's known `P2002` / `P2025`
  codes to a uniform `{ error, details? }` response envelope.
  The error middleware is registered **last** in `createApp()`.
- **REQ-5.2.0a (input validation, shipped)** — The
  `validate(zodSchema, source?)` middleware
  (`server/src/common/validators/validate.middleware.ts`) runs
  in front of every Phase 1–4 route. `source` defaults to
  `"body"`; passing `"params"` validates path segments
  (necessary for UUID `:id` parameters). Phase 5 audits every
  route for coverage (see §4.1).
- **REQ-5.2.0b (health check, shipped)** — `GET /health` returns
  200 `{status: "ok", timestamp, db: "up"}` on a successful
  `SELECT 1` against the DB; 503 `{status: "degraded",
  timestamp, db: "down", error}` on failure.

---

## 2. Frontend UX — Responsive Layout

- **REQ-5.1.1** The board view must support three layout tiers:
  **compact** (`< 640px`), **tablet** (`640px–1023px`), and
  **desktop** (`≥ 1024px`).
- **REQ-5.1.2** On **compact**, the sidebar is collapsed to a
  hamburger menu that slides over the board as a 100%-width
  drawer. The board becomes a single-column "lane focus" view:
  a tab strip at the top lets the user pick one column at a
  time; previous / next chevrons move between tabs. Drag-and-
  drop is disabled on compact; tasks are tap-to-open.
- **REQ-5.1.3** On **tablet**, the sidebar shows icons only.
  The board is a horizontal scroll with `min-w-[280px]`
  columns. Drag-and-drop works with the `PointerSensor`.
- **REQ-5.1.4** On **desktop**, the full sidebar (icon + label)
  is visible by default. The board is a horizontal scroll with
  `min-w-[320px]` columns. Drag-and-drop works with both
  `PointerSensor` and `KeyboardSensor`. A chevron collapse
  button shrinks the sidebar to icons-only (the tablet layout).
- **REQ-5.1.5** The layout tier is computed by a
  `useMediaQuery` hook (8 lines, no external dep) subscribed to
  `window.matchMedia("(min-width: 1024px)")` (and a second
  call for `(min-width: 640px)`). The hook returns a stable
  boolean and re-renders on media-query change.
- **REQ-5.1.6** The sidebar slide-in drawer (REQ-5.1.2) is
  dismissed by a backdrop click or Esc. It uses the existing
  `motion.css` `--duration-slow` token (320ms) for the
  transition.
- **REQ-5.1.7** The "scroll-to-end" affordance on tablet /
  desktop: a floating right-edge chevron button appears when
  more columns are off-screen. Clicking it scrolls the board
  container to the right by one column width.

---

## 3. Frontend UX — Column Counters + Quick-Add

### 3.1 Column counters

- **REQ-5.1.8** Each column header renders a `{n}` chip to the
  right of the title, where `n = tasks.length`. The chip is a
  small `rounded-full` pill with the `surface-container`
  background and `on-surface-variant` color from the Kinetic
  Grid tokens. When `n === 0`, the chip is rendered with
  reduced opacity (so the affordance is still visible).
- **REQ-5.1.9** The chip must update on every move / create /
  delete without a network round-trip — it reads from the
  React Query cache. Verified by an existing cache
  invalidation: the move / create / delete mutations all call
  `queryClient.invalidateQueries({ queryKey: ["board", id] })`
  in their `onSettled` callback.
- **REQ-5.1.10** The chip's color animates over
  `var(--duration-medium)` (200ms) when `n` changes, so the
  update is catchable by the eye without a flashy scale-in.

### 3.2 Quick-add task

- **REQ-5.1.11** Each column body renders a `+ Add task`
  affordance at the bottom of the task list. Clicking it
  expands an inline `<input>` + a Submit button + a Cancel (×)
  button.
- **REQ-5.1.12** Submit on Enter; Cancel on Esc; the input
  clears on successful submit but stays open so the user can
  add multiple tasks in a row.
- **REQ-5.1.13** On submit, a `useCreateTaskMutation` is
  dispatched against `POST /api/columns/:columnId/tasks` (which
  already exists from Phase 3) with body `{ title }`. The
  mutation optimistically inserts a placeholder task at the end
  of the column; on success the placeholder is replaced by the
  server's response; on error the placeholder is removed and a
  toast surfaces the error.
- **REQ-5.1.14** While the mutation is in flight, the input is
  disabled and a spinner replaces the Submit button. A second
  submission is not possible until the first resolves.
- **REQ-5.1.15** The quick-add input must be reachable on
  **every** layout tier (REQ-5.1.1). On compact, it sits inside
  the lane-focus view; on tablet / desktop, it sits at the
  bottom of each column in the horizontal-scroll view.

---

## 4. Frontend UX — Motion Language

- **REQ-5.1.16** A new file `client/kanban-board-client/src/design/motion.css`
  defines the motion tokens as CSS custom properties:
  - `--ease-standard: cubic-bezier(0.2, 0, 0, 1)`
  - `--ease-emphasized: cubic-bezier(0.3, 0, 0, 1)`
  - `--duration-fast: 120ms`
  - `--duration-medium: 200ms`
  - `--duration-slow: 320ms`
  The tokens are also exposed as Tailwind v4 `@theme` keys so
  utility classes like `duration-(--duration-medium)` work
  without a config extension.
- **REQ-5.1.17** The Phase 4 placeholder `<div role="status">`
  toast is promoted to a real `<Toast />` component
  (`src/features/board/components/Toast.tsx`) that slides in
  from the bottom-right with `translate-y-2 → 0` and
  `opacity-0 → 1` over `var(--duration-medium)`, auto-dismisses
  after 4 seconds, pauses the dismiss timer on hover, and
  dismisses on click. The toast exposes `role="status"` for
  screen-reader announcement.
- **REQ-5.1.18** The sidebar collapse (REQ-5.1.4) uses
  `transition-[width] duration-(--duration-slow)
  ease-(--ease-standard)` on the sidebar's outer wrapper.
- **REQ-5.1.19** The TaskModal / ShareBoardModal / CreateBoardDrawer
  open / close animations continue to use the existing
  `animate-in fade-in zoom-in-95` pattern (Phase 4) but switch
  the hard-coded `duration-200` for the `duration-(--duration-medium)`
  token utility. The close animation reverses (zoom-out +
  fade-out) on Esc / backdrop click.
- **REQ-5.1.20** The board view's initial mount must NOT animate
  — the columns are readable immediately. The dnd-kit
  `DragOverlay` keeps its built-in animation; Phase 5 does not
  re-animate it.

---

## 5. Frontend UX — Loading & Error States

- **REQ-5.1.21** The board view's loading state is a skeleton:
  three ghost columns with five ghost task cards each. The
  skeletons use `animate-pulse bg-surface-container-lowest
  rounded-(--radius-md)`. The skeleton renders inside the
  same `<main>` slot as the real board so the board's chrome
  (header, sidebar, control bar) is visible immediately —
  no layout shift when the data lands.
- **REQ-5.1.22** The error state distinguishes between:
  - **Network error** (no response) → "Couldn't reach the
    server. Check your connection and try again."
  - **Auth error (401)** → "Your session expired. Sign in
    again." (button routes to `/`)
  - **Forbidden (403)** → "You don't have access to this
    board."
  - **Not found (404)** → "This board doesn't exist or has
    been deleted."
  Each error state includes a "Try again" button that calls
  `queryClient.invalidateQueries({ queryKey: ["board", id] })`.
- **REQ-5.1.23** The home page's empty state (logged-in user
  with no boards) renders a centered card with a "Create your
  first board" button that opens the `CreateBoardDrawer`
  (REQ-5.1.0c) via the lifted overlay state (REQ-5.1.0d).
- **REQ-5.1.24** Each column with `tasks.length === 0` shows a
  centered "No tasks yet — add one to get started" line in
  the column body, with the `+ Add task` affordance
  (REQ-5.1.11) directly below.

---

## 6. Frontend UX — Wiring the Phase 5 Overlays

### 6.1 TaskModal wiring

- **REQ-5.1.25** Title and description edits are debounced 600ms
  before they fire `PATCH /api/tasks/:id`. The autosave footer's
  "Autosaved live to {board}" text reflects the in-flight /
  settled state (`Saving…` / `Saved` / `Failed to save`).
- **REQ-5.1.26** Subtask add / toggle dispatches
  `POST /api/tasks/:id/subtasks` and
  `PATCH /api/tasks/:id/subtasks/:subtaskId` respectively
  (both new in Phase 5 — see §6.5). The optimistic insert
  matches the Phase 4 move-mutation pattern
  (`onMutate` → `onError` → `onSettled`).
- **REQ-5.1.27** Post-comment dispatches `POST /api/tasks/:id/comments`
  (new). The comment input clears on success; on error the
  input is restored and a toast surfaces the message.
- **REQ-5.1.28** Status / priority / column / due date / labels
  / story points edits all dispatch `PATCH /api/tasks/:id` with
  the relevant partial. The column change uses the existing
  `useMoveTaskMutation` (Phase 4) so the move semantics are
  consistent.
- **REQ-5.1.29** Trash goes through a two-step confirm: the
  trash button first shows "Click again to confirm" for 3
  seconds, then dispatches `DELETE /api/tasks/:id`. The modal
  closes on success; a "Task deleted" toast with an "Undo"
  button is shown. Undo re-creates the task from the cached
  pre-delete shape (a 5-second undo window).
- **REQ-5.1.30** Star dispatches `PATCH /api/tasks/:id` with
  `{ starred: true | false }` (the new field in §7.1).

### 6.2 ShareBoardModal wiring

- **REQ-5.1.31** Send Invite dispatches `POST /api/boards/:id/members`
  with `{ email, role: "MEMBER" }` (Phase 2 endpoint, body
  widened in Phase 5 — see §6.5). The modal optimistically
  appends the email to the collaborators list with a
  "pending" badge; on success the badge clears; on error the
  row is removed and a toast surfaces the message.
- **REQ-5.1.32** Remove a member dispatches
  `DELETE /api/boards/:id/members/:userId` (Phase 2). The row
  is optimistically removed; on error the row is restored.
- **REQ-5.1.33** Change a member's role dispatches
  `PATCH /api/boards/:id/members/:userId` with
  `{ role: "MEMBER" | "ADMIN" }` (new in Phase 5). The change
  is staged in the modal and committed when the user clicks
  Save Changes. The role-change PATCHes are dispatched
  sequentially (one per changed row) in the Save Changes
  handler.
- **REQ-5.1.34** "Anyone with the link can view" toggle
  dispatches `PATCH /api/boards/:id` with
  `{ linkSharing: "DISABLED" | "VIEW" }` (new field in §7.1).
  If the backend change ships as a no-op (the public read
  endpoint is out of scope per §6.6 of the Plan), the toggle
  shows a "Coming soon" toast and the change is **not**
  persisted. This gap is documented in `Validation.md`.
- **REQ-5.1.35** Cancel closes the modal without dispatching
  any of the staged role changes.

### 6.3 CreateBoardDrawer wiring

- **REQ-5.1.36** Create & Launch Board dispatches
  `POST /api/boards` with
  `{ title, projectKey, colorIdentity, template }` (the body
  is widened in Phase 5 — see §6.5). On success the drawer
  closes and the user is navigated to `/boards/:newId` via
  `router.push`.
- **REQ-5.1.37** Cancel closes the drawer without persisting
  any of the staged fields.
- **REQ-5.1.38** The drawer pre-fills the lead-coordinator
  avatar with the current user's `useAuth().userEmail`
  (already in place from earlier passes; the wiring is
  unchanged).

### 6.4 Lifted overlay state

- **REQ-5.1.39** A new `useOverlayState` context
  (`src/features/board/overlays/useOverlayState.ts`) owns
  `shareModalOpen`, `createBoardOpen`, and the
  `onCreateBoard` callback (so the `page.tsx` empty state and
  the `BoardControlBar` both write to the same flag).
- **REQ-5.1.40** The context uses `useSyncExternalStore` to
  back the flags with `localStorage` (per-tab) so a refresh
  preserves the "share modal was open" state. (The state
  resets on a hard refresh because `localStorage` only sees
  the persisted value; in practice, the overlay close on
  refresh is the desired behaviour and the persistence is
  incidental — the contract is "the overlay stays open across
  React re-renders, not across page reloads.")

### 6.5 Backend changes that the wiring depends on

These are **owned by Phase 5** but referenced here for
traceability. See §7 of this document for the full
requirements.

- **REQ-5.2.13** Widen `POST /api/boards` body to accept
  `projectKey` (≤ 6 chars), `colorIdentity` (enum), and
  `template` (enum).
- **REQ-5.2.14** Widen `PATCH /api/boards/:id` body to accept
  `linkSharing` (enum).
- **REQ-5.2.15** Widen `PATCH /api/tasks/:id` body to accept
  `starred`, `priority`, `dueDate`, `storyPoints`, `labels`.
- **REQ-5.2.16** New `POST /api/tasks/:id/subtasks` and
  `PATCH /api/tasks/:id/subtasks/:subtaskId` and
  `DELETE /api/tasks/:id/subtasks/:subtaskId`.
- **REQ-5.2.17** New `POST /api/tasks/:id/comments` and
  `GET /api/tasks/:id/comments`.
- **REQ-5.2.18** New `PUT /api/tasks/:id/assignees` (replaces
  the full set with `{ userIds: string[] }`).
- **REQ-5.2.19** New `PATCH /api/boards/:id/members/:userId`
  with `{ role: "MEMBER" | "ADMIN" }`.

---

## 7. Frontend UX — Quick-Add Keyboard Shortcut

- **REQ-5.1.41** Typing `c` while no input is focused on the
  board view opens a centered `<QuickAddTaskModal />` with a
  single `<input>` for the task title + a column `<select>`.
  Submit on Enter; Esc cancels.
- **REQ-5.1.42** The shortcut handler is wired in
  `BoardView.tsx` via a `useEffect` that subscribes to
  `keydown` and short-circuits if `e.target` is an
  `<input>`, `<textarea>`, or `[contenteditable]`.
- **REQ-5.1.43** A small "?" help button in
  `BoardControlBar` opens a one-screen shortcut list (`<dl>`
  with `c`, `b`, `m`, `?`, `Esc`) rendered as a static
  modal. The list is hard-coded; no new state.
- **REQ-5.1.44 (stretch)** Typing `b` opens
  `CreateBoardDrawer`; typing `m` opens `ShareBoardModal`. Both
  are **stretch** — if the base quick-add (REQ-5.1.41) doesn't
  ship, the stretch is dropped.

---

## 8. Backend Quality — Input Validation Audit

- **REQ-5.2.1** A new `server/scripts/audit-routes.mjs` walks
  the Express app's route table (`app._router.stack`) and
  asserts that every non-`/health` route that is **not** a
  public auth route (`POST /api/auth/login`,
  `POST /api/auth/register`) has at least one `validate(...)`
  middleware in front of it. The script exits 1 on a miss and
  prints the offending route(s).
- **REQ-5.2.2** The audit script is run by `npm run lint`
  (added to the `lint` script: `tsc --noEmit && node
  scripts/audit-routes.mjs`) and by the Phase 5 CI workflow.
- **REQ-5.2.3** Any route flagged by the audit is fixed by
  prepending the missing `validate(Schema, source?)` middleware
  to its chain in the corresponding `*.routes.ts` file. The
  fix is a one-line change in the common case.
- **REQ-5.2.4** The error response envelope is the existing
  `{ error, details? }` (Phase 1) — no breaking change. The
  `details` field is populated from `ZodError.flatten()` or
  from a service-provided details object.
- **REQ-5.2.5** Every `:id` / `:boardId` / `:columnId` /
  `:taskId` path segment must be validated as a UUID via
  `validate(Schema, "params")` **before** the `loadBoard` /
  `loadColumn` / `loadTask` middleware runs (so a non-UUID
  id returns 400 rather than 404 — the existing Phase 1–4
  contract).

---

## 9. Backend Quality — Structured API Logging

- **REQ-5.2.6** Add `pino` and `pino-http` to
  `server/package.json` `dependencies`. The log level is
  controlled by a new `LOG_LEVEL` env var (default `info`).
- **REQ-5.2.7** A new `src/common/middleware/logger.middleware.ts`
  exports `requestLogger` (a configured `pinoHttp` instance)
  and `logger` (the underlying `pino` instance).
- **REQ-5.2.8** `requestLogger` is mounted **first** in
  `createApp()` (before `helmet`) so it sees every request.
  It attaches `req.id = crypto.randomUUID()` and sets the
  `X-Request-Id` response header.
- **REQ-5.2.9** Every request logs one structured line at
  `info`: method, URL, status, response time, request id,
  user id (if `req.user` is set). Every 4xx logs at `warn`;
  every 5xx logs at `error` with the error message and stack
  (5xx only — never leak stacks on 4xx).
- **REQ-5.2.10** The request body is **not** logged (PII risk
  — passwords, JWTs). The `authorization` header and any
  `password` field in the body are redacted by
  `pino-http`'s `redact` config.
- **REQ-5.2.11** In production (`NODE_ENV=production`), the log
  format is pino's default newline-delimited JSON. In
  development, `pino-pretty` is loaded as a dev-only transform
  (it's a `devDependency`).
- **REQ-5.2.12** The central error middleware
  (`error.middleware.ts`) replaces its `console.error` call
  with `logger.error({ err, reqId }, ...)`.

---

## 10. Backend Quality — Rate Limiting

- **REQ-5.2.20** Add `express-rate-limit` to
  `server/package.json` `dependencies`.
- **REQ-5.2.21** `src/common/middleware/rate-limit.middleware.ts`
  exports two pre-configured limiters:
  - `loginRateLimiter` — 10 attempts per IP per 15 minutes
    (sliding window) on `POST /api/auth/login`.
  - `registerRateLimiter` — 5 attempts per IP per hour
    (sliding window) on `POST /api/auth/register`.
- **REQ-5.2.22** Both limiters are mounted **only** on the
  routes in `src/modules/auth/auth.routes.ts`. They are not
  global.
- **REQ-5.2.23** The 429 response uses the existing
  `{ error: "Too many requests, try again later." }`
  envelope. The `Retry-After` header is set by
  `express-rate-limit`.
- **REQ-5.2.24** Behind a reverse proxy, `req.ip` is the
  proxy's IP. The default is `app.set("trust proxy", false)`;
  deployments behind a known proxy set
  `app.set("trust proxy", 1)`. The deployment readme
  documents this.

---

## 11. Backend Quality — Schema Additions for the Phase 5 UX

### 11.1 New fields on existing models

- **REQ-5.2.25** `Task` gains `starred: Boolean @default(false)`,
  `priority: String?` (one of `"LOW" | "MEDIUM" | "HIGH" |
  "URGENT"`), `dueDate: DateTime?`, `storyPoints: Int?`,
  `labels: String[] @default([])`.
- **REQ-5.2.26** `Task` gains a many-to-many relation
  `assignees: User[]` via a new `TaskAssignee` join model
  `{ taskId, userId }` with a composite primary key.
- **REQ-5.2.27** `Board` gains `linkSharing: LinkSharing
  @default(DISABLED)` (enum `{ DISABLED, VIEW }`),
  `projectKey: String?` (≤ 6 chars), `colorIdentity: String?`
  (one of `"PRIMARY" | "TERTIARY" | "SECONDARY" | "ERROR" |
  "OUTLINE"`), `template: String?` (one of `"SOFTWARE_ENG" |
  "INCIDENT_MGMT"`).
- **REQ-5.2.28** `BoardUser.role` is widened from a free-form
  `String` to an enum `BoardRole { OWNER, ADMIN, MEMBER }`
  with default `MEMBER`. A migration-time `UPDATE` sets
  every existing owner's row to `OWNER`:
  ```sql
  UPDATE "BoardUser" SET role = 'OWNER' WHERE "boardId" IN (
    SELECT id FROM "Board" WHERE "ownerId" = "BoardUser"."userId"
  );
  ```

### 11.2 New models

- **REQ-5.2.29** `TaskSubtask` —
  `{ id, taskId, title, done, position, createdAt }`. The
  `position` field is `String` and uses the Phase 4
  `lexoPosition` helper (same alphabet, same precision
  budget). Cascade delete on `Task`.
- **REQ-5.2.30** `TaskComment` —
  `{ id, taskId, authorId, body, createdAt }`. `body` is
  `String` with a max length of 5000 chars. Cascade delete
  on `Task`.

### 11.3 New endpoints (or widened bodies)

- **REQ-5.2.31** `PATCH /api/tasks/:id` widens its body
  schema to accept the new fields (`starred`, `priority`,
  `dueDate`, `storyPoints`, `labels`). `assignees` is
  rejected here — the dedicated endpoint owns them.
  Validation: `priority` is one of the four enum values;
  `dueDate` is a valid `Date.parse`-able string;
  `storyPoints` is an integer ≥ 0 and ≤ 99; `labels` is an
  array of strings each ≤ 32 chars.
- **REQ-5.2.32** `POST /api/tasks/:id/subtasks` —
  body `{ title }` (1–200 chars), 201 with the new subtask.
- **REQ-5.2.33** `PATCH /api/tasks/:id/subtasks/:subtaskId`
  — body `{ title?, done? }` (at least one required), 200.
- **REQ-5.2.34** `DELETE /api/tasks/:id/subtasks/:subtaskId`
  — 204.
- **REQ-5.2.35** `POST /api/tasks/:id/comments` —
  body `{ body }` (1–5000 chars), 201 with the new comment.
- **REQ-5.2.36** `GET /api/tasks/:id/comments` — returns the
  50 most recent comments, newest first, with `authorId`
  joined to the author's `email` for the avatar. 200.
- **REQ-5.2.37** `PUT /api/tasks/:id/assignees` —
  body `{ userIds: string[] }` (replaces the full set,
  returns 200 with the new assignees list).
- **REQ-5.2.38** `POST /api/boards` widens its body schema to
  accept `projectKey` (≤ 6 chars, uppercased server-side),
  `colorIdentity`, and `template`. Existing
  `{ title }`-only calls continue to work.
- **REQ-5.2.39** `PATCH /api/boards/:id` widens its body
  schema to accept `linkSharing` and the other new fields.
  Validation: `linkSharing` is one of `"DISABLED" | "VIEW"`.
- **REQ-5.2.40** `PATCH /api/boards/:id/members/:userId` —
  body `{ role: "MEMBER" | "ADMIN" }`, 200. The owner role
  is immutable (returns 400). The caller must be the board
  owner; non-owners get 403.

### 11.4 Authorization on the new endpoints

- **REQ-5.2.41** Every new endpoint chains `requireAuth →
  validate(Schema, "params") → loadBoard|loadTask → requireBoardAccess`
  (or `requireBoardOwner` for owner-only mutations like the
  role change on someone who isn't the caller). The existing
  Phase 1–4 middleware stack is reused — no new authz logic.

---

## 12. Testing — Backend `jest` Suite

- **REQ-5.3.1** Add `jest`, `ts-jest`, `@types/jest`, `supertest`,
  `@types/supertest` to `server/package.json` `devDependencies`.
  A new `jest.config.cjs` configures `ts-jest` with the
  `module: NodeNext` ESM transform.
- **REQ-5.3.2** The integration tests live under
  `server/src/__tests__/integration/`. One file per route group:
  `auth.test.ts`, `boards.test.ts`, `columns.test.ts`,
  `tasks.test.ts`, `board-invitations.test.ts`,
  `phase5-extensions.test.ts` (the new endpoints).
- **REQ-5.3.3** The integration tests use a per-test-file
  Prisma transaction (rolled back at teardown) so they don't
  pollute the dev DB. The `DATABASE_URL_TEST` env var is
  required; `jest.config.cjs` loads it via `dotenv/config`.
- **REQ-5.3.4** Service unit tests live under
  `server/src/modules/<name>/__tests__/<name>.service.test.ts`
  and cover the new fields, the new endpoints, and the
  widened bodies.
- **REQ-5.3.5** The `lexoPosition` invariants move into
  `server/src/common/utils/__tests__/lexoPosition.test.ts` as
  formal `describe` / `it` / `expect` cases. The smoke script
  (`lexoPosition.smoke.mjs`) is **kept** as a runnable artifact
  (it doubles as a quick local sanity check).
- **REQ-5.3.6** Coverage targets (measured by `jest
  --coverage`): **lines 80%, branches 70%**. The new Phase 5
  modules (`subtasks`, `comments`, `assignees`, `link-sharing`,
  `role-change`) are 100% covered.
- **REQ-5.3.7** `npm test` runs the full jest suite and exits
  non-zero on any failure. The script is added to
  `server/package.json`.

---

## 13. Testing — Frontend `vitest` Suite

- **REQ-5.3.8** Add `vitest`, `@vitest/coverage-v8`,
  `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `jsdom` to
  `client/kanban-board-client/package.json` `devDependencies`.
  A new `vitest.config.ts` configures the `jsdom` environment
  and the `src/**` include pattern.
- **REQ-5.3.9** Component tests live under
  `client/kanban-board-client/src/features/<name>/__tests__/`.
  Every Phase 5 component has at least one test.
- **REQ-5.3.10** `AuthScreen` tests cover: tab switch, form
  validation, `registerWithEmail` / `loginWithEmail` callbacks
  fire with the right args, the disabled SSO buttons don't fire
  anything.
- **REQ-5.3.11** `TaskModal` tests cover: title edit calls the
  right callback, subtask add / toggle, comment post, the trash
  confirm flow (one click → "Click again to confirm"; two clicks
  in 3s → DELETE), the Esc / backdrop close.
- **REQ-5.3.12** `ShareBoardModal` tests cover: invite row
  validation, the role `<select>` change (stages the change;
  Save Changes dispatches the PATCH), the remove (X) click
  (optimistic remove + rollback on error), the link-sharing
  toggle (if shipped; otherwise the test asserts the "Coming
  soon" toast).
- **REQ-5.3.13** `CreateBoardDrawer` tests cover: name input,
  project-key uppercase + maxlength, color swatch selection,
  template radio behavior, the `Create & Launch Board` button
  calls `useCreateBoardMutation` and routes to `/boards/:id`.
- **REQ-5.3.14** The new mutation hooks each have at least one
  test covering `onMutate` (optimistic insert) and `onError`
  (rollback). The hooks are:
  `useCreateTaskMutation`, `useUpdateTaskMutation`,
  `useCreateSubtaskMutation`, `useToggleSubtaskMutation`,
  `useCreateCommentMutation`, `useUpdateMemberRoleMutation`,
  `useCreateBoardMutation`.
- **REQ-5.3.15** `useAuth` tests cover `setToken` / `clearToken`
  round-trips through `localStorage` and assert that the
  `getUserSnapshot` cache holds the same object reference for
  the same raw `localStorage` string.
- **REQ-5.3.16** Coverage targets (measured by
  `@vitest/coverage-v8`): **lines 60%**. Lower than the
  backend because the visual surface is the focus; the tested
  components cover every interactive flow but not every style
  branch.
- **REQ-5.3.17** `npm test` runs the full vitest suite and
  exits non-zero on any failure.

---

## 14. Testing — PowerShell Phase 5 E2E

- **REQ-5.3.18** A new `server/phase5-e2e.ps1` script codifies
  the Phase 5 validation surface. The script is independent of
  `phase2-e2e.ps1` and `phase4-e2e.ps1` and uses its own email
  suffix so the three scripts can run back-to-back against the
  same dev server.
- **REQ-5.3.19** Section A (auth rate limiting, ~10 assertions)
  confirms: 11 login attempts within 15 min from the same IP
  returns 429 on the 11th; the 429 body is the correct envelope;
  6 register attempts within an hour returns 429 on the 6th.
- **REQ-5.3.20** Section B (Phase 5 schema additions, ~25
  assertions) confirms every new field round-trips through the
  new endpoints, every new endpoint returns the right status
  codes on the happy path, every 4xx case is covered, and the
  cross-board / soft-deleted guards repeat.
- **REQ-5.3.21** Section C (non-functional, ~15 assertions)
  confirms: `tsc --noEmit` and `npm run lint` exit 0 in both
  projects; `audit-routes.mjs` exits 0; the `X-Request-Id`
  header is present on every response; the 4xx envelope is
  consistent; pino log lines are JSON in production mode; the
  `lexoPosition` invariants still pass.
- **REQ-5.3.22** Section D (frontend static analysis, ~10
  assertions) confirms: the new client deps are in
  `client/kanban-board-client/package.json`; the new mutation
  hooks exist; the `Toast` component exists and exposes
  `role="status"`; the `motion.css` tokens file exists; the
  `useOverlayState` context exists; the compact-mode hook
  exists.
- **REQ-5.3.23** Expected output:
  `Phase 5 end-to-end: 60+ passed, 0 failed` (the exact count
  is finalized in `Validation.md` once the script is
  written).
- **REQ-5.3.24** The browser-driven visual checks (responsive
  layout, motion language, overlay wiring in a real browser)
  are out of scope for the script and live in
  `Validation.md`'s "Phase 5 — Step 14 Manual Verification"
  as a human-tickable list.

---

## 15. Deployment Readiness

- **REQ-5.4.1** A new `server/.env.example` lists every env var
  consumed by `src/config/env.ts`:
  `DATABASE_URL`, `JWT_SECRET`, `PORT` (default 4000),
  `BCRYPT_SALT_ROUNDS` (default 12), `JWT_EXPIRES_IN` (default
  `7d`), `LOG_LEVEL` (default `info`). Each line has a
  placeholder or a safe default.
- **REQ-5.4.2** The frontend's `NEXT_PUBLIC_API_URL` is **not**
  required; the default axios base URL is `http://localhost:4000`.
  Production deploys set it via the platform's env config.
- **REQ-5.4.3** The existing `GET /health` route (Phase 1)
  continues to return 200 / 503 and includes the DB ping. The
  Phase 5 contribution is a documentation block in the route
  file describing the contract.
- **REQ-5.4.4** A new `.github/workflows/ci.yml` defines a
  two-job pipeline: `lint-and-typecheck` (Node 22; `npm run
  lint` in both projects) and `e2e` (Node 22; Postgres 16
  service; `prisma migrate deploy`; `npm start` in the
  background; all three `phase*-e2e.ps1` scripts and the
  `lexoPosition` smoke script). The workflow runs on PRs
  targeting `main` and on pushes to `phase*` branches.
- **REQ-5.4.5** Husky is installed as a devDependency at the
  repo root. A `.husky/pre-commit` hook runs `lint-staged`,
  which in turn runs `eslint --fix` + `tsc --noEmit` on the
  staged files in the matching project.
- **REQ-5.4.6** `lint-staged` is configured to handle both
  the server (`server/src/**/*.ts`) and the client
  (`client/kanban-board-client/src/**/*.{ts,tsx}`). The hook
  is fast (only staged files are touched) and catches the
  easy mistakes (import order, unused vars, missing `await`)
  before they leave the developer's machine.

---

## 16. Non-Functional Requirements

- **REQ-5.5.1** All new backend code is TypeScript with strict
  mode. `npx tsc --noEmit` passes in both projects.
- **REQ-5.5.2** The codebase remains ESM-native: every relative
  import in new server code uses the `.js` extension
  (`module: NodeNext`, `verbatimModuleSyntax: true`).
- **REQ-5.5.3** No new top-level **client** dependencies are
  added beyond the Phase 5 list (no `framer-motion`, no
  `zustand`, no `react-hook-form`). The `useOverlayState`
  context is a 50-line React context with no external dep.
- **REQ-5.5.4** The new server dependencies are exactly:
  `pino`, `pino-http` (logging), `express-rate-limit` (auth
  rate limiting). The new server devDependencies are exactly:
  `jest`, `ts-jest`, `@types/jest`, `supertest`,
  `@types/supertest`, `pino-pretty` (dev only), Husky
  tooling.
- **REQ-5.5.5** Domain errors on the server are surfaced via
  `HttpError(status, message)` and handled by the central
  error middleware (Phase 1). The new endpoints (REQ-5.2.13
  through 5.2.40) all use the same convention.
- **REQ-5.5.6** Controllers remain thin: all business logic
  and DB access lives in the service layer. Controllers read
  `req` and call the service.
- **REQ-5.5.7** The new mutation hooks on the frontend
  (`useCreateTaskMutation`, `useUpdateTaskMutation`,
  `useCreateSubtaskMutation`, `useCreateCommentMutation`,
  `useUpdateMemberRoleMutation`, `useCreateBoardMutation`)
  follow the same `onMutate` (optimistic insert) →
  `onError` (snapshot rollback + toast) → `onSettled`
  (cache invalidation) pattern that the Phase 4
  `useMoveTaskMutation` established.
- **REQ-5.5.8** Every new server endpoint chains
  `requireAuth → validate(Schema, "params") → loadBoard |
  loadColumn | loadTask → requireBoardAccess |
  requireBoardOwner` per the Phase 1–4 convention. The
  `loadBoard` / `loadColumn` / `loadTask` middlewares
  auto-populate `req.board` / `req.column` / `req.task` for
  the downstream `require*` checks.
- **REQ-5.5.9** The Phase 5 `position: String` re-keying
  for `TaskSubtask` reuses the Phase 4 `lexoPosition`
  helper (same alphabet, same precision budget). No inline
  position math.
- **REQ-5.5.10** No new top-level routes are added that
  bypass the existing access-control layer. Every route
  uses `loadBoard` / `loadColumn` / `loadTask` +
  `requireBoardAccess` (or `requireBoardOwner` for
  owner-only mutations).
- **REQ-5.5.11** Phase 5 introduces no schema-level soft
  delete on tasks, subtasks, or comments. Hard delete
  from Phase 3 is preserved; the cascade rules from
  Phase 4 (`Task → Column`, `Task → Subtasks`, `Task →
  Comments`, `Task → Assignees`) keep the deletes atomic.
- **REQ-5.5.12** Phase 5 introduces no real-time / WebSocket
  sync. The optimistic-update + cache-invalidation pattern
  from Phase 4 remains the reconciliation strategy.
