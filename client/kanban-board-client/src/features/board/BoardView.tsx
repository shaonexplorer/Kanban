"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useBoardQuery, boardQueryKey } from "./useBoardQuery";
import { useMoveTaskMutation } from "./useMoveTaskMutation";
import { useMoveColumnMutation } from "./useMoveColumnMutation";
import {
  findColumnOfTask,
  moveTaskWithinBoard,
  snapshotBoard,
} from "./reorderBoard";
import { Column } from "./Column";
import { TaskCard } from "./TaskCard";
import type { BoardDetail, Column as ColumnT, Task } from "./types";

export interface BoardViewProps {
  boardId: string;
}

type ActiveDrag =
  | { type: "task"; id: string; task: Task }
  | { type: "column"; id: string; column: ColumnT }
  | null;

/**
 * Top-level board view. Owns the dnd-kit `DndContext`, the snapshot
 * ref, the in-flight set, and the toast. The two mutations are
 * called from `onDragEnd`; the live cross-column preview is applied
 * through `onDragOver` so the user sees the card land in the target
 * column before they release the pointer.
 */
export default function BoardView({ boardId }: BoardViewProps) {
  const qc = useQueryClient();
  const { data: board, isLoading, error, refetch } = useBoardQuery(boardId);
  const snapshotRef = useRef<BoardDetail | null>(null);
  const moveTask = useMoveTaskMutation(boardId, snapshotRef);
  const moveColumn = useMoveColumnMutation(boardId, snapshotRef);

  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss the toast after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ----- dnd-kit handlers -------------------------------------------------

  function handleDragStart(event: DragStartEvent) {
    if (!board) return;
    // Capture the pre-drag board so the mutations can roll back on
    // failure. This is preferred over the TanStack `previous`
    // snapshot — `onMutate` runs after `onDragOver` may have already
    // mutated the cache, so the dnd-kit snapshot is the only "true"
    // pre-drag value.
    snapshotRef.current = snapshotBoard(board);

    const id = String(event.active.id);
    const type = (event.active.data.current?.type as
      | "task"
      | "column"
      | undefined) ?? null;

    if (type === "column") {
      const column = board.columns.find((c) => c.id === id) ?? null;
      setActiveDrag(column ? { type: "column", id, column } : null);
    } else if (type === "task") {
      const column = findColumnOfTask(board, id);
      const task = column?.tasks.find((t) => t.id === id) ?? null;
      setActiveDrag(task ? { type: "task", id, task } : null);
    } else {
      setActiveDrag(null);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || !board) return;

    const activeType = active.data.current?.type as
      | "task"
      | "column"
      | undefined;
    const overType = over.data.current?.type as "task" | "column" | undefined;
    if (activeType !== "task" || !overType) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Use the live (possibly already-mutated) cache so multiple
    // `onDragOver` ticks compose correctly.
    const live =
      qc.getQueryData<BoardDetail>(boardQueryKey(boardId)) ?? board;
    const sourceColumn = findColumnOfTask(live, activeId);
    if (!sourceColumn) return;

    let toColumnId: string;
    let toIndex: number;

    if (overType === "task") {
      const overColumn = findColumnOfTask(live, overId);
      if (!overColumn) return;
      toColumnId = overColumn.id;
      const overIdx = overColumn.tasks.findIndex((t) => t.id === overId);
      toIndex = overIdx < 0 ? overColumn.tasks.length : overIdx;
    } else {
      // Dropped on a column (e.g. its empty body). Land at the end.
      toColumnId = overId;
      const targetColumn = live.columns.find((c) => c.id === toColumnId);
      toIndex = targetColumn?.tasks.length ?? 0;
    }

    const fromIndex = sourceColumn.tasks.findIndex((t) => t.id === activeId);
    // No-op: same position, same column.
    if (sourceColumn.id === toColumnId && fromIndex === toIndex) return;

    const next = moveTaskWithinBoard(live, activeId, toColumnId, toIndex);
    qc.setQueryData(boardQueryKey(boardId), next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDrag(null);

    if (!over || !board) {
      // Dropped outside any droppable — restore the pre-drag state.
      const snap = snapshotRef.current;
      snapshotRef.current = null;
      if (snap) qc.setQueryData(boardQueryKey(boardId), snap);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeType = active.data.current?.type as
      | "task"
      | "column"
      | undefined;
    const overType = over.data.current?.type as
      | "task"
      | "column"
      | undefined;

    // Read the post-`onDragOver` cache so we use the same destination
    // the user has been previewing.
    const live =
      qc.getQueryData<BoardDetail>(boardQueryKey(boardId)) ?? board;

    if (activeType === "column" && overType === "column" && activeId !== overId) {
      const fromIndex = live.columns.findIndex((c) => c.id === activeId);
      const toIndex = live.columns.findIndex((c) => c.id === overId);
      snapshotRef.current = null;
      if (fromIndex < 0 || toIndex < 0) return;

      setInFlightIds((s) => {
        const n = new Set(s);
        n.add(activeId);
        return n;
      });

      moveColumn.mutate(
        { columnId: activeId, toIndex },
        {
          onError: () => {
            setToast("Couldn't reorder column — restored previous state.");
          },
          onSettled: () => {
            setInFlightIds((s) => {
              const n = new Set(s);
              n.delete(activeId);
              return n;
            });
          },
        },
      );
      return;
    }

    if (activeType === "task") {
      const sourceColumn = findColumnOfTask(live, activeId);
      if (!sourceColumn) {
        snapshotRef.current = null;
        return;
      }

      let toColumnId: string;
      let toIndex: number;

      if (overType === "task") {
        const overColumn = findColumnOfTask(live, overId);
        if (!overColumn) {
          snapshotRef.current = null;
          return;
        }
        toColumnId = overColumn.id;
        const overIdx = overColumn.tasks.findIndex((t) => t.id === overId);
        toIndex = overIdx < 0 ? overColumn.tasks.length : overIdx;
      } else if (overType === "column") {
        toColumnId = overId;
        const targetColumn = live.columns.find((c) => c.id === toColumnId);
        toIndex = targetColumn?.tasks.length ?? 0;
      } else {
        snapshotRef.current = null;
        return;
      }

      const fromIndex = sourceColumn.tasks.findIndex((t) => t.id === activeId);
      if (sourceColumn.id === toColumnId && fromIndex === toIndex) {
        snapshotRef.current = null;
        return;
      }

      setInFlightIds((s) => {
        const n = new Set(s);
        n.add(activeId);
        return n;
      });

      moveTask.mutate(
        {
          taskId: activeId,
          sourceColumnId: sourceColumn.id,
          toColumnId,
          toIndex,
        },
        {
          onError: () => {
            setToast("Couldn't move task — restored previous state.");
          },
          onSettled: () => {
            setInFlightIds((s) => {
              const n = new Set(s);
              n.delete(activeId);
              return n;
            });
          },
        },
      );
      snapshotRef.current = null;
      return;
    }

    // Unhandled shape — clear the snapshot and let the cache settle.
    snapshotRef.current = null;
  }

  function handleDragCancel() {
    setActiveDrag(null);
    const snap = snapshotRef.current;
    snapshotRef.current = null;
    if (snap) qc.setQueryData(boardQueryKey(boardId), snap);
  }

  // ----- render states ----------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        Loading board…
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
            Failed to load board
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {error instanceof Error ? error.message : "Unknown error."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center justify-center rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const columnIds = board.columns.map((c) => c.id);
  const isAnyDragging = activeDrag !== null;

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {board.title}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {board.columns.length} column
            {board.columns.length === 1 ? "" : "s"} · {board.members.length}{" "}
            member{board.members.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/"
          className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline"
        >
          Home
        </Link>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-4 p-6 h-full items-start min-w-min">
            {board.columns.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 px-6 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No columns yet. Create one via
                <code className="mx-1 px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                  POST /api/boards/:id/columns
                </code>
                .
              </div>
            ) : (
              <SortableContext
                items={columnIds}
                strategy={horizontalListSortingStrategy}
              >
                {board.columns.map((column) => (
                  <Column
                    key={column.id}
                    column={column}
                    inFlightIds={inFlightIds}
                    isAnyDragging={isAnyDragging}
                  />
                ))}
              </SortableContext>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeDrag?.type === "task" ? (
            <TaskCard task={activeDrag.task} inFlight={false} />
          ) : activeDrag?.type === "column" ? (
            <div className="w-72 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 p-3 shadow-lg">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {activeDrag.column.title}
              </h2>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-50 max-w-sm rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-800 dark:text-red-200 shadow-md flex items-start gap-3"
        >
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="text-red-500 hover:text-red-700 dark:text-red-300 dark:hover:text-red-100"
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
