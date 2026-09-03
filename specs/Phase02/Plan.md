# Phase 2 — Boards & Access Control: Implementation Plan

## Overview

Phase 2 turns the empty `Board` / `BoardUser` tables from Phase 1 into a fully
usable board management API. By the end of this phase, an authenticated user
can:

- Create, list, view, rename, and soft-delete boards they own.
- Share boards with other **already-registered** users via an invitation flow.
- List members, accept or decline invitations, and be removed by the owner.
- Be denied (HTTP 403) on any board, member, or invitation they don't have
  explicit access to — enforced by a reusable access-control layer.

This phase delivers **no columns or tasks** — those land in Phase 3. The nested
`GET /api/boards/:id` response includes empty `columns: []` until Phase 3 wires
them up.

---

## Prerequisites (from Phase 1)

- Modular MVC backend skeleton at `server/src/` (ESM, `module: NodeNext`,
  TypeScript strict).
- `auth` and `health` modules mounted in `src/app.ts`.
- Prisma 7 client generated to `src/generated/prisma/` with the `User`,
  `Board`, `BoardUser`, `Column`, `Task` models and `@prisma/adapter-pg`
  driver adapter (per CLAUDE.md).
- `authMiddleware` / `requireAuth` already attach `req.user = { id, email }`
  via the global `Express.Request` augmentation in
  `src/common/types/express.d.ts`.
- Generic `validate(zodSchema)` middleware available at
  `src/common/validators/validate.middleware.ts`.
- Central error middleware (`src/common/errors/errorMiddleware.ts`) consumes
  `HttpError(status, message)` thrown from anywhere in the stack.

## Architectural Decisions

| Decision | Choice | Why |
|---|---|---|
| Module layout | One folder per feature: `boards`, `board-invitations` | Matches existing `auth` / `health` pattern |
| Soft delete on `Board` | `deletedAt: DateTime?` | Roadmap §2.1 says "soft-delete recommended"; lets us keep `BoardUser` history |
| Invitation flow | Persisted `BoardInvitation` rows with status enum | Roadmap §2.2 says "Accept / decline a board invitation" |
| Invitee resolution | By `userId` or `email`; must already be registered | Avoids out-of-band email tokens in Phase 2 |
| Authorization | Reusable middlewares in `src/common/middleware/access-control.middleware.ts` | Roadmap §2.3; reused in Phase 3+ for column/task scopes |
| Atomic accept | `prisma.$transaction(async tx => { ... })` | Insert `BoardUser` + flip invitation status must be atomic |
| Where to enforce access | Middleware on `:id` routes (load + check) | Keeps controllers thin and uniform |
| New top-level deps | **None** | Prisma, zod, express, `HttpError` already cover everything |

---

## Step 1 — Prisma Schema Evolution

### 1.1 Update `server/prisma/schema.prisma`

Add the following to existing models and add the new model + enum:

- `Board` model:
  - Add `deletedAt DateTime?` (default `null`).

- `BoardUser` model:
  - Add `joinedAt DateTime @default(now())` so the members list can return a
    stable timestamp without inferring it from row order.

- New enum (top-level in schema):
  ```prisma
  enum BoardInvitationStatus {
    PENDING
    ACCEPTED
    DECLINED
    REVOKED
  }
  ```

- New model:
  ```prisma
  model BoardInvitation {
    id        String                @id @default(uuid())
    boardId   String
    inviterId String
    inviteeId String
    status    BoardInvitationStatus @default(PENDING)
    createdAt DateTime              @default(now())
    updatedAt DateTime              @updatedAt

    board   Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
    inviter User  @relation("InvitationsSent",    fields: [inviterId], references: [id])
    invitee User  @relation("InvitationsReceived", fields: [inviteeId], references: [id])

    @@index([inviteeId, status])
    @@index([boardId, status])
  }
  ```

- Add back-relations:
  - `Board { ... invitations BoardInvitation[] }`
  - `User { ... invitationsSent    BoardInvitation[] @relation("InvitationsSent")`
  - `              invitationsReceived BoardInvitation[] @relation("InvitationsReceived") }`

### 1.2 Generate & apply migration

```bash
cd server
npx prisma migrate dev --name phase02_boards_access
```

Verify `server/prisma/migrations/<timestamp>_phase02_boards_access/migration.sql`
adds the new column + table + indexes (no destructive changes to existing
data).

---

## Step 2 — Access Control Layer

Create `server/src/common/middleware/access-control.middleware.ts` exposing:

### 2.1 `loadBoard(boardIdSource = "params", key = "id")`

- Reads `boardId = req[boardIdSource][key]`.
- `prisma.board.findUnique({ where: { id: boardId } })`.
- If the board is `null` OR `deletedAt != null` → throw
  `HttpError(404, "Board not found")`.
- Attaches `req.board = board` and calls `next()`.

### 2.2 `requireBoardAccess`

