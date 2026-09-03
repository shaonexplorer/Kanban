"use client";

import { useState } from "react";
import { Icon } from "./Icon";

export interface BoardControlBarProps {
  /** Called when the user clicks "New Task" and confirms a title. */
  onCreateTask: (args: { title: string }) => void;
  /** Disable the New Task button (e.g. while no columns exist). */
  canCreateTask?: boolean;
  /** Open the "Share Board" modal. Wired by `BoardView` to the
   * `ShareBoardModal` component from the Stitch share screen. */
  onOpenShareModal?: () => void;
  /** Open the "Create Board" right-side drawer. Wired by `BoardView`
   * to the `CreateBoardDrawer` component from the Stitch share
   * screen (the New Board control is a global affordance — it
   * always opens the create flow, even from a board view). */
  onOpenCreateBoard?: () => void;
}

/**
 * The trimmed Stitch sub-header that sits between the top bar and
 * the kanban canvas. The visible affordances match the Stitch
 * share.html control bar one-for-one:
 *
 *   - Active Pipeline pulse + "Sprint Active" label (placeholder
 *     text — we don't track sprints server-side).
 *   - New Board — opens the `CreateBoardDrawer` (Phase 5).
 *   - Manage Access — opens the `ShareBoardModal` (Phase 5).
 *   - New Task — opens the inline title input and calls
 *     `onCreateTask`.
 *
 * The velocity sparkline, sprint name + dates, filter chips,
 * group-by selector, "X / Y issues" counter, and the Board / List /
 * Timeline view-mode toggle from the Stitch mock are intentionally
 * omitted — none have a backing endpoint in this pass.
 */
export function BoardControlBar({
  onCreateTask,
  canCreateTask = true,
  onOpenShareModal,
  onOpenCreateBoard,
}: BoardControlBarProps) {
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  function submitNewTask() {
    const title = newTaskTitle.trim();
    if (!title) return;
    onCreateTask({ title });
    setNewTaskTitle("");
    setNewTaskOpen(false);
  }

  return (
    <section className=" w-full bg-surface-container-lowest/80 backdrop-blur-md px-space-xl py-space-md shadow-sm">
      <div className="flex flex-col gap-space-md">
        {/* Top tier: status + actions */}
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-base min-w-0">
            <div className="flex items-center gap-space-xs">
              <span className="size-2.5 rounded-full bg-tertiary animate-pulse" />
              <span className="font-label-mono-md text-label-mono-md text-tertiary uppercase tracking-wider">
                Sprint Active
              </span>
            </div>
          </div>

          <div className="flex items-center gap-space-md">
            <button
              type="button"
              title="Create a new board"
              onClick={onOpenCreateBoard}
              className="flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-ui-md text-label-ui-md transition-colors shadow-sm"
            >
              <Icon name="add_box" className="w-4 h-4" />
              <span className="hidden md:inline">New Board</span>
            </button>

            <button
              type="button"
              title="Share board & manage collaborators"
              onClick={onOpenShareModal}
              className="flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors shadow-sm"
            >
              <Icon name="person_add" className="w-4 h-4" />
              <span className="hidden md:inline">Manage Access</span>
            </button>

            {newTaskOpen ? (
              <div className="flex items-center gap-space-xs bg-surface-container-high rounded-lg p-1 shadow-md">
                <input
                  autoFocus
                  type="text"
                  placeholder="Task title…"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitNewTask();
                    if (e.key === "Escape") {
                      setNewTaskTitle("");
                      setNewTaskOpen(false);
                    }
                  }}
                  className="bg-surface-container-low text-on-surface placeholder:text-outline px-space-sm py-1.5 rounded-md font-body-md text-body-md focus:outline-none focus:bg-surface-container w-64"
                />
                <button
                  type="button"
                  onClick={submitNewTask}
                  disabled={!newTaskTitle.trim()}
                  className="px-space-md py-1.5 rounded-md bg-primary text-on-primary font-label-ui-md text-label-ui-md disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewTaskTitle("");
                    setNewTaskOpen(false);
                  }}
                  aria-label="Cancel"
                  className="px-space-md py-1.5 rounded-md text-on-surface-variant hover:text-on-surface font-label-ui-md text-label-ui-md"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNewTaskOpen(true)}
                disabled={!canCreateTask}
                title={canCreateTask ? "Add a new task" : "Add a column first"}
                className="flex items-center gap-1.5 px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-label-ui-md text-label-ui-md shadow-md hover:bg-primary-fixed-dim transition-all disabled:opacity-50"
              >
                <Icon name="add" className="w-5 h-5" />
                <span>New Task</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
