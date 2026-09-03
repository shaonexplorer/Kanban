# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

```
Mini Kanban Board/
├── client/
│   └── kanban-board-client/    # Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 — Phase 4 frontend (board view with dnd-kit + TanStack Query) complete; Phase 5 frontend (real auth UI ported from `.stitch-cache/auth.html`, JWT login + register) complete; Phase 5 `TaskModal` (Stitch-faithful task detail modal, two-column body + metadata sidebar + breadcrumb header + autosave footer) complete; Phase 5 polish (automated testing) pending
├── server/                      # Backend (Node.js + Express + TypeScript + Prisma) — Phase 1, 2, 3 & 4 complete (Phase 4 Steps 1–7 done: schema migration to position String + lexoPosition helper + smoke script + move endpoints for both tasks and columns + phase4-e2e.ps1 (58 assertions) + phase4-step7-e2e.ps1 (32 assertions) + Validation.md updated with Summary Checklist ✅ everywhere)
├── specs/                       # Project specifications and documentation
│   ├── Mission.md              # Project purpose and success criteria
│   ├── Techstack.md            # Tech stack decisions and planned libraries
│   ├── Roadmap.md             # Phased implementation roadmap
│   ├── Phase01/               # Phase 1 specs: Plan.md, Requirements.md, Validation.md — Foundation
│   ├── Phase02/               # Phase 2 specs: Plan.md, Requirements.md, Validation.md — Boards & Access Control
│   ├── Phase03/               # Phase 3 specs: Plan.md, Requirements.md, Validation.md — Columns & Tasks (Steps 1–4 done: schema evolution + access-control loaders + columns module + tasks module)
│   └── Phase04/               # Phase 4 specs: Plan.md, Requirements.md, Validation.md — Ordering & Task Movement (Steps 1–7 done: position Int → String migration on Column + Task + lexoPosition helper + smoke script + move endpoints for both tasks and columns + Next.js board view with @dnd-kit + TanStack Query + phase4-e2e.ps1 (58 assertions) + phase4-step7-e2e.ps1 (32 assertions) + Validation.md Summary Checklist ✅ everywhere + Step 7 manual-verification checklist)
└── specs.md                     # Top-level spec summary
```

**Important:** The `client/kanban-board-client/` directory is a separate Git repository (own `.git`). The `server/` directory contains the implemented backend organized as a **Modular MVC** layout (per-feature modules + a `common/` cross-cutting layer) on native ES Modules.

