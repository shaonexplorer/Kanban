# Phase 5 — Polishing & Polish: Implementation Plan

## Overview

Phase 5 turns the working Phase 4 prototype into something that
feels deliberate, ships with confidence, and is pleasant to run on
any developer machine. It has four work-streams, taken straight
from `specs/Roadmap.md` §5:

1. **Frontend UX** — responsive board layout, column task counters,
   quick-add tasks, intentional motion language, and loading / error
   states that don't read as defaults.
2. **Backend quality** — a uniform input-validation audit,
   structured API logging, and rate limiting on the auth surface.
3. **Testing** — promote the `lexoPosition` smoke script to a real
   `jest` suite, add a per-module backend integration suite, codify
   the Phase 5 validation surface in a new `server/phase5-e2e.ps1`
   script, and write a manual frontend checklist for the parts that
   still need a human.
4. **Deployment readiness** — `.env.example` for the server, harden
   the existing `GET /health` route for orchestrators, set up Husky
   + lint-staged, and a GitHub Actions CI workflow that mirrors the
   local `tsc` + `eslint` + PowerShell-e2e gate.

The Phase 5 real-auth UI (`AuthScreen` at `src/app/page.tsx`), the
`TaskModal`, the `ShareBoardModal`, and the `CreateBoardDrawer`
have already been authored in earlier passes and live in
`client/kanban-board-client/src/features/auth/AuthScreen.tsx` and
`client/kanban-board-client/src/features/board/components/`. They
are listed below in **"Already shipped"** so the rest of the plan
is the remaining work, not a re-implementation. Phase 5's
contribution for those surfaces is the **wiring** step: turn each
overlay's local `useState` setters into TanStack Query mutations
against the (existing or upcoming) backend endpoints.

---

## Prerequisites (from Phase 1, 2, 3 & 4)

- Phase 4's board view with `@dnd-kit` + TanStack Query is complete
  and reorders / cross-column moves / column moves work end-to-end
  with optimistic updates and rollback.
- `server/phase2-e2e.ps1` (48 assertions), `phase4-e2e.ps1` (58
  assertions), and `phase4-step7-e2e.ps1` (32 assertions) all pass
  against the current dev server.
- `lexoPosition` is the only place on the server that produces or
  consumes `position` strings; the helper is unit-tested by
  `server/lexoPosition.smoke.mjs` (24 invariants, all passing).
- `prisma migrate` is clean, the dev server starts on port 4000,
  and the Next.js dev server starts on port 3000.
- `GET /health` already exists (Phase 1) and returns
  `{ status: "ok", timestamp, db: "up" }` on success and
  `{ status: "degraded", timestamp, db: "down", error }` on DB
  failure.
- The central error middleware (`src/common/errors/error.middleware.ts`)
  already maps `HttpError`, `ZodError`, and Prisma's known
  `P2002` / `P2025` codes; the `validate(zodSchema, source?)`
  middleware already runs in front of every Phase 1–4 route.
- `AuthContext` (`src/features/auth/AuthContext.tsx`) exposes
  `registerWithEmail`, `loginWithEmail`, `setToken`, and
  `clearToken`, all wired to the existing axios instance.

## Already Shipped (from earlier passes; not re-implemented here)

These are documented in `CLAUDE.md` and exist in the working tree.
Phase 5 plans the **wiring** that turns them from local-state
surfaces into round-tripped ones; it does not re-author them.

| Surface | Location | Status before Phase 5 |
| --- | --- | --- |
| `AuthScreen` (sign-in / create-account tabs, SSO buttons disabled) | `client/kanban-board-client/src/features/auth/AuthScreen.tsx` | Wired to `POST /api/auth/login` and `POST /api/auth/register`; the home page renders it on logged-out visits and auto-redirects logged-in visitors to their first board. |
| `TaskModal` (~760px, two-column body + metadata sidebar, autosave footer) | `client/kanban-board-client/src/features/board/components/TaskModal.tsx` | Local state only (title edit, subtask add/toggle, comment post). |
| `ShareBoardModal` (port of `.stitch-cache/share.html#shareModal`) | `client/kanban-board-client/src/features/board/components/ShareBoardModal.tsx` | Local state only (invite row, link-sharing toggle, copy state). Reads `board.members` from `useBoardQuery`. |
| `CreateBoardDrawer` (port of `.stitch-cache/share.html#createBoardDrawer`) | `client/kanban-board-client/src/features/board/components/CreateBoardDrawer.tsx` | Local state only (board name, project key, color identity, template). |
| `BoardView` open-state ownership | `client/kanban-board-client/src/features/board/BoardView.tsx` | Owns `shareModalOpen` / `createBoardOpen` flags and the body-scroll lock. |
| `BoardControlBar` triggers | `client/kanban-board-client/src/features/board/components/BoardControlBar.tsx` | Renders the `New Board` / `Manage Access` / `New Task` controls that open the overlays. |
| `Icon` (Material Symbols silhouette) | `client/kanban-board-client/src/features/board/components/Icon.tsx` | One file owns every glyph used by the auth screen, the board chrome, the task modal, the share modal, and the create-board drawer. |
| `UserAvatar` (initials, email-derived color) | `client/kanban-board-client/src/features/board/components/UserAvatar.tsx` | Used by the sidebar, the share modal, and the task modal metadata sidebar. |
| Kinetic Grid tokens | `client/kanban-board-client/src/design/tokens.css` | Source of truth for color / spacing / radius / typography. |
| `lib/api.ts` (axios + cookie) | `client/kanban-board-client/src/lib/api.ts` | The single fetch wrapper; the httpOnly `token` cookie is attached automatically via `withCredentials: true` (Phase 5 Step 8 migration). |
| Board-settings menu in `<BoardHeader />` | `client/kanban-board-client/src/features/board/components/BoardHeader.tsx` (state + UI) + `BoardView.tsx` (handlers) | Owner-only `more_horiz` between bell and avatar opens Rename + Delete. The form state (`renamingBoard` + `renameDraft`) and the mutation calls live in `BoardView` (parent) — `BoardHeader` is purely presentational. Rename → `useUpdateBoardMutation`; Delete → `useDeleteBoardMutation`. The `["boards"]` list cache is the single source of truth — the same query feeds the Sidebar and the home page. Always visible on every tier (compact/tablet/desktop) because the header is always mounted. |

---

