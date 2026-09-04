"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";
import { useCreateTaskMutation } from "../useCreateTaskMutation";

export interface QuickAddTaskProps {
  /** The id of the board the column belongs to. Used to key the
   *  TanStack mutation's optimistic cache write. */
  boardId: string;
  /** The id of the column the new task will be appended to. */
  columnId: string;
  /** Whether the form is open. When `undefined` the component
   *  manages its own open state (uncontrolled). When provided, the
   *  parent controls the open/close (controlled). The parent uses
   *  the controlled form so the column header's "+" button can
   *  expand the form below. */
  open?: boolean;
  /** Called when the form's open state changes (controlled mode). */
  onOpenChange?: (open: boolean) => void;
  /** Called when the mutation fails. The parent typically surfaces
   *  this as a toast so the user knows the input is still editable. */
  onError?: (message: string) => void;
}

/**
 * Inline quick-add task affordance (Phase 5 Step 2, Plan §2.2).
 *
 * Each column gets one. The form is closed by default and expands
 * into a single-line input + Submit + Cancel on click. Submitting
 * calls `useCreateTaskMutation` (optimistic insert → on success,
 * the placeholder is replaced with the real task; on error, the
 * snapshot is restored). On success the input clears but stays
 * open so the user can add multiple tasks in a row; on error the
 * input is re-enabled with the text preserved.
 *
 * Keyboard:
 *   - Enter inside the input → submit.
 *   - Esc anywhere → cancel (collapse the form, drop the draft).
 *
 * Open state is controlled when the parent passes `open` +
 * `onOpenChange` (the column header "+" button uses this to open
 * the form). Uncontrolled otherwise.
 */
export function QuickAddTask({
  boardId,
  columnId,
  open,
  onOpenChange,
  onError,
}: QuickAddTaskProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const createTask = useCreateTaskMutation(boardId);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  function setOpen(next: boolean) {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  }

  // Autofocus the input when the form opens.
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  function openForm() {
    setOpen(true);
  }

  function cancel() {
    setOpen(false);
    setDraft("");
  }

  function submit() {
    const title = draft.trim();
    if (!title) return;
    createTask.mutate(
      { columnId, title },
      {
        onSuccess: () => {
          // Spec: input clears and stays open so the user can add
          // multiple tasks in a row. Re-focus so the next keystroke
          // lands in the input.
          setDraft("");
          inputRef.current?.focus();
        },
        onError: () => {
          // Re-enable the input; surface the failure to the parent
          // so a toast can be shown. The draft is preserved.
          onError?.("Couldn't create task — please retry.");
        },
      },
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={openForm}
        className="w-full flex items-center justify-center gap-1 py-space-xs mt-space-xs rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors font-label-ui-md text-label-ui-md"
      >
        <Icon name="add" className="w-5 h-5" />
        <span>Add Task</span>
      </button>
    );
  }

  const isSubmitting = createTask.isPending;

  return (
    <div
      className="mt-space-xs flex flex-col gap-1"
      data-testid={`quick-add-${columnId}`}
    >
      <div
        className={[
          "flex items-center gap-1",
          "rounded-lg border bg-surface-container-lowest",
          "px-2 py-1.5",
          "transition-colors duration-(--duration-fast) ease-standard",
          isSubmitting
            ? "border-outline/30 opacity-70"
            : "border-primary/60 focus-within:border-primary",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSubmitting}
          placeholder="Task title…"
          maxLength={200}
          aria-label="New task title"
          className="flex-1 min-w-0 bg-transparent text-sm text-on-surface placeholder:text-outline focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={submit}
          disabled={isSubmitting || draft.trim().length === 0}
          aria-label="Submit new task"
          className="size-7 flex items-center justify-center rounded text-on-primary bg-primary hover:bg-primary-fixed-dim disabled:opacity-40 disabled:hover:bg-primary transition-colors"
        >
          {isSubmitting ? (
            <span
              aria-hidden
              className="inline-block size-3 rounded-full border-2 border-on-primary border-t-transparent animate-spin"
            />
          ) : (
            <Icon name="check" className="w-4 h-4" />
          )}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isSubmitting}
          aria-label="Cancel"
          className="size-7 flex items-center justify-center rounded text-outline hover:text-on-surface hover:bg-surface-container-high disabled:opacity-40 transition-colors"
        >
          <Icon name="close" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
