"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { createColumn } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import type { BoardDetail, Column } from "./types";

export interface CreateColumnArgs {
  title: string;
}

export interface CreateColumnContext {
  /** The pre-`onMutate` board snapshot (for `onError` rollback). */
  previous: BoardDetail | undefined;
  /** The id used for the optimistic placeholder column, so the
   *  `onSuccess` swap and the `onError` rollback can find and
   *  remove the exact row. */
  optimisticId: string;
}

/**
 * `POST /api/boards/:boardId/columns` with `{ title }`.
 *
 * Phase 5 Plan §5 — the `AddColumnGhost`'s "Add Column" tile and
 * the compact tier's "Add column" button both call this hook so
 * the user can author a new column from anywhere on the board.
 *
 * Optimistic update flow (mirrors `useCreateTaskMutation`):
 *  - `onMutate` cancels in-flight refetches, snapshots the current
 *    `["board", id]` cache value, and appends a placeholder
 *    column to the board so the new tile appears immediately.
 *    A temporary `clientId` is used so the rollback can find and
 *    remove the exact row.
 *  - `onSuccess` replaces the placeholder with the server's
 *    authoritative column (so the real `id` / `position` land in
 *    the cache without a refetch) and, if the new column is the
 *    first one, swaps the `LaneFocusView` out of the
 *    "No columns yet" empty state.
 *  - `onError` restores the snapshot AND removes the placeholder,
 *    whichever is preferred by the caller (the snapshot wins — it
 *    covers the edge case where the user added another column
 *    while this one was in flight).
 *  - `onSettled` invalidates the query so any drift between the
 *    server and the optimistic shape is reconciled.
 *
 * Position is server-assigned (the server picks `MAX(existing) +
 * 1000` via `floatPosition.nextAppend`). The placeholder's
 * `position: Number.MAX_SAFE_INTEGER` keeps it visually at the
 * tail of the column strip until the server response swaps it
 * for the real Float value.
 */
export function useCreateColumnMutation(
  boardId: string,
): UseMutationResult<
  Column,
  Error,
  CreateColumnArgs,
  CreateColumnContext
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ title }) => {
      const created = await createColumn(boardId, { title });
      // Map the wire shape (`{ id, title, boardId, position }`) to
      // the full `Column` (`{ ..., tasks: [] }`) so the success
      // result matches the cache type. The server never returns
      // task rows from `POST /columns`, so `tasks: []` is the
      // canonical shape until the next `useBoardQuery` refetch
      // (which the `onSettled` invalidation triggers).
      return { ...created, tasks: [] };
    },

    onMutate: async ({ title }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      const optimisticId = `optimistic-column-${crypto.randomUUID()}`;
      if (previous) {
        const placeholder: Column = {
          id: optimisticId,
          title,
          // `Number.MAX_SAFE_INTEGER` keeps the placeholder at
          // the tail of the horizontal board until the server's
          // `onSuccess` swap replaces it with the real Float
          // (which is `MAX(existing.position) + 1000` — also the
          // tail, so the visible ordering is stable across the
          // swap).
          position: Number.MAX_SAFE_INTEGER,
          tasks: [],
        };
        const optimistic: BoardDetail = {
          ...previous,
          columns: [...previous.columns, placeholder],
        };
        qc.setQueryData(boardQueryKey(boardId), optimistic);
      }
      return { previous, optimisticId };
    },

    onSuccess: (created, _vars, ctx) => {
      qc.setQueryData<BoardDetail | undefined>(
        boardQueryKey(boardId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            columns: current.columns.map((c) => {
              // If the placeholder is still in the list, swap it
              // for the server-authoritative column. This is the
              // common path — the user just added a column and
              // the cache should converge on the real row.
              if (c.id === ctx?.optimisticId) {
                return { ...created, tasks: [] };
              }
              return c;
            }),
          };
        },
      );
    },

    onError: (_err, _vars, ctx) => {
      // Prefer the snapshot — it covers the case where the user
      // has already added another column while this one was in
      // flight. Falling back to "remove just the placeholder"
      // would still be correct in the simple case, but the
      // snapshot is unambiguously the right rollback.
      if (ctx?.previous) {
        qc.setQueryData(boardQueryKey(boardId), ctx.previous);
      }
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
    },
  });
}
