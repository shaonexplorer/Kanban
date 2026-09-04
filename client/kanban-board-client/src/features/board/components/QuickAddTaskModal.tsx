"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface QuickAddTaskColumnOption {
  id: string;
  title: string;
}

export interface QuickAddTaskModalProps {
  open: boolean;
  onClose: () => void;
  /** Columns the user can add the task to. The first option is
   *  pre-selected so the user can immediately type a title and
   *  press Enter. */
  columns: QuickAddTaskColumnOption[];
  /** Called when the user submits a non-empty title. The parent
   *  wires this to `useCreateTaskMutation.mutate`. The modal
   *  auto-clears its own input on success and keeps focus so
   *  the user can add another task without re-typing — matches
   *  the inline `<QuickAddTask />` behaviour from Step 2. */
  onCreate: (args: { columnId: string; title: string }) => void;
  /** Disable the submit button + input. Used while the mutation
   *  is in flight (REQ-5.1.14). */
  inFlight?: boolean;
  /** Optional error message to surface above the input. Rendered
   *  with the `error` colour so the user knows the submit failed. */
  errorMessage?: string | null;
  /** Optional helper text shown under the title. Currently unused
   *  but exposed so the parent can pass a column-count message
   *  like "Adding to the leftmost column" without growing the
   *  prop surface again. */
  helperText?: string;
}

/**
 * Phase 5 Step 6 — Centered quick-add modal opened by the `c`
 * keyboard shortcut.
 *
 * Layout:
 *   - Backdrop with the same blur + ambient glows as the other
 *     modals (TaskModal, ShareBoardModal). Click on the backdrop
 *     closes the modal.
 *   - Centered card (max-w ~480px) with header (icon + title +
 *     close X), body (column selector + title input), and footer
 *     (Esc / Enter hint + Cancel + Add).
 *
 * Behaviour:
 *   - Open animation: `animate-in fade-in zoom-in-95
 *     duration-(--duration-medium) ease-(--ease-emphasized)` —
 *     matches the other overlays (Step 3).
 *   - Esc closes; backdrop click closes; both are
 *     `preventDefault`-on the `keydown` handler so they don't
 *     conflict with the board-level shortcut subscription.
 *   - Enter submits when the input has focus; the title is
 *     trimmed and the form clears on success but stays open so
 *     the user can add multiple tasks in a row.
 *   - Body scroll lock while open (same pattern as the other
 *     overlays).
 *
 * Reference: `specs/Phase05/Plan.md` §6 + `Requirements.md`
 * REQ-5.1.41 / REQ-5.1.42 / REQ-5.1.15.
 */