## Architectural Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Test framework | **`jest`** for the backend (matches `specs/Techstack.md`), **`vitest`** for the frontend (faster, native ESM, plays nicely with the Next.js + Tailwind v4 setup; the `specs/Techstack.md` "Frontend component tests" line is optional) | `jest` is already listed in `specs/Techstack.md` for the backend; for the frontend, `vitest` avoids the heavyweight Babel transform step the project doesn't need. The two runners don't share a config — that's a feature, not a bug, because the test surfaces are different. |
| Test layout — backend | `server/src/modules/<name>/__tests__/<name>.service.test.ts` for unit tests + `server/src/__tests__/integration/<route>.test.ts` for the HTTP integration suite (uses `supertest` against the in-process Express app) | Mirrors the existing `src/modules/<name>/` layout so the test file is adjacent to the code it covers. |
| Test layout — frontend | `client/kanban-board-client/src/features/<name>/__tests__/<file>.test.tsx` (colocated with the component), run with `vitest` + `@testing-library/react` + `jsdom` | Same rationale. |
| E2E script | **New `server/phase5-e2e.ps1`** that codifies the Phase 5 validation surface, complementary to the existing `phase2-e2e.ps1` and `phase4-e2e.ps1`. Each script uses a unique email suffix, so they can run back-to-back. | The existing PowerShell scripts are the project's "live API + DB" source of truth; adding a new script for Phase 5 keeps that discipline and keeps each script focused. |
| Logging library | **`pino`** with `pino-http` (request/response logger middleware) | `pino` is the lowest-overhead structured logger in the Node ecosystem; `pino-http` produces one line per request with status, latency, and a request id. No new transitive dependencies matter — the team already has helmet, cors, and zod in production. |
| Rate limiting | **`express-rate-limit`** on `/api/auth/*` (login, register) only | The plan targets the auth surface because that's where credential stuffing and registration abuse land. Per-route limiters are easier to reason about than a global one, and Phase 5's threat model is "abuse via auth" — not "abuse via boards." |
| Request id | **`crypto.randomUUID()`** set by the request-logger middleware, returned in the `X-Request-Id` response header, and stamped into every `console.error` / `pino` log line | One header so a developer can grep their browser's network tab against the server log. UUID v4 is cheap (no external dep). |
| Motion language | Tailwind utility classes (`transition`, `duration-200`, `ease-in-out`) + dnd-kit's built-in `DragOverlay` for drag animations; the Phase 4 placeholder toast is promoted to a real slide-in toast on the bottom-right | Phase 4 deliberately left motion out (`REQ-4.5.19`); Phase 5 introduces it but keeps it small and consistent. No `framer-motion` dep — the project's existing utility classes cover every animation needed. |
| Responsive strategy | Horizontal-scroll board for `< md`, three-column "card view" summary for `< sm`, sidebar collapses to icons at `< lg`; `useMediaQuery` (or CSS `@media`) drives the layout swap | A kanban board doesn't have a "mobile" layout that genuinely works (drag-and-drop on touch is awkward), so Phase 5 picks a graceful degradation rather than a half-baked port. The control bar's primary actions remain reachable on small screens. |
| Quick-add tasks | A "+ Add task" affordance at the bottom of each column expands into an inline `<input>` + a Submit button; the optimistic TanStack mutation hits the existing `POST /api/columns/:columnId/tasks` endpoint | Reuses the existing `tasks` create endpoint and the `lexoPosition.between(max, null)` happy path. No new backend work. |
| Column counters | Render a `{n}` chip in the column header, where `n = tasks.length`; updates on every move / create / delete via the React Query cache | One read of the in-memory array; no new server call. |
| Overlay wiring (TaskModal, ShareBoardModal, CreateBoardDrawer) | Each `useState` setter is replaced by a TanStack `useMutation`; mutations invalidate the relevant query keys so the surface re-renders with server state. Errors surface as a `role="status"` toast (already present from Phase 4) and the optimistic update is rolled back to the snapshot taken at `onMutate` time | The Phase 4 `useMoveTaskMutation` is the proven template; the new mutations follow the same `onMutate` / `onError` / `onSettled` shape. |
| Task CRUD PATCH endpoint | Phase 5 adds `PATCH /api/tasks/:id` on the server (it already exists from Phase 3 — `UpdateTaskSchema` allows `title` and `description` partials) so the `TaskModal` can persist its edits | Reuses the existing endpoint; no new server code is needed for title / description persistence. |
| Task comment endpoint | **New** `POST /api/tasks/:id/comments` + `GET /api/tasks/:id/comments` (returns paginated latest-first comments) | Phase 3 left a `TaskComment` model out of the schema; Phase 5 adds it (Step 1 of §5.2 below). |
| Member-role update endpoint | **New** `PATCH /api/boards/:id/members/:userId` (body `{ role: "MEMBER" | "ADMIN" }`) | The `ShareBoardModal` already exposes a per-row role `<select>`; Phase 5 wires it to a real endpoint. |
| Environment configuration | `server/.env.example` lists every env var consumed by `src/config/env.ts` (DATABASE_URL, JWT_SECRET, PORT, BCRYPT_SALT_ROUNDS, JWT_EXPIRES_IN) with safe placeholders | The `.env*` files are already gitignored; the example makes onboarding a one-step `cp`. |
| CI | GitHub Actions: `lint-and-typecheck` job (`tsc --noEmit` + `eslint` in both projects) + `e2e` job (`npm run build` + start the server, run all three `phase*-e2e.ps1` scripts and the `lexoPosition` smoke against it) | The CI is "the same commands a developer runs locally" — nothing magical. It runs on PRs targeting `main` and on pushes to `phase*` branches. |
| Git hooks | **Husky** + **lint-staged**: pre-commit runs `eslint --fix` on staged files + the matching `tsc --noEmit` for the touched project | A small hook catches the easy mistakes (lint failures, import-order drift) before they leave the developer's machine. The full `tsc` / e2e suite stays in CI — the hook is fast. |
| **`framer-motion` (or similar) for the toast / overlay open animations** | **No** — the existing `animate-in fade-in zoom-in-95 duration-200` class is already used by the TaskModal / ShareBoardModal and works without an extra dep | One less dep, one less version skew, and the existing pattern is consistent. |
| **Dark mode** | **No** — out of scope for Phase 5; the tokens file already exposes light variables only and the Stitch-faithful components target a light surface. Dark mode is a future phase. | The roadmap doesn't list it; introducing it now would derail the motion / responsive / testing work. |

---

## Step 1 — Frontend UX: Responsive Layout

### 1.1 Breakpoints

