# Phase 2 — Boards & Access Control: Validation Criteria

Each requirement (REQ-2.x.x) from `Requirements.md` must be verifiable.
This document provides the validation method and expected outcome for each.

## Validation Environment

- Backend running locally: `cd server && npm run dev` (port 4000, tsx watch).
- PostgreSQL reachable via `DATABASE_URL` from `server/.env`.
- A clean DB is recommended for a clean run; if reusing an existing DB,
  truncate `BoardInvitation`, `BoardUser`, `Board`, and re-create test users.
- `$T1`, `$T2`, `$T3` are JWTs obtained via `POST /api/auth/login` for three
  distinct registered users. Examples below assume `T1` is the owner.

Replace `$B1` with a board id returned from `POST /api/boards`.

```bash
# Example login
T1=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"u1@example.com","password":"password123"}' | jq -r .token)
```

> **Reminder:** the server port in this project is **4000** (CLAUDE.md) — not
> 3000 as in Phase 1's older examples.

---

## 1. Schema Evolution

### 1.1 Board Soft Delete

- **VAL-2.1.1** Confirm `Board.deletedAt` column exists.
  - **Method:** Read `server/prisma/schema.prisma`.
  - **Expected:** `deletedAt DateTime?` on the `Board` model.

- **VAL-2.1.2** Confirm `BoardUser.joinedAt` column exists.
  - **Method:** Read `server/prisma/schema.prisma`.
  - **Expected:** `joinedAt DateTime @default(now())` on `BoardUser`.

- **VAL-2.1.3** Confirm migration applied.
  - **Method:** `ls server/prisma/migrations/`.
  - **Expected:** A directory named `*_phase02_boards_access/` with
    `migration.sql` adding `deletedAt`, `joinedAt`, and the
    `BoardInvitation` table.

### 1.2 Board Invitation Model

- **VAL-2.2.1** Confirm enum and model exist.
  - **Method:** Read `server/prisma/schema.prisma`.
  - **Expected:** `enum BoardInvitationStatus { PENDING ACCEPTED DECLINED REVOKED }`
    and `model BoardInvitation { ... }`.

- **VAL-2.2.2** Confirm back-relations on `Board` and `User`.
  - **Method:** Read `server/prisma/schema.prisma`.
  - **Expected:** `Board.invitations BoardInvitation[]` and
    `User.invitationsSent` / `invitationsReceived` relations present.

- **VAL-2.2.3** Confirm required indexes.
  - **Method:** Read the migration SQL.
  - **Expected:** `CREATE INDEX ... ON "BoardInvitation"("inviteeId","status")`
    and `(boardId,status)` are present.

---

## 2. Board CRUD

### 2.1 Create Board

- **VAL-2.3.1** Confirm route registered.
  - **Method:** Read `server/src/app.ts`.
  - **Expected:** `app.use("/api/boards", boardsRouter);`

- **VAL-2.3.2** Confirm a valid create returns HTTP 201.
  - **Method:**
    ```bash
    curl -s -o /dev/null -w "%{http_code}\n" \
      -X POST http://localhost:4000/api/boards \
      -H "Authorization: Bearer $T1" -H "Content-Type: application/json" \
      -d '{"title":"My Sprint"}'
    ```
  - **Expected:** `201`; body has `{ id, title: "My Sprint", ownerId, createdAt }`.

- **VAL-2.3.3** Confirm empty title is rejected.
  - **Method:** POST with `{ "title": "" }`.
  - **Expected:** HTTP 400.

- **VAL-2.3.4** Confirm oversized title is rejected.
  - **Method:** POST with `{ "title": "<201 chars>" }`.
  - **Expected:** HTTP 400.

- **VAL-2.3.5** Confirm unauthenticated request is rejected.
  - **Method:** POST without `Authorization`.
  - **Expected:** HTTP 401.

### 2.2 List My Boards

- **VAL-2.4.1** Confirm list returns owned boards with `role: "OWNER"`.
  - **Method:** Create one board as `T1`, then `GET /api/boards`.
  - **Expected:** Array of length 1; first item has `role: "OWNER"`.

- **VAL-2.4.2** Confirm shared boards appear with `role: "MEMBER"`.
  - **Method:** Invite `T2`, accept from `T2`, then `GET /api/boards` as `T2`.
  - **Expected:** Array includes the board with `role: "MEMBER"`.

