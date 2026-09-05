# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repo.

## Project Structure

```
Mini Kanban Board/
├── client/kanban-board-client/    # Next.js 16 + React 19 + TS + Tailwind v4 + @dnd-kit + TanStack Query
├── server/                         # Express 5 + TS (ESM) + Prisma 7 — Modular MVC
├── specs/                          # Plan.md / Requirements.md / Validation.md per phase
└── specs.md                        # Top-level summary
```

`client/kanban-board-client/` is a separate git repo. **No Docker** — services run on the host.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TS, Tailwind v4, `@dnd-kit/*`, `@tanstack/react-query`. Phase 4 (board view) + Phase 5 Steps 1–9a done. `npx tsc --noEmit`, `npm run lint`, `npm run build` clean.
- **Backend:** Node 22 + Express 5 + TS (`module: NodeNext`, `verbatimModuleSyntax`, ESM `.js` imports) + Prisma 7 (`@prisma/adapter-pg`, import from `src/generated/prisma/client.js`). Modular MVC: per-feature `controller / service / validation / routes / index`. Phase 1–4 + Phase 5 Float simplification + Steps 7, 8 done; Steps 9 (rate limit), 10 (schema widening), 11 (jest) planned.
- **DB:** PostgreSQL + Prisma 7.
- **Auth:** JWT (`jsonwebtoken`) + `bcryptjs`. Delivered as httpOnly `token` cookie via `cookie-parser` (Step 8) — `Authorization: Bearer …` removed. No `localStorage` on the client.
- **Validation:** `zod` per module + generic `validate(schema, source?)` middleware. Tags each handler with non-enumerable `kanbanValidate` marker so `scripts/audit-routes.mts` can detect validators by introspection (29 routes, 7 public, 22 validated, 100% non-public).
- **Ordering:** `Column.position` and `Task.position` are `Float @default(1000)`. Helper at `server/src/common/utils/floatPosition.ts` (`nextAppend`, `between`, `rePack`) — the **only** place position math runs. Inline `position: max+1` is forbidden. Float precision floor (~50 midpoint inserts) — workaround is `PATCH /reorder`.
- **Dev runner:** `tsx`. **Package manager:** npm.

## Frontend

```bash
cd client/kanban-board-client
npm run dev          # http://localhost:3000 (requires server on :4000)
npm run build
npm run lint
npx tsc --noEmit
```

**Layout** (`client/kanban-board-client/src/`):

```
app/                          # layout.tsx → <Providers>; page.tsx (AuthScreen when logged out; logged-in redirects); boards/[id]/page.tsx
design/                       # tokens.css (Kinetic Grid palette/type/radius/spacing), motion.css (Phase 5 ease + duration tokens)
features/
  auth/                       # AuthContext.tsx (Step 8), AuthScreen.tsx, useAuth.ts
  board/                      # BoardView.tsx (tier-based), Column.tsx, types.ts, api.ts, useBoardQuery.ts + mutation hooks (move/rename/delete task+col, create task+col, invite/remove member, update board, create board)
    components/               # Sidebar / SidebarOverlay / LaneFocusView / BoardHeader (real bell w/ invitations badge) / BoardControlBar / ColumnShell (column-management menu) / TaskCardShell / QuickAddTask / AddColumnGhost / TaskModal / ShareBoardModal / CreateBoardDrawer / Toast / ScrollToEndChevron / Icon / UserAvatar
  invitations/                # Phase 5 Step 9a — useMyInvitationsQuery + Accept/Decline mutations + <InvitationsInbox /> modal
  overlays/                   # useOverlayState.tsx (~50 lines, no dep) — owns createBoardOpen / selectedTaskId / expectedBoardId / invitationsInboxOpen at app root
lib/                          # api.ts (axios, withCredentials: true), useMediaQuery.ts (useSyncExternalStore)
```

**Conventions:**