Define three layout tiers (Tailwind's defaults already cover the
breakpoints; no `tailwind.config.js` extension is needed because
Tailwind v4 is config-free):

| Tier | Width | Layout |
| --- | --- | --- |
| `compact` | `< 640px` (`< sm`) | Sidebar collapsed to a hamburger menu that slides over the board. Board view becomes a **single-column "lane focus"** view: the user picks one column at a time from a tab strip at the top. Task cards stack vertically. No drag-and-drop (the `PointerSensor` is still wired but the task becomes tap-to-open instead of drag-to-move). |
| `tablet` | `640px–1023px` (`sm`–`md`) | Sidebar shows icons only. Board is a horizontal scroll; columns are `min-w-[280px]`. Drag-and-drop works with the `PointerSensor`. |
| `desktop` | `≥ 1024px` (`md`+) | Full sidebar (icon + label), board is a horizontal scroll with `min-w-[320px]` columns, drag-and-drop works with both `PointerSensor` and `KeyboardSensor`. |

### 1.2 Sidebar collapse

- A `useMediaQuery("(min-width: 1024px)")` (custom 8-line hook that
  subscribes to `window.matchMedia`) drives a `isDesktop` boolean
  in `SidebarHeader`.
- On compact / tablet, the sidebar is hidden by default and a
  hamburger button in the board header (`BoardHeader.tsx`) toggles
  a slide-in drawer. The drawer is a 100% width on compact, 320px
  on tablet, and is dismissed by a backdrop click or Esc.
- On desktop, the sidebar is visible by default and the hamburger
  button is replaced with a chevron that collapses the sidebar to
  icons-only (the "tablet" layout).

### 1.3 Compact board view (the "lane focus" view)

- On compact, render a tab strip (`<div role="tablist">`) above the
  board with one tab per column. Selecting a tab shows only that
  column. The previous / next column buttons (chevron left / right)
  move between tabs.
- Drag-and-drop is disabled on compact. A task's "move to another
  column" action is exposed through the `TaskModal`'s metadata
  sidebar (the `Move to column` `<select>` already exists in the
  modal surface from earlier passes; Phase 5 wires it to
  `useMoveTaskMutation`).
- The `AddColumnGhost` and `BoardControlBar` controls remain
  reachable on compact via a sticky bottom action bar.

### 1.4 The board on tablet / desktop

- The Phase 4 horizontal-scroll layout is preserved on tablet and
  desktop — no change to the dnd-kit machinery, the column
  widths, or the sortable contexts.
- Add a "scroll-to-end" affordance: a floating right-edge chevron
  button appears when more columns are off-screen.

---

## Step 2 — Frontend UX: Column Counters + Quick-Add

### 2.1 Column task counter

- `ColumnShell.tsx` already renders a column header. Add a
  `{n}` chip to the right of the column title. `n` is read from
  the column's `tasks.length` (no new server call, no new
  selector).
- The chip is a small `rounded-full` pill with the surface-container
  background and `text-on-surface-variant` color from the
  Kinetic Grid tokens. When `n === 0`, the chip is rendered with
  reduced opacity so the column reads as "empty" without the chip
  disappearing (users still see the affordance exists).
- The chip updates automatically on every move / create / delete
  because it reads from the React Query cache.

### 2.2 Quick-add task

- `ColumnShell.tsx` adds an "inline quick-add" affordance at the
  bottom of the task list:
  - Default state: a `+ Add task` button (icon + label).
  - Click → expands into an inline `<input>` + a Submit button +
    a Cancel (×) button.
  - Submit on Enter; Cancel on Esc.
  - On submit, the input calls
    `useCreateTaskMutation.mutate({ columnId, title })`. While the
    mutation is in flight, the input is disabled and a spinner
    replaces the Submit button. On success, the input clears and
    stays open so the user can add multiple tasks in a row. On
    error, the input is re-enabled and the error is surfaced in the
    `role="status"` toast.
- The new mutation:
  ```ts
  // features/board/useCreateTaskMutation.ts
  useMutation({
    mutationFn: ({ columnId, title }) => api.post(`/api/columns/${columnId}/tasks`, { title }),
    onMutate:   ({ columnId, title }) => { /* optimistic insert at the end of the column */ },
    onError:    (_err, _vars, _ctx) => { /* restore snapshot, show toast */ },
    onSettled:  () => { queryClient.invalidateQueries({ queryKey: ["board", boardId] }) },
  });
  ```
- The endpoint already exists (`POST /api/columns/:columnId/tasks`,
  Phase 3). No new server work for the happy path; only the
  description is optional and can be left `null`.

---

## Step 3 — Frontend UX: Intentional Motion Language

### 3.1 The baseline

Phase 4 deliberately shipped with no custom motion
(`REQ-4.5.19`). Phase 5 introduces a small, consistent vocabulary
that lives in `src/design/motion.css` (a new file alongside
`tokens.css`):

| Token | Value | Used for |
| --- | --- | --- |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default for most transitions. |
| `--ease-emphasized` | `cubic-bezier(0.3, 0, 0, 1)` | Overlay open / close (TaskModal, ShareBoardModal, CreateBoardDrawer). |
| `--duration-fast` | `120ms` | Hover, focus rings, button press. |
| `--duration-medium` | `200ms` | Overlay open / close, column re-order settling. |
| `--duration-slow` | `320ms` | Sidebar slide-in, compact-mode tab transition. |

Expose them as Tailwind v4 `@theme` keys so utility classes like
`duration-(--duration-medium)` work without an extension file.

### 3.2 What gets motion

- **Overlays** — the existing `animate-in fade-in zoom-in-95
  duration-200` (TaskModal, ShareBoardModal) stays; replace the
  ad-hoc class with the new token-driven utility so the timing is
  consistent.
- **Toast** — the Phase 4 `<div role="status">` placeholder is
  promoted to a real toast (`features/board/components/Toast.tsx`).
  Slide in from the bottom-right (`translate-y-2 → 0`,
  `opacity-0 → 1`) over `var(--duration-medium)`, auto-dismiss
  after 4s, hover pauses the dismiss timer, click dismisses.
- **DragOverlay** — keep dnd-kit's default; the column / task
  cards already use the `DragOverlay` for the in-flight visual.
- **Sidebar collapse** — `transition-[width] duration-(--duration-slow)
  ease-(--ease-standard)` on the sidebar's outer wrapper.
- **Column counter** — the chip animates its color when `n` changes
  (a 200ms `bg` transition so the eye catches the update without
  a flashy scale-in).

