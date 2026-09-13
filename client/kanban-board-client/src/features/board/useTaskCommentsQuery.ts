"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchComments, taskCommentsQueryKey } from "./api";
import type { TaskComment } from "./types";

/**
 * `GET /api/tasks/:id/comments` — the TaskModal's activity feed.
 *
 * Comments are fetched on a separate query key
 * (`["task-comments", taskId]`) because they're not part of the
 * board detail response. The query is enabled only when a `taskId`
 * is provided (i.e. the TaskModal is open).
 */
export function useTaskCommentsQuery(taskId: string | null) {
  return useQuery<TaskComment[]>({
    queryKey: taskCommentsQueryKey(taskId ?? ""),
    queryFn: () => fetchComments(taskId!),
    enabled: Boolean(taskId),
    staleTime: 30_000,
  });
}