**Note:** Docker is intentionally not used in this project. There is no `docker-compose.yml` or `Dockerfile` — run the database, backend, and frontend directly on the host.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (drag-and-drop), `@tanstack/react-query` (server state) — Phase 4 board view complete; Phase 5 real auth UI complete (`AuthScreen` component, sign-in + create-account tabs, JWT-based); Phase 5 `TaskModal` component complete (`features/board/components/TaskModal.tsx` — Stitch-faithful task detail modal, ~760px, two-column body + metadata sidebar, local state only). On a logged-out visit the home page renders the Stitch-faithful auth screen; on a logged-in visit it auto-redirects to the first board. SSO (GitHub/Google) buttons are rendered but disabled — the spec'd auth surface is email/password only.
- **Backend:** Node.js + Express 5 + TypeScript (ES Modules, Modular MVC layout)
- **Database:** PostgreSQL + Prisma 7 (with `@prisma/adapter-pg` driver adapter)
- **Auth:** JWT tokens (`jsonwebtoken`) + bcrypt password hashing (`bcryptjs`)
- **Access control:** `loadBoard` + `loadColumn` + `loadTask` + `requireBoardAccess` + `requireBoardOwner` middlewares in `server/src/common/middleware/access-control.middleware.ts`. `loadBoard` reads the board id from `req.params` (or `req.body`) and attaches the non-deleted `Board` to `req.board`; `loadColumn` and `loadTask` (Phase 3) do the same for sub-resources, fetching the column (with its board) or the task (with its column and that column's board) in a single query, treating missing or soft-deleted parent as 404, and additionally exposing the resolved board on `req.board` so the same `requireBoardAccess` / `requireBoardOwner` middlewares chain behind them. The two `require*` middlewares enforce owner-only vs. owner-or-member access and throw `HttpError(403, "Forbidden")` otherwise.
- **Ordering (Phase 4, complete — Steps 1–7 done):** `position` on `Column` and `Task` is now `String @default("a0")` (Step 1 schema migration applied; existing rows re-keyed to `a1`, `a2`, … via CTE in `migrations/20260903024837_phase04_fractional_positions/migration.sql`). The `lexoPosition` helper lives at `server/src/common/utils/lexoPosition.ts` — exports `first()`, `between(a, b)`, `nextKey(tier, n)`, and `rePackKey(i)`; all are pure, no DB or globals. `between` is the canonical "find a lexo position between two bounds" helper used by the move endpoints. `nextKey` returns the n-th position in a tier-prefixed V-tail sequence (`a0`, `a0V`, `a0VV`, ..., `b0`, `b0V`, ...). `rePackKey` flattens an index `i` into the right `(tier, n)` pair so re-packs of arbitrary size stay within the `MAX_LENGTH` budget. A debug smoke script at `server/lexoPosition.smoke.mjs` asserts the invariants from Plan §2.2 (`a < between(a, b) < b` for random pairs, `between(null, null) === first()`, `between("a0", "a1")` is a valid in-between, repeated halving stays in budget, the V-tail sequence is strictly increasing, every position fits the budget); run it with `node --experimental-strip-types --no-warnings ./lexoPosition.smoke.mjs` (Node 22's strip-types lets the `.mjs` script import the `.ts` helper directly). Steps 2–4 (helper, task-move endpoint, column-move endpoint) are done; `npx tsc --noEmit` is clean and `server/phase4-e2e.ps1` (added in Step 6, 58 assertions) confirms create, move (column), move (task), reorder, access control, all 4xx validation cases, atomicity, the re-pack fallback, and re-pack isolation between columns. Step 5 (Next.js board view with dnd-kit + TanStack Query) is done in `client/kanban-board-client/src/features/board/`; details below. **Step 7 (manual verification)** is also done — `server/phase4-step7-e2e.ps1` (added in Step 7, 32 assertions) codifies `VAL-4.4.6` (column-move re-pack interop), every `VAL-4.6.*` non-functional check, and the frontend static-analysis baseline (`VAL-4.5.12`–`5.16`, `VAL-4.5.4`, `VAL-4.5.10`); the browser-driven visual checks (drag-and-drop UX, keyboard interaction) live in `specs/Phase04/Validation.md` as a human-tickable checklist. Phase 4 is closed out.
- **Validation:** `zod` schemas per feature module + a generic `validate()` middleware
- **Dev runner:** `tsx` (ESM-compatible TypeScript runner with watch mode)
- **Package manager:** npm
- **No Docker / containers** — services run directly on the host

## Frontend Development

The client is at `client/kanban-board-client/`.

```bash
cd client/kanban-board-client

# Development
npm run dev          # Start Next.js dev server on port 3000

# Build & deploy
npm run build        # Production build
npm start            # Start production server

# Code quality
npm run lint         # Run ESLint

# Type checking
npx tsc --noEmit     # TypeScript type-check only
```

The project uses Tailwind CSS v4 with the `@tailwindcss/postcss` package — configuration is via `postcss.config.mjs` (no separate `tailwind.config.js` in v4). Global styles live in `src/app/globals.css`. The App Router convention is `src/app/` with page components at `src/app/page.tsx`.

**Frontend layout (Phase 4 Step 5):**

```
client/kanban-board-client/src/
├── app/
│   ├── layout.tsx                # Root layout — wraps children in <Providers>
│   ├── providers.tsx             # Client-side QueryClientProvider + AuthProvider
│   ├── page.tsx                  # Landing — renders <AuthScreen> when logged out; auto-redirects to /boards/<id> via useEffect when a token is present
│   ├── globals.css               # Tailwind v4 entry, light/dark CSS vars
│   └── boards/[id]/page.tsx      # Async server component, awaits Next.js 16 params
├── features/
│   ├── auth/
│   │   ├── AuthContext.tsx       # useSyncExternalStore over localStorage; registerWithEmail + loginWithEmail; memoized user snapshot to keep Object.is stable
│   │   ├── AuthScreen.tsx        # Phase 5 — Stitch-faithful sign-in / create-account form (Kandor design, Kinetic Grid tokens)
│   │   └── useAuth.ts            # Context consumer
│   │   └── useAuth.ts            # Context consumer
│   └── board/
│       ├── types.ts              # BoardDetail, Column, Task, BoardMember (mirrors server)
│       ├── api.ts                # Typed wrappers over the existing axios instance
│       ├── useBoardQuery.ts      # useQuery(["board", id])
│       ├── useMoveTaskMutation.ts# useMutation w/ optimistic update + dnd-kit snapshot rollback
│       ├── useMoveColumnMutation.ts  # useMutation w/ optimistic update + dnd-kit snapshot rollback
│       ├── reorderBoard.ts       # Pure helpers: moveTaskWithinBoard, reorderColumnsInBoard, …
│       ├── BoardView.tsx         # DndContext + sensors + toast + in-flight indicator
│       ├── BoardViewGate.tsx     # Auth redirect guard ("/boards/:id" -> "/" if no token)
│       ├── Column.tsx            # Sortable column (useSortable + nested SortableContext for tasks)
│       ├── TaskCard.tsx          # Sortable task card (useSortable) — shim that re-exports TaskCardShell
│       └── components/           # Stitch-styled visual primitives (sidebar, header, cards, icons, modal)
│           ├── Icon.tsx          # Inline-SVG icon set (Material Symbols silhouettes). IconName union covers board chrome (dashboard, view_kanban, drag_indicator, …), auth screen (login, mail, lock, badge, security, …), and the task-modal (star, link, delete, close, notes, checklist, chat, format_bold, code, alternate_email, attach_file, edit, speed, check_box, calendar_today, warning)
│           ├── UserAvatar.tsx    # Circular initials avatar with email-derived container color + presence dot
│           ├── Sidebar.tsx       # Left navigation rail
│           ├── SidebarHeader.tsx # Logo + collapse control
│           ├── BoardHeader.tsx   # Sticky top bar with breadcrumb + facepile + share
│           ├── BoardControlBar.tsx # Sub-header (title, velocity, sort, view-mode toggle)
│           ├── ColumnShell.tsx   # Lane container (header + cards)
│           ├── TaskCardShell.tsx # Stitch-faithful card markup (the `TaskCard` shim re-exports this)
│           ├── AddColumnGhost.tsx# "Add column" affordance
│           └── TaskModal.tsx     # Phase 5 — Stitch-faithful task detail modal (~760px). Two-column body (description with Preview/Raw tabs + inline `Lexorank` code chip, subtasks checklist w/ progress bar, activity feed with rich-text toolbar) + metadata sidebar (status, priority, assignees, move-to-column, due date, labels, story points, audit). Header has breadcrumb + copy-link / star / trash / close actions; trash uses a confirm-then-actually-delete state. Footer pulses "Autosaved live to {board}" with Esc-to-dismiss hint. Backdrop has ambient radial glows (`bg-primary/10` + `bg-tertiary/10`, both `blur-3xl`). Closes on Esc or backdrop click. Open animation: `animate-in fade-in zoom-in-95 duration-200`. Local state only (title edit, subtask add/toggle, comment post); wire to `PATCH /api/tasks/:id` / future `POST /api/tasks/:id/comments` when those endpoints exist. Icons use `w-* h-*` (width property), not `text-[Npx]`.
└── lib/api.ts                    # Existing axios instance with auto-attached JWT (reused)
```

**Frontend conventions:**
- Server components by default; `"use client"` only on the files that use hooks / dnd-kit / React Query.
- HTTP: reuse the existing `src/lib/api.ts` axios instance — JWT is read from `localStorage.getItem("token")` and attached as `Authorization: Bearer …` on every request. Do not add a parallel fetch wrapper.
- Auth: `AuthContext` exposes `{ token, userId, userEmail, setToken, clearToken, registerWithEmail, loginWithEmail }`. The Phase 4 "Quick register (dev only)" home-page button is gone — `AuthScreen` is now the real sign-in / create-account UI, wired to `POST /api/auth/register` and `POST /api/auth/login`. The user snapshot returned by `getUserSnapshot` is **memoized at module scope keyed on the raw localStorage string** so `useSyncExternalStore`'s `Object.is` comparison sees a stable reference; a fresh `{ id, email }` literal on every call would trigger the "The result of getSnapshot should be cached to avoid an infinite loop" runtime error. (`getTokenSnapshot` returns a string and is already stable by value.)
- React Query: one `QueryClient` per browser tab is created in `src/app/providers.tsx` via a `useState` initializer. Default `staleTime: 30_000`, `refetchOnWindowFocus: false`.
- Optimistic updates: snapshot is captured at dnd-kit `onDragStart` into a `useRef` (preferred over the TanStack `onMutate` snapshot because the dnd-kit snapshot was taken before any `onDragOver` previews). Mutations roll back to that snapshot on error.
- Next.js 16: dynamic route `params` is `Promise<{ id: string }>` — pages must `await params`. `node_modules/next/dist/docs/` is the source of truth (the project's `AGENTS.md` warns that "this is NOT the Next.js you know").
- Icons: the `Icon` component (`features/board/components/Icon.tsx`) renders an inline-SVG Material Symbols silhouette. **Size icons with the `width` / `height` properties (Tailwind `w-* h-*` utilities) — never with `text-[Npx]`**. The Stitch HTML uses the text-size hack to drive its font-based icon glyphs; the inline-SVG component here doesn't, and `text-[Npx]` is silently ignored. When the Tailwind `@theme` size key isn't generated automatically, mirror it as an inline `style={{ width, height }}` for redundancy.
- `TaskModal` (`features/board/components/TaskModal.tsx`): presentation-only. The interactive fields (title edit, subtask add/toggle, comment post, status / priority / column / due date / assignees / labels / story-points) all live in local `useState`. To persist edits, swap the corresponding setters for TanStack Query mutations against the (future) `PATCH /api/tasks/:id` and `POST /api/tasks/:id/comments` endpoints — the visual surface stays unchanged. Re-mount the component (parent uses a `key={task.id}`) rather than resetting local state on `open` transitions; the `setState-in-effect` anti-pattern is rejected by the project's ESLint config.
- The Phase 4 board view's `TaskCard` and the Phase 5 `TaskModal` are independent — the modal is not yet wired into the board's click-to-open flow. Future integration: lift a `selectedTaskId` to `BoardView` state, render `<TaskModal open={...} onClose={...} {...selectedTask} />` in the same tree, and trigger `onOpen` from the card's `useSortable` `onClick` (or a dedicated "open" affordance on `TaskCardShell`).

**To run the frontend:**
```bash
cd client/kanban-board-client
npm run dev          # http://localhost:3000
```
A working board demo requires the server on `:4000` with a populated DB; see the backend "Dev runner" section below for `cd server && npm run dev`.

## Backend Development

The backend lives at `server/` and is organized as a **Modular MVC** layout on native ES Modules. **Phase 1 (Foundation), Phase 2 (Boards & Access Control), Phase 3 (Columns & Tasks), and Phase 4 (Ordering & Task Movement) are complete (Steps 1–7 all done).** Step 1 (schema evolution) migrates `Column.position` and `Task.position` from `Int` to `String @default("a0")` via the `prisma migrate dev --name phase04_fractional_positions` migration in `prisma/migrations/20260903024837_phase04_fractional_positions/`. The migration also re-keys existing rows in-place to lexo indices in row order (`a1`, `a2`, … per `boardId` for `Column` and per `columnId` for `Task`) so post-migration ordering is immediately consistent. Step 2 introduces the `lexoPosition` shared utility at `server/src/common/utils/lexoPosition.ts` (exports `first()`, `between(a, b)`, `nextKey(tier, n)`, `rePackKey(i)`; all pure, no DB or globals) plus a debug smoke script at `server/lexoPosition.smoke.mjs` that asserts the Plan §2.2 invariants and the V-tail re-pack sequence. **Step 3 (task move) and Step 4 (column move)** add `POST /api/columns/:columnId/tasks/:taskId/move` and `POST /api/columns/:id/move`. Both endpoints use `lexoPosition.between` for the happy path and a `prisma.$transaction`-wrapped re-pack (driven by `rePackKey`) when the helper exhausts its precision budget. The bridge-state integer arithmetic (`max(position) + 1`, integer-keyed reorder) has been fully replaced; `npx tsc --noEmit` is clean. **Step 5 (frontend board view with dnd-kit + TanStack Query)** is implemented in `client/kanban-board-client/src/features/board/` — see the **Frontend layout** section above. `npx tsc --noEmit`, `npm run lint`, and `npm run build` are all clean in the client. **Step 6 (wiring & final touches) is done** — `server/phase4-e2e.ps1` (new, 58 assertions, all passing) covers the new ordering surface end-to-end (ordering by `position` asc, same-column reorders, cross-column moves, column moves, the legacy `PATCH /boards/:id/columns/reorder` endpoint, cross-board rejection, non-member 403s, every 4xx validation case, soft-delete 404s, atomicity, the open-ended re-pack fallback, and re-pack isolation between columns). The choice (a new e2e script rather than mutating `phase2-e2e.ps1`) is documented in `specs/Phase04/Validation.md` §Validation Environment; `phase2-e2e.ps1` was left unchanged because it doesn't touch column/task positions and still passes (48/48) against the new schema. **Step 7 (manual verification) is done** — `server/phase4-step7-e2e.ps1` (new, 32 assertions, all passing) codifies the remaining validation surface that doesn't require a browser: `VAL-4.4.6` (column-move re-pack interop, §A), every `VAL-4.6.*` non-functional check (TypeScript clean, ESM `.js` discipline, no new server deps, no WebSocket, no test framework, no Tailwind config extension, middleware chains, prisma transactions, no inline `position` strings, §B), and the frontend static-analysis baseline (`VAL-4.5.12`–`5.16` plus the `VAL-4.5.4` optimistic-update rollback contract and the `VAL-4.5.10` `role="status"` toast, §C). The browser-driven visual checks (drag-and-drop UX, keyboard interaction, auth-redirect UX) live in `specs/Phase04/Validation.md` "Phase 4 — Step 7 Manual Verification" section as a human-tickable checklist. **`specs/Phase04/Validation.md` Summary Checklist is now ✅ for every REQ-4.x row.** **Phase 3 step history (for reference):** Step 1 added `onDelete: Cascade` from `Task → Column` so `DELETE /api/columns/:id` cleans up its tasks atomically; `Column → Board` and `Board → BoardUser` remain `RESTRICT` (boards still soft-delete via `deletedAt`). Step 2 extended the access-control layer with `loadColumn` and `loadTask` middlewares in `src/common/middleware/access-control.middleware.ts` — they fetch the column (with its board) or the task (with its column and that column's board) in a single Prisma query, treat missing or soft-deleted parent as 404, and expose the resolved board on `req.board` so the existing `requireBoardAccess` / `requireBoardOwner` middlewares chain behind them unchanged. Step 3 implemented the `columns` module (CRUD + intra-board reorder) in `src/modules/columns/`, mounted on `/api` so a single router owns both `/api/boards/:boardId/columns` and `/api/columns/:id`. Step 4 implemented the `tasks` module (CRUD; reorder + cross-column move are now in Phase 4) in `src/modules/tasks/`, mounted on `/api` so a single router owns both `/api/columns/:columnId/tasks` and `/api/tasks/:id`. The Prisma schema includes `Board.deletedAt`, `BoardUser.joinedAt`, and a `BoardInvitation` model (with `BoardInvitationStatus` enum). The `boards` module (CRUD + member management + owner-driven invitations) is implemented in `src/modules/boards/`, the `board-invitations` module (list / accept / decline invitations addressed to the caller) is implemented in `src/modules/board-invitations/`, the `columns` module is implemented in `src/modules/columns/`, the `tasks` module is implemented in `src/modules/tasks/`, and the `lexoPosition` ordering helper is implemented at `server/src/common/utils/lexoPosition.ts`. `GET /api/boards/:id` returns the nested shape with `columns[].tasks[]` ordered by `position` asc (per REQ-3.14.1–3.14.3) — `position` is a lexo string (Phase 4), not an integer, so the ordering works the same way lexically. The Phase 4 frontend (board view + dnd-kit + TanStack Query) is implemented in `client/kanban-board-client/src/features/board/` (see the **Frontend layout** section above). The Phase 5 real auth UI (`AuthScreen` — a faithful port of `.stitch-cache/auth.html` onto the Kinetic Grid tokens) is implemented in `client/kanban-board-client/src/features/auth/AuthScreen.tsx`; the home page at `src/app/page.tsx` renders it on logged-out visits and auto-redirects logged-in visitors to their first board. `AuthContext` exposes both `registerWithEmail` and `loginWithEmail` and is wired to the existing `POST /api/auth/register` and `POST /api/auth/login` endpoints (JWTs persisted to `localStorage` under the `token` key, with the cached user under `auth.user`). The Phase 5 `TaskModal` (a faithful port of `.stitch-cache/task-modal.html` onto the Kinetic Grid tokens) is implemented in `client/kanban-board-client/src/features/board/components/TaskModal.tsx` — ~760px, two-column body (description with Preview/Raw tabs, subtasks checklist, activity feed) plus metadata sidebar, breadcrumb header with copy-link / star / trash / close actions, and an autosave footer; local state only, with the next task-CRUD backend pass replacing the local `useState` setters with TanStack mutations.

```bash
cd server

# Development
npm run dev          # Start Express with tsx watch (auto-reload) on port 4000

# Build & deploy
npm run build        # Compile TypeScript to dist/ (emits real ESM)
npm start            # Run compiled output (node dist/index.js)

# Type checking & Prisma
npm run lint         # tsc --noEmit
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

**Stack:**
- Express 5 with TypeScript (target ES2022, **module: NodeNext**, strict mode, `verbatimModuleSyntax: true`)
- Native **ES Modules** (`"type": "module"` in `package.json`); all relative imports use `.js` extensions even when the source is `.ts`
- Prisma 7 client generated to `src/generated/prisma/` (uses `@prisma/adapter-pg` driver adapter — required by Prisma 7)
- Validation: **`zod`** schemas in each feature module, run via a generic `validate(schema, source?)` middleware (`source` defaults to `"body"`; pass `"params"` to validate path segments or `"query"` for query strings — needed for UUID `:id` params)
- Dev runner: **`tsx`** (replaces `ts-node-dev` for ESM compatibility)
- Auth: `POST /api/auth/register` → `{ id, email, token }` (201); `POST /api/auth/login` → `{ email, token }` (200). Both issue a signed JWT; the password is never returned.
- Boards: `GET /api/boards` (caller's boards, tagged `role: "OWNER" | "MEMBER"`, soft-deleted excluded), `POST /api/boards` (create, returns 201 with `{ id, title, ownerId, createdAt }`), `GET /api/boards/:id` (nested detail: `{ ..., columns: [{ id, title, position, tasks: [{ id, title, description, position, createdAt }] }], members: [{ userId, email, role, joinedAt }] }` — columns and their tasks ordered by `position` asc, members owner-first then accepted collaborators newest-first by `joinedAt`), `PATCH /api/boards/:id` (owner renames, 200), `DELETE /api/boards/:id` (owner soft-deletes via `deletedAt`, 204), `GET /api/boards/:id/members` (list), `POST /api/boards/:id/members` (owner invites a registered user — exactly one of `userId` (UUID) or `email`; 201 invitation, 400 owner/empty/both, 404 unknown email, 409 already-member or duplicate pending), `DELETE /api/boards/:id/members/:userId` (owner removes an accepted collaborator, 204; 400 on owner, 404 on non-member). All routes require `requireAuth`; `:id` routes chain `validate(BoardIdParamSchema, "params") → loadBoard → requireBoardAccess` (read paths) or `requireBoardOwner` (mutations); soft-deleted boards are treated as 404 on every read and every mutation. Param validation runs *before* `loadBoard` so a non-UUID id returns 400 rather than 404.
- Board invitations: `GET /api/board-invitations` (caller's PENDING invites, joined with `boardTitle` + `inviterEmail`, newest first), `POST /api/board-invitations/:id/accept` (atomic `prisma.$transaction` that idempotently upserts a `BoardUser` row and flips the invitation to `ACCEPTED`; 200 with `{ boardId, invitationId, status: "ACCEPTED" }`), `POST /api/board-invitations/:id/decline` (single-write `DECLINED`; 200 with `{ invitationId, status: "DECLINED" }`). All routes require `requireAuth`; per-invitation actions verify `inviteeId === req.user.id` and reject with 403 / 404 / 409 (board soft-deleted, not addressee, or no longer PENDING).
- Columns (Phase 3 done + Phase 4 done): `GET /api/boards/:boardId/columns` (list, `position` asc, 200), `POST /api/boards/:boardId/columns` (create, 201 with `{ id, title, boardId, position }` — appends at `lexoPosition.between(max, null)`; re-packs via `lexoPosition.rePackKey` when the helper exhausts its budget; `lexoPosition.first()` for empty boards), `GET /api/columns/:id` (200), `PATCH /api/columns/:id` (rename, 200), `DELETE /api/columns/:id` (hard-delete, 204; cascading to tasks per `onDelete: Cascade` on `Task.column`), `PATCH /api/boards/:boardId/columns/reorder` (atomic `prisma.$transaction` that re-keys the board's columns to fresh `rePackKey` positions from the full `columnIds` array; 400 when the set is not identical to the board's current column ids, 200 with the new ordering otherwise), and `POST /api/columns/:id/move` (**Phase 4 Step 4, done** — single-column move within its own board, body `{ toIndex: number }`; atomic `prisma.$transaction` that calls `lexoPosition.between(before, after)` on the board's other columns with a board-level `rePackKey`-driven re-pack fallback when `between` returns `null`; 200 with the moved column). All routes require `requireAuth`; board-scoped routes chain `validate(BoardScopedColumnParamSchema, "params") → loadBoard("params", "boardId") → requireBoardAccess` and column-scoped routes chain `validate(ColumnIdParamSchema, "params") → loadColumn → requireBoardAccess`. Phase 3/4 reuse `requireBoardAccess` for ALL column mutations (both owners and accepted members can author content); `position` is changed only via the reorder or move endpoints, not via `PATCH /api/columns/:id`.
- Tasks (Phase 3 done + Phase 4 done): `GET /api/columns/:columnId/tasks` (list, `position` asc, 200; empty array for an empty column), `POST /api/columns/:columnId/tasks` (create, 201 with `{ id, title, description, columnId, position, createdAt }` — appends at `lexoPosition.between(max, null)`; re-packs via `lexoPosition.rePackKey` when the helper exhausts its budget; `lexoPosition.first()` for empty columns; body is `{ title: 1–200 chars, description?: ≤ 2000 chars }`), `GET /api/tasks/:id` (200, full task shape), `PATCH /api/tasks/:id` (200, partial of `{ title?, description? }` with `.refine()` enforcing at-least-one-field), `DELETE /api/tasks/:id` (hard-delete, 204), and `POST /api/columns/:columnId/tasks/:taskId/move` (**Phase 4 Step 3, done** — cross-column move + same-column reorder, body `{ toColumnId: UUID, toIndex: number }`; atomic `prisma.$transaction` that calls `lexoPosition.between(before, after)` on the destination column's tasks — `before` and `after` computed **after** excluding the task being moved, index clamped to the destination's length — with a column-local `rePackKey`-driven re-pack fallback when `between` returns `null`; 200 with the moved task's full shape). All routes require `requireAuth`; column-scoped routes chain `validate(ColumnScopedTaskParamSchema, "params") → loadColumn("params", "columnId") → requireBoardAccess` and task-scoped routes chain `validate(TaskIdParamSchema, "params") → loadTask → requireBoardAccess`. Phase 3/4 reuse `requireBoardAccess` for ALL task mutations; `position` and `columnId` are immutable on `PATCH /api/tasks/:id` — the move endpoint is the **only** way to change either. Cross-board moves are forbidden (HTTP 403 even if the caller has access to both boards, verified by the service's defensive check on the destination).
- Middleware: `authMiddleware` (attaches `req.user`) and `requireAuth` (rejects unauthenticated); `loadBoard` + `loadColumn` + `loadTask` + `requireBoardAccess` + `requireBoardOwner` in `access-control.middleware.ts` — wire them as `requireAuth → loadBoard|loadColumn|loadTask → requireBoardAccess|requireBoardOwner` on every resource-scoped `:id` route. `loadColumn` / `loadTask` (Phase 3) auto-populate `req.board` from the parent, so the same `requireBoardAccess` / `requireBoardOwner` middlewares chain behind them unchanged. **Phase 4 Step 3's task-move route** chains `loadColumn("params", "columnId") → loadTask("params", "taskId")` so both the source column's board and the task itself are authorized by the middleware chain; the destination column's board is verified by the service's defensive check (cross-board moves return 403, not 404). **Phase 4 Step 4's column-move route** chains `loadColumn()` on the URL `:id` so the same `requireBoardAccess` middleware authorizes the move.
- Ordering helper (**Phase 4 Steps 2–4, done**): `lexoPosition` lives in `server/src/common/utils/lexoPosition.ts` and is the **only** place on the server that produces or consumes `position` strings. Services must call `lexoPosition.first()` for empty scopes, `lexoPosition.between(a, b)` for inserts between two neighbors, and treat a `null` return as the trigger for a column/board-local re-pack. Re-packs use `lexoPosition.rePackKey(i)` (which delegates to `nextKey(tier, n)`) to assign fresh positions from the dense V-tail sequence with guaranteed headroom. Inline position math (e.g. `position: "a" + i.toString()`) is forbidden. All integer-arithmetic call sites have been replaced; `npx tsc --noEmit` is clean.
- Health: `GET /health` — returns 200 `{status: "ok", timestamp, db: "up"}` when the DB responds to a `SELECT 1`, or 503 `{status: "degraded", timestamp, db: "down", error}` when it doesn't (useful for orchestrators/liveness probes)

**Layout (Modular MVC):**
```
server/
├── prisma/
│   ├── schema.prisma       # User, Board (soft-delete via deletedAt), BoardUser (+ joinedAt), BoardInvitation (+ BoardInvitationStatus enum), Column, Task (Phase 4: position is String on Column + Task, default "a0")
│   └── migrations/         # Generated SQL migrations (init, phase02_boards_access, phase04_fractional_positions, ...)
├── src/
│   ├── index.ts            # Entry point — validates env, connects DB, starts server
│   ├── app.ts              # Express app factory (helmet, cors, json, mounts modules, error mw)
│   ├── config/
│   │   └── env.ts          # Zod-validated env (config + validateEnv)
│   ├── lib/prisma.ts       # Shared Prisma client (hot-reload safe singleton)
│   ├── common/             # Cross-cutting layer — no business logic
│   │   ├── errors/         # HttpError class + central errorMiddleware
│   │   ├── middleware/     # auth.middleware.ts (authMiddleware + requireAuth), access-control.middleware.ts (loadBoard, loadColumn, loadTask, requireBoardAccess, requireBoardOwner)
│   │   ├── utils/          # asyncHandler (forwards rejections to error mw); lexoPosition (Phase 4 Step 2) — the only place on the server that produces or consumes `position` strings
│   │   ├── validators/     # validate.middleware.ts (generic zod runner; supports source: "body" | "params" | "query")
│   │   └── types/          # express.d.ts (global Request.user + Request.board + Request.column + Request.task augmentation)
│   ├── modules/            # One folder per feature
│   │   ├── auth/                    # auth.controller, auth.service, auth.validation, auth.routes, index
│   │   ├── boards/                  # boards.controller, boards.service, boards.validation, boards.routes, index — CRUD + members + invitations
│   │   ├── board-invitations/       # board-invitations.controller, board-invitations.service, board-invitations.validation, board-invitations.routes, index — list / accept / decline invitations addressed to the caller
│   │   ├── columns/                 # columns.controller, columns.service, columns.validation, columns.routes, index — CRUD + intra-board reorder (Phase 3) + single-column move POST /api/columns/:id/move (Phase 4 Step 4)
│   │   ├── tasks/                   # tasks.controller, tasks.service, tasks.validation, tasks.routes, index — CRUD (Phase 3) + task move POST /api/columns/:columnId/tasks/:taskId/move (Phase 4 Step 3)
│   │   └── health/                  # health.controller, health.service, health.routes, index
│   └── generated/prisma/   # Prisma client output (gitignored)
├── .env                    # DATABASE_URL, JWT_SECRET, PORT, BCRYPT_SALT_ROUNDS, JWT_EXPIRES_IN (gitignored)
├── package.json
└── tsconfig.json
```

**Adding a new feature module** — create `src/modules/<name>/` with:
- `<name>.controller.ts` — HTTP I/O only (read `req`, call service, write `res`)
- `<name>.service.ts` — business logic (DB, hashing, external calls)
- `<name>.validation.ts` — `zod` schemas + inferred input types
- `<name>.routes.ts` — `Router` that wires `validate(schema, "body" | "params") → [loadBoard|loadColumn|loadTask → requireBoardAccess|requireBoardOwner →] asyncHandler(controller.fn)`
- `index.ts` — barrel: `export { default as <name>Router } from "./<name>.routes.js"`

Then mount it in `src/app.ts` (e.g. `app.use("/api/<name>", <name>Router)`) and add the new env vars (if any) to the `EnvSchema` in `src/config/env.ts`. Throw `HttpError(status, message)` from the service to surface domain errors through the central error middleware. On `:id` routes that resolve to a board-scoped resource, use the deepest applicable loader: `loadBoard` for board routes, `loadColumn` for column routes (auto-exposes `req.board`), or `loadTask` for task routes (auto-exposes `req.board` and `req.column`) — never re-query the parent inside the controller. **Phase 4 move endpoints** (Steps 3 and 4) wrap their writes in `prisma.$transaction` and use `lexoPosition` (in `src/common/utils/lexoPosition.ts`) to compute new positions — never produce or compare `position` strings inline. All integer-arithmetic call sites have been replaced; `npx tsc --noEmit` is clean.

## Environment & Configuration

- `.env*` files are gitignored at root, `client/kanban-board-client/`, and `server/` levels.
- Required backend env vars: `DATABASE_URL`, `JWT_SECRET`. Optional: `PORT` (default 4000), `BCRYPT_SALT_ROUNDS` (default 12), `JWT_EXPIRES_IN` (default `7d`). The schema lives in `src/config/env.ts` (zod) — add new keys there, then read them off the typed `config` object.
- The frontend `LayoutProps` type used in `src/app/layout.tsx` comes from Next.js 16's type system — do not shadow it.
- The server uses Prisma 7's driver-adapter pattern — import the client from `src/generated/prisma/client.js` (note the `.js` extension — required by `module: NodeNext`) and pass a `PrismaPg` adapter to `new PrismaClient({ adapter })`. Do not use the legacy `PrismaClient` constructor without an adapter.
- **ESM import rules** for the backend: every relative import must use the `.js` extension, and type-only imports must use `import type { ... }` (`verbatimModuleSyntax: true`). The on-disk source files are still `.ts`; only the import specifier changes.

## Testing

No automated test framework is configured yet. For now:
- **Phase 1 (auth)** and **Phase 2 (boards & access control)** are validated end-to-end by `server/phase2-e2e.ps1` — a self-contained PowerShell script that hits the live dev server with 48 assertions covering the 13-step happy path plus key negative cases. Run it with `cd server && powershell -ExecutionPolicy Bypass -File .\phase2-e2e.ps1` after `npm run dev` is up on port 4000. Each run uses a unique email suffix so it is safe to re-run against any environment.
- **Phase 4 (ordering & task movement)** is validated end-to-end by `server/phase4-e2e.ps1` — a self-contained PowerShell script that hits the live dev server with 58 assertions covering the new ordering surface: `position` asc ordering on columns and tasks, same-column reorders, cross-column moves, `toIndex` clamping, all 4xx validation cases (non-UUID `toColumnId`/`:columnId`/`:taskId`, negative/non-integer/missing `toIndex`, unauthenticated), non-member 403, cross-board 403, missing/soft-deleted column 404, column move, the legacy `PATCH /boards/:boardId/columns/reorder` endpoint, atomicity, the open-ended re-pack fallback (detected by matching the V-tail rePackKey sequence), and re-pack isolation between sibling columns. Run it with `cd server && powershell -ExecutionPolicy Bypass -File .\phase4-e2e.ps1`. The script is independent of `phase2-e2e.ps1` and uses its own email suffix; both can run back-to-back against the same dev server.
- **Phase 4 Step 7 (codified verification)** is validated by `server/phase4-step7-e2e.ps1` — a self-contained PowerShell script with 32 assertions in three independent sections: §A (column-move re-pack interop, 9 assertions, requires the live dev server), §B (every `VAL-4.6.*` non-functional check, 16 assertions, file-inspection / shell-grep only), §C (frontend static-analysis baseline: deps, `QueryClientProvider`, no global state library, `KeyboardSensor` + `sortableKeyboardCoordinates`, nested `SortableContext`, `role="status"` toast, optimistic-update rollback contract, 7 assertions). Run it with `cd server && powershell -ExecutionPolicy Bypass -File .\phase4-step7-e2e.ps1`. The browser-driven visual checks (drag-and-drop UX, keyboard interaction) that can't be codified without a test framework (per REQ-4.6.12) live in `specs/Phase04/Validation.md` "Phase 4 — Step 7 Manual Verification" as a human-tickable checklist.
- The `lexoPosition` helper is unit-tested by `server/lexoPosition.smoke.mjs` — run with `cd server && node --experimental-strip-types --no-warnings ./lexoPosition.smoke.mjs` (24 invariants from Plan §2.2; exit 0 on success).
- The specs (`specs/Techstack.md`) plan for: Backend: `jest` + `supertest`; Frontend: component tests (optional); E2E: register → create board → share → move tasks. Set up automated testing as part of Phase 5 (Polish & Testing) per `specs/Roadmap.md`.

## Git & Version Control

- The root repository is the primary repo. `client/kanban-board-client/` has its own nested `.git` — changes inside it are tracked separately.
- Commit messages should follow the project's existing style (conventional commits with a `type: subject` prefix — see `git log` for the most recent examples). The first commit was `5f1008f Project Init`; subsequent work uses `feat:`, `docs:`, etc.

## Specification Documents

- `specs.md` — High-level project summary
- `specs/Mission.md` — Purpose, what we're building, core principles, success criteria
- `specs/Techstack.md` — Full tech stack with planned libraries for frontend, backend, database, and tooling
- `specs/Roadmap.md` — 5-phase implementation roadmap (Foundation → Boards & Access → Columns & Tasks → Ordering & Drag-and-Drop → Polish)
- `specs/Phase01/` — Phase 1 detailed deliverables (Plan, Requirements, Validation)
- `specs/Phase02/` — Phase 2 detailed deliverables (Plan, Requirements, Validation) — Boards & Access Control
- `specs/Phase03/` — Phase 3 detailed deliverables (Plan, Requirements, Validation) — Columns & Tasks (Steps 1–4 done: schema evolution + access-control loaders + columns module + tasks module; nested `GET /api/boards/:id` shape also populated)
- `specs/Phase04/` — Phase 4 detailed deliverables (Plan, Requirements, Validation) — Ordering & Task Movement (Steps 1–7 done: `position Int → String` migration on `Column` and `Task`; `lexoPosition` helper; move endpoints for tasks and columns; Next.js board view with `@dnd-kit` + TanStack Query; `server/phase4-e2e.ps1` (58 assertions); `server/phase4-step7-e2e.ps1` (32 assertions); `Validation.md` Summary Checklist ✅ everywhere; Step 7 manual-verification checklist; Phase 4 closed out)

## Design System Guidelines

- Prioritize using the tokens defined in `@design/design.md` for layout, colors, and spacing.
- Use the Stitch MCP server to inspect visual assets, layouts, and DOM hierarchy before writing UI code.

## Development Workflow & Skills

- **Up-to-date library documentation:** When referencing or implementing with a library, framework, SDK, API, CLI tool, or cloud service (e.g., Next.js, React, Tailwind CSS, Prisma, Express), use the `find-docs` skill (backed by Context7 / `ctx7`) to fetch current docs rather than relying on training data. API syntax, configuration options, and version-specific behavior can change rapidly.
- **Modern UI design:** When building or reshaping visual UI, invoke the `/frontend-design` skill for guidance on intentional visual design, typography, and choices that avoid templated-looking defaults.
