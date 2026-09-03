# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

```
Mini Kanban Board/
├── client/
│   └── kanban-board-client/    # Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 — Phase 4: board view + dnd-kit drag-and-drop + TanStack Query
├── server/                      # Backend (Node.js + Express + TypeScript + Prisma) — Phase 1, 2 & 3 complete; Phase 4 in progress (Steps 1–2 done)
├── specs/                       # Project specifications and documentation
│   ├── Mission.md              # Project purpose and success criteria
│   ├── Techstack.md            # Tech stack decisions and planned libraries
│   ├── Roadmap.md             # Phased implementation roadmap
│   ├── Phase01/               # Phase 1 specs: Plan.md, Requirements.md, Validation.md — Foundation
│   ├── Phase02/               # Phase 2 specs: Plan.md, Requirements.md, Validation.md — Boards & Access Control
│   ├── Phase03/               # Phase 3 specs: Plan.md, Requirements.md, Validation.md — Columns & Tasks (Steps 1–4 done: schema evolution + access-control loaders + columns module + tasks module)
│   └── Phase04/               # Phase 4 specs: Plan.md, Requirements.md, Validation.md — Ordering & Task Movement (Steps 1–2 done: schema migration to position String + lexoPosition helper)
└── specs.md                     # Top-level spec summary
```

**Important:** The `client/kanban-board-client/` directory is a separate Git repository (own `.git`). The `server/` directory contains the implemented backend organized as a **Modular MVC** layout (per-feature modules + a `common/` cross-cutting layer) on native ES Modules.

