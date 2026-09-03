import api from "@/lib/api";
import type { BoardDetail, Task, Column } from "./types";

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
