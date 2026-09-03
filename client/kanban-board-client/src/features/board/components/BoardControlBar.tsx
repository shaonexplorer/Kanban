"use client";

import { useState } from "react";
import { Icon, type IconName } from "./Icon";
import { UserAvatar } from "./UserAvatar";

export interface BoardControlBarProps {
  /** Called when the user clicks "New Task" and confirms a title. */
  onCreateTask: (args: { title: string }) => void;
  /** Disable the New Task button (e.g. while no columns exist). */
  canCreateTask?: boolean;
}

type ViewMode = "board" | "list" | "timeline";

const viewModes: { key: ViewMode; label: string; icon: IconName }[] = [
  { key: "board", label: "Board", icon: "view_kanban" },
  { key: "list", label: "List", icon: "format_list_bulleted" },
  { key: "timeline", label: "Timeline", icon: "calendar_month" },
];

/**
 * The trimmed Stitch sub-header that sits between the top bar and
 * the kanban canvas. Only the affordances that map to a real
 * affordance are kept:
 *
 *   - The sprint status pulse + "Sprint Active" label (honest
 *     placeholder text — we don't track sprints server-side).
 *   - The current-user facepile (real data from `useAuth()`).
 *   - The Invite button (no-op; collaborator invites are Phase 5).
 *   - The New Task button (active; prompts for a title and calls
 *     `onCreateTask`).
 *   - The Board / List / Timeline view-mode toggle (Board is
 *     active; List / Timeline are no-ops in this pass).
 *
 * The velocity sparkline, sprint name + dates, filter chips,
 * group-by selector, and "X / Y issues" counter from the Stitch
 * mock are intentionally omitted — none have a backing endpoint.
 */
export function BoardControlBar({
  onCreateTask,
  canCreateTask = true,
}: BoardControlBarProps) {
  const [view, setView] = useState<ViewMode>("board");
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
            {/* <div className="flex items-center -space-x-2">
              <UserAvatar size="sm" presence="tertiary" />
            </div> */}

            <button
              type="button"
              title="Invite teammates (coming in Phase 5)"
              className="flex items-center gap-1.5 px-space-md py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-ui-md text-label-ui-md shadow-sm transition-all"
            >
              <Icon name="person_add" className="w-5 h-5 text-tertiary" />
              <span className="hidden md:inline">Invite</span>
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

        {/* Bottom tier: view-mode toggle only.
            Filter chips / group-by / "X / Y issues" intentionally omitted
            because no endpoint backs them. */}
        {/* <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs">
          <div className="flex items-center bg-surface-container-low p-0.5 rounded-lg">
            {viewModes.map((m) => {
              const active = view === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setView(m.key)}
                  aria-pressed={active}
                  className={[
                    "flex items-center gap-1 px-2.5 py-1 rounded-md",
                    "font-label-ui-md text-label-ui-md",
                    "transition-colors",
                    active
                      ? "bg-surface-container-high text-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface",
                  ].join(" ")}
                >
                  <Icon name={m.icon} className="w-5 h-5" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          <span className="font-label-mono-sm text-label-mono-sm text-outline px-2 py-1 rounded bg-surface-container">
            {view === "board"
              ? "Drag cards to reorder"
              : view === "list"
                ? "List view (coming soon)"
                : "Timeline (coming soon)"}
          </span>
        </div> */}
      </div>
    </section>
  );
}
