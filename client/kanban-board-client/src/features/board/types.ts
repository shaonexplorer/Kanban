/**
 * Frontend types that mirror the server's response shape.
 *
 * The server is the source of truth (see
 * `server/src/modules/boards/boards.service.ts` — `BoardDetail`).
 * Dates are serialised to ISO strings over the wire, so we keep them as
 * `string` on the client to avoid accidental `Date` comparisons on
 * unsanitised cache data.
 */

export interface Task {
  id: string;
  title: string;
  description: string | null;
  position: number;
  columnId: string;
  createdAt: string;
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
  role: "OWNER" | "MEMBER";
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
