"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchMyBoards, myBoardsQueryKey } from "./api";

/**
 * Cached list of boards the current user owns or has been invited to.
 *
 * Mirrors `useBoardQuery`'s conventions: the defaults set in
 * `src/app/providers.tsx` (staleTime: 30s, refetchOnWindowFocus: false)
 * already apply, so we don't redeclare them here.
 *
 * `myBoardsQueryKey` is owned by `./api` and re-exported here for
 * convenience — `useCreateBoardMutation` and the accept-invite
 * hook import it directly from `./api` to keep the source of
 * truth single-file.
 */
export type MyBoardSummary = Awaited<ReturnType<typeof fetchMyBoards>>[number];

export { myBoardsQueryKey };

export function useMyBoardsQuery(): UseQueryResult<MyBoardSummary[]> {
  return useQuery({
    queryKey: myBoardsQueryKey,
    queryFn: fetchMyBoards,
  });
}