export function QuickAddTaskModal({
  open,
  onClose,
  columns,
  onCreate,
  inFlight = false,
  errorMessage = null,
  helperText,
}: QuickAddTaskModalProps) {
  // Initial column pre-selected to the first option so the user
  // can immediately type a title and press Enter without
  // choosing a column. We use a lazy initializer so the value
  // is computed once at mount; subsequent renders read from the
  // same state slot.
  const [selectedColumnId, setSelectedColumnId] = useState<string>(
    () => columns[0]?.id ?? "",
  );
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // When the modal opens, focus the input on the next frame so
  // the user can immediately type. We do NOT set state in this
  // effect — the project ESLint config rejects `setState in
  // effect` to avoid cascading renders. The state initializers
  // above already establish the correct starting values, and
  // the `useEffect` only touches the DOM (focus).
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  // Esc-to-close + body-scroll lock. Same pattern as the other
  // overlays (TaskModal, ShareBoardModal, CreateBoardDrawer).
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey, { capture: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey, { capture: true });
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    if (!selectedColumnId) return;
    if (inFlight) return;
    onCreate({ columnId: selectedColumnId, title: trimmed });
    // Clear the input but keep the modal open so the user can
    // add another task — matches the inline `<QuickAddTask />`
    // behaviour from Step 2 and REQ-5.1.12. The `setTitle` here
    // is in a click handler, not an effect, so the lint rule
    // does not apply.
    setTitle("");
    // Re-focus the input on the next frame so the user can
    // immediately type the next title.
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  // The modal renders nothing when closed OR when the board
  // has no columns (a defensive guard — the parent should
  // never open the modal in that case, but it costs nothing
  // to short-circuit).
  if (!open) return null;
  if (columns.length === 0) return null;

  return (
    <div
      // The backdrop fills the entire viewport. The `bg-surface/70`
      // gives the modal a visible scrim without going fully opaque,
      // matching the TaskModal / ShareBoardModal pattern.
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface/70 backdrop-blur-sm p-space-md"
      onClick={onClose}
      data-testid="quick-add-task-modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-task-modal-title"
        // The card itself stops click propagation so a click
        // inside the form doesn't bubble up to the backdrop's
        // close handler. Same pattern as the other modals.
        onClick={(e) => e.stopPropagation()}
        className={[
          "w-full max-w-[480px]",
          "bg-surface-container-low shadow-2xl rounded-2xl",
          "flex flex-col",
          "animate-in fade-in zoom-in-95",
          "duration-(--duration-medium) ease-(--ease-emphasized)",
        ].join(" ")}
      >
        {/* ---- HEADER ------------------------------------------- */}
        <div className="px-space-xl pt-space-lg pb-space-md flex items-start justify-between gap-space-md">
          <div className="flex items-center gap-space-xs min-w-0">
            <Icon
              name="add"
              className="w-5 h-5 text-primary shrink-0"
              aria-hidden
            />
            <h2
              id="quick-add-task-modal-title"
              className="font-headline-lg text-headline-lg text-on-surface tracking-tight"
            >
              Quick-add task
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close quick-add"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors shrink-0"
          >
            <Icon name="close" className="w-[18px] h-[18px]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="contents">
          {/* ---- BODY --------------------------------------------- */}
          <div className="px-space-xl pb-space-md flex flex-col gap-space-md">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {helperText ??
                "Add a new task without leaving the keyboard. Press Enter to add, Esc to dismiss."}
            </p>

            {/* Column selector */}
            <div className="flex flex-col gap-space-xs">
              <label
                htmlFor="qat-column"
                className="font-label-ui-md text-label-ui-md text-on-surface font-semibold"
              >
                Column
              </label>
              <select
                id="qat-column"
                value={selectedColumnId}
                onChange={(e) => setSelectedColumnId(e.target.value)}
                className="w-full bg-surface-container text-on-surface px-space-md py-2.5 rounded-lg font-body-md text-body-md focus:outline-none focus:bg-surface-container-highest transition-colors"
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Title input */}
            <div className="flex flex-col gap-space-xs">
              <label
                htmlFor="qat-title"
                className="font-label-ui-md text-label-ui-md text-on-surface font-semibold"
              >
                Task title
              </label>
              <input
                id="qat-title"
                ref={inputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Wire up the QuickAddTaskModal mutation"
                autoComplete="off"
                disabled={inFlight}
                className="w-full bg-surface-container text-on-surface placeholder:text-outline px-space-md py-2.5 rounded-lg font-body-md text-body-md focus:outline-none focus:bg-surface-container-highest transition-colors disabled:opacity-60"
              />
              {errorMessage ? (
                <p
                  role="alert"
                  className="font-body-sm text-body-sm text-error"
                >
                  {errorMessage}
                </p>
              ) : null}
            </div>
          </div>

          {/* ---- FOOTER ------------------------------------------ */}
          <div className="px-space-xl py-space-md border-t border-outline-variant/30 flex items-center justify-between gap-space-sm">
            <span className="font-label-mono-sm text-label-mono-sm text-outline">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high font-label-mono-sm text-label-mono-sm text-on-surface-variant">
                Enter
              </kbd>{" "}
              to add ·{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high font-label-mono-sm text-label-mono-sm text-on-surface-variant">
                Esc
              </kbd>{" "}
              to dismiss
            </span>
            <div className="flex items-center gap-space-xs">
              <button
                type="button"
                onClick={onClose}
                className="px-space-md py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-ui-md text-label-ui-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || !selectedColumnId || inFlight}
                className="px-space-md py-2 rounded-lg bg-primary text-on-primary font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-space-xs"
              >
                {inFlight ? (
                  <span
                    className="inline-block size-3.5 rounded-full border-2 border-on-primary/40 border-t-on-primary animate-spin"
                    aria-hidden
                  />
                ) : (
                  <Icon name="add" className="w-4 h-4" aria-hidden />
                )}
                <span>Add</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
