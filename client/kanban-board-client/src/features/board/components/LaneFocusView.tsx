"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Column } from "../Column";
import type { BoardDetail } from "../types";

export interface LaneFocusViewProps {
  /** The id of the board the column belongs to. Passed through to
   *  the `Column` so the per-column quick-add mutation can key its
   *  optimistic cache write. */
  boardId: string;
  board: BoardDetail;
  /** Status dot color rotation (same as the desktop columns). */
  statusTokens: ReadonlyArray<"tertiary" | "secondary" | "primary" | "outline">;
  /** Ids of items currently mid-mutation — used to dim the column. */
  inFlightIds: Set<string>;
  /** When true, this column is the source/destination of an active drag. */
  isAnyDragging: boolean;
  /** Called when the quick-add mutation fails. The parent typically
   *  surfaces this as a toast so the user knows the input is still
   *  editable. */
  onQuickAddError?: (message: string) => void;
}

/**
 * The compact "lane focus" view (Phase 5 Step 1, REQ-5.1.2).
 *
 * On phones (< 640px) the kanban board becomes a single-column
 * view: a tab strip with one tab per column at the top, and the
 * active column rendered full-width below. Previous / next chevrons
 * move between columns when the tab strip is wider than the screen
 * (overflow-x-auto on the strip).
 *
 * Drag-and-drop is disabled at the parent (`BoardView` skips the
 * dnd-kit `DndContext` on compact), so the `inFlightIds` /
 * `isAnyDragging` props are passed straight through to the
 * `Column` for visual consistency.
 *
 * Phase 5 Step 2: the per-column inline `QuickAddTask` (owned by
 * `Column` / `ColumnShell`) is the only task-creation surface on
 * the compact tier — the previous `window.prompt()` fallback is
 * gone.
 */
export function LaneFocusView({
  boardId,
  board,
  statusTokens,
  inFlightIds,
  isAnyDragging,
  onQuickAddError,
}: LaneFocusViewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const columns = board.columns;
  const activeColumn = columns[activeIndex];

  // Scroll the active tab into view when the user navigates.
  useEffect(() => {
    const tab = tabButtonRefs.current[activeIndex];
    if (tab) {
      tab.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeIndex]);

  if (columns.length === 0) {
    return (
      <div className="px-space-xl py-space-3xl text-center">
        <p className="font-headline-sm text-headline-sm text-on-surface-variant">
          No columns yet
        </p>
        <p className="mt-space-xs font-body-md text-body-md text-outline">
          Create one via{" "}
          <code className="px-1 py-0.5 rounded bg-surface-container-high text-on-surface font-label-mono-md text-label-mono-md">
            POST /api/boards/:id/columns
          </code>
          .
        </p>
      </div>
    );
  }

  function goPrev() {
    setActiveIndex((i) => Math.max(0, i - 1));
  }
  function goNext() {
    setActiveIndex((i) => Math.min(columns.length - 1, i + 1));
  }

  const statusToken = statusTokens[activeIndex % statusTokens.length];

  return (
    <div className="flex flex-col h-full">
      {/* Tab strip with prev/next chevrons. */}
      <div className="flex items-center gap-space-xs px-space-md py-space-sm bg-surface-container-lowest/80 backdrop-blur-md border-b border-outline/10">
        <button
          type="button"
          aria-label="Previous column"
          onClick={goPrev}
          disabled={activeIndex === 0}
          className="size-8 shrink-0 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Icon name="chevron_left" className="w-5 h-5" />
        </button>

        <div
          ref={stripRef}
          role="tablist"
          aria-label="Board columns"
          className="flex-1 min-w-0 overflow-x-auto board-scroll"
        >
          <div className="flex items-center gap-space-2xs min-w-max">
            {columns.map((column, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={column.id}
                  ref={(node) => {
                    tabButtonRefs.current[idx] = node;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`lane-panel-${column.id}`}
                  onClick={() => setActiveIndex(idx)}
                  className={[
                    "shrink-0",
                    "flex items-center gap-space-xs",
                    "px-space-md py-1.5",
                    "rounded-full",
                    "font-label-ui-md text-label-ui-md",
                    "transition-colors",
                    isActive
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high",
                  ].join(" ")}
                >
                  <span className="truncate max-w-[8rem]">{column.title}</span>
                  <span
                    className={[
                      "font-label-mono-sm text-label-mono-sm",
                      "px-1.5 py-0.5 rounded-full shrink-0",
                      "transition-opacity duration-(--duration-medium) ease-standard",
                      isActive
                        ? "bg-primary-fixed-dim text-on-primary"
                        : "bg-surface-container-high text-on-surface-variant",
                      column.tasks.length === 0 ? "opacity-60" : "opacity-100",
                    ].join(" ")}
                  >
                    {column.tasks.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          aria-label="Next column"
          onClick={goNext}
          disabled={activeIndex === columns.length - 1}
          className="size-8 shrink-0 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Icon name="chevron_right" className="w-5 h-5" />
        </button>
      </div>

      {/* Active column, rendered full-width. */}
      <div
        id={`lane-panel-${activeColumn.id}`}
        role="tabpanel"
        aria-labelledby={`lane-tab-${activeColumn.id}`}
        className="flex-1 overflow-y-auto board-scroll px-space-md py-space-md"
      >
        <Column
          boardId={boardId}
          column={activeColumn}
          inFlightIds={inFlightIds}
          isAnyDragging={isAnyDragging}
          statusToken={statusToken}
          compactMode
          onQuickAddError={onQuickAddError}
        />
      </div>
    </div>
  );
}
