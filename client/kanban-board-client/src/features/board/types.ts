/**
 * Frontend types that mirror the server's response shape.
 *
 * The server is the source of truth (see
 * `server/src/modules/boards/boards.service.ts` — `BoardDetail`).
 * Dates are serialised to ISO strings over the wire, so we keep them as
 * `string` on the client to avoid accidental `Date` comparisons on
 * unsanitised cache data.
 */

// ---------------------------------------------------------------------------
// Phase 5 Step 10 — enums mirrored from the Prisma schema so the
// client doesn't need to import the generated Prisma client.
// ---------------------------------------------------------------------------

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type BoardRole = "OWNER" | "ADMIN" | "MEMBER";

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface TaskAssignee {
  userId: string;
  email: string;
}

export interface TaskSubtask {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  position: number;
  createdAt: string;
}

export interface TaskCommentAuthor {
  id: string;
  email: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  author: TaskCommentAuthor;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  position: number;
  columnId: string;
  createdAt: string;
  // Phase 5 Step 10 — modal chrome fields
  starred: boolean;
  priority: TaskPriority | null;
  dueDate: string | null;
  storyPoints: number | null;
  labels: string[];
  assignees: TaskAssignee[];
  subtasks: TaskSubtask[];
}

export interface Column {
  id: string;
  title: string;
  position: number;
  tasks: Task[];
}

export interface BoardMember {
  userId: string;
  email: string;
  role: BoardRole;
  joinedAt: string;
}

export interface BoardDetail {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
  columns: Column[];
  members: BoardMember[];
}