- Calls `loadBoard` semantics internally (or relies on it having run first —
  exported as a combined `loadBoard + requireBoardAccess` chain for ergonomics).
- Pass when `req.user.id === req.board.ownerId` OR a `BoardUser` row exists for
  `(req.board.id, req.user.id)`.
- Otherwise throw `HttpError(403, "Forbidden")`.

### 2.3 `requireBoardOwner`

- After loading the board, throws `HttpError(403, "Forbidden")` unless
  `req.user.id === req.board.ownerId`.

> Phase 3 will reuse these by adding `loadColumn` / `loadTask` /
> `requireResourceAccess` helpers that resolve the parent board before
> delegating to the same checks. Phase 2 keeps the surface tight.

---

## Step 3 — Boards Module (`server/src/modules/boards/`)

Per-feature layout that mirrors `auth/` and `health/`:

```
modules/boards/
├── boards.controller.ts
├── boards.service.ts
├── boards.validation.ts
├── boards.routes.ts
└── index.ts
```

### 3.1 `boards.validation.ts`

zod schemas (all use `z.string().uuid()` for IDs):

- `CreateBoardSchema` — `{ title: z.string().trim().min(1).max(100) }`
- `UpdateBoardSchema` — `{ title: z.string().trim().min(1).max(100) }`
- `BoardIdParamSchema` — `{ id: z.string().uuid() }`
- `MemberParamsSchema` — `{ id: z.string().uuid(), userId: z.string().uuid() }`
- `InviteMemberSchema` — discriminated union on exactly-one of `userId` | `email`:
  ```ts
  z.union([
    z.object({ userId: z.string().uuid() }).strict(),
    z.object({ email: z.string().email() }).strict(),
  ])
  ```

Export inferred input types (`CreateBoardInput`, `UpdateBoardInput`,
`InviteMemberInput`).

### 3.2 `boards.service.ts`

Pure DB + business rules. Throws `HttpError` on every domain failure.
Internal helpers (re-exported for tests / other modules):

- `createBoard(ownerId, { title })` — `prisma.board.create(...)`.
- `listMyBoards(userId)` — `prisma.board.findMany` where `ownerId = userId`
  OR a `BoardUser` row exists, `deletedAt: null`. Attach derived
  `role: "OWNER" | "MEMBER"`.
- `getBoardById(userId, boardId)` — loads board with `columns` (ordered by
  `position`) and `tasks` (ordered by `position`), plus `BoardUser` rows
  joined with `User`. Calls `assertBoardAccess`; throws 403 otherwise.
- `updateBoard(userId, boardId, { title })` — `assertBoardOwner`; update.
- `softDeleteBoard(userId, boardId)` — `assertBoardOwner`; set `deletedAt`.
- `listMembers(userId, boardId)` — `assertBoardAccess`; return owner first,
  then accepted members with `joinedAt`.
- `inviteMember(userId, boardId, input)` — `assertBoardOwner`; resolves
  invitee (by id or email lookup); rejects owner (400), already-member (409),
  pending-duplicate (409), missing user (404); inserts `BoardInvitation`.
- `removeMember(userId, boardId, targetUserId)` — `assertBoardOwner`; reject
  removing owner (400); delete `BoardUser`; 404 if no row.
- `assertBoardAccess(userId, boardId)` — shared helper.
- `assertBoardOwner(userId, boardId)` — shared helper.

### 3.3 `boards.controller.ts`

Thin HTTP I/O. Each handler:
1. Reads `req.user.id`, `req.params`, `req.body` (validated upstream).
2. Calls the service.
3. Responds with the documented status (see Requirements.md).

Handlers:
`createBoard`, `listBoards`, `getBoard`, `updateBoard`, `deleteBoard`,
`listMembers`, `inviteMember`, `removeMember`.

### 3.4 `boards.routes.ts`

Wiring uses `validate()` (body / params) and the access-control middlewares:

| Method | Path | Middleware chain |
|---|---|---|
| `GET`    | `/`             | `requireAuth` → `listBoards` |
| `POST`   | `/`             | `requireAuth` → `validate(CreateBoardSchema)` → `createBoard` |
| `GET`    | `/:id`          | `requireAuth` → `validate(BoardIdParamSchema, "params")` → `loadBoard` → `requireBoardAccess` → `getBoard` |
| `PATCH`  | `/:id`          | `requireAuth` → `validate(BoardIdParamSchema, "params")` → `validate(UpdateBoardSchema)` → `loadBoard` → `requireBoardOwner` → `updateBoard` |
| `DELETE` | `/:id`          | `requireAuth` → `validate(BoardIdParamSchema, "params")` → `loadBoard` → `requireBoardOwner` → `deleteBoard` |
| `GET`    | `/:id/members`  | `requireAuth` → `validate(BoardIdParamSchema, "params")` → `loadBoard` → `requireBoardAccess` → `listMembers` |
| `POST`   | `/:id/members`  | `requireAuth` → `validate(BoardIdParamSchema, "params")` → `loadBoard` → `requireBoardOwner` → `validate(InviteMemberSchema)` → `inviteMember` |
| `DELETE` | `/:id/members/:userId` | `requireAuth` → `validate(MemberParamsSchema, "params")` → `loadBoard` → `requireBoardOwner` → `removeMember` |