- **VAL-2.4.3** Confirm soft-deleted boards are excluded.
  - **Method:** Create board → `DELETE` → `GET /api/boards`.
  - **Expected:** Deleted board does not appear.

### 2.3 Get Board (Nested)

- **VAL-2.5.1** Confirm nested shape on a fresh board.
  - **Method:** `GET /api/boards/$B1` as the owner.
  - **Expected:** HTTP 200; body has
    `{ id, title, ownerId, columns: [], members: [{ userId, email, role: "OWNER", joinedAt }] }`.

- **VAL-2.5.2** Confirm forbidden access returns 403.
  - **Method:** As `T3` (not invited), `GET /api/boards/$B1`.
  - **Expected:** HTTP 403.

- **VAL-2.5.3** Confirm missing board returns 404.
  - **Method:** `GET /api/boards/00000000-0000-0000-0000-000000000000`.
  - **Expected:** HTTP 404.

- **VAL-2.5.4** Confirm non-UUID id returns 400.
  - **Method:** `GET /api/boards/not-a-uuid`.
  - **Expected:** HTTP 400.

### 2.4 Update Board

- **VAL-2.6.1** Confirm owner can update.
  - **Method:** As `T1`, `PATCH /api/boards/$B1` with `{ "title": "Renamed" }`.
  - **Expected:** HTTP 200 with the new title.

- **VAL-2.6.2** Confirm member cannot update.
  - **Method:** As accepted `T2`, PATCH same endpoint.
  - **Expected:** HTTP 403.

- **VAL-2.6.3** Confirm non-existent board returns 404.
  - **Method:** `PATCH /api/boards/00000000-0000-0000-0000-000000000000`.
  - **Expected:** HTTP 404.

- **VAL-2.6.4** Confirm soft-deleted board returns 404.
  - **Method:** Soft-delete `$B1`, then PATCH.
  - **Expected:** HTTP 404.

### 2.5 Delete Board

- **VAL-2.7.1** Confirm owner can soft-delete.
  - **Method:** As `T1`, `DELETE /api/boards/$B1`.
  - **Expected:** HTTP 204; subsequent `GET` returns 404.

- **VAL-2.7.2** Confirm DB row is preserved (soft delete).
  - **Method:** `cd server && npx prisma studio` → inspect `Board` row.
  - **Expected:** Row exists with non-null `deletedAt`.

- **VAL-2.7.3** Confirm non-owner gets 403.
  - **Method:** As `T3`, `DELETE /api/boards/$B1`.
  - **Expected:** HTTP 403.

- **VAL-2.7.4** Confirm deleting again returns 404 (already deleted).
  - **Method:** As `T1`, second `DELETE`.
  - **Expected:** HTTP 404.

---

## 3. Board Sharing

### 3.1 Invite a Member

- **VAL-2.8.1** Confirm owner can invite by email.
  - **Method:** `POST /api/boards/$B1/members` with
    `{ "email": "u2@example.com" }`.
  - **Expected:** HTTP 201; `inviteeId` resolves to `U2.id`.

- **VAL-2.8.2** Confirm owner can invite by userId.
  - **Method:** POST with `{ "userId": "<u2-uuid>" }`.
  - **Expected:** HTTP 201.

- **VAL-2.8.3** Confirm both/neither fields returns 400.
  - **Method:** POST with `{}` then with `{ "userId":"x","email":"y" }`.
  - **Expected:** HTTP 400 in both cases.

- **VAL-2.8.4** Confirm unknown email returns 404.
  - **Method:** POST with `{ "email": "ghost@example.com" }`.
  - **Expected:** HTTP 404.

- **VAL-2.8.5** Confirm inviting the owner is rejected.
  - **Method:** POST with the owner's `userId`.
  - **Expected:** HTTP 400.

- **VAL-2.8.6** Confirm duplicate pending invitation is rejected.
  - **Method:** Same invite twice without accepting in between.
  - **Expected:** HTTP 409 on the second call.

- **VAL-2.8.7** Confirm inviting an accepted member is rejected.
  - **Method:** Accept the existing invitation, then re-invite.
  - **Expected:** HTTP 409.

- **VAL-2.8.8** Confirm member (non-owner) cannot invite.
  - **Method:** As `T2` (after accepting), POST a new invite.
  - **Expected:** HTTP 403.

