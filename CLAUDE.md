# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

```
Mini Kanban Board/
├── client/
│   └── kanban-board-client/    # Next.js 16 + React 19 + TypeScript + Tailwind CSS v4
├── server/                      # Backend (to be created: Node.js + Express + TypeScript + Prisma)
├── specs/                       # Project specifications and documentation
│   ├── Mission.md              # Project purpose and success criteria
│   ├── Techstack.md            # Tech stack decisions and planned libraries
│   ├── Roadmap.md             # Phased implementation roadmap
│   └── Phase01/               # Phase 1 deliverables (Plan, Requirements, Validation)
└── specs.md                     # Top-level spec summary
```

**Important:** The `client/kanban-board-client/` directory is a separate Git repository (own `.git`). The `server/` directory is currently empty — the backend has not yet been initialized.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Backend:** Node.js + Express + TypeScript (planned; not yet scaffolded)
- **Database:** PostgreSQL + Prisma (planned)
- **Auth:** JWT tokens + bcrypt password hashing (planned)
- **Package manager:** npm

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

The backend will live at `server/` (not yet scaffolded). Based on the specs, the intended stack is:

- Express.js with TypeScript
- Prisma ORM with PostgreSQL
- JWT + bcrypt for authentication

When scaffolding the backend, follow the patterns established in `specs/Phase01/Plan.md` and `specs/Phase01/Requirements.md`.

## Environment & Configuration

- `.env*` files are gitignored at both the root and `client/kanban-board-client/` levels.
- The frontend `LayoutProps` type used in `src/app/layout.tsx` comes from Next.js 16's type system — do not shadow it.

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