### 3.3 What stays still

- Board view initial mount (no fade-in on the columns — they
  should be readable immediately).
- The dnd-kit `DragOverlay` snap (it's already animated by
  dnd-kit; we don't re-animate it).
- Loading skeletons (the board view's `<Skeleton />` placeholder
  uses a subtle `animate-pulse` from Tailwind; no change).

---

## Step 4 — Frontend UX: Loading & Error States

Phase 4 already has a basic loading state (`useBoardQuery.isLoading`)
and an error state (`useBoardQuery.isError`) in `BoardView.tsx`.
Phase 5 hardens them and adds the missing empty states.

### 4.1 Loading state

- Replace the Phase 4 "spinner" with a skeleton: three ghost
  columns with five ghost task cards each. Skeletons use
  `animate-pulse bg-surface-container-lowest rounded-(--radius-md)`.
- The skeleton is rendered inside the same `<main>` slot so the
  board's chrome (header, sidebar, control bar) is already
  visible. No layout shift when the real data lands.

### 4.2 Error state

- `BoardView` shows a full-bleed error card with a "Try again"
  button that calls `queryClient.invalidateQueries({ queryKey:
  ["board", id] })`.
- The card distinguishes between:
  - **Network error** (no response) → "Couldn't reach the server.
    Check your connection and try again."
  - **Auth error (401)** → "Your session expired. Sign in again."
    (button routes to `/`)
  - **Forbidden (403)** → "You don't have access to this board."
  - **Not found (404)** → "This board doesn't exist or has been
    deleted."

### 4.3 Empty state (no boards)

- `page.tsx` already handles the `boards.length === 0` case for
  logged-in users. Phase 5 promotes the inline status message to
  a real empty-state card with a "Create your first board" button
  that opens the `CreateBoardDrawer` (the drawer's open state is
  lifted to a context or to the `page.tsx` tree).

### 4.4 Empty state (no tasks in a column)

- A column with `tasks.length === 0` shows a centered "No tasks
  yet — add one to get started" line in the column body, with the
  `+ Add task` affordance right below.

---

## Step 5 — Frontend UX: Wiring the Phase 5 Overlays

The `TaskModal`, `ShareBoardModal`, and `CreateBoardDrawer` already
exist as local-state surfaces. Phase 5 turns their setters into
real mutations.

### 5.1 TaskModal wiring

- **Edit title / description** — `PATCH /api/tasks/:id` (already
  exists from Phase 3). The mutation is debounced 600ms so the
  user typing doesn't fire a request per keystroke; the autosave
  footer's "Autosaved live to {board}" text reflects the
  in-flight / settled state.
- **Toggle / add subtask** — **new** `POST /api/tasks/:id/subtasks`
  and `PATCH /api/tasks/:id/subtasks/:subtaskId` (body `{ done }`).
  The subtask model is added to the Prisma schema in §10.1.
- **Post comment** — **new** `POST /api/tasks/:id/comments`. The
  model is added in §10.1.
- **Status / priority / column / due date / assignees / labels /
  story points** — `PATCH /api/tasks/:id` accepts a partial that
  includes the new fields (the schema migration in §10.1 widens
  `Task` to support them).
- **Trash** — calls `DELETE /api/tasks/:id` (already exists),
  closes the modal, and shows a "Task deleted" toast with an
  "Undo" button that re-creates the task (Phase 5 keeps "Undo"
  simple — a 5-second window where the cached task can be
  re-posted; full optimistic-undo is out of scope).
- **Star** — `PATCH /api/tasks/:id` with `{ starred: true | false }`
  (the new field in §10.1).

### 5.2 ShareBoardModal wiring

- **Send Invite** — `POST /api/boards/:id/members` with
  `{ email, role: "MEMBER" }` (already exists from Phase 2). The
  modal optimistically appends the email to the collaborators
  list with a "pending" badge; on success the badge clears; on
  error the row is removed and a toast surfaces the error.
- **Remove a member** — `DELETE /api/boards/:id/members/:userId`
  (already exists from Phase 2). The row is optimistically
  removed; on error the row is restored.
- **Change a member's role** — **new** `PATCH /api/boards/:id/members/:userId`
  with `{ role: "MEMBER" | "ADMIN" }`. The model change is in
  §10.1.
- **"Anyone with the link can view" toggle** — **new**
  `PATCH /api/boards/:id` body `{ linkSharing: "DISABLED" |
  "VIEW" }` (the new field in §10.1). The toggle is a stretch
  goal — if the backend change is too big for the phase, ship the
  toggle as a no-op that just toasts "Coming soon" and document it
  as a known gap in `Validation.md`.
- **Save Changes footer** — becomes a real save that fires the
  pending role changes in a batch (Phase 5 uses sequential
  `PATCH` calls; a true batch endpoint is out of scope).

### 5.3 CreateBoardDrawer wiring

- **Create & Launch Board** — `POST /api/boards` with
  `{ title, projectKey, colorIdentity, template }` (the
  `POST /api/boards` endpoint already exists from Phase 2 with
  the minimal `{ title }` body; Phase 5 widens its body to
  accept the new fields). On success, the drawer closes and the
  user is navigated to `/boards/:newId`.
- **Project key, color identity, template** — are persisted to
  the new fields on `Board` (see §10.1); if the field is omitted,
  the server falls back to the Phase 2 default (e.g. `title`
  only).

### 5.4 Lifted state

- The `CreateBoardDrawer` can be opened from two places: the
  `BoardControlBar`'s `New Board` button AND the `page.tsx` empty
  state. To avoid prop-drilling, Phase 5 introduces a tiny
  `useOverlayState` zustand-style context (3 files, ~50 lines,
  no external dep) that owns `shareModalOpen`, `createBoardOpen`,
  and `selectedBoardId`. The `BoardControlBar` writes to it; the
  `page.tsx` empty state writes to it; `BoardView` reads from it
  and renders the overlays.

> **Why a tiny context instead of zustand:** the spec's
> "Tech stack" lists `zustand` as a *planned* library; adding it
> for one overlay-flag use case is overkill. A 50-line React
> context with `useSyncExternalStore` is the right size and
> matches the project's existing `AuthContext` pattern.

---

## Step 6 — Frontend UX: Quick-Add Keyboard Shortcut

- A global "Quick-add task" shortcut: typing `c` (no input is
  focused) opens a centered modal (`<QuickAddTaskModal />`) with
  a single input for the task title + a column selector. Submit
  hits the same `POST /api/columns/:columnId/tasks` endpoint and
  closes the modal. Esc cancels.
- The shortcut is wired in `BoardView.tsx` with a `useEffect` that
  subscribes to `keydown` and checks `e.target` isn't an input.
- Document the shortcut in a small "?" help button in the control
  bar that opens a one-screen shortcut list (the list is a static
  `<dl>` — no new state).

> **Stretch:** typing `b` opens `CreateBoardDrawer`, `m` opens
> `ShareBoardModal`. Both are explicitly stretch goals and ship
> only if Step 5.4 lands first.

---

## Step 7 — Backend Quality: Input Validation Audit

Phase 1–4 already use the `validate(zodSchema, source?)` middleware
on every controller method. Phase 5's contribution is a
**uniformity audit** + a few targeted additions:

1. **Audit script** — `server/scripts/audit-routes.mjs` (a small
   Node script, not part of the runtime) walks the Express app's
   route table (`express.Router`'s `.stack`) and asserts every
   non-`/health` route that is not a public auth route (i.e.
   `POST /api/auth/login`, `POST /api/auth/register`) has at
   least one `validate(...)` middleware in front of it. Exits 1
   on a miss. Run by `npm run lint` and by the CI workflow.
2. **Response shape envelope** — add a small `envelope` helper
   for success responses so `{ data: ... }` and `{ error, details }`
   are consistent. Existing handlers keep their current shapes
   (no breaking change), but the error middleware already uses
   the `{ error, details? }` shape so the document is the
   contract.
3. **Tighten the param UUIDs** — confirm every `loadBoard` /
   `loadColumn` / `loadTask` route validates its `:id` /
   `:columnId` / `:boardId` / `:taskId` path segment with
   `validate(Schema, "params")`. A few Phase 2 routes were
   authored before the `validate(... "params")` convention
   existed; the audit (item 1) catches them. Phase 5 fixes any
   misses — usually a one-line `validate(BoardIdParamSchema,
   "params")` prepended to the chain.

---

## Step 8 — Backend Quality: Structured API Logging

### 8.1 Dependencies

```bash
cd server
npm install pino pino-http
npm install -D @types/pino-http
```

Both are dev/runtime deps; `pino` is the logger, `pino-http` is
the Express middleware that emits one structured log line per
request.

### 8.2 Configuration

- A new `src/common/middleware/logger.middleware.ts` exports
  `requestLogger` (a configured `pinoHttp` instance) and `logger`
  (the underlying `pino` instance for use elsewhere).
- Log level is read from `LOG_LEVEL` (new env var, defaults to
  `info`). Log format is `pino`'s default JSON in production;
  in development, `pino-pretty` is loaded as a dev-only transform
  via `transport: { target: "pino-pretty" }`.
- The `requestLogger` middleware is mounted **first** in
  `createApp()` (before `helmet`) so it sees every request. It
  attaches `req.id` (a `crypto.randomUUID()`) and sets the
  `X-Request-Id` response header.

### 8.3 What gets logged

- **Every request** (info): method, URL, status, response time,
  request id, user id (if `req.user` is set by `authMiddleware`).
- **Every 4xx/5xx** (warn / error): same fields + the error
  message + the error stack (5xx only — never leak stacks on 4xx).
- The central error middleware (`error.middleware.ts`) replaces
  its `console.error` call with `logger.error({ err, reqId }, ...)`.

### 8.4 What does NOT get logged

- Request bodies (PII risk — passwords, JWTs). The middleware
  redacts the `authorization` header and any `password` field.
- The full Prisma query log (that's a Prisma-level concern; the
  existing `prisma:studio` setup already covers debug-time query
  inspection).

---

## Step 9 — Backend Quality: Rate Limiting on Auth

### 9.1 Dependencies

```bash
cd server
npm install express-rate-limit
```

### 9.2 Configuration

- `src/common/middleware/rate-limit.middleware.ts` exports two
  pre-configured limiters:
  - `loginRateLimiter` — 10 attempts per IP per 15 minutes on
    `POST /api/auth/login`. Sliding window.
  - `registerRateLimiter` — 5 attempts per IP per hour on
    `POST /api/auth/register`. Sliding window.
- Both are mounted **only** on the routes in
  `src/modules/auth/auth.routes.ts`. The 429 response uses the
  existing `{ error: ... }` envelope:
  `res.status(429).json({ error: "Too many requests, try again later." })`.

### 9.3 Edge cases

- Behind a reverse proxy, `req.ip` is the proxy's IP. Phase 5
  documents this as a known gap in `Validation.md` and recommends
  `app.set("trust proxy", 1)` when deployed behind a known proxy
  (e.g. on Render or Railway). The default is `false` so dev
  works without surprises.
- The limiters are **not** global; per-IP throttling on the auth
  surface only.

---

## Step 10 — Backend Quality: Schema Additions for the Phase 5 UX

The Phase 5 frontend wants to persist more fields than the Phase
3 schema holds. The additions are small, additive, and don't
break the existing API contract.

### 10.1 New fields

| Model | New field | Type | Default | Used by |
| --- | --- | --- | --- | --- |
| `Task` | `starred` | `Boolean` | `false` | The star button in `TaskModal` header. |
| `Task` | `priority` | `String?` (one of `"LOW" | "MEDIUM" | "HIGH" | "URGENT"`) | `null` | The priority chip in `TaskModal` metadata sidebar. |
| `Task` | `dueDate` | `DateTime?` | `null` | The due date picker. |
| `Task` | `storyPoints` | `Int?` | `null` | The story-points field. |
| `Task` | `labels` | `String[]` (Prisma scalar list) | `[]` | The labels editor. |
| `Task` | `assignees` | many-to-many to `User` (new `TaskAssignee` join) | n/a | The assignees chip. |
| `Board` | `linkSharing` | `enum LinkSharing { DISABLED, VIEW }` | `DISABLED` | The share-modal toggle. |
| `Board` | `projectKey` | `String?` (≤ 6 chars) | `null` | The create-board drawer. |
| `Board` | `colorIdentity` | `String?` (one of `"PRIMARY" | "TERTIARY" | "SECONDARY" | "ERROR" | "OUTLINE"`) | `null` | The drawer's color swatches. |
| `Board` | `template` | `String?` (one of `"SOFTWARE_ENG" | "INCIDENT_MGMT"`) | `null` | The drawer's template cards. |
| `BoardUser` | `role` | widen from `String` to `enum BoardRole { OWNER, ADMIN, MEMBER }` | `MEMBER` | The share-modal role `<select>`. |

### 10.2 New models

- **`TaskSubtask`** — `{ id, taskId, title, done, position, createdAt }`.
  `position` reuses the Phase 4 `lexoPosition` helper (same
  alphabet, same precision budget). The model has its own
  `position` so reordering is consistent with the rest of the
  codebase.
- **`TaskComment`** — `{ id, taskId, authorId, body, createdAt }`.
  `body` ≤ 5000 chars.
- **`TaskAssignee`** — join `{ taskId, userId }` with a
  composite primary key.

### 10.3 Migration

```bash
cd server
npx prisma migrate dev --name phase05_polish
```

The migration is additive — every new field has a default; no
existing row is rewritten; no enum rename happens (`BoardUser.role`
was already a free-form `String` in Phase 2, so widening it to
an enum is a clean break that defaults every existing row to
`"MEMBER"`). The board owner is the row where `userId === board.ownerId`,
so the existing owner data is preserved by a follow-up `UPDATE`
in the migration:

```sql
UPDATE "BoardUser" SET role = 'OWNER' WHERE "boardId" IN (
  SELECT id FROM "Board" WHERE "ownerId" = "BoardUser"."userId"
);
```

### 10.4 New endpoints (and the ones that already exist)

| Endpoint | Status | Notes |
| --- | --- | --- |
| `PATCH /api/tasks/:id` | exists (Phase 3) | Widen the `UpdateTaskSchema` to accept the new fields (`starred`, `priority`, `dueDate`, `storyPoints`, `labels`). Reject `assignees` here — the dedicated endpoint owns them. |
| `POST /api/tasks/:id/subtasks` | **new** | Body `{ title }`. 201 with the new subtask. |
| `PATCH /api/tasks/:id/subtasks/:subtaskId` | **new** | Body `{ title?, done? }`. 200. |
| `DELETE /api/tasks/:id/subtasks/:subtaskId` | **new** | 204. |
| `POST /api/tasks/:id/comments` | **new** | Body `{ body }` (1–5000 chars). 201 with the new comment. |
| `GET /api/tasks/:id/comments` | **new** | Returns the 50 most recent comments, newest first. 200. |
| `PUT /api/tasks/:id/assignees` | **new** | Body `{ userIds: string[] }` (replaces the full set — simpler than a delta for the v1 UX). 200 with the new assignees list. |
| `POST /api/boards` | exists (Phase 2) | Widen the body schema to accept the new fields; reject unknown fields. |
| `PATCH /api/boards/:id` | exists (Phase 2) | Widen the body schema to accept `linkSharing` and the other new fields. |
| `PATCH /api/boards/:id/members/:userId` | **new** | Body `{ role: "ADMIN" | "MEMBER" }`. 200. Owner role is immutable (returns 400). |
| `POST /api/boards/:id/members` | exists (Phase 2) | Widen to accept the new `role` (default `"MEMBER"`). |

All new endpoints chain `requireAuth → validate(ParamSchema, "params")
→ loadBoard / loadTask → requireBoardAccess` (or `requireBoardOwner`
for owner-only mutations like the role change on someone who isn't
the caller).

---

## Step 11 — Testing: Backend `jest` Suite

### 11.1 Dependencies

```bash
cd server
npm install -D jest ts-jest @types/jest supertest @types/supertest
```

`ts-jest` is configured for ESM (`module: NodeNext` in
`tsconfig.json` requires `ts-jest` to use the `esm` transform —
`jest.config.cjs` configures that).

### 11.2 Layout

```
server/
├── jest.config.cjs
├── src/
│   ├── __tests__/
│   │   ├── integration/
│   │   │   ├── auth.test.ts
│   │   │   ├── boards.test.ts
│   │   │   ├── columns.test.ts
│   │   │   ├── tasks.test.ts
│   │   │   ├── board-invitations.test.ts
│   │   │   └── phase5-extensions.test.ts  # subtasks, comments, assignees, role change, link sharing
│   │   └── setup/
│   │       └── test-db.ts                  # spins up a per-test-file Prisma transaction
│   └── modules/<name>/
│       └── __tests__/
│           └── <name>.service.test.ts      # unit tests for the service layer
```

The integration tests use a per-test-file Prisma transaction (set
up in `setup/test-db.ts` and rolled back at teardown) so they
don't pollute the dev DB. The `DATABASE_URL_TEST` env var
(distinct from `DATABASE_URL`) is required; `jest.config.cjs`
loads it via `dotenv/config`.

### 11.3 What gets tested

- **Service unit tests** — `boards.service.test.ts` covers the
  role-change, the link-sharing toggle, the new board fields
  (project key, color identity, template), and the soft-delete
  exclusion. `tasks.service.test.ts` covers the new patch fields
  (priority validation, due-date round-trip, labels as a string
  list, story-points range). `columns.service.test.ts` and
  `auth.service.test.ts` cover the existing surface as a
  regression net.
- **HTTP integration tests** — every endpoint has at least one
  happy-path + one 4xx case. `auth.test.ts` is the most
  thorough because of the rate limiter (a single test bypasses
  the limiter with a mock; the rest exercise the real limiter
  with `process.env.RATE_LIMIT_DISABLED = "1"` for the bulk).
- **`lexoPosition` unit tests** — the `lexoPosition.smoke.mjs`
  invariants move into `src/common/utils/__tests__/lexoPosition.test.ts`
  with a real `describe` / `it` / `expect` structure. The smoke
  script (`lexoPosition.smoke.mjs`) is **kept** as a runnable
  artifact (it doubles as a quick local sanity check); the jest
  suite is the formal version.

### 11.4 Coverage target

- **Lines:** 80% (measured by `jest --coverage`).
- **Branches:** 70%.
- The new modules (`subtasks`, `comments`, `assignees`,
  `link-sharing`) are 100% covered (small, isolated, easy).

---

## Step 12 — Testing: Frontend `vitest` Suite

### 12.1 Dependencies

```bash
cd client/kanban-board-client
npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

### 12.2 Layout

```
client/kanban-board-client/
├── vitest.config.ts
├── src/
│   └── features/<name>/
│       └── __tests__/
│           └── <Component>.test.tsx
```

### 12.3 What gets tested

- **`AuthScreen`** — tabs switch, form validation, the
  `registerWithEmail` / `loginWithEmail` callbacks fire with the
  right args, the disabled SSO buttons don't fire anything.
- **`TaskModal`** — title edit calls the right callback,
  subtask add/toggle, comment post, the trash confirm flow, the
  Esc / backdrop close.
- **`ShareBoardModal`** — invite row validation, the role
  `<select>` change, the remove (X) click, the link-sharing
  toggle (if shipped).
- **`CreateBoardDrawer`** — name input, project-key uppercase
  + maxlength, color swatch selection, template radio behavior,
  the `Create & Launch Board` button.
- **`BoardView` snapshot rollback** — drag a task, mock the
  mutation to reject, assert the UI snaps back to the
  pre-drag state and a `role="status"` element appears.
- **`useAuth`** — `setToken` / `clearToken` round-trips through
  `localStorage`, the user snapshot cache (the `Object.is`
  memoization from `AuthContext.tsx` lines 65–99) holds.
- **`AuthScreen` redirect** — `useEffect` in `page.tsx` pushes
  to `/boards/:firstId` after `registerWithEmail` resolves.

### 12.4 The new mutation hooks

- `useCreateTaskMutation`, `useUpdateTaskMutation`,
  `useCreateSubtaskMutation`, `useCreateCommentMutation`,
  `useUpdateMemberRoleMutation`, `useCreateBoardMutation` each
  have at least one test covering `onMutate` (optimistic insert)
  and `onError` (rollback).

### 12.5 Coverage target

- **Lines:** 60% (lower than the backend because the visual
  surface is the focus; the tested components cover every
  interactive flow but not every style branch).

---

## Step 13 — Testing: PowerShell E2E Codifier

A new `server/phase5-e2e.ps1` script (estimated 60–80 assertions)
codifies the Phase 5 validation surface:

### 13.1 Section A — Auth rate limiting (~10 assertions)

- 11 login attempts within 15 min from the same IP → the 11th
  returns 429.
- The 429 response is `{ error: "Too many requests, ..." }`.
- 6 register attempts within an hour from the same IP → the 6th
  returns 429.

### 13.2 Section B — Phase 5 schema additions (~25 assertions)

- `Task` accepts `priority`, `dueDate`, `storyPoints`, `labels`,
  `starred` via `PATCH /api/tasks/:id` and round-trips them in
  `GET /api/tasks/:id`.
- `Task` accepts `assignees` via `PUT /api/tasks/:id/assignees`
  and the response shape mirrors the request.
- `TaskSubtask` create / update / delete work; the order
  matches `position asc`.
- `TaskComment` post returns 201; the next `GET /api/tasks/:id/comments`
  includes the new comment in the right slot (newest first).
- `Board` accepts `projectKey`, `colorIdentity`, `template` via
  `POST /api/boards`; `linkSharing` via `PATCH /api/boards/:id`.
- `PATCH /api/boards/:id/members/:userId` changes the role; the
  owner role is immutable (returns 400).
- Cross-board surface checks (403) and soft-deleted checks (404)
  repeat for the new endpoints.

### 13.3 Section C — Non-functional (~15 assertions)

- `npx tsc --noEmit` exits 0 in both `server/` and
  `client/kanban-board-client/`.
- `npm run lint` exits 0 in both projects.
- Every new server dep is present in `server/package.json`.
- No new top-level client dep was added beyond what Phase 5 lists
  (no `framer-motion`, no `zustand`, no `react-hook-form`).
- `audit-routes.mjs` exits 0.
- The `X-Request-Id` header is present on every response from
  the dev server.
- The 4xx responses use the `{ error, details? }` envelope.
- `pino` log lines are JSON in production mode (`LOG_LEVEL=info`,
  no `pino-pretty`).
- The `lexoPosition` invariants still pass (24/24).

### 13.4 Section D — Frontend static analysis (~10 assertions)

- The new client deps (`vitest`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event`,
  `jsdom`) are in `client/kanban-board-client/package.json`.
- The new mutation hooks exist
  (`useCreateTaskMutation`, `useUpdateTaskMutation`,
  `useCreateSubtaskMutation`, `useCreateCommentMutation`,
  `useUpdateMemberRoleMutation`, `useCreateBoardMutation`).
- The `Toast` component exists and exposes `role="status"`.
- The `motion.css` tokens file exists.
- The `useOverlayState` context exists.
- The compact-mode hook (`useMediaQuery`) exists.

### 13.5 Manual checklist

The browser-driven visual checks live in `Validation.md` as a
human-tickable list, just like Phase 4's Step 7 manual checklist.

---

## Step 14 — Deployment Readiness

### 14.1 `.env.example` for the server

```bash
# server/.env.example
# Copy this file to .env and fill in the values.

# PostgreSQL connection string. Required.
# Example: postgresql://user:password@localhost:5432/kanban
DATABASE_URL=

# JWT signing secret. Required. Use at least 32 bytes of randomness
# in production (e.g. `openssl rand -hex 32`).
JWT_SECRET=

# HTTP port. Defaults to 4000.
PORT=4000

# Bcrypt cost factor. Defaults to 12.
BCRYPT_SALT_ROUNDS=12

# JWT lifetime. Defaults to 7d.
JWT_EXPIRES_IN=7d

# Log level for pino. Defaults to info. Use "debug" in development.
LOG_LEVEL=info
```

The frontend's `NEXT_PUBLIC_API_URL` is **not** required; the
default axios base URL is `http://localhost:4000`. Production
deploys set it via the Vercel / Render / Railway dashboard.

### 14.2 Health check

The existing `GET /health` (Phase 1) is sufficient; Phase 5
verifies it still works and adds a small documentation block to
the route file. The endpoint already returns 200 / 503 and
includes the DB ping; the Phase 5 changes are documentation-only.

### 14.3 CI workflow

`.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
    branches: [main, phase*]
  pull_request:
    branches: [main]
jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - run: cd server && npm ci && npm run lint
      - run: cd client/kanban-board-client && npm ci && npm run lint && npx tsc --noEmit
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: kanban_test }
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - run: cd server && npm ci
      - run: cd server && npx prisma migrate deploy
      - run: cd server && npm run build &
      - run: cd server && npm start &  # exposes :4000
      - run: cd server && powershell -ExecutionPolicy Bypass -File ./phase2-e2e.ps1
      - run: cd server && powershell -ExecutionPolicy Bypass -File ./phase4-e2e.ps1
      - run: cd server && powershell -ExecutionPolicy Bypass -File ./phase5-e2e.ps1
      - run: cd server && node --experimental-strip-types --no-warnings ./lexoPosition.smoke.mjs
```

> The PowerShell step runs on the GitHub-hosted runner's
> `pwsh` (PowerShell Core 7+ is preinstalled on `ubuntu-latest`).

### 14.4 Git hooks (Husky + lint-staged)

```bash
# install once
cd . && npm install -D husky lint-staged
npx husky init
```

`.husky/pre-commit`:

```bash
npx lint-staged
```

`package.json` (root or per-project — root is fine):

```json
"lint-staged": {
  "server/src/**/*.ts": [
    "cd server && npx eslint --fix",
    "cd server && npx tsc --noEmit"
  ],
  "client/kanban-board-client/src/**/*.{ts,tsx}": [
    "cd client/kanban-board-client && npx eslint --fix",
    "cd client/kanban-board-client && npx tsc --noEmit"
  ]
}
```

The hook is fast (only the staged files are touched) and catches
the easy mistakes (import order, unused vars, missing `await`).

---

## Execution Order

| #   | Task                                                                                                       | Estimated Effort | Status         |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------------- | -------------- |
| 1   | Frontend responsive layout (Step 1)                                                                        | 180 min          | ⬜ Pending      |
| 2   | Column counters + quick-add (Step 2)                                                                       | 90 min           | ⬜ Pending      |
| 3   | Intentional motion language (Step 3)                                                                       | 60 min           | ⬜ Pending      |
| 4   | Loading / error / empty states (Step 4)                                                                    | 90 min           | ⬜ Pending      |
| 5   | Wire the Phase 5 overlays to real mutations (Step 5)                                                       | 240 min          | ⬜ Pending      |
| 6   | Quick-add keyboard shortcut (Step 6 — base; stretch goals b/m are separate)                               | 60 min           | ⬜ Pending      |
| 7   | Backend input-validation audit script (Step 7)                                                             | 60 min           | ⬜ Pending      |
| 8   | Backend structured logging (Step 8)                                                                       | 90 min           | ⬜ Pending      |
| 9   | Backend rate limiting on auth (Step 9)                                                                    | 60 min           | ⬜ Pending      |
| 9a  | Board invitation inbox UI (Step 9a — recipient accept/decline; backend endpoints from Phase 2)             | 90 min           | ✅ Shipped      |
| 10  | Backend schema additions for the Phase 5 UX (Step 10)                                                      | 120 min          | ⬜ Pending      |
| 11  | Backend `jest` suite (Step 11)                                                                             | 240 min          | ⬜ Pending      |
| 12  | Frontend `vitest` suite (Step 12)                                                                          | 240 min          | ⬜ Pending      |
| 13  | PowerShell Phase 5 e2e codifier (Step 13)                                                                  | 120 min          | ⬜ Pending      |
| 14  | Deployment readiness — `.env.example`, CI workflow, Husky + lint-staged (Step 14)                         | 120 min          | ⬜ Pending      |
|     | **Total**                                                                                                  | **~30 hours**    |                |

### Step 9a — Frontend UX: Board Invitation Inbox

The Phase 2 backend has shipped
`GET /api/board-invitations`, `POST /:id/accept`, and
`POST /:id/decline` since the original implementation, but the
frontend never gained a recipient-side surface — a freshly-registered
user could be invited but had no way to accept the invitation from
the app. The `BoardHeader` already carried a placeholder
`notifications` bell button with
`title="Notifications (coming in Phase 5)"`, which is the natural
home for this surface.

The work follows the same mutation / cache-wiring pattern as Steps 1
+ 5: a new `features/invitations/` folder with a `useMyInvitationsQuery`
+ `useAcceptInvitationMutation` + `useDeclineInvitationMutation`
(optimistic remove from `["my-invitations"]` cache, rollback on
error, invalidate on settle), a new `<InvitationsInbox />` modal
(loading / empty / loaded states, two-step decline confirm, Esc +
backdrop close, body scroll-lock), a count-pill wired to the
`BoardHeader` bell, and a `useOverlayState().invitationsInboxOpen`
flag so the bell (in `<BoardHeader />`) and the home page's
`<EmptyBoardsState />` "View invitations" button share the same
open state without prop-drilling. The home page mount is what
covers a user with pending invitations but no boards yet.

`Accept` invalidates `["my-invitations"]` **and** `["my-boards"]`
(the `api.ts` `myBoardsQueryKey`, not the dead-code duplicate in
`useMyBoardsQuery.ts`) so the new board shows up in the sidebar on
next visit. The mutation's `onSuccess` returns `{ boardId }` and
the parent calls `router.push(\`/boards/${boardId}\`)` so the user
lands on the new board immediately. No backend work is required
— the three endpoints are unchanged from Phase 2.

---

## Out of Scope (Deferred)

- **Real-time / WebSocket sync** — Still deferred per Phase 4's
  `REQ-4.6.11`. Last-write-wins on `position` remains the
  reconciliation strategy; the new endpoints inherit that.
- **Dark mode** — The Kinetic Grid tokens are light-only today;
  Phase 5 doesn't add a dark theme. The tokens file's `data-theme`
  hooks are in place for a future phase to add it.
- **Mobile drag-and-drop (full touch DnD)** — The compact mode
  uses a tabbed "lane focus" view; touch DnD on small screens is
  awkward and Phase 5 ships the graceful degradation instead of
  a half-baked DnD port.
- **`Task.assignees` per-permission fine-grained ACL** — The
  Phase 5 model is a flat list of assignees; per-task ACLs (e.g.
  "only Alice can move this card") are out of scope.
- **`Board.template` actually templating columns** — Phase 5
  persists the `template` field, but the *content* of the
  template (which columns / tasks get created) is a future
  enhancement. For Phase 5, the field is just metadata; the
  `POST /api/boards` call still creates a board with the default
  (empty) columns.
- **`Board.linkSharing` actually exposing a public URL** — The
  toggle is wired in the UI; the public read endpoint
  (`GET /api/boards/:id?token=...`) is a future enhancement
  (documented as a known gap in `Validation.md` if the backend
  work is too big for Phase 5).
- **"Undo" for task delete** — Phase 5 keeps the undo window
  simple (a 5-second re-create from the cached task); a proper
  soft-delete with undo history is out of scope.
- **Multi-tenancy / organizations** — Not in the roadmap.
- **Email verification on register** — Not in the roadmap.
- **Production hardening** (TLS, CSP, secret rotation, audit
  log) — Not in the roadmap; Phase 5 ships dev / staging
  readiness, not production-grade security review.
