# Roadmap

## Phase 1 — Foundation

### 1.1 Project Scaffolding
- [ ] Initialize the monorepo / project structure.
- [ ] Set up the backend (Node.js + Express + TypeScript).
- [ ] Set up the frontend (Next.js + React + TypeScript).
- [ ] Configure Tailwind CSS on the frontend.
- [ ] Configure Prisma with PostgreSQL.

### 1.2 Database Schema Design
- [ ] Design and implement the Prisma schema:
  - `User` — id, email, password hash, createdAt.
  - `Board` — id, title, ownerId, createdAt.
  - `BoardUser` — many-to-many between Board and User (shared access).
  - `Column` — id, title, boardId, position/order.
  - `Task` — id, title, description, columnId, position/order, createdAt.
- [ ] Run migrations and verify the schema.

### 1.3 Authentication
- [ ] Implement user registration (signup) endpoint with password hashing.
- [ ] Implement user login endpoint issuing a signed token (JWT).
- [ ] Create auth middleware to verify tokens on protected routes.
- [ ] Set up a password-reset flow (optional stretch).

---

## Phase 2 — Boards & Access Control

### 2.1 Board CRUD
- [ ] Create board (owner = creator).
- [ ] Fetch board + columns + tasks (nested structure).
- [ ] Update board title / settings.
- [ ] Delete board (soft-delete recommended).

### 2.2 Board Sharing
- [ ] Invite another user to a board (by email or user id).
- [ ] List board members / shared users.
- [ ] Accept / decline a board invitation.
- [ ] Remove a collaborator from a board.

### 2.3 Access Control Layer
- [ ] Per-request authorization checks on board, column, and task access.
- [ ] Prevent unauthorized cross-board access.
- [ ] Ensure users can only mutate resources they have explicit access to.

---

## Phase 3 — Columns & Tasks

### 3.1 Column Management
- [ ] Create column on a board.
- [ ] Reorder / rename / delete columns.
- [ ] Cascade-delete columns on board deletion.

### 3.2 Task Management
- [ ] Create task in a column.
- [ ] Update task (title, description).
- [ ] Delete task.
- [ ] Assign task to a user (optional).

---

## Phase 4 — Ordering & Task Movement

### 4.1 Task Reordering API
- [ ] Reorder tasks within the same column.
- [ ] Move a task across columns to a specific position index.
- [ ] Ensure order consistency and conflict-free positioning.
- [ ] Support an ordering strategy (e.g., fractional indexing / gap-based positions) that survives concurrent edits.

### 4.2 Frontend Drag & Drop
- [ ] Board view renders columns and tasks.
- [ ] Drag-and-drop tasks within a column.
- [ ] Drag-and-drop tasks to a different column.
- [ ] Optimistic UI updates with rollback on server error.

---

## Phase 5 — Polishing & Polish

### 5.1 Frontend UX
- [ ] Responsive board layout.
- [ ] Column task counters.
- [ ] Keyboard shortcuts / quick-add tasks (stretch).
- [ ] Loading and error states.

### 5.2 Backend Quality
- [ ] Input validation on all endpoints.
- [ ] Centralized error handling middleware.
- [ ] API logging / request tracing.
- [ ] Rate limiting on auth endpoints.

### 5.3 Testing
- [ ] Backend unit + integration tests.
- [ ] Frontend component tests (optional).
- [ ] E2E flow: register → create board → share → move tasks.

### 5.4 Deployment Readiness
- [ ] Environment variable configuration.
- [ ] Health check endpoint.
- [ ] Basic CI / git hooks (formatting, lint, type-check).
