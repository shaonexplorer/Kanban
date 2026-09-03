"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import { moveColumn } from "./api";
import { boardQueryKey } from "./useBoardQuery";
import { reorderColumnsInBoard } from "./reorderBoard";
import type { BoardDetail, Column } from "./types";

export interface MoveColumnVariables {
  columnId: string;
  toIndex: number;
}

export interface MoveColumnContext {
  previous: BoardDetail | undefined;
}

/**
 * Move a column to a new index on its own board.
 *
 * Same optimistic-update contract as `useMoveTaskMutation` — see
 * the task-mutation file for the full write-up.
 */
export function useMoveColumnMutation(
  boardId: string,
  snapshotRef: RefObject<BoardDetail | null>,
) {
  const qc = useQueryClient();

  return useMutation<Column, Error, MoveColumnVariables, MoveColumnContext>({
    mutationFn: (vars) => moveColumn(vars.columnId, { toIndex: vars.toIndex }),

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      if (previous) {
        const fromIndex = previous.columns.findIndex(
          (c) => c.id === vars.columnId,
        );
        if (fromIndex >= 0) {
          const optimistic = reorderColumnsInBoard(
            previous,
            fromIndex,
            vars.toIndex,
          );
          qc.setQueryData(boardQueryKey(boardId), optimistic);
        }
      }
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      const snap = snapshotRef.current ?? ctx?.previous ?? null;
      if (snap) {
        qc.setQueryData(boardQueryKey(boardId), snap);
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
    },
  });
}
