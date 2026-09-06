# Mini Kanban Board

A full-stack Kanban board application for collaborative workflow management.

## Overview

This is a TypeScript monorepo featuring a Next.js 16 frontend and an Express 5
backend, designed to demonstrate modern web development practices with
production-grade authentication, database design, drag-and-drop ordering, and
shareable boards.

## What the app does

A user can:

- **Create boards** — each board represents a distinct workspace or project.
- **Organize workflow columns** — columns represent stages (e.g. Backlog, In
  Progress, Done), reorderable via drag-and-drop or the `PATCH /reorder` API.
- **Manage tasks** — tasks live within columns and carry title + description.
- **Drag and drop** — reorder tasks within a column or move them across
  columns; ordering uses a Float midpoint scheme with a `PATCH /reorder`
  re-pack fallback.
- **Collaborate** — owners can invite registered users to a board; invitees
  accept or decline from an inbox and gain the same authoring access as the
  owner.

## Status

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1     | Auth (register / login / me / logout) | ✅ done |
| 2     | Boards + board invitations + member access control | ✅ done |
| 3     | Columns + tasks CRUD, soft-delete boards | ✅ done |
| 4     | Float-position move + reorder (tasks & columns) | ✅ done |
| 5     | Polishing & polish (14 steps) | Steps 1–9a + Step 7 (audit) done; steps 8–14 planned |

Phase 5 details live under `specs/Phase05/Plan.md`.

## Tech stack

### Frontend (`client/kanban-board-client/`)
- **Next.js 16** (App Router)
- **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **@dnd-kit** for drag-and-drop, with responsive tiers (compact / tablet /
  desktop) and a compact-tier `LaneFocusView` that disables dnd on small
  screens
- **@tanstack/react-query** for server state, including optimistic updates
  with snapshot rollback

### Backend (`server/`)
- **Node 22 + Express 5** in TypeScript (`module: NodeNext`,
  `verbatimModuleSyntax`, ESM `.js` imports)
- **Prisma 7** ORM on **PostgreSQL** (with `@prisma/adapter-pg`)
- **JWT** authentication delivered as an httpOnly `token` cookie
  (`cookie-parser`); `bcryptjs` for password hashing
- **zod** per-module validation, with a generic `validate(schema, source?)`
  middleware that tags handlers with a `kanbanValidate` marker so
  `scripts/audit-routes.mts` can prove every non-public route is validated

## Project structure

```
Mini Kanban Board/
├── client/kanban-board-client/    # Next.js frontend (its own git repo)
│   ├── src/
│   │   ├── app/                   # App Router pages + <Providers> + auth gate
│   │   ├── design/                # tokens.css + motion.css (Kinetic Grid)
│   │   ├── features/
│   │   │   ├── auth/              # AuthContext, AuthScreen, useAuth
│   │   │   ├── board/             # BoardView, Column, types, api, queries
│   │   │   │   └── components/    # Sidebar, BoardHeader, TaskModal, …
│   │   │   ├── invitations/       # useMyInvitationsQuery + Accept/Decline
│   │   │   └── overlays/          # useOverlayState (no-prop-drilling flags)
│   │   └── lib/                   # api (axios, withCredentials) + useMediaQuery
│   └── eslint.config.mjs
├── server/                        # Express backend
│   ├── prisma/
│   │   ├── schema.prisma          # User, Board, BoardUser, BoardInvitation,
│   │   │                          # Column, Task (+ Float position)
│   │   └── migrations/
│   ├── scripts/audit-routes.mts   # Validates every non-public route has zod
│   └── src/
│       ├── app.ts                 # createApp() — helmet, cors, cookie-parser,
│       │                          # json, auth mw, modules, error mw
│       ├── common/                # errors, middleware (auth + access-control),
│       │                          # utils (asyncHandler, floatPosition),
│       │                          # validators (zod middleware)
│       ├── config/env.ts          # zod-validated env loader
│       ├── lib/prisma.ts          # PrismaClient singleton (PrismaPg adapter)
│       └── modules/               # auth/, boards/, board-invitations/,
│                                  # columns/, tasks/, health/
├── specs/                         # Per-phase Plan / Requirements / Validation
└── README.md
```

## Development

### Prerequisites
- Node.js 18+ (the backend uses Node 22 features)
- PostgreSQL
- npm

### Getting started

1. Clone the repository.
2. Set up environment variables in `server/.env`:
   ```
   DATABASE_URL="postgresql://USER:PASS@localhost:5432/kanban?schema=public"
   JWT_SECRET="your-jwt-secret"
   # Optional
   PORT=4000
   BCRYPT_SALT_ROUNDS=12
   JWT_EXPIRES_IN=7d
   CORS_ORIGIN=http://localhost:3000
   NODE_ENV=development
   ```
3. Install + migrate:
   ```bash
   cd server
   npm install
   npm run prisma:migrate
   ```
4. Start the backend: `npm run dev` (from `server/`, listens on `:4000`).
5. Start the frontend: `npm run dev` (from
   `client/kanban-board-client/`, listens on `:3000`).

### Useful scripts

| Where        | Command                  | What it does |
| ------------ | ------------------------ | ------------ |
| `server/`    | `npm run dev`            | `tsx watch` on `:4000` |
| `server/`    | `npm run build`          | `tsc` emit to `dist/` |
| `server/`    | `npm run start`          | Run the compiled server |
| `server/`    | `npm run lint`           | `tsc --noEmit` + route audit |
| `server/`    | `npm run audit:routes`   | Walk live route table; assert every non-public route has a validator |
| `server/`    | `npm run prisma:generate`| Regenerate Prisma client |
| `server/`    | `npm run prisma:migrate` | Apply migrations + create dev migrations |
| `server/`    | `npm run prisma:studio`  | Open Prisma Studio |
| `client/`    | `npm run dev`            | Next.js dev server on `:3000` |
| `client/`    | `npm run build`          | Production build |
| `client/`    | `npm run lint`           | ESLint |
| `client/`    | `npx tsc --noEmit`       | Type-check without emit |

## API surface

All API endpoints are prefixed with `/api/`. Authentication is via an httpOnly
`token` cookie set by `POST /api/auth/login` and `POST /api/auth/register`.

### Health
- `GET /health` — liveness check; returns `{status:"ok",db:"up"}` on
  `SELECT 1` success, `503` otherwise.

### Authentication (`/api/auth`)
- `POST /api/auth/register` — `{ email, password }` → sets cookie, returns
  `{ id, email, token }`
- `POST /api/auth/login` — `{ email, password }` → sets cookie, returns
  `{ id, email, token }`
- `GET /api/auth/me` — returns the calling user from the verified JWT
- `POST /api/auth/logout` — clears the `token` cookie (`204`)

### Boards (`/api/boards`)
- `GET /api/boards` — list boards the caller owns or has been invited to
- `POST /api/boards` — `{ title }` → create a board (caller becomes owner)
- `GET /api/boards/:id` — board + columns (tasks nested, ordered by position
  ascending) + members (owner first, then by `joinedAt`)
- `PATCH /api/boards/:id` — owner-only; update `title`
- `DELETE /api/boards/:id` — owner-only; soft-delete via `deletedAt`
- `GET /api/boards/:id/members` — list members
- `POST /api/boards/:id/members` — owner-only; invite a registered user by
  email (`{ email }`)
- `DELETE /api/boards/:id/members/:userId` — owner-only; remove a member

### Board invitations (`/api/board-invitations`)
- `GET /api/board-invitations` — list the caller's `PENDING` invitations
- `POST /api/board-invitations/:id/accept` — accept; atomically upserts
  `BoardUser` and flips the invitation to `ACCEPTED`
- `POST /api/board-invitations/:id/decline` — decline (terminal state)

### Columns
- `GET /api/boards/:boardId/columns` — list columns (ordered by `position`)
- `POST /api/boards/:boardId/columns` — `{ title }` → create column
- `PATCH /api/boards/:boardId/columns/reorder` — body `{ columnIds: [...] }`
  → re-pack positions to fresh 1000-step values (Float precision escape hatch)
- `GET /api/columns/:id` — read a single column
- `PATCH /api/columns/:id` — `{ title }` → rename
- `DELETE /api/columns/:id` — delete (cascades to tasks)
- `POST /api/columns/:id/move` — `{ toIndex }` → re-position via Float
  midpoint

### Tasks
- `GET /api/columns/:columnId/tasks` — list tasks in a column (by `position`)
- `POST /api/columns/:columnId/tasks` — `{ title, description? }` → create
- `POST /api/columns/:columnId/tasks/:taskId/move` — `{ toColumnId, toIndex }`
  → move within or across columns (cross-board returns `403`)
- `GET /api/tasks/:id` — read
- `PATCH /api/tasks/:id` — `{ title?, description? }`; `position` and
  `columnId` are not accepted here (use `move`)
- `DELETE /api/tasks/:id` — delete

## Ordering: Float positions

`Column.position` and `Task.position` are `Float @default(1000)`. The only
place position math runs is `server/src/common/utils/floatPosition.ts`
(`nextAppend`, `between`, `rePack`). Inline `position: max + 1` is forbidden
and reviewable in code review.

This is the **Phase 5 simplification** of the earlier lexicographic-key scheme:
midpoint inserts are O(1) and simple. The known trade-off is Float precision —
after ~50 midpoint inserts in one gap, `(prev + next) / 2` rounds to `prev` and
the move lands on the wrong neighbour. The escape hatch is
`PATCH /api/boards/:boardId/columns/reorder`, which re-keys the scope to fresh
1000-step positions.

## Authorization model

The middleware chain on every resource `:id` route is:

```
requireAuth → validate(ParamSchema, "params") → loadBoard|loadColumn|loadTask
            → requireBoardAccess|requireBoardOwner → asyncHandler(controller.fn)
```

- `loadColumn` and `loadTask` auto-populate `req.board` (single query joins
  the parent).
- `requireBoardOwner` gates destructive / admin actions to the board owner.
- `requireBoardAccess` is the authoring gate — both owners and accepted
  members can author content on a shared board.
- Cross-board moves return `403`, not `404`.

## Testing

No `jest` / `vitest` yet — Steps 11 / 12 of Phase 5 plan to add them. Until
then, validation is exercised by three PowerShell end-to-end scripts in
`server/`:

- `phase2-e2e.ps1` — 48 assertions (uses `WebRequestSession` as a cookie jar
  for the httpOnly `token` cookie)
- `phase4-e2e.ps1` — 59 assertions covering Float ordering
- `phase4-step7-e2e.ps1` — 45 assertions covering column-move, validation
  audit, and frontend static checks

Run them from `server/` while `npm run dev` is up on `:4000`.

## License

ISC
