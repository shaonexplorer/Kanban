# Kanban Board — Server

Express 5 + Prisma 7 backend for the Mini Kanban Board application.
Phases 1 (Foundation: auth) and 2 (Boards & Access Control) are implemented.
Columns and tasks land in Phase 3.

## Quick Start

```bash
cd server
npm install

# Required in .env (gitignored):
#   DATABASE_URL=postgresql://...
#   JWT_SECRET=<random string>
# Optional: PORT (default 4000), BCRYPT_SALT_ROUNDS (default 12),
#           JWT_EXPIRES_IN (default "7d")

npx prisma migrate dev   # apply schema
npm run dev               # tsx watch on http://localhost:4000
```

## Scripts

| Command            | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `npm run dev`      | Start the dev server with hot reload (`tsx`).   |
| `npm run build`    | Compile TypeScript to `dist/`.                   |
| `npm start`        | Run the compiled output.                         |
| `npm run lint`     | Strict `tsc --noEmit`.                           |
| `npm run prisma:generate` | Regenerate the Prisma client.              |
| `npm run prisma:migrate`  | Create / apply a dev migration.             |
| `npm run prisma:studio`   | Open Prisma Studio.                        |

## Module Layout

```
src/
├── app.ts                     # Express app factory + middleware order
├── index.ts                   # validateEnv → connect DB → app.listen
├── config/env.ts              # zod-validated env (config, validateEnv)
├── lib/prisma.ts              # shared Prisma client (hot-reload safe)
├── common/
│   ├── errors/                # HttpError + central errorMiddleware
│   ├── middleware/            # auth + access-control (loadBoard / requireBoardAccess / requireBoardOwner)
│   ├── validators/            # generic validate(zodSchema, source?)
│   ├── types/                 # Express.Request.user + Request.board augmentation
│   └── utils/                 # asyncHandler
└── modules/
    ├── auth/                  # register, login → JWT
    ├── boards/                # CRUD + members + invitations
    ├── board-invitations/     # list / accept / decline
    └── health/                # GET /health (db ping)
```

Every module follows the same shape:
`<name>.controller.ts` (HTTP I/O) · `<name>.service.ts` (DB / business
rules) · `<name>.validation.ts` (zod) · `<name>.routes.ts` (router wiring)
· `index.ts` (barrel).

## API

All routes below are mounted under the paths shown. Bodies are JSON.
`Authorization: Bearer <jwt>` is required on every route except `POST
/api/auth/*` and `GET /health`.

### Auth (`/api/auth`)

| Method | Path                  | Body                                | Returns          |
| ------ | --------------------- | ----------------------------------- | ---------------- |
| POST   | `/api/auth/register`  | `{ email, password, name? }`        | `{ token, user }`|
| POST   | `/api/auth/login`     | `{ email, password }`               | `{ token, user }`|

### Boards (`/api/boards`)

| Method | Path                                | Auth      | Body / Notes                                 | Returns                          |
| ------ | ----------------------------------- | --------- | -------------------------------------------- | -------------------------------- |
| GET    | `/api/boards`                       | caller    | —                                            | `BoardListItem[]`                |
| POST   | `/api/boards`                       | caller    | `{ title }`                                  | `201 Board` (id, title, ownerId, createdAt) |
| GET    | `/api/boards/:id`                   | access    | —                                            | `BoardDetail` (nested)           |
| PATCH  | `/api/boards/:id`                   | owner     | `{ title }`                                  | `200 Board`                      |
| DELETE | `/api/boards/:id`                   | owner     | soft-delete (`deletedAt`)                    | `204`                            |
| GET    | `/api/boards/:id/members`           | access    | —                                            | `BoardMemberItem[]` (owner first) |
| POST   | `/api/boards/:id/members`           | owner     | `{ userId }` *or* `{ email }`                | `201 BoardInvitation` (PENDING)  |
| DELETE | `/api/boards/:id/members/:userId`   | owner     | removes an accepted collaborator             | `204`                            |

Authorization: `:id` routes run `loadBoard` (resolves the row, 404 on
missing or soft-deleted) and then either `requireBoardAccess` (owner or
member) or `requireBoardOwner` (owner only). Param validation runs
*before* `loadBoard` so a non-UUID id returns `400` rather than `404`.

### Board Invitations (`/api/board-invitations`)

| Method | Path                                       | Auth     | Notes                                                  | Returns                                |
| ------ | ------------------------------------------ | -------- | ------------------------------------------------------ | -------------------------------------- |
| GET    | `/api/board-invitations`                   | invitee  | PENDING invites addressed to the caller, newest first  | `InvitationListItem[]`                 |
| POST   | `/api/board-invitations/:id/accept`        | invitee  | atomic `$transaction` (upsert `BoardUser` + flip to `ACCEPTED`) | `200 { boardId, invitationId, status: "ACCEPTED" }` |
| POST   | `/api/board-invitations/:id/decline`       | invitee  | single write to `DECLINED`                             | `200 { invitationId, status: "DECLINED" }` |

The service enforces that the authenticated caller is `inviteeId` (403
otherwise), the invitation is still PENDING (409 otherwise), and the
board hasn't been soft-deleted (404 otherwise).

### Health

| Method | Path      | Returns                                              |
| ------ | --------- | ---------------------------------------------------- |
| GET    | `/health` | `200 {status:"ok", db:"up"}` or `503 {db:"down"}`    |

## Error Format

Every error response is `{ error: string }` with an HTTP status:
`400` validation, `401` unauthenticated, `403` forbidden, `404` not
found, `409` conflict, `500` internal. Domain errors are `throw new
HttpError(status, message)` from the service; `asyncHandler` forwards
them to the central error middleware.

## Validation Environment

- `DATABASE_URL` must point to a reachable PostgreSQL instance.
- `JWT_SECRET` is used to sign and verify auth tokens — rotate it
  in production.
- Hot reload: `tsx watch` restarts the process on `.ts` changes but
  reuses the same Prisma client (see `src/lib/prisma.ts`).

## Phase Status

- ✅ Phase 1 — Foundation: auth (register / login), health, project skeleton
- ✅ Phase 2 — Boards & Access Control: board CRUD, members, invitations
- ⏳ Phase 3 — Columns & Tasks (see `specs/Roadmap.md`)
- ⏳ Phase 4 — Ordering & drag-and-drop
- ⏳ Phase 5 — Polish & Testing (test framework, e2e flows)
