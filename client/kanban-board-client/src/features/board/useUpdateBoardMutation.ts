"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { updateBoard, type UpdateBoardInput, type BoardMutationResult } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail } from "./types";

export interface UpdateBoardVariables {
  patch: UpdateBoardInput;
}

export interface UpdateBoardContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
}

/**
 * `PATCH /api/boards/:id` (Phase 5 Plan §5.2 — link-sharing toggle).
 *
 * Used by the `ShareBoardModal`'s "Anyone with the link can view"
 * toggle. The hook writes the patch into the board cache
 * optimistically; on error the snapshot is restored.
 *
 * The `linkSharing` field is accepted server-side (the
 * `UpdateBoardSchema` widens to include it) but persistence
 * lands in Step 10's `phase05_polish` migration. The
 * `onSettled.invalidateQueries` is the safety net that picks up
 * the server's authoritative response shape once the column
 * lands in `BoardDetail`.
 */
export function useUpdateBoardMutation(
  boardId: string,
): UseMutationResult<
  BoardMutationResult,
  Error,
  UpdateBoardVariables,
  UpdateBoardContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ patch }) => updateBoard(boardId, patch),

    onMutate: async ({ patch }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      if (previous) {
        const optimistic: BoardDetail = {
          ...previous,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
        };
        qc.setQueryData(boardQueryKey(boardId), optimistic);
      }
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(boardQueryKey(boardId), ctx.previous);
      }
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
    },
  });
}
