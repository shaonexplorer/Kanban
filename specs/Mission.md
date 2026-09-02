# Mission

## Purpose

Build a functional **Mini Kanban Board** application — a full-stack engineering challenge that demonstrates the ability to design and implement a collaborative workflow management system from the ground up.

## What We're Building

A web application where users can:

- **Create boards** — each board represents a distinct workspace or project.
- **Organize workflow columns** — columns represent stages in a process (e.g., Backlog, In Progress, Done).
- **Manage tasks** — tasks live within columns and carry the actual work items.
- **Drag and drop** — reorder tasks within a column or move them across columns with full position-consistency guarantees.

## Core Principles

- **Self-designed architecture** — the database schema and system architecture are authored from scratch to handle collaboration, access permissions, and drag-and-drop ordering.
- **Collaboration-first** — boards have owners and can be shared with other registered users.
- **Strict access control** — authorization rules prevent unauthorized cross-board access to boards, columns, and tasks.

## Success Criteria

A user should be able to:

1. Register and log in with token-based authentication.
2. Create a board and share it with other users.
3. Add, edit, and delete columns on the board.
4. Add, edit, and delete tasks within columns.
5. Drag-and-drop tasks to reorder them within a column or move them to a different column.
6. See consistent, conflict-free ordering even under concurrent edits.
7. Be denied access to any board, column, or task they do not have explicit permission for.
