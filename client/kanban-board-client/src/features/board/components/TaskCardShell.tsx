"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import { Icon } from "./Icon";
import type { Task } from "../types";

export interface TaskCardShellProps {
  task: Task;
  /** When true, the card is dimmed to indicate a move is in flight. */
  inFlight: boolean;
}

/**
 * Derive a short identifier from the task UUID. The server doesn't
 * expose a `CORE-XX` slug, so we use the first 6 chars of the
 * column/task UUID combined — stable, collision-resistant, and
 * visually similar to a task identifier badge.
 */
function shortId(task: Task): string {
  const c = task.columnId?.replace(/-/g, "").slice(0, 3).toUpperCase();
  const t = task.id?.replace(/-/g, "").slice(0, 3).toUpperCase();
  return `${c}-${t}`;
}

/**
 * Stitch-styled draggable task card. Behavior is identical to the
 * Phase 4 `TaskCard` — same `useSortable` wiring, same `inFlight`
 * dim semantic — only the markup is new.
 *
 * The Stitch card has many affordances (priority badge, story
 * points, progress bar, tag chips, subtask count, comment count,
 * due date, assignee avatar). None of these have backing fields in
 * the `Task` model, so they are intentionally omitted — the card
 * only renders the title and optional description.
 */
export function TaskCardShell({ task, inFlight }: TaskCardShellProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", columnId: task.columnId },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dimmed = inFlight || isDragging;
  const dragging = isDragging;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={[
        "group relative flex flex-col gap-space-sm",
        "p-space-md rounded-lg",
        "bg-surface-container-low",
        dragging
          ? "bg-surface-bright shadow-2xl ring-2 ring-primary/40 rotate-1 scale-[1.02] cursor-grabbing"
          : "hover:bg-surface-container shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing",
        "transition-all duration-150",
        dimmed && !dragging ? "opacity-50" : "opacity-100",
      ].join(" ")}
      data-testid={`task-card-${task.id}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon
            name="drag_indicator"
            className={[
              "text-[16px]",
              dragging
                ? "text-primary"
                : "text-outline/60 group-hover:text-outline",
            ].join(" ")}
          />
          <span
            className={[
              "font-label-mono-sm text-label-mono-sm",
              dragging
                ? "text-primary font-semibold"
                : "text-outline group-hover:text-primary",
              "transition-colors",
            ].join(" ")}
          >
            {shortId(task)}
          </span>
        </div>
      </div>

      <h4 className="font-headline-sm text-headline-sm text-on-surface line-clamp-2 leading-snug">
        {task.title}
      </h4>

      {task.description ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 whitespace-pre-wrap">
          {task.description}
        </p>
      ) : null}
    </div>
  );
}
