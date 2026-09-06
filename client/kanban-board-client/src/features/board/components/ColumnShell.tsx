"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  /** Phase 5 column management — called when the user submits a
   *  new title from the column header's inline rename input
   *  (the `more_horiz` → "Rename" menu). The parent dispatches
   *  `useUpdateColumnMutation.mutate`. */
  onRenameColumn?: (args: { columnId: string; title: string }) => void;
  /** Phase 5 column management — called when the user confirms
   *  the two-step delete in the column header's menu (the
   *  `more_horiz` → "Delete" → "Click to confirm" flow). The
   *  parent dispatches `useDeleteColumnMutation.mutate`. The
   *  confirm step is owned by this component; the parent just
   *  fires the mutation. */
  onDeleteColumn?: (columnId: string) => void;
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
  onRenameColumn,
  onDeleteColumn,
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

  // ---- Phase 5 column-management state -----------------------
  // `menuOpen` toggles the small "Rename / Delete" menu that drops
  // out of the `more_horiz` button. `renaming` swaps the column
  // title for an inline input. `renameDraft` holds the in-flight
  // value while the input is mounted. `confirmingDelete` is the
  // two-step "Click to confirm" arming state for the destructive
  // delete action — same anti-misclick pattern as the trash
  // button in `TaskModal` and the decline button in
  // `InvitationsInbox`.
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(column.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // ---- Menu: outside-click + Esc-to-close --------------------
  // Capture-phase Esc handler so the menu's close fires before
  // the board-level keydown subscription. Mirrors
  // `InvitationsInbox.tsx:79-94`.
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMenuOpen(false);
        setConfirmingDelete(false);
      }
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
      setConfirmingDelete(false);
    }
    document.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [menuOpen]);

  // ---- Rename: open / close helpers --------------------------
  // Opening the rename input syncs the draft to the current
  // title and focuses the input on the next frame (autoFocus
  // is intentionally avoided so the parent re-mount on
  // `column.id` change is a no-op instead of stealing focus).
  function openRename() {
    setRenameDraft(column.title);
    setRenaming(true);
    setMenuOpen(false);
    setConfirmingDelete(false);
  }
  function cancelRename() {
    setRenaming(false);
    setRenameDraft(column.title);
  }
  function commitRename() {
    const next = renameDraft.trim();
    // Empty / unchanged: no-op, just close. This mirrors
    // `QuickAddTask`'s "empty = no submit" pattern and
    // `AddColumnGhost`'s trim+empty-skip so the existing
    // title is preserved on cancel.
    if (!next || next === column.title) {
      cancelRename();
      return;
    }
    if (next.length > 100) {
      // The server validates `max(100)` — surface a quiet
      // inline note via the column's existing toast channel
      // and let the user trim. We don't fire the mutation so
      // the snapshot isn't taken against an invalid value.
      onQuickAddError?.("Column title must be 100 characters or fewer.");
      return;
    }
    setRenaming(false);
    onRenameColumn?.({ columnId: column.id, title: next });
  }
  function onRenameKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    // Don't let Enter / Esc bubble to the board-level keydown
    // subscription. The `<input>` short-circuit on the board
    // level (BoardView.tsx:475) already stops the `c` /
    // `b` / `m` / `?` shortcuts from firing, but stopping
    // propagation here keeps the contract explicit.
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelRename();
    }
  }

  // Auto-focus the rename input on open. Skipped on the first
  // render (when `renaming` is still `false`).
  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  // ---- Delete: two-step inline confirm -----------------------
  // First click arms the confirm (3s auto-disarm via inline
  // setTimeout, mirroring `InvitationsInbox.tsx:122-131` to
  // avoid the project's `setState-in-effect` lint rule).
  // Second click within the window fires the mutation.
  function handleDeleteClick() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      window.setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    setMenuOpen(false);
    setConfirmingDelete(false);
    onDeleteColumn?.(column.id);
  }

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
          {renaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameDraft}
              maxLength={100}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={onRenameKeyDown}
              onBlur={() => commitRename()}
              // Stop the click from being interpreted as a
              // drag-start by the dnd-kit header listener.
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="Column title"
              className="font-headline-sm text-headline-sm text-on-surface bg-surface-container-low rounded px-1 py-0.5 min-w-0 flex-1 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          ) : (
            <h3
              className="font-headline-sm text-headline-sm text-on-surface truncate"
              // The `onDoubleClick` is a power-user shortcut
              // for "rename" — the menu's "Rename" item is
              // the primary affordance. Kept off the touch
              // path on purpose (no double-tap) so compact
              // users on a phone still go through the menu.
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (onRenameColumn) openRename();
              }}
            >
              {column.title}
            </h3>
          )}
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
          <div className="relative">
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Column settings"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
                setConfirmingDelete(false);
              }}
              className="size-6 flex items-center justify-center rounded text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <Icon name="more_horiz" className="w-5 h-5" />
            </button>
            {menuOpen ? (
              <div
                ref={menuRef}
                role="menu"
                aria-label="Column actions"
                // `onMouseDown` stop prevents a mousedown on
                // a menu item from being interpreted as a
                // drag-start by the dnd-kit header listener.
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 z-10 min-w-[10rem] bg-surface-container-highest rounded-lg shadow-lg p-1 border border-outline/10"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    openRename();
                  }}
                  // `onMouseDown` stop is redundant given the
                  // parent div's stop, but kept for symmetry
                  // with the existing `+` button pattern
                  // (line 178-182).
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-label-ui-md text-label-ui-md text-on-surface hover:bg-surface-container transition-colors"
                >
                  <Icon
                    name="edit"
                    className="w-4 h-4 text-on-surface-variant"
                  />
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={[
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded",
                    "text-left font-label-ui-md text-label-ui-md",
                    "transition-colors",
                    confirmingDelete
                      ? "bg-error-container text-on-error-container"
                      : "text-error hover:bg-error-container/40",
                  ].join(" ")}
                >
                  <Icon
                    name={confirmingDelete ? "warning" : "delete"}
                    className="w-4 h-4"
                  />
                  {confirmingDelete ? "Click to confirm" : "Delete"}
                </button>
              </div>
            ) : null}
          </div>
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
