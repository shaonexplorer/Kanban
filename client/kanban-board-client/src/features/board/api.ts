import api from "@/lib/api";
import type { BoardDetail, Task, Column, BoardMember } from "./types";

/**
 * Tiny typed wrappers around the existing axios instance.
 *
 * The instance already attaches the JWT to every request (see
 * `src/lib/api.ts`). We re-use it instead of pulling in `fetch` so
 * there is exactly one place in the codebase that talks to the
 * backend.
 */

export function fetchBoard(boardId: string): Promise<BoardDetail> {
  return api.get<BoardDetail>(`/boards/${boardId}`).then((r) => r.data);
}

export function fetchMyBoards(): Promise<
  Array<{ id: string; title: string; role: "OWNER" | "MEMBER"; createdAt: string }>
> {
  return api.get("/boards").then((r) => r.data);
}

/**
 * Stable query key for the caller's boards. Used by
 * `useCreateBoardMutation` (invalidates on success so the home
 * page's `EmptyBoardsState` clears on the next visit) and the
 * future `useFetchMyBoards` hook (if/when one is added).
 */
export const myBoardsQueryKey = ["my-boards"] as const;

export interface CreateBoardInput {
  title: string;
  /** Phase 5 Step 5: optional. Persistence lands in Step 10. */
  projectKey?: string;
  /** Phase 5 Step 5: optional. Persistence lands in Step 10. */
  colorIdentity?: "PRIMARY" | "TERTIARY" | "SECONDARY" | "ERROR" | "OUTLINE";
  /** Phase 5 Step 5: optional. Persistence lands in Step 10. */
  template?: "SOFTWARE_ENG" | "INCIDENT_MGMT";
}

/** Response from `POST /api/boards` (and the same shape
 *  `PATCH /api/boards/:id` returns). */
export interface BoardMutationResult {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
}

export function createBoard(body: CreateBoardInput): Promise<BoardMutationResult> {
  return api.post<BoardMutationResult>("/boards", body).then((r) => r.data);
}

export interface UpdateBoardInput {
  title?: string;
  /** Phase 5 Step 5: optional. Persistence lands in Step 10. */
  linkSharing?: "DISABLED" | "VIEW";
}

export function updateBoard(
  boardId: string,
  body: UpdateBoardInput,
): Promise<BoardMutationResult> {
  return api
    .patch<BoardMutationResult>(`/boards/${boardId}`, body)
    .then((r) => r.data);
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  /** Phase 5 Step 5: optional. Persistence lands in Step 10. */
  starred?: boolean;
}

export function updateTask(
  taskId: string,
  body: UpdateTaskInput,
): Promise<Task> {
  return api
    .patch<Task>(`/tasks/${taskId}`, body)
    .then((r) => r.data);
}

export function deleteTask(taskId: string): Promise<void> {
  return api.delete(`/tasks/${taskId}`).then(() => undefined);
}

export interface InviteMemberInput {
  /** Either a known userId (UUID) or an email of a registered user.
   * Matches the discriminated union on the server's
   * `InviteMemberSchema`. */
  userId?: string;
  email?: string;
  /** Phase 5 Step 5: optional. Defaults to "MEMBER" server-side. */
  role?: "MEMBER" | "ADMIN";
}

/** Response from `POST /api/boards/:id/members` — a PENDING
 *  invitation row. The current `BoardMember` type on the client
 *  doesn't model the `pending: boolean` flag, so callers may want
 *  to compose with their own flag until the type widens. */
export interface BoardInvitationResult {
  id: string;
  boardId: string;
  inviterId: string;
  inviteeId: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED";
  createdAt: string;
}

export function inviteBoardMember(
  boardId: string,
  body: InviteMemberInput,
): Promise<BoardInvitationResult> {
  return api
    .post<BoardInvitationResult>(`/boards/${boardId}/members`, body)
    .then((r) => r.data);
}

export function removeBoardMember(
  boardId: string,
  userId: string,
): Promise<void> {
  return api
    .delete(`/boards/${boardId}/members/${userId}`)
    .then(() => undefined);
}

export function moveTask(
  sourceColumnId: string,
  taskId: string,
  body: { toColumnId: string; toIndex: number },
): Promise<Task> {
  return api
    .post<Task>(`/columns/${sourceColumnId}/tasks/${taskId}/move`, body)
    .then((r) => r.data);
}

export function moveColumn(
  columnId: string,
  body: { toIndex: number },
): Promise<Column> {
  return api
    .post<Column>(`/columns/${columnId}/move`, body)
    .then((r) => r.data);
}

/** Response from `POST /api/boards/:boardId/columns` — a freshly
 *  appended column in the server's wire shape. The cache side of
 *  the create-column mutation maps this to a full `Column` (with
 *  an empty `tasks` array) so the new column appears in the
 *  board view without a follow-up refetch. */
export interface ColumnMutationResult {
  id: string;
  title: string;
  boardId: string;
  position: number;
}

export function createColumn(
  boardId: string,
  body: { title: string },
): Promise<ColumnMutationResult> {
  return api
    .post<ColumnMutationResult>(`/boards/${boardId}/columns`, body)
    .then((r) => r.data);
}

/**
 * `PATCH /api/columns/:id` — rename a column. The wire response
 * is `ColumnMutationResult` (id / title / boardId / position,
 * no `tasks`); the `useUpdateColumnMutation` hook is responsible
 * for mapping the server shape back into the cache's full
 * `Column` (with the existing `tasks` preserved).
 */
export function updateColumn(
  columnId: string,
  body: { title: string },
): Promise<ColumnMutationResult> {
  return api
    .patch<ColumnMutationResult>(`/columns/${columnId}`, body)
    .then((r) => r.data);
}

/**
 * `DELETE /api/columns/:id`. Cascades to the column's tasks via
 * the schema's `onDelete: Cascade` on `Task.column`. Returns
 * `void` to mirror `deleteTask` (line 85-87).
 */
export function deleteColumn(columnId: string): Promise<void> {
  return api.delete(`/columns/${columnId}`).then(() => undefined);
}

/**
 * Re-export the `BoardMember` type for callers that want to
 * construct a synthetic optimistic member row (the
 * `useInviteMemberMutation` uses this for the "pending" placeholder).
 */
export type { BoardMember };
