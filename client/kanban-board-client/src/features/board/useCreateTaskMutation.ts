"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import api from "@/lib/api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail, Task } from "./types";

export interface CreateTaskArgs {
  columnId: string;
  title: string;
}

/**
 * `POST /api/columns/:columnId/tasks` with `{ title }`. Updates the
 * cached `BoardDetail` directly so the new card appears without
 * waiting for a refetch, then invalidates the query so the server
 * has the final say on the new `position` string.
 */
export function useCreateTaskMutation(
  boardId: string,
): UseMutationResult<Task, Error, CreateTaskArgs> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ columnId, title }) => {
      const { data } = await api.post<Task>(
        `/columns/${columnId}/tasks`,
        { title },
      );
      return data;
    },
    onSuccess: (created) => {
      qc.setQueryData<BoardDetail | undefined>(
        boardQueryKey(boardId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            columns: current.columns.map((c) =>
              c.id === created.columnId
                ? { ...c, tasks: [...c.tasks, created] }
                : c,
            ),
          };
        },
      );
    },
    onSettled: () => {
      // Let the server's authoritative position / createdAt settle.
      void qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
    },
  });
}
