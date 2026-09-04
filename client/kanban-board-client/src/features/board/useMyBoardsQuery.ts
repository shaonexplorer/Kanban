"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchMyBoards } from "./api";

/**
 * Cached list of boards the current user owns or has been invited to.
 *
 * Mirrors `useBoardQuery`'s conventions: the defaults set in
 * `src/app/providers.tsx` (staleTime: 30s, refetchOnWindowFocus: false)
 * already apply, so we don't redeclare them here.
 */
export type MyBoardSummary = Awaited<ReturnType<typeof fetchMyBoards>>[number];

export const myBoardsQueryKey = ["boards"] as const;

export function useMyBoardsQuery(): UseQueryResult<MyBoardSummary[]> {
  return useQuery({
    queryKey: myBoardsQueryKey,
    queryFn: fetchMyBoards,
  });
}