`validate()` signature: `validate(schema, source = "body")` so we can validate
`req.params` separately from `req.body` when both are needed.

### 3.5 `index.ts`

```ts
export { default as boardsRouter } from "./boards.routes.js";
```

### 3.6 Mount in `src/app.ts`

```ts
import { boardsRouter } from "./modules/boards/index.js";
// ...
app.use("/api/boards", boardsRouter);
```

---

## Step 4 — Board Invitations Module (`server/src/modules/board-invitations/`)

```
modules/board-invitations/
├── board-invitations.controller.ts
├── board-invitations.service.ts
├── board-invitations.validation.ts
├── board-invitations.routes.ts
└── index.ts
```

### 4.1 `board-invitations.validation.ts`

- `InvitationIdParamSchema` — `{ id: z.string().uuid() }`.

### 4.2 `board-invitations.service.ts`

All operations enforce `req.user.id === invitation.inviteeId` for the
per-invitation actions.

- `listMyInvitations(userId)` — return `PENDING` invitations addressed to
  `userId`, newest first, including `boardTitle` + `inviterEmail` (joined).
- `acceptInvitation(userId, invitationId)`:
  ```ts
  return prisma.$transaction(async (tx) => {
    const inv = await tx.boardInvitation.findUnique({
      where: { id: invitationId },
      include: { board: true },
    });
    if (!inv || inv.board.deletedAt)        throw new HttpError(404, ...);
    if (inv.inviteeId !== userId)            throw new HttpError(403, ...);
    if (inv.status !== "PENDING")            throw new HttpError(409, ...);

    await tx.boardUser.upsert({
      where:  { boardId_userId: { boardId: inv.boardId, userId } },
      update: {},
      create: { boardId: inv.boardId, userId },
    });
    return tx.boardInvitation.update({
      where: { id: invitationId },
      data:   { status: "ACCEPTED" },
    });
  });
  ```
- `declineInvitation(userId, invitationId)` — same authz checks; updates
  `status: "DECLINED"` outside a transaction is fine (single write).

### 4.3 Controller

Three handlers: `listInvitations`, `acceptInvitation`, `declineInvitation`.

### 4.4 Routes

| Method | Path | Middleware chain |
|---|---|---|
| `GET`  | `/`           | `requireAuth` → `listInvitations` |
| `POST` | `/:id/accept` | `requireAuth` → `validate(InvitationIdParamSchema, "params")` → `acceptInvitation` |
| `POST` | `/:id/decline`| `requireAuth` → `validate(InvitationIdParamSchema, "params")` → `declineInvitation` |

### 4.5 Mount in `src/app.ts`

```ts
import { boardInvitationsRouter } from "./modules/board-invitations/index.js";
app.use("/api/board-invitations", boardInvitationsRouter);
```

---

## Step 5 — Wiring & Final Touches

- Both new routers imported and mounted in `src/app.ts`.
- No changes needed to `src/index.ts` (env validation + DB connection are
  already in place).
- Optional: add a brief entry to the top of `server/README.md` describing the
  new endpoints (out of scope for spec compliance).

---

## Step 6 — Manual Verification

Executed before declaring Phase 2 complete. See `Validation.md` for the full
checklist.

---

## Execution Order

| # | Task | Estimated Effort |
|---|---|---|
| 1 | Schema migration (Step 1) | 20 min |
| 2 | Access-control middleware (Step 2) | 25 min |
| 3 | `boards` module: validation + service + controller + routes (Step 3) | 90 min |
| 4 | `board-invitations` module (Step 4) | 45 min |
| 5 | Mount routers + tsx reload smoke test (Step 5) | 10 min |
| 6 | End-to-end manual verification (Step 6) | 45 min |
|   | **Total** | **~3.75 hours** |

---

## Out of Scope (Deferred)

- **Columns & Tasks** — Phase 3 (Plan.md / Requirements.md for that phase come
  later).
- **Ordering / drag-and-drop** — Phase 4.
- **Frontend work** — The current frontend (`client/kanban-board-client/`)
  remains a placeholder; no UI for boards is added until later phases.
- **Automated tests** — No test framework yet (Phase 5, per `specs/Roadmap.md`).
  Phase 2 relies on cURL / Postman checks captured in `Validation.md`.
- **E-mail notifications for invitations** — Phase 5 stretch. Phase 2 simply
  stores the invitation in the DB; invitees discover them via
  `GET /api/board-invitations`.
- **Password reset** — Phase 1 stretch, still deferred.
- **User account deletion** — Out of scope; would require cascade rules on
  `BoardUser` / `BoardInvitation` we don't need yet.