**Note:** Docker is intentionally not used in this project. There is no `docker-compose.yml` or `Dockerfile` — run the database, backend, and frontend directly on the host.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Backend:** Node.js + Express 5 + TypeScript (ES Modules, Modular MVC layout)
- **Database:** PostgreSQL + Prisma 7 (with `@prisma/adapter-pg` driver adapter)
- **Auth:** JWT tokens (`jsonwebtoken`) + bcrypt password hashing (`bcryptjs`)
- **Access control:** `loadBoard` + `loadColumn` + `loadTask` + `requireBoardAccess` + `requireBoardOwner` middlewares in `server/src/common/middleware/access-control.middleware.ts`. `loadBoard` reads the board id from `req.params` (or `req.body`) and attaches the non-deleted `Board` to `req.board`; `loadColumn` and `loadTask` (Phase 3) do the same for sub-resources, fetching the column (with its board) or the task (with its column and that column's board) in a single query, treating missing or soft-deleted parent as 404, and additionally exposing the resolved board on `req.board` so the same `requireBoardAccess` / `requireBoardOwner` middlewares chain behind them. The two `require*` middlewares enforce owner-only vs. owner-or-member access and throw `HttpError(403, "Forbidden")` otherwise.
- **Ordering:** `lexoPosition` hand-rolled helper in `server/src/common/utils/lexoPosition.ts` (Phase 4) — base-62 lexicographic fractional indices, exports `first()` and `between(a, b): string | null`. Used by every `move*` service to compute new positions atomically inside a `prisma.$transaction`; a `null` return triggers a column-local re-pack. `position` on `Column` and `Task` is now `String @default("a0")` (Phase 4 schema migration).
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

## Backend Development

The backend lives at `server/` and is organized as a **Modular MVC** layout on native ES Modules. **Phase 1 (Foundation), Phase 2 (Boards & Access Control), and Phase 3 (Columns & Tasks) are complete.** **Phase 4 (Ordering & Task Movement) is in progress — Steps 1 & 2 are done:** Step 1 (schema evolution) migrates `Column.position` and `Task.position` from `Int` to `String @default("a0")` via a `prisma migrate dev --name phase04_fractional_positions` migration; all writes go through the new `lexoPosition` helper so positions are lexo indices, not integers. Step 2 implements the `lexoPosition` shared utility in `server/src/common/utils/lexoPosition.ts` — base-62 alphabet, fixed precision, pure function, exports `first()` and `between(a, b): string | null` (the latter signals a re-pack by returning `null` when the midpoint is exhausted). The Phase 3 `columns` and `tasks` modules now route their move endpoints through this helper inside `prisma.$transaction`s, with a column-local re-pack fallback when `between` returns `null`. **Phase 3 step history (for reference):** Step 1 added `onDelete: Cascade` from `Task → Column` so `DELETE /api/columns/:id` cleans up its tasks atomically; `Column → Board` and `Board → BoardUser` remain `RESTRICT` (boards still soft-delete via `deletedAt`). Step 2 extended the access-control layer with `loadColumn` and `loadTask` middlewares in `src/common/middleware/access-control.middleware.ts` — they fetch the column (with its board) or the task (with its column and that column's board) in a single Prisma query, treat missing or soft-deleted parent as 404, and expose the resolved board on `req.board` so the existing `requireBoardAccess` / `requireBoardOwner` middlewares chain behind them unchanged. Step 3 implemented the `columns` module (CRUD + intra-board reorder) in `src/modules/columns/`, mounted on `/api` so a single router owns both `/api/boards/:boardId/columns` and `/api/columns/:id`. Step 4 implemented the `tasks` module (CRUD; reorder + cross-column move are now in Phase 4) in `src/modules/tasks/`, mounted on `/api` so a single router owns both `/api/columns/:columnId/tasks` and `/api/tasks/:id`. The Prisma schema includes `Board.deletedAt`, `BoardUser.joinedAt`, and a `BoardInvitation` model (with `BoardInvitationStatus` enum). The `boards` module (CRUD + member management + owner-driven invitations) is implemented in `src/modules/boards/`, the `board-invitations` module (list / accept / decline invitations addressed to the caller) is implemented in `src/modules/board-invitations/`, the `columns` module is implemented in `src/modules/columns/`, the `tasks` module is implemented in `src/modules/tasks/`, and the `lexoPosition` shared utility lives in `src/common/utils/lexoPosition.ts`. `GET /api/boards/:id` returns the nested shape with `columns[].tasks[]` ordered by `position` asc (per REQ-3.14.1–3.14.3) — `position` is now a lexo string (Phase 4), not an integer. The Phase 4 frontend (board view + dnd-kit + TanStack Query) lives in `client/kanban-board-client/src/features/board/` and the route page `app/boards/[id]/page.tsx`; auth is a placeholder `localStorage` JWT (a real login UI is Phase 5).

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
- Columns: `GET /api/boards/:boardId/columns` (list, `position` asc, 200), `POST /api/boards/:boardId/columns` (create, 201 with `{ id, title, boardId, position }`; new columns append at `position = lexoPosition.between(max-existing, null)`, or `lexoPosition.first()` for an empty board), `GET /api/columns/:id` (200), `PATCH /api/columns/:id` (rename, 200), `DELETE /api/columns/:id` (hard-delete, 204; cascading to tasks per `onDelete: Cascade` on `Task.column`), `PATCH /api/boards/:boardId/columns/reorder` (atomic `prisma.$transaction` that re-keys the board's columns to fresh lexo positions 0..N-1 from the full ordered `columnIds` array; 400 when the set is not identical to the board's current column ids, 200 with the new ordering otherwise), and `POST /api/columns/:id/move` (Phase 4; single-column move within its own board, body `{ toIndex: number }`; atomic `prisma.$transaction` that calls `lexoPosition.between(before, after)` on the board's other columns and falls back to a board-level re-pack when `between` returns `null`; 200 with the moved column). All routes require `requireAuth`; board-scoped routes chain `validate(BoardScopedColumnParamSchema, "params") → loadBoard("params", "boardId") → requireBoardAccess` and column-scoped routes chain `validate(ColumnIdParamSchema, "params") → loadColumn → requireBoardAccess`. Phase 3/4 reuse `requireBoardAccess` for ALL column mutations (both owners and accepted members can author content); `position` is changed only via the reorder or move endpoints, not via `PATCH /api/columns/:id`.
- Tasks: `GET /api/columns/:columnId/tasks` (list, `position` asc, 200; empty array for an empty column), `POST /api/columns/:columnId/tasks` (create, 201 with `{ id, title, description, columnId, position, createdAt }`; new tasks append at `position = lexoPosition.between(max-existing, null)` within the column, or `lexoPosition.first()` for an empty column; body is `{ title: 1–200 chars, description?: ≤ 2000 chars }`), `GET /api/tasks/:id` (200, full task shape), `PATCH /api/tasks/:id` (200, partial of `{ title?, description? }` with `.refine()` enforcing at-least-one-field), `DELETE /api/tasks/:id` (hard-delete, 204), and `POST /api/columns/:columnId/tasks/:taskId/move` (Phase 4; cross-column move + same-column reorder, body `{ toColumnId: UUID, toIndex: number }`; atomic `prisma.$transaction` that calls `lexoPosition.between(before, after)` on the destination column's tasks — `before` and `after` are computed **after** excluding the task being moved, and the index is clamped to the destination's length — with a column-local re-pack fallback when `between` returns `null`; 200 with the moved task's full shape). All routes require `requireAuth`; column-scoped routes chain `validate(ColumnScopedTaskParamSchema, "params") → loadColumn("params", "columnId") → requireBoardAccess` and task-scoped routes chain `validate(TaskIdParamSchema, "params") → loadTask → requireBoardAccess`. Phase 3/4 reuse `requireBoardAccess` for ALL task mutations; `position` and `columnId` are immutable on `PATCH /api/tasks/:id` — the move endpoint is the **only** way to change either. Cross-board moves are forbidden (HTTP 403 even if the caller has access to both boards, verified by the service's defensive check on the destination).
- Middleware: `authMiddleware` (attaches `req.user`) and `requireAuth` (rejects unauthenticated); `loadBoard` + `loadColumn` + `loadTask` + `requireBoardAccess` + `requireBoardOwner` in `access-control.middleware.ts` — wire them as `requireAuth → loadBoard|loadColumn|loadTask → requireBoardAccess|requireBoardOwner` on every resource-scoped `:id` route. `loadColumn` / `loadTask` (Phase 3) auto-populate `req.board` from the parent, so the same `requireBoardAccess` / `requireBoardOwner` middlewares chain behind them unchanged. Phase 4's task-move route additionally chains `loadColumn("params", "columnId") → loadTask("params", "taskId")` so both the source column's board and the task itself are authorized by the middleware chain; the destination column's board is verified by the service's defensive check (cross-board moves return 403, not 404).
- Ordering helper: `lexoPosition` in `server/src/common/utils/lexoPosition.ts` is the **only** place on the server that produces or consumes `position` strings. Services must call `lexoPosition.first()` for empty scopes, `lexoPosition.between(a, b)` for inserts between two neighbors, and treat a `null` return as the trigger for a column/board-local re-pack. Inline position math (e.g. `position: "a" + i.toString()`) is forbidden.
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
│   │   ├── utils/          # asyncHandler (forwards rejections to error mw), lexoPosition.ts (Phase 4: first() + between(a, b) for fractional indices)
│   │   ├── validators/     # validate.middleware.ts (generic zod runner; supports source: "body" | "params" | "query")
│   │   └── types/          # express.d.ts (global Request.user + Request.board + Request.column + Request.task augmentation)
│   ├── modules/            # One folder per feature
│   │   ├── auth/                    # auth.controller, auth.service, auth.validation, auth.routes, index
│   │   ├── boards/                  # boards.controller, boards.service, boards.validation, boards.routes, index — CRUD + members + invitations
│   │   ├── board-invitations/       # board-invitations.controller, board-invitations.service, board-invitations.validation, board-invitations.routes, index — list / accept / decline invitations addressed to the caller
│   │   ├── columns/                 # columns.controller, columns.service, columns.validation, columns.routes, index — CRUD + intra-board reorder (Phase 3) + single-column move POST /api/columns/:id/move (Phase 4)
│   │   ├── tasks/                   # tasks.controller, tasks.service, tasks.validation, tasks.routes, index — CRUD (Phase 3) + task move POST /api/columns/:columnId/tasks/:taskId/move (Phase 4)
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

Then mount it in `src/app.ts` (e.g. `app.use("/api/<name>", <name>Router)`) and add the new env vars (if any) to the `EnvSchema` in `src/config/env.ts`. Throw `HttpError(status, message)` from the service to surface domain errors through the central error middleware. On `:id` routes that resolve to a board-scoped resource, use the deepest applicable loader: `loadBoard` for board routes, `loadColumn` for column routes (auto-exposes `req.board`), or `loadTask` for task routes (auto-exposes `req.board` and `req.column`) — never re-query the parent inside the controller. Phase 4 move endpoints additionally wrap their writes in `prisma.$transaction` and use `lexoPosition` (in `src/common/utils/lexoPosition.ts`) to compute new positions — never produce or compare `position` strings inline.

## Environment & Configuration

- `.env*` files are gitignored at root, `client/kanban-board-client/`, and `server/` levels.
- Required backend env vars: `DATABASE_URL`, `JWT_SECRET`. Optional: `PORT` (default 4000), `BCRYPT_SALT_ROUNDS` (default 12), `JWT_EXPIRES_IN` (default `7d`). The schema lives in `src/config/env.ts` (zod) — add new keys there, then read them off the typed `config` object.
- The frontend `LayoutProps` type used in `src/app/layout.tsx` comes from Next.js 16's type system — do not shadow it.
- The server uses Prisma 7's driver-adapter pattern — import the client from `src/generated/prisma/client.js` (note the `.js` extension — required by `module: NodeNext`) and pass a `PrismaPg` adapter to `new PrismaClient({ adapter })`. Do not use the legacy `PrismaClient` constructor without an adapter.
- **ESM import rules** for the backend: every relative import must use the `.js` extension, and type-only imports must use `import type { ... }` (`verbatimModuleSyntax: true`). The on-disk source files are still `.ts`; only the import specifier changes.

## Testing

No automated test framework is configured yet. For now:
- **Phase 1 (auth)** and **Phase 2 (boards & access control)** are validated end-to-end by `server/phase2-e2e.ps1` — a self-contained PowerShell script that hits the live dev server with 48 assertions covering the 13-step happy path plus key negative cases. Run it with `cd server && powershell -ExecutionPolicy Bypass -File .\phase2-e2e.ps1` after `npm run dev` is up on port 4000. Each run uses a unique email suffix so it is safe to re-run against any environment.
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
- `specs/Phase04/` — Phase 4 detailed deliverables (Plan, Requirements, Validation) — Ordering & Task Movement (Steps 1–2 done: `position Int → String` migration + `lexoPosition` helper; move endpoints + dnd-kit frontend pending)

## Development Workflow & Skills

- **Up-to-date library documentation:** When referencing or implementing with a library, framework, SDK, API, CLI tool, or cloud service (e.g., Next.js, React, Tailwind CSS, Prisma, Express), use the `find-docs` skill (backed by Context7 / `ctx7`) to fetch current docs rather than relying on training data. API syntax, configuration options, and version-specific behavior can change rapidly.
- **Modern UI design:** When building or reshaping visual UI, invoke the `/frontend-design` skill for guidance on intentional visual design, typography, and choices that avoid templated-looking defaults.
