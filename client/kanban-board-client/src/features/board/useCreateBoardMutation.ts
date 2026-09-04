"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { createBoard, myBoardsQueryKey, type CreateBoardInput, type BoardMutationResult } from "./api";

/**
 * `POST /api/boards` with the new optional Phase 5 fields
 * (projectKey, colorIdentity, template — server-side widening
 * in `boards.validation.ts`; persistence lands in Step 10).
 *
 * Phase 5 Plan §5.3 — the `CreateBoardDrawer`'s "Create & Launch
 * Board" button calls this hook. The caller is expected to
 * navigate to `/boards/:newId` on success (the home page and
 * the board view both do this via `router.push`).
 *
 * `onSuccess` invalidates `["my-boards"]` so the home page's
 * `EmptyBoardsState` clears on the next visit (the home page
 * currently fetches boards in a `useEffect`; a future refactor
 * to a real `useQuery` would automatically pick up the
 * invalidation).
 */
export function useCreateBoardMutation(): UseMutationResult<
  BoardMutationResult,
  Error,
  CreateBoardInput,
  unknown
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => createBoard(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: myBoardsQueryKey });
    },
  });
}
