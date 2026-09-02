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
│   └── Phase01/               # Phase 1 deliverables (Plan, Requirements, Validation)
└── specs.md                     # Top-level spec summary
```

**Important:** The `client/kanban-board-client/` directory is a separate Git repository (own `.git`). The `server/` directory contains the implemented backend (auth routes, health check, Prisma schema, JWT middleware).

**Note:** Docker is intentionally not used in this project. There is no `docker-compose.yml` or `Dockerfile` — run the database, backend, and frontend directly on the host.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Backend:** Node.js + Express 5 + TypeScript
- **Database:** PostgreSQL + Prisma 7 (with `@prisma/adapter-pg` driver adapter)
- **Auth:** JWT tokens (`jsonwebtoken`) + bcrypt password hashing (`bcryptjs`)
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

The backend lives at `server/` and is already scaffolded with Phase 1 complete.

```bash
cd server

# Development
npm run dev          # Start Express with ts-node-dev (auto-reload) on port 4000

# Build & deploy
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled output (node dist/index.js)

# Type checking & Prisma
npm run lint         # tsc --noEmit
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

**Stack:**
- Express 5 with TypeScript (target ES2022, commonjs, strict mode)
- Prisma 7 client generated to `src/generated/prisma/` (uses `@prisma/adapter-pg` driver adapter — required by Prisma 7)
- Auth: `POST /api/auth/register`, `POST /api/auth/login` → returns signed JWT
- Middleware: `authMiddleware` (attaches `req.user`) and `requireAuth` (rejects unauthenticated)
- Health: `GET /health`

**Layout:**
```
server/
├── prisma/
│   ├── schema.prisma       # User, Board, BoardUser, Column, Task models
│   └── migrations/         # Generated SQL migrations
├── src/
│   ├── index.ts            # Entry point — validates env, connects DB, starts server
│   ├── app.ts              # Express app factory (helmet, cors, json, routes)
│   ├── config/             # Env validation & config object
│   ├── lib/prisma.ts       # Shared Prisma client (hot-reload safe)
│   ├── routes/             # auth.routes.ts, health.routes.ts
│   ├── middleware/         # auth.middleware.ts
│   └── generated/prisma/   # Prisma client output (gitignored)
├── .env                    # DATABASE_URL, JWT_SECRET, PORT (gitignored)
├── package.json
└── tsconfig.json
```

## Environment & Configuration

- `.env*` files are gitignored at root, `client/kanban-board-client/`, and `server/` levels.
- Required backend env vars: `DATABASE_URL`, `JWT_SECRET`; optional: `PORT` (default 4000).
- The frontend `LayoutProps` type used in `src/app/layout.tsx` comes from Next.js 16's type system — do not shadow it.
- The server uses Prisma 7's driver-adapter pattern — import the client from `src/generated/prisma/client` and pass a `PrismaPg` adapter to `new PrismaClient({ adapter })`. Do not use the legacy `PrismaClient` constructor without an adapter.

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

## Development Workflow & Skills

- **Up-to-date library documentation:** When referencing or implementing with a library, framework, SDK, API, CLI tool, or cloud service (e.g., Next.js, React, Tailwind CSS, Prisma, Express), use the `find-docs` skill (backed by Context7 / `ctx7`) to fetch current docs rather than relying on training data. API syntax, configuration options, and version-specific behavior can change rapidly.
- **Modern UI design:** When building or reshaping visual UI, invoke the `/frontend-design` skill for guidance on intentional visual design, typography, and choices that avoid templated-looking defaults.
