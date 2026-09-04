"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchBoard } from "./api";
import type { BoardDetail } from "./types";

/** Stable query key factory — also used by the mutations to invalidate. */
export const boardQueryKey = (boardId: string) => ["board", boardId] as const;

/**
 * Fetch the nested board detail (`GET /api/boards/:id`).
 *
 * The server returns columns + their tasks in `position asc` order
 * already, so the client just renders the array as-is.
 */
export function useBoardQuery(boardId: string) {
  return useQuery<BoardDetail>({
    queryKey: boardQueryKey(boardId),
    queryFn: () => fetchBoard(boardId),
    enabled: Boolean(boardId),
    staleTime: 30_000,
  });
}
