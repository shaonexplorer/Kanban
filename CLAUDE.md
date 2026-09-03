# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

```
Mini Kanban Board/
├── client/
│   └── kanban-board-client/    # Next.js 16 + React 19 + TypeScript + Tailwind CSS v4
├── server/                      # Backend (Node.js + Express + TypeScript + Prisma) — Phase 1 complete
├── specs/                       # Project specifications and documentation
│   ├── Mission.md              # Project purpose and success criteria
│   ├── Techstack.md            # Tech stack decisions and planned libraries
│   ├── Roadmap.md             # Phased implementation roadmap
│   ├── Phase01/               # Phase 1 deliverables (Plan, Requirements, Validation) — Foundation
│   └── Phase02/               # Phase 2 deliverables (Plan, Requirements, Validation) — Boards & Access Control (in progress)
└── specs.md                     # Top-level spec summary
```

**Important:** The `client/kanban-board-client/` directory is a separate Git repository (own `.git`). The `server/` directory contains the implemented backend organized as a **Modular MVC** layout (per-feature modules + a `common/` cross-cutting layer) on native ES Modules.

**Note:** Docker is intentionally not used in this project. There is no `docker-compose.yml` or `Dockerfile` — run the database, backend, and frontend directly on the host.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Backend:** Node.js + Express 5 + TypeScript (ES Modules, Modular MVC layout)
- **Database:** PostgreSQL + Prisma 7 (with `@prisma/adapter-pg` driver adapter)
- **Auth:** JWT tokens (`jsonwebtoken`) + bcrypt password hashing (`bcryptjs`)
- **Access control (Phase 2):** `loadBoard` + `requireBoardAccess` + `requireBoardOwner` middlewares in `server/src/common/middleware/access-control.middleware.ts`. `loadBoard` reads the board id from `req.params` (or `req.body`) and attaches the non-deleted `Board` to `req.board`; the two `require*` middlewares enforce owner-only vs. owner-or-member access and throw `HttpError(403, "Forbidden")` otherwise. Reusable in Phase 3+ for column/task scopes.
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

The backend lives at `server/` and is organized as a **Modular MVC** layout on native ES Modules. **Phase 1 (Foundation) is complete; Phase 2 (Boards & Access Control) is in progress** — the Prisma schema includes `Board.deletedAt`, `BoardUser.joinedAt`, and a `BoardInvitation` model (with `BoardInvitationStatus` enum), and the access-control middlewares (`loadBoard`, `requireBoardAccess`, `requireBoardOwner`) live in `src/common/middleware/access-control.middleware.ts`. The `boards` and `board-invitations` modules land in the next steps.

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
- Validation: **`zod`** schemas in each feature module, run via a generic `validate(schema)` middleware
- Dev runner: **`tsx`** (replaces `ts-node-dev` for ESM compatibility)
- Auth: `POST /api/auth/register`, `POST /api/auth/login` → returns signed JWT
- Middleware: `authMiddleware` (attaches `req.user`) and `requireAuth` (rejects unauthenticated); `loadBoard` + `requireBoardAccess` + `requireBoardOwner` in `access-control.middleware.ts` (Phase 2) — wire them as `requireAuth → loadBoard → requireBoardAccess|requireBoardOwner` on every `:id` board route
- Health: `GET /health` — returns 200 `{status: "ok", timestamp, db: "up"}` when the DB responds to a `SELECT 1`, or 503 `{status: "degraded", timestamp, db: "down", error}` when it doesn't (useful for orchestrators/liveness probes)

