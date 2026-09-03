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
import { useCreateTaskMutation } from "./useCreateTaskMutation";
import {
  findColumnOfTask,
  moveTaskWithinBoard,
  snapshotBoard,
} from "./reorderBoard";
import { Column } from "./Column";
import { TaskCard } from "./TaskCard";
import type { BoardDetail, Column as ColumnT, Task } from "./types";
import { Sidebar } from "./components/Sidebar";
import { BoardHeader } from "./components/BoardHeader";
import { BoardControlBar } from "./components/BoardControlBar";
import { AddColumnGhost } from "./components/AddColumnGhost";

export interface BoardViewProps {
  boardId: string;
}

type ActiveDrag =
  | { type: "task"; id: string; task: Task }
  | { type: "column"; id: string; column: ColumnT }
  | null;

/**
 * Top-level board view. Owns the dnd-kit `DndContext`, the snapshot
 * ref, the in-flight set, and the toast. The two move mutations are
 * called from `onDragEnd`; the live cross-column preview is applied
 * through `onDragOver` so the user sees the card land in the target
 * column before they release the pointer.
 *
 * The visual shell (sidebar / top bar / sub-header / columns /
 * add-column ghost) is composed from the Stitch-style components
 * in `./components/`. The dnd-kit handlers and the snapshot /
 * optimistic-update contract are unchanged from Phase 4.
 */
export default function BoardView({ boardId }: BoardViewProps) {
  const qc = useQueryClient();
  const { data: board, isLoading, error, refetch } = useBoardQuery(boardId);
  const snapshotRef = useRef<BoardDetail | null>(null);
  const moveTask = useMoveTaskMutation(boardId, snapshotRef);
  const moveColumn = useMoveColumnMutation(boardId, snapshotRef);
  const createTask = useCreateTaskMutation(boardId);

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

  // ----- dnd-kit handlers (unchanged from Phase 4) --------------------

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
    const overType = over.data.current?.type as "task" | "column" | undefined;

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

  // ----- render states -------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-outline pl-sidebar-expanded">
        Loading board…
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 pl-sidebar-expanded">
        <div className="max-w-md text-center">
          <p className="font-headline-sm text-headline-sm text-on-surface">
            Failed to load board
          </p>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            {error instanceof Error ? error.message : "Unknown error."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary text-on-primary px-4 py-2 font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const columnIds = board.columns.map((c) => c.id);
  const isAnyDragging = activeDrag !== null;
  const canCreateTask = board.columns.length > 0;
  const firstColumnId = board.columns[0]?.id ?? null;

  function handleNewTask({ title }: { title: string }) {
    if (!firstColumnId) {
      setToast("Create a column before adding tasks.");
      return;
    }
    createTask.mutate(
      { columnId: firstColumnId, title },
      {
        onError: () => {
          setToast("Couldn't create task — please retry.");
        },
      },
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar />

      <div className="pl-sidebar-expanded">
        <BoardHeader boardId={boardId} />

        <main className="pt-16 min-h-screen flex flex-col">
          <BoardControlBar
            onCreateTask={handleNewTask}
            canCreateTask={canCreateTask}
          />

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="flex-1 overflow-x-auto kanban-scroll px-space-xl py-space-lg select-none">
              <div className="flex items-start gap-gutter-board min-w-max pb-space-3xl">
                {board.columns.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-outline/30 px-space-xl py-space-3xl text-center">
                    <p className="font-headline-sm text-headline-sm text-on-surface-variant">
                      No columns yet
                    </p>
                    <p className="mt-space-xs font-body-md text-body-md text-outline">
                      Create one via
                      <code className="mx-1 px-1 py-0.5 rounded bg-surface-container-high text-on-surface font-label-mono-md text-label-mono-md">
                        POST /api/boards/:id/columns
                      </code>
                      .
                    </p>
                    <Link
                      href="/"
                      className="mt-space-md inline-block font-label-ui-sm text-label-ui-sm text-primary hover:text-primary-fixed underline underline-offset-4"
                    >
                      Back home
                    </Link>
                  </div>
                ) : (
                  <SortableContext
                    items={columnIds}
                    strategy={horizontalListSortingStrategy}
                  >
                    {board.columns.map((column, columnIndex) => {
                      // Stable per-column status token — first column
                      // is "tertiary" (the active/pulse color in the
                      // Stitch mock), then secondary / primary /
                      // outline for the rest. Index-based so the
                      // colors don't shuffle when a column moves.
                      const statusTokens = [
                        "tertiary",
                        "secondary",
                        "primary",
                        "outline",
                      ] as const;
                      const statusToken =
                        statusTokens[columnIndex % statusTokens.length];
                      return (
                        <Column
                          key={column.id}
                          column={column}
                          inFlightIds={inFlightIds}
                          isAnyDragging={isAnyDragging}
                          statusToken={statusToken}
                          onAddTask={(columnId) => {
                            // Phase 5 will wire this to a per-column
                            // task-creation dialog. For now, open
                            // the same first-column flow and tell
                            // the user which column they targeted.
                            const title = window.prompt(
                              `Task title for "${board.columns.find((c) => c.id === columnId)?.title ?? columnId}"`,
                            );
                            if (title && title.trim()) {
                              createTask.mutate(
                                { columnId, title: title.trim() },
                                {
                                  onError: () => {
                                    setToast(
                                      "Couldn't create task — please retry.",
                                    );
                                  },
                                },
                              );
                            }
                          }}
                        />
                      );
                    })}
                  </SortableContext>
                )}

                {board.columns.length > 0 ? (
                  <AddColumnGhost
                    onClick={() =>
                      setToast("Add column flow lands in Phase 5.")
                    }
                  />
                ) : null}
              </div>
            </div>

            <DragOverlay>
              {activeDrag?.type === "task" ? (
                <TaskCard task={activeDrag.task} inFlight={false} />
              ) : activeDrag?.type === "column" ? (
                <div className="w-column-width-min md:w-column-width-max rounded-xl bg-surface-container-lowest shadow-2xl p-space-sm">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface px-space-xs">
                    {activeDrag.column.title}
                  </h3>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </main>
      </div>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-50 max-w-sm rounded-lg border border-error bg-surface-container px-space-md py-space-sm font-body-sm text-body-sm text-error shadow-md flex items-start gap-space-sm"
        >
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="text-error hover:text-on-error-container"
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