- Server components by default; `"use client"` only when using hooks / dnd-kit / React Query.
- HTTP: reuse `src/lib/api.ts`. `withCredentials: true` — the browser attaches the httpOnly `token` cookie automatically. Do NOT add an `Authorization: Bearer …` interceptor (removed Step 8).
- Auth: `useAuth()` exposes `{ isAuthenticated, userId, userEmail, registerWithEmail, loginWithEmail, signOut }`. No `token`/`setToken`/`clearToken` (cookie-only). Identity fetched from `GET /api/auth/me`. `signOut()` calls `POST /api/auth/logout`; caller does the `router.replace("/")`.
- React Query: one `QueryClient` per tab via `useState` initializer in `src/app/providers.tsx`. Default `staleTime: 30_000`, `refetchOnWindowFocus: false`.
- **Optimistic updates:** snapshot at dnd-kit `onDragStart` into `useRef`. Mutations roll back to that snapshot on error. **Move-task contract:** `BoardView.handleDragEnd` reads the original column + index from the pre-drag snapshot; short-circuits the mutation only when `originalColumnId === toColumnId && originalIndex === toIndex && currentIndex === toIndex`. Upward drags would otherwise silently no-op (the post-`onDragOver` cache has already moved the task).
- Next.js 16: dynamic `params` is `Promise<{ id: string }>` — `await params`.
- Icons (`Icon.tsx`): inline-SVG Material Symbols. Size with `w-* h-*` (width/height), NEVER `text-[Npx]`.
- **Motion tokens** (`src/design/motion.css`): `--ease-standard: cubic-bezier(0.2, 0, 0, 1)`, `--ease-emphasized: cubic-bezier(0.3, 0, 0, 1)`, `--duration-fast: 120ms`, `--duration-medium: 200ms`, `--duration-slow: 320ms` — all exposed as Tailwind v4 `@theme` keys so `duration-(--duration-medium)` + `ease-standard` work without config. Modals use `animate-in fade-in zoom-in-95 duration-(--duration-medium) ease-(--ease-emphasized)`; toasts use `animate-in slide-in-from-bottom-2 fade-in ...`. **No** `framer-motion`.
- **Responsive tiers** (Step 1): `compact < 640px` (sidebar as `<SidebarOverlay />` slide-in, board as `<LaneFocusView />` with tab strip, no dnd-kit) / `tablet 640–1023px` (320px drawer, `PointerSensor` only, `<ScrollToEndChevron />` floats right) / `desktop ≥ 1024px` (full `<Sidebar />` collapsible to icons, `PointerSensor + KeyboardSensor`). Tier from `useMediaQuery("(min-width: 640px)")` + `useMediaQuery("(min-width: 1024px)")` (both `useSyncExternalStore`, no dep).
- **Loading/error/empty (Step 4):** `<BoardSkeleton />` (3 ghost cols × 5 ghost cards, `animate-pulse`, tier-aware) + `<BoardErrorState />` discriminated on `network | auth | forbidden | not_found | unknown` (auth → `useAuth().signOut() + router.replace("/")`). `<EmptyBoardsState />` for no-boards (invitations line + View button + Create CTA + sign-out link). `readErrorStatus(error)` in `lib/api.ts` extracts HTTP status from `AxiosError`.
- **Keyboard shortcuts (Step 6):** `c` → `<QuickAddTaskModal />` (column select + title input → `useCreateTaskMutation`), `b` → `<CreateBoardDrawer />`, `m` → `<ShareBoardModal />`, `?` → `<KeyboardShortcutsHelp />` (or `?` button in `BoardControlBar`), `Esc` closes overlays. Keydown in `BoardView` short-circuits if target is `input`/`textarea`/`[contenteditable]`, if a modifier is held, or if any overlay is already open (only `?` may layer).
- **`TaskModal`** (Step 5 wired): title + Raw-tab description edits debounced 600ms → `PATCH /api/tasks/:id` via `useUpdateTaskMutation`. Star toggle is local-state only (Step 10 will add `Task.starred`). Trash → `useDeleteTaskMutation` + 5s "Undo" toast (`Toast` `action` prop) that re-creates via `useCreateTaskMutation`. Subtasks / comments / metadata sidebar / role change stay local-state and toast `${surface} ships in Phase 5 Step 10.`. Open via `selectedTaskId` in lifted `useOverlayState` (with `expectedBoardId` to prevent stale-id rendering). Re-mount on `key={task.id}`, not on `open` (project's ESLint rejects `setState-in-effect`).
- **`ShareBoardModal` + `CreateBoardDrawer`** (Step 5 wired): `onSendInvite` → optimistic `POST /api/boards/:id/members` via `useInviteMemberMutation`; `onRemoveMember` → optimistic `DELETE /api/boards/:id/members/:userId` via `useRemoveMemberMutation`; `onLinkSharingChange` → `PATCH /api/boards/:id` via `useUpdateBoardMutation`; `onCreate` → `POST /api/boards` with `{ title, projectKey (≤6 uppercased), colorIdentity, template }` via `useCreateBoardMutation`, then `router.push("/boards/:newId")`. The new POST/PATCH board fields are accepted server-side but **dropped at the Prisma write** (Step 10 adds the columns). `onChangeMemberRole` stays no-op until Step 10.
- **`useOverlayState`** (`src/features/board/overlays/useOverlayState.tsx`, ~50 lines): owns `createBoardOpen` + `selectedTaskId` + `expectedBoardId` + `invitationsInboxOpen` at app root (`<OverlayStateProvider />` in `app/layout.tsx`). Home page and board view share the same flags without prop-drilling.
- **`AddColumnGhost` + `useCreateColumnMutation`:** `POST /api/boards/:boardId/columns` with standard onMutate (optimistic placeholder at `Number.MAX_SAFE_INTEGER`) → onSuccess swap → onError snapshot rollback → onSettled invalidate. Same `<AddColumnGhost />` rendered in 3 places: tablet/desktop empty-state branch, column strip tail, compact tier `<LaneFocusView />` empty state.
- **`ColumnShell` column-management menu:** header `more_horiz` opens `<div role="menu">` with **Rename** (input swap, Enter/blur commit, Esc revert, double-click shortcut) + **Delete** (two-step "Click to confirm" with 3s auto-disarm via inline `setTimeout`, icon `delete` → `warning`). Same anti-misclick pattern as `TaskModal` trash and `InvitationsInbox` decline. Wired by `BoardView.handleRenameColumn` / `handleDeleteColumn` → `useUpdateColumnMutation` (`PATCH /api/columns/:id`) / `useDeleteColumnMutation` (`DELETE /api/columns/:id`). **No Undo for column delete** (re-creating cascade-wiped tasks is expensive / race-prone). `LaneFocusView` forwards both props so compact tier gets the same affordance.
- **Auth + sign-out surfaces:** `<Sidebar />` user card (`data-testid="sidebar-signout"`), `<SidebarOverlay />` (wraps `<Sidebar />`), `<EmptyBoardsState />` (`data-testid="empty-boards-signout"`). All three: `useAuth().signOut() + router.replace("/")`.

## Backend

```bash
cd server
npm run dev          # Express + tsx watch on :4000
npm run build
npm start
npm run lint         # tsc --noEmit && tsx scripts/audit-routes.mts (Phase 5 Step 7 gate)
npm run prisma:generate / migrate / studio
```

**Layout** (Modular MVC, native ESM):

```
server/
├── prisma/schema.prisma          # User, Board (soft-delete via deletedAt), BoardUser (+ joinedAt), BoardInvitation, Column, Task; Step 10 widens Task (starred/priority/dueDate/storyPoints/labels/assignees), Board (linkSharing/projectKey/colorIdentity/template), BoardUser.role (String → BoardRole enum), + TaskSubtask + TaskComment
├── prisma/migrations/            # init, phase02_boards_access, phase04_fractional_positions, phase05_float_positions, phase05_polish (Step 10, planned)
├── src/
│   ├── index.ts                  # env → DB → listen
│   ├── app.ts                    # createApp(): helmet, cors({origin:CORS_ORIGIN, credentials:true}), json, cookie-parser, modules, error mw
│   ├── config/env.ts             # zod env (DATABASE_URL, JWT_SECRET required; PORT, BCRYPT_SALT_ROUNDS, JWT_EXPIRES_IN, CORS_ORIGIN, NODE_ENV, LOG_LEVEL optional)
│   ├── lib/prisma.ts             # shared PrismaClient with PrismaPg adapter (singleton)
│   ├── common/                   # errors (HttpError + errorMw), middleware (auth[cookie] + access-control[loadBoard/Column/Task + requireBoardAccess/Owner], planned logger + rate-limit), utils (asyncHandler, floatPosition), validators (validate.middleware w/ kanbanValidate marker), envelope.ts (envelope<T>() + errorEnvelope()), types (express.d.ts)
│   ├── modules/                  # auth/, boards/, board-invitations/, columns/, tasks/, health/ — each = controller/service/validation/routes/index
│   └── generated/prisma/         # gitignored
├── scripts/audit-routes.mts      # Step 7 — walks live route table from createApp(); asserts validate(...) on every non-public route. 29 routes, 7 public, 22 validated.
├── .env                          # gitignored
├── phase2-e2e.ps1                # 48 assertions (Step 8: WebRequestSession cookies)
├── phase4-e2e.ps1                # 59 assertions (Float ordering)
├── phase4-step7-e2e.ps1          # 45 assertions (§A Float column-move / §B VAL-4.6.* / §C frontend static / §D Step 7 audit)
└── phase5-e2e.ps1                # planned (Step 13) ≥ 60 assertions
```

**Routes** (current; Step 10 additions noted):

- `GET /health` (public; 200 `{status:"ok",timestamp,db:"up"}` on `SELECT 1` success, else 503).
- `POST /api/auth/register`, `/login` (public; set httpOnly `token` cookie + return `{id,email,token}`); `GET /api/auth/me` (public allowlist, behind `requireAuth`); `POST /api/auth/logout` (behind `requireAuth`, clears cookie, 204).
- `GET /api/boards` (public allowlist, behind `requireAuth`); `POST /api/boards` (Step 5 widened: optional `projectKey` ≤6 uppercased, `colorIdentity` enum, `template` enum — accepted on wire, dropped at Prisma write until Step 10); `GET /api/boards/:id` (nested columns[tasks] by position asc, members owner-first by joinedAt); `PATCH /api/boards/:id` (Step 5 widened with optional `linkSharing`); `DELETE /api/boards/:id` (soft-delete via `deletedAt`); `GET/POST/DELETE /api/boards/:id/members`; **Step 10 planned**: `PATCH /api/boards/:id/members/:userId` for role change.
- `GET /api/board-invitations` (caller's PENDING invites); `POST /api/board-invitations/:id/accept` (atomic upsert BoardUser + flip to ACCEPTED); `POST /api/board-invitations/:id/decline`.
- Columns: `GET/POST /api/boards/:boardId/columns`, `GET/PATCH/DELETE /api/columns/:id` (CASCADE to tasks on delete), `PATCH /api/boards/:boardId/columns/reorder` (re-key via `floatPosition.rePack(i)`), `POST /api/columns/:id/move` (Step 4, Float).
- Tasks: `GET/POST /api/columns/:columnId/tasks`, `GET/PATCH/DELETE /api/tasks/:id` (Step 10 widens PATCH: `starred`, `priority`, `dueDate`, `storyPoints`, `labels`), `POST /api/columns/:columnId/tasks/:taskId/move` (Step 3, Float). **Step 10 planned**: `POST/PATCH/DELETE /api/tasks/:id/subtasks[/:subtaskId]`, `GET/POST /api/tasks/:id/comments`, `PUT /api/tasks/:id/assignees`.

**Middleware chain** on resource `:id` routes: `requireAuth → validate(ParamSchema, "params") → loadBoard|loadColumn|loadTask → requireBoardAccess|requireBoardOwner → asyncHandler(controller.fn)`. `loadColumn`/`loadTask` auto-populate `req.board` (single query joins parent). Cross-board moves return 403, not 404. `position` is changed only via `move` or `reorder`, never via `PATCH`.

**Float position helper:** `server/src/common/utils/floatPosition.ts` is the **only** place that produces or consumes position Floats. Use `floatPosition.nextAppend(max)`, `floatPosition.between(prev, next)`, `floatPosition.rePack(i)`. Inline `position: max+1` is forbidden. Move endpoints wrap in `prisma.$transaction`.

**Adding a new module:** create `src/modules/<name>/` with `controller / service / validation / routes / index`, mount in `src/app.ts` (`app.use("/api/<name>", <name>Router)`), add env vars (if any) to `EnvSchema`. Throw `HttpError(status, message)` from the service.

**ESM imports:** every relative import uses `.js` ext; type-only imports use `import type { ... }` (`verbatimModuleSyntax: true`). Prisma 7: `import { PrismaClient } from "../generated/prisma/client.js"` + `PrismaPg` adapter passed to `new PrismaClient({ adapter })`.

## Environment

- `.env*` gitignored at root / client / server. Backend required: `DATABASE_URL`, `JWT_SECRET`. Optional: `PORT` (4000), `BCRYPT_SALT_ROUNDS` (12), `JWT_EXPIRES_IN` (`7d`), `CORS_ORIGIN` (default `http://localhost:3000`, comma-separated), `NODE_ENV` (toggles `Secure` on cookie), `LOG_LEVEL` (`info` for planned pino logger).
- Frontend: don't shadow `LayoutProps` from Next.js 16 in `src/app/layout.tsx`.

## Testing

No `jest`/`vitest` yet — Steps 11/12 planned. Validation exercised by three PowerShell e2e scripts (`cd server` first; `npm run dev` on :4000):

- `phase2-e2e.ps1` — 48 assertions (uses `WebRequestSession` cookie jar).
- `phase4-e2e.ps1` — 59 assertions (Float ordering surface).
- `phase4-step7-e2e.ps1` — 45 assertions (§A Float column-move / §B VAL-4.6.* non-functional / §C frontend static / §D Phase 5 Step 7 input-validation audit).

Step 8 extended `VAL-4.6.3` "no new top-level server deps" allowlist for `cookie-parser` + `@types/cookie-parser`. Step 8 rewrote `phase4-step7-e2e.ps1` §B grep checks from `& grep` to native `Get-Content`/`-match` (Windows has no `grep` on PATH).

`floatPosition` math is exercised end-to-end by `phase4-e2e.ps1` (10-task 1000-step append) + `phase4-step7-e2e.ps1` §A; no separate unit test (helper is trivial).

Phase 5 plans backend `jest` + `ts-jest` + `supertest` (80% line / 70% branch) and frontend `vitest` + Testing Library + jsdom (60% line) plus `phase5-e2e.ps1` (≥ 60 assertions in §A rate-limit / §B schema additions / §C non-functional / §D frontend static).

## Git

- Root repo is primary; `client/kanban-board-client/` has its own nested `.git`.
- Conventional-commits `type: subject` (see `git log`). First commit: `5f1008f Project Init`.

## Specs

`specs.md` (top-level), `specs/Mission.md`, `specs/Techstack.md`, `specs/Roadmap.md`, `specs/Phase01/` … `specs/Phase05/` (Plan.md / Requirements.md / Validation.md per phase). Phase 5 = Polishing & Polish (14 steps, ~30 hours); Steps 1–9a + Step 7 (audit) done; Steps 8 (logging) / 9 (rate limit) / 10 (schema) / 11 (jest) / 12 (vitest) / 13 (e2e) / 14 (deploy) planned.

## Deployment & CI (Phase 5, planned)

- `server/.env.example` (planned) mirrors every `process.env.<X>` consumed by `src/`. `scripts/audit-routes.mts` is the formal validation-audit gate (runs in `npm run lint`).
- `GET /health` for orchestrator liveness.
- GitHub Actions `.github/workflows/ci.yml` (planned): `lint-and-typecheck` + `e2e` jobs on `ubuntu-latest` Node 22 with `postgres:16` service container; runs `prisma migrate deploy` + all three `phase*-e2e.ps1` scripts.
- Husky + lint-staged pre-commit (planned): `eslint --fix` + `tsc --noEmit` on staged files.
- **No Docker** at runtime. CI Postgres service is the only transient container.

## Design System

- Use tokens from `@design/design.md` (Kinetic Grid in `src/design/tokens.css`, motion in `src/design/motion.css`).
- Inspect Stitch assets via the Stitch MCP before writing UI.

## Workflow

- For library / framework / SDK / API questions: use the `find-docs` skill (Context7 / `ctx7`) — training data may be stale.
- For modern UI design: invoke `/frontend-design`.