# Mini Kanban Board

A full-stack Kanban board application for collaborative workflow management.

## Overview

This is a TypeScript monorepo featuring a Next.js frontend and Express.js backend, designed to demonstrate modern web development practices with production-grade authentication, database design, and drag-and-drop functionality.

## What We're Building

A web application where users can:

- **Create boards** — each board represents a distinct workspace or project
- **Organize workflow columns** — columns represent stages (e.g., Backlog, In Progress, Done)
- **Manage tasks** — tasks live within columns and carry actual work items
- **Drag and drop** — reorder tasks within a column or move them across columns
- **Collaborate** — share boards with other registered users

## Success Criteria

A user should be able to:

1. Register and log in with token-based authentication
2. Create a board and share it with other users
3. Add, edit, and delete columns on the board
4. Add, edit, and delete tasks within columns
5. Drag-and-drop tasks to reorder them
6. See consistent ordering under concurrent edits
7. Access only boards they own or have explicit permission for

## Tech Stack

### Frontend
- **Next.js 16** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS v4**

### Backend
- **Node.js + Express.js**
- **TypeScript**
- **JWT authentication** with bcrypt password hashing
- **Prisma ORM** with PostgreSQL

## Project Structure

```
Mini Kanban Board/
├── client/
│   └── kanban-board-client/    # Next.js frontend
├── server/                      # Express backend
├── specs/                       # Project specifications
│   ├── Mission.md
│   ├── Techstack.md
│   ├── Roadmap.md
│   └── Phase01/
│       ├── Plan.md
│       ├── Requirements.md
│       └── Validation.md
├── .gitignore
└── README.md
```

## Development

### Prerequisites
- Node.js 18+ 
- PostgreSQL
- npm

### Getting Started

1. Clone the repository
2. Set up environment variables in `server/.env`:
   ```
   DATABASE_URL="postgresql://USER:PASS@localhost:5432/kanban?schema=public"
   JWT_SECRET="your-jwt-secret"
   PORT=4000
   ```
3. Run migrations: `cd server && npm run prisma:migrate`
4. Start the backend: `npm run dev` (from server/)
5. Start the frontend: `npm run dev` (from client/kanban-board-client/)

## APIs

All API endpoints are prefixed with `/api/`.

### Authentication
- `POST /api/auth/register` — Register a new user
- `POST /api/auth/login` — Authenticate and receive a JWT token

### Health
- `GET /health` — Health check endpoint

## License

ISC