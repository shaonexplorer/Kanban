"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import { TaskCardShell } from "./TaskCardShell";
import { Icon } from "./Icon";
import { QuickAddTask } from "./QuickAddTask";
import type { Column } from "../types";

export interface ColumnShellProps {
  /** The id of the board the column belongs to. Used to key the
   *  TanStack mutation's optimistic cache write. */
  boardId: string;
  column: Column;
  /** Ids of items currently mid-mutation — used to dim the column. */
  inFlightIds: Set<string>;
  /** When true, this column is the source/destination of an active drag. */
  isAnyDragging: boolean;
  /** Status dot color (semantic token). The status itself isn't
   * modeled server-side; the dot uses the column's index-based
   * hash so each column gets a stable color across renders. */
  statusToken?: "tertiary" | "secondary" | "primary" | "outline";
  /** Called when the quick-add mutation fails. The parent typically
   *  surfaces this as a toast so the user knows the input is still
   *  editable. */
  onQuickAddError?: (message: string) => void;
  /** When true, render the column at full width inside the
   *  compact "lane focus" view. The column's `useSortable` is
   *  still wired (so the dnd-kit types stay consistent) but
   *  the parent disables dnd-kit on compact, so the handle
   *  becomes a no-op. The column header still acts as a drag
   *  handle on tablet / desktop. */
  compactMode?: boolean;
  /** Phase 5 Step 5 — called when a task card in this column is
   *  clicked. The parent (BoardView / LaneFocusView) uses this to
   *  set the lifted `selectedTaskId` and open the `TaskModal`.
   *  Forwarded to every `TaskCardShell` rendered below. */
  onSelectTask?: (taskId: string) => void;
}

const statusDotClass: Record<
  NonNullable<ColumnShellProps["statusToken"]>,
  string
> = {
  tertiary: "bg-tertiary",
  secondary: "bg-secondary",
  primary: "bg-primary",
  outline: "bg-outline",
};

const statusRingClass: Record<
  NonNullable<ColumnShellProps["statusToken"]>,
  string
> = {
  tertiary: "bg-tertiary/10",
  secondary: "bg-secondary/15",
  primary: "bg-primary/15",
  outline: "bg-outline/15",
};

/**
 * The Stitch-styled sortable column. Behavior is identical to the
 * Phase 4 `Column` — same `useSortable` wiring, same nested
 * `SortableContext`, same `inFlightIds` dim semantics — only the
 * markup is new.
 *
 * Phase 5 Step 2 replaces the previous "Add Task" button + parent
 * `onAddTask` callback with an inline `QuickAddTask` form owned by
 * the column. The header "+" button and the footer button are now
 * the same affordance — both expand the same form via the
 * `quickAddOpen` state.
 */
export function ColumnShell({
  boardId,
  column,
  inFlightIds,
  isAnyDragging,
  statusToken = "outline",
  onQuickAddError,
  compactMode = false,
  onSelectTask,
}: ColumnShellProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { type: "column" },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const taskIds = column.tasks.map((t) => t.id);
  const columnDimmed = inFlightIds.has(column.id);

  // The header "+" and the footer affordance both control the same
  // form. Keeping the state here (rather than inside `QuickAddTask`)
  // means both buttons can open the same inline form below.
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  return (
    <section
      ref={setNodeRef}
      style={style}
      data-testid={`column-${column.id}`}
      className={[
        compactMode
          ? "w-full max-w-none"
          : "w-column-width-min md:w-column-width-max",
        "flex flex-col",
        compactMode ? "" : "shrink-0",
        "bg-surface-container-lowest/90 rounded-xl",
        "p-space-sm shadow-md",
        "transition-opacity",
        isDragging ? "opacity-60" : "opacity-100",
      ].join(" ")}
    >
      {/* Column header — drag handle is the entire header. */}
      <header
        {...attributes}
        {...listeners}
        className="flex items-center justify-between px-space-xs py-space-sm mb-space-xs cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`size-2.5 rounded-full ${statusDotClass[statusToken]} ${
              statusToken === "tertiary" ? "animate-pulse" : ""
            }`}
          />
          <h3 className="font-headline-sm text-headline-sm text-on-surface truncate">
            {column.title}
          </h3>
          <span
            className={[
              "font-label-mono-sm text-label-mono-sm",
              "px-1.5 py-0.5 rounded-full bg-surface-container",
              "text-on-surface-variant shrink-0",
              "transition-opacity duration-(--duration-medium) ease-standard",
              column.tasks.length === 0 ? "opacity-60" : "opacity-100",
            ].join(" ")}
          >
            {column.tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Add task to ${column.title}`}
            onClick={(e) => {
              // Don't let a click on + propagate to the drag handle.
              e.stopPropagation();
              setQuickAddOpen(true);
            }}
            className="size-6 flex items-center justify-center rounded text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <Icon name="add" className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Column settings"
            onClick={(e) => e.stopPropagation()}
            className="size-6 flex items-center justify-center rounded text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <Icon name="more_horiz" className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-space-sm">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {column.tasks.map((task) => (
            <TaskCardShell
              key={task.id}
              task={task}
              inFlight={
                columnDimmed || inFlightIds.has(task.id) || isAnyDragging
              }
              onSelect={onSelectTask}
            />
          ))}
        </SortableContext>

        {/* Empty-state affordance. On the compact tier (where
         * dnd-kit is disabled) the "Drop task here" hint is a
         * non-functional affordance — show a "No tasks yet" line
         * instead and pre-open the quick-add form so the user can
         * add the first task without an extra click. On tablet /
         * desktop the "Drop task here" hint is the right
         * affordance (drag-and-drop is the primary task-add flow). */}
        {column.tasks.length === 0 && compactMode ? (
          <div className="flex flex-col items-center justify-center gap-space-xs py-space-sm text-outline">
            <Icon name="add" className="w-5 h-5" />
            <p className="font-label-ui-md text-label-ui-md text-center">
              No tasks yet
              <br />
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                add one to get started
              </span>
            </p>
          </div>
        ) : null}

        {column.tasks.length === 0 && !compactMode ? (
          <div
            className={[
              "w-full h-20 rounded-lg",
              "flex flex-col items-center justify-center gap-1",
              "text-outline p-space-sm",
              "transition-all duration-200",
              statusRingClass[statusToken],
              "hover:bg-surface-container/40",
            ].join(" ")}
          >
            <Icon name="south" className="w-4 h-4" />
            <span className="font-label-ui-sm text-label-ui-sm">
              Drop task here
            </span>
          </div>
        ) : null}

        {/* On compact, pre-open the quick-add form when the column
         * is empty so the user has an obvious next step. The form
         * closes itself on a successful submit, and the parent
         * (ColumnShell) can also close it via `setQuickAddOpen` if
         * the user opens it from the header `+` button on a
         * non-empty column. */}
        <QuickAddTask
          boardId={boardId}
          columnId={column.id}
          open={compactMode && column.tasks.length === 0 ? true : quickAddOpen}
          onOpenChange={setQuickAddOpen}
          onError={onQuickAddError}
        />
      </div>
    </section>
  );
}
