"use client";

import { useSortable } from "@dnd-kit/sortable";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import { TaskCardShell } from "./TaskCardShell";
import { Icon } from "./Icon";
import type { Column } from "../types";

export interface ColumnShellProps {
  column: Column;
  /** Ids of items currently mid-mutation — used to dim the column. */
  inFlightIds: Set<string>;
  /** When true, this column is the source/destination of an active drag. */
  isAnyDragging: boolean;
  /** Status dot color (semantic token). The status itself isn't
   * modeled server-side; the dot uses the column's index-based
   * hash so each column gets a stable color across renders. */
  statusToken?: "tertiary" | "secondary" | "primary" | "outline";
  /** Called when the per-column "+" button is pressed (no-op default). */
  onAddTask?: (columnId: string) => void;
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
 */
export function ColumnShell({
  column,
  inFlightIds,
  isAnyDragging,
  statusToken = "outline",
  onAddTask,
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

  return (
    <section
      ref={setNodeRef}
      style={style}
      data-testid={`column-${column.id}`}
      className={[
        "w-column-width-min md:w-column-width-max",
        "flex flex-col shrink-0",
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
          <span className="font-label-mono-sm text-label-mono-sm px-1.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant shrink-0">
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
              onAddTask?.(column.id);
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
            />
          ))}
        </SortableContext>

        {column.tasks.length === 0 ? (
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

        <button
          type="button"
          onClick={() => onAddTask?.(column.id)}
          className="w-full flex items-center justify-center gap-1 py-space-xs mt-space-xs rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors font-label-ui-md text-label-ui-md"
        >
          <Icon name="add" className="w-5 h-5" />
          <span>Add Task</span>
        </button>
      </div>
    </section>
  );
}
