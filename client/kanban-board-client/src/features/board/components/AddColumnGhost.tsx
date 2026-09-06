"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface AddColumnGhostProps {
  /** Called when the user submits a non-empty column title. The
   *  parent wires this to `useCreateColumnMutation.mutate`. The
   *  ghost collapses back to its resting state on success and
   *  re-opens with the input intact on error so the user can
   *  retry without re-typing (matches the inline
   *  `<QuickAddTask />` per-column pattern from Step 2). */
  onCreate: (args: { title: string }) => void;
  /** Disable the input + submit button. Used while the mutation
   *  is in flight. */
  inFlight?: boolean;
  /** Optional error message to surface above the input. Rendered
   *  with the `error` colour so the user knows the submit failed. */
  errorMessage?: string | null;
}

/**
 * The Stitch "Add Column" tile that sits at the end of the
 * horizontal board. Two states:
 *
 *   - **Resting** — the same ghost surface as the Stitch HTML:
 *     `bg-surface-container-lowest/40` resting state, darkens on
 *     hover, and reveals a primary-tinted plus icon when the
 *     user hovers.
 *   - **Open** — the same tile flips into a small form: a
 *     single-line `<input>` for the title, plus a Submit
 *     spinner and a Cancel button. Enter submits, Esc cancels.
 *     On success, the input clears and the tile collapses back
 *     to resting. On error, the tile stays open with the input
 *     intact so the user can retry.
 *
 * Phase 5 Plan §5 — wired to `useCreateColumnMutation`
 * (`POST /api/boards/:boardId/columns`). The mutation owns the
 * optimistic cache append; this component is purely the form
 * surface.
 */
export function AddColumnGhost({
  onCreate,
  inFlight = false,
  errorMessage = null,
}: AddColumnGhostProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus the input when the form opens. The `setTimeout(…, 0)`
  // defers the focus to the next frame so the open animation has
  // a chance to start (matches the `<QuickAddTaskModal />` pattern).
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    if (inFlight) return;
    onCreate({ title: trimmed });
    // Clear the input and collapse back to resting on success.
    // The parent surfaces errors via the `errorMessage` prop and
    // keeps `open` true (this component is a controlled child of
    // the parent's mutation state).
    setTitle("");
    setOpen(false);
  }

  function handleCancel() {
    setTitle("");
    setOpen(false);
  }

  if (open) {
    return (
      <form
        onSubmit={handleSubmit}
        className={[
          "flex flex-col shrink-0",
          "w-column-width-min h-44",
          "rounded-xl",
          "bg-surface-container-lowest/80",
          "p-space-md",
          "justify-between",
          "shadow-sm",
          "animate-in fade-in zoom-in-95",
          "duration-(--duration-medium) ease-(--ease-emphasized)",
        ].join(" ")}
      >
        <div className="flex flex-col gap-space-xs min-w-0">
          <label
            htmlFor="add-column-title"
            className="font-label-ui-sm text-label-ui-sm text-on-surface-variant uppercase tracking-wider"
          >
            New column
          </label>
          <input
            id="add-column-title"
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                handleCancel();
              }
            }}
            placeholder="e.g. In review"
            autoComplete="off"
            disabled={inFlight}
            className="w-full bg-surface-container text-on-surface placeholder:text-outline px-space-sm py-1.5 rounded-md font-body-md text-body-md focus:outline-none focus:bg-surface-container-highest transition-colors disabled:opacity-60"
          />
          {errorMessage ? (
            <p role="alert" className="font-body-sm text-body-sm text-error">
              {errorMessage}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-space-xs">
          <button
            type="submit"
            disabled={!title.trim() || inFlight}
            className="flex items-center gap-1.5 px-space-sm py-1.5 rounded-md bg-primary text-on-primary font-label-ui-sm text-label-ui-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
          <button
            type="button"
            onClick={handleCancel}
            disabled={inFlight}
            className="px-space-sm py-1.5 rounded-md text-on-surface-variant hover:text-on-surface font-label-ui-sm text-label-ui-sm transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title="Add column"
      className={[
        "flex flex-col shrink-0",
        "w-column-width-min h-44",
        "rounded-xl",
        "bg-surface-container-lowest/40 hover:bg-surface-container-lowest/80",
        "p-space-lg",
        "items-center justify-center",
        "gap-space-sm",
        "cursor-pointer",
        "transition-all duration-200 group",
      ].join(" ")}
    >
      <div className="size-10 rounded-full bg-surface-container-high group-hover:bg-primary group-hover:text-on-primary flex items-center justify-center text-outline transition-all duration-200">
        <Icon name="add" className="w-7 h-7" />
      </div>
      <span className="font-headline-sm text-headline-sm text-outline group-hover:text-on-surface transition-colors">
        Add Column
      </span>
      <span className="font-label-mono-sm text-label-mono-sm text-outline/60 text-center">
        Configure custom workflow status
      </span>
    </button>
  );
}