### 3.2 List Members

- **VAL-2.9.1** Confirm owner is listed first.
  - **Method:** After accepting `T2`, `GET /api/boards/$B1/members` as owner.
  - **Expected:** Array of length 2; first item is the owner
    (`role: "OWNER"`); second is `T2` (`role: "MEMBER"`).

- **VAL-2.9.2** Confirm `joinedAt` is present and ISO-formatted.
  - **Method:** Inspect response.
  - **Expected:** Each member item has a parseable ISO `joinedAt`.

- **VAL-2.9.3** Confirm non-member gets 403.
  - **Method:** As `T3`, GET.
  - **Expected:** HTTP 403.

### 3.3 Remove a Member

- **VAL-2.10.1** Confirm owner can remove a member.
  - **Method:** `DELETE /api/boards/$B1/members/<u2-id>`.
  - **Expected:** HTTP 204; subsequent `GET /api/boards/$B1` as `T2`
    returns 403.

- **VAL-2.10.2** Confirm removing the owner is rejected.
  - **Method:** `DELETE /api/boards/$B1/members/<owner-id>`.
  - **Expected:** HTTP 400.

- **VAL-2.10.3** Confirm non-owner gets 403.
  - **Method:** As another member, DELETE anyone.
  - **Expected:** HTTP 403.

- **VAL-2.10.4** Confirm removing a non-member returns 404.
  - **Method:** `DELETE /api/boards/$B1/members/<u3-id>` (never invited).
  - **Expected:** HTTP 404.

### 3.4 Invitations

- **VAL-2.11.1** Confirm invitee can list pending invites.
  - **Method:** As `T2`, `GET /api/board-invitations`.
  - **Expected:** Array contains the invitation with `boardTitle`,
    `inviterEmail`, `createdAt`.

- **VAL-2.11.2** Confirm accept succeeds and grants access.
  - **Method:** As `T2`, `POST /api/board-invitations/$I1/accept`.
  - **Expected:** HTTP 200; `GET /api/boards/$B1` as `T2` now returns 200.

- **VAL-2.11.3** Confirm double-accept fails.
  - **Method:** Accept twice.
  - **Expected:** Second call returns HTTP 409.

- **VAL-2.11.4** Confirm wrong user cannot accept.
  - **Method:** As `T3`, POST accept on `$I1`.
  - **Expected:** HTTP 403.

- **VAL-2.11.5** Confirm accept of soft-deleted board returns 404.
  - **Method:** Soft-delete `$B1` while `T2` has a pending invite, then
    accept.
  - **Expected:** HTTP 404.

- **VAL-2.11.6** Confirm decline succeeds without granting access.
  - **Method:** Issue a fresh invite, decline as invitee.
  - **Expected:** HTTP 200; `GET /api/boards/$B1` returns 403.

- **VAL-2.11.7** Confirm declined invitation no longer appears in pending
  list.
  - **Method:** `GET /api/board-invitations` after decline.
  - **Expected:** The declined invitation is absent.

---

## 4. Access Control Layer

- **VAL-2.12.1** Confirm middlewares exist.
  - **Method:** Read `server/src/common/middleware/access-control.middleware.ts`.
  - **Expected:** `loadBoard`, `requireBoardAccess`, `requireBoardOwner`
    exported.

- **VAL-2.12.2** Confirm middlewares are applied in `boards.routes.ts`.
  - **Method:** Read the file.
  - **Expected:** `loadBoard` runs before every `:id` handler; `requireBoardOwner`
    on PATCH/DELETE/invite/remove; `requireBoardAccess` on GET (board) and
    GET (members).

- **VAL-2.12.3** Confirm `requireAuth` is applied at router level.
  - **Method:** Read both `boards.routes.ts` and
    `board-invitations.routes.ts`.
  - **Expected:** `router.use(requireAuth)` (or per-route `requireAuth`)
    present.

- **VAL-2.12.4** Confirm accept flow is atomic.
  - **Method:** Read `board-invitations.service.ts`.
  - **Expected:** `acceptInvitation` is wrapped in
    `prisma.$transaction(async (tx) => { ... })` (or equivalent array form).

- **VAL-2.12.5** Confirm strict-mode typecheck passes.
  - **Method:** `cd server && npx tsc --noEmit`.
  - **Expected:** No errors.

