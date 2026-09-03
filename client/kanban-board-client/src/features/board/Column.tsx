"use client";

import { useSortable } from "@dnd-kit/sortable";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import { TaskCard } from "./TaskCard";
import type { Column } from "./types";

export interface ColumnProps {
  column: Column;
  /** Ids of items currently mid-mutation — used to dim the column. */
  inFlightIds: Set<string>;
  /** When true, this column is the source/destination of an active drag. */
  isAnyDragging: boolean;
}

/**
 * A sortable column on the board. The column itself is a sortable
 * item (so users can drag it to reorder columns), and it contains a
 * nested `<SortableContext>` for its tasks.
 */
export function Column({ column, inFlightIds, isAnyDragging }: ColumnProps) {
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
        "w-72 shrink-0 flex flex-col rounded-lg",
        "bg-zinc-100/80 dark:bg-zinc-900/60",
        "border border-zinc-200 dark:border-zinc-800",
        "transition-opacity",
        isDragging ? "opacity-60" : "opacity-100",
      ].join(" ")}
    >
      <header
        {...attributes}
        {...listeners}
        className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 cursor-grab active:cursor-grabbing"
      >
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
          <span>{column.title}</span>
          <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
            {column.tasks.length}
          </span>
        </h2>
      </header>

      <div className="flex-1 p-2 min-h-[60px]">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {column.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                inFlight={columnDimmed || inFlightIds.has(task.id) || isAnyDragging}
              />
            ))}
            {column.tasks.length === 0 ? (
              <div className="rounded border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                Drop tasks here
              </div>
            ) : null}
          </div>
        </SortableContext>
      </div>
    </section>
  );
}
