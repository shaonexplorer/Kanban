"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import type { Task } from "./types";

export interface TaskCardProps {
  task: Task;
  /** When true, the card is dimmed to indicate a move is in flight. */
  inFlight: boolean;
}

/**
 * A single draggable task. Lives inside a column's
 * `<SortableContext>` and uses `useSortable` to participate in both
 * intra-column reorder and cross-column moves.
 */
export function TaskCard({ task, inFlight }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { type: "task", columnId: task.columnId },
    });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dimmed = inFlight || isDragging;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={[
        "rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900",
        "p-3 shadow-sm select-none cursor-grab active:cursor-grabbing",
        "transition-opacity",
        dimmed ? "opacity-50" : "opacity-100",
      ].join(" ")}
      data-testid={`task-card-${task.id}`}
    >
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {task.title}
      </p>
      {task.description ? (
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3 whitespace-pre-wrap">
          {task.description}
        </p>
      ) : null}
    </div>
  );
}