---

## 5. Non-Functional Requirements

- **VAL-2.13.1** Confirm ESM `.js` extensions on new relative imports.
  - **Method:**
    ```bash
    grep -RE "from '\\.\\.?/[^']+'" server/src/modules/boards \
      server/src/modules/board-invitations \
      server/src/common/middleware/access-control.middleware.ts \
      | grep -v "\\.js['\"]"
    ```
  - **Expected:** No matches — every relative import in new code ends in
    `.js`.

- **VAL-2.13.2** Confirm no new top-level dependencies.
  - **Method:** `git diff server/package.json`.
  - **Expected:** No new entries in `dependencies` or `devDependencies`.

- **VAL-2.13.3** Confirm Prisma client usage is consistent with the existing
  singleton.
  - **Method:** Read new services.
  - **Expected:** They import the shared `prisma` from
    `../../lib/prisma.js` (or use the same `PrismaPg` adapter pattern).

- **VAL-2.13.4** Confirm `HttpError` is the only error type thrown from
  services for expected domain failures.
  - **Method:** Grep for `throw new` in
    `server/src/modules/boards/boards.service.ts` and
    `server/src/modules/board-invitations/board-invitations.service.ts`.
  - **Expected:** All domain errors are `HttpError(status, message)`.

---

## Summary Checklist

| Requirement ID | Description | Status |
|---|---|---|
| REQ-2.1.1 | `Board.deletedAt` field | |
| REQ-2.1.2 | Soft-deleted boards excluded from reads | |
| REQ-2.1.3 | Soft-deleted board returns 404 on direct fetch | |
| REQ-2.1.4 | Mutating routes on soft-deleted board return 404 | |
| REQ-2.2.1 | `BoardInvitationStatus` enum | |
| REQ-2.2.2 | `BoardInvitation` model with all fields | |
| REQ-2.2.3 | Required indexes on `(inviteeId,status)` and `(boardId,status)` | |
| REQ-2.2.4 | `BoardUser.joinedAt` field | |
| REQ-2.2.5 | Back-relations on `Board` and `User` | |
| REQ-2.3.1–6 | Create board | |
| REQ-2.4.1–4 | List my boards | |
| REQ-2.5.1–6 | Get board (nested) | |
| REQ-2.6.1–5 | Update board (owner only) | |
| REQ-2.7.1–5 | Soft-delete board (owner only) | |
| REQ-2.8.1–8 | Invite member | |
| REQ-2.9.1–5 | List members | |
| REQ-2.10.1–4 | Remove member | |
| REQ-2.11.1–7 | List / accept / decline invitations | |
| REQ-2.12.1–6 | Access control middleware | |
| REQ-2.13.1–8 | Non-functional (strict TS, ESM, errors, no new deps, etc.) | |

> **Phase 2 is complete when all REQ-2.x items are marked ✅ and the
> end-to-end manual scenario below passes.**

## End-to-End Manual Scenario

A single happy-path run that exercises every requirement:

1. Register `u1@example.com`, `u2@example.com`, `u3@example.com` via
   `POST /api/auth/register`. Capture their JWTs (`$T1`, `$T2`, `$T3`).
2. As `T1`, `POST /api/boards` with `{ "title": "Demo" }` → capture `$B1`.
3. As `T1`, `POST /api/boards/$B1/members` with
   `{ "email": "u2@example.com" }` → capture `$I1`.
4. As `T2`, `GET /api/board-invitations` — must include `$I1`.
5. As `T2`, `POST /api/board-invitations/$I1/accept` — expect 200.
6. As `T2`, `GET /api/boards` — expect `Demo` with `role: "MEMBER"`.
7. As `T3`, `GET /api/boards/$B1` — expect 403.
8. As `T1`, `PATCH /api/boards/$B1` with `{ "title": "Demo v2" }` — expect 200.
9. As `T1`, `GET /api/boards/$B1/members` — expect `[OWNER u1, MEMBER u2]`.
10. As `T1`, `DELETE /api/boards/$B1/members/<u2-id>` — expect 204.
11. As `T2`, `GET /api/boards/$B1` — expect 403.
12. As `T1`, `DELETE /api/boards/$B1` — expect 204.
13. As `T1`, `GET /api/boards/$B1` — expect 404.