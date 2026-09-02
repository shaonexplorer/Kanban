# Tech Stack

## Overview

The Mini Kanban Board is a full-stack TypeScript application. The tech stack is intentionally chosen to demonstrate modern, production-grade web development practices.

---

## Frontend

| Technology | Details |
|---|---|
| **Next.js** | React framework for server-rendered pages, API routes, and deployment. |
| **React** | Component library for the UI. |
| **TypeScript** | Type safety across the entire frontend codebase. |
| **Tailwind CSS** | Utility-first CSS framework for rapid, consistent styling. |

### Planned Frontend Libraries
- **Drag & drop:** `react-dnd` or `@dnd-kit/core` for interactive task movement.
- **State management:** React Query / SWR for server state; `zustand` or Context API for local UI state.
- **HTTP client:** `axios` or native `fetch`.
- **Forms:** `react-hook-form` with `zod` for validation.
- **Date utilities:** `date-fns`.

---

## Backend

| Technology | Details |
|---|---|
| **Node.js** | JavaScript runtime. |
| **Express.js** | Minimal web framework for the REST API. |
| **TypeScript** | Type safety across the backend. |

### Planned Backend Libraries
- **Auth:** `jsonwebtoken` for JWT tokens, `bcrypt` for password hashing.
- **Validation:** `zod` or `joi` for request validation.
- **HTTP:** `helmet` for security headers, `cors` for cross-origin support.
- **Logging:** `winston` or `pino`.
- **Rate limiting:** `express-rate-limit`.
- **Testing:** `jest` + `supertest` for API tests.

---

## Database

| Technology | Details |
|---|---|
| **PostgreSQL** | Relational database for persistent storage. |
| **Prisma** | ORM for type-safe database access and migrations. |

### Schema Entities
- `User` — authentication and identity.
- `Board` — top-level container for workflow columns.
- `BoardUser` — join table for board sharing / access control.
- `Column` — a workflow stage within a board.
- `Task` — an individual work item within a column.

---

## Tooling & Infrastructure

| Area | Tooling |
|---|---|
| **Package manager** | `npm` (Node.js ecosystem). |
| **Code quality** | `eslint`, `prettier`. |
| **Type checking** | `tsc` (TypeScript compiler). |
| **Environment config** | `.env` files, `dotenv`. |
| **Git hooks** | `husky` for pre-commit hooks (lint, format, type-check). |
| **Testing** | `jest`. |
| **Deployment** | TBD — Vercel (frontend) + Render / Railway (backend + DB). |

---

## Communication

- **Frontend ↔ Backend:** RESTful JSON API over HTTP/HTTPS.
- **Authentication:** Bearer token (JWT) in the `Authorization` header.