**Layout (Modular MVC):**
```
server/
├── prisma/
│   ├── schema.prisma       # User, Board (soft-delete via deletedAt), BoardUser (+ joinedAt), BoardInvitation (+ BoardInvitationStatus enum), Column, Task
│   └── migrations/         # Generated SQL migrations (init, phase02_boards_access, ...)
├── src/
│   ├── index.ts            # Entry point — validates env, connects DB, starts server
│   ├── app.ts              # Express app factory (helmet, cors, json, mounts modules, error mw)
│   ├── config/
│   │   └── env.ts          # Zod-validated env (config + validateEnv)
│   ├── lib/prisma.ts       # Shared Prisma client (hot-reload safe singleton)
│   ├── common/             # Cross-cutting layer — no business logic
│   │   ├── errors/         # HttpError class + central errorMiddleware
│   │   ├── middleware/     # auth.middleware.ts (authMiddleware + requireAuth), access-control.middleware.ts (loadBoard, requireBoardAccess, requireBoardOwner) — Phase 2 in progress
│   │   ├── utils/          # asyncHandler (forwards rejections to error mw)
│   │   ├── validators/     # validate.middleware.ts (generic zod runner)
│   │   └── types/          # express.d.ts (global Request.user + Request.board augmentation)
│   ├── modules/            # One folder per feature
│   │   ├── auth/                    # auth.controller, auth.service, auth.validation, auth.routes, index
│   │   ├── boards/                  # Phase 2 (planned): board CRUD + member management
│   │   ├── board-invitations/       # Phase 2 (planned): list / accept / decline invitations
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
- `<name>.routes.ts` — `Router` that wires `validate(schema, "body" | "params") → [loadBoard → requireBoardAccess|requireBoardOwner →] asyncHandler(controller.fn)`
- `index.ts` — barrel: `export { default as <name>Router } from "./<name>.routes.js"`

Then mount it in `src/app.ts` (e.g. `app.use("/api/<name>", <name>Router)`) and add the new env vars (if any) to the `EnvSchema` in `src/config/env.ts`. Throw `HttpError(status, message)` from the service to surface domain errors through the central error middleware. On `:id` routes that resolve to a board-scoped resource, always use `loadBoard` (or its Phase 3 successors `loadColumn` / `loadTask`) to populate `req.board` before the authorization check — never re-query the board inside the controller.

## Environment & Configuration

- `.env*` files are gitignored at root, `client/kanban-board-client/`, and `server/` levels.
- Required backend env vars: `DATABASE_URL`, `JWT_SECRET`. Optional: `PORT` (default 4000), `BCRYPT_SALT_ROUNDS` (default 12), `JWT_EXPIRES_IN` (default `7d`). The schema lives in `src/config/env.ts` (zod) — add new keys there, then read them off the typed `config` object.
- The frontend `LayoutProps` type used in `src/app/layout.tsx` comes from Next.js 16's type system — do not shadow it.
- The server uses Prisma 7's driver-adapter pattern — import the client from `src/generated/prisma/client.js` (note the `.js` extension — required by `module: NodeNext`) and pass a `PrismaPg` adapter to `new PrismaClient({ adapter })`. Do not use the legacy `PrismaClient` constructor without an adapter.
- **ESM import rules** for the backend: every relative import must use the `.js` extension, and type-only imports must use `import type { ... }` (`verbatimModuleSyntax: true`). The on-disk source files are still `.ts`; only the import specifier changes.

## Testing

No test framework is currently configured. The specs (`specs/Techstack.md`) plan for:
- Backend: `jest` + `supertest`
- Frontend: component tests (optional)
- E2E: register → create board → share → move tasks

Set up testing as part of Phase 5 (Polish & Testing) per `specs/Roadmap.md`.

## Git & Version Control

- The root repository is the primary repo. `client/kanban-board-client/` has its own nested `.git` — changes inside it are tracked separately.
- Commit messages should follow the project's existing style (current commit: `5f1008f Project Init`).

## Specification Documents

- `specs.md` — High-level project summary
- `specs/Mission.md` — Purpose, what we're building, core principles, success criteria
- `specs/Techstack.md` — Full tech stack with planned libraries for frontend, backend, database, and tooling
- `specs/Roadmap.md` — 5-phase implementation roadmap (Foundation → Boards & Access → Columns & Tasks → Ordering & Drag-and-Drop → Polish)
- `specs/Phase01/` — Phase 1 detailed deliverables (Plan, Requirements, Validation)
- `specs/Phase02/` — Phase 2 detailed deliverables (Plan, Requirements, Validation) — Boards & Access Control

## Development Workflow & Skills

- **Up-to-date library documentation:** When referencing or implementing with a library, framework, SDK, API, CLI tool, or cloud service (e.g., Next.js, React, Tailwind CSS, Prisma, Express), use the `find-docs` skill (backed by Context7 / `ctx7`) to fetch current docs rather than relying on training data. API syntax, configuration options, and version-specific behavior can change rapidly.
- **Modern UI design:** When building or reshaping visual UI, invoke the `/frontend-design` skill for guidance on intentional visual design, typography, and choices that avoid templated-looking defaults.
