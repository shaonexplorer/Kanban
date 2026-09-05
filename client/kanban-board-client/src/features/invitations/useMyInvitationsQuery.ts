"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchMyInvitations } from "./api";
import type { BoardInvitation } from "./types";

/**
 * Cached list of the current user's PENDING board invitations.
 *
 * Mirrors `useBoardQuery`'s conventions: the defaults set in
 * `src/app/providers.tsx` (staleTime: 30s, refetchOnWindowFocus: false)
 * already apply, so we don't redeclare them here.
 *
 * The query refetches when invalidated by the accept / decline
 * mutations, and on every navigation (TanStack Query's default
 * `refetchOnMount: true` after `staleTime` elapses). The bell
 * badge in `BoardHeader` reads the array length off this hook, so
 * the count stays in sync without any prop-drilling.
 */
export const myInvitationsQueryKey = ["my-invitations"] as const;

export function useMyInvitationsQuery(): UseQueryResult<BoardInvitation[]> {
  return useQuery({
    queryKey: myInvitationsQueryKey,
    queryFn: fetchMyInvitations,
  });
}
