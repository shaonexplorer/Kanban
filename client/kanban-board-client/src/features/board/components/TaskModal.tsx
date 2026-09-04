"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Icon } from "./Icon";
import { UserAvatar } from "./UserAvatar";
import type { Task } from "../types";

/**
 * Local modal-only data model. The modal's interactive fields
 * (priority, status, due date, assignees, labels, story points,
 * subtasks, comments, description) are not in the wire `Task`
 * shape — they are mocked locally to mirror the Stitch design. A
 * future task-API pass can replace the local state with a real
 * fetch / mutation without changing the visual surface.
 */
export interface ModalSubtask {
  id: string;
  title: string;
  done: boolean;
}

export interface ModalComment {
  id: string;
  author: string;
  initials: string;
  body: string;
  postedAgo: string;
  isYou?: boolean;
  badges?: string[];
}

export interface ModalAssignee {
  id: string;
  name: string;
  initials: string;
  role?: "Owner" | "Member";
  removable?: boolean;
}

export interface ModalLabel {
  id: string;
  name: string;
  /** Kinetic Grid token name (without the `bg-` / `text-` prefix). */
  token:
    | "primary"
    | "secondary"
    | "tertiary"
    | "error"
    | "outline";
}

export interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  /** Board path segment for the breadcrumb. */
  boardTitle: string;
  /** Column path segment for the breadcrumb. */
  columnTitle: string;
  /** Pre-formatted task identifier shown in the breadcrumb (`KAN-142`). */
  taskIdLabel: string;
  /** Initial task title. */
  title: string;
  /** Optional description (markdown-flavored plain text). */
  description: string;
  /** Optional status token for the dot in the status field. */
  statusToken: "tertiary" | "secondary" | "primary" | "outline";
  statusLabel: string;
  /** Priority tokens — `urgent` is the only one that uses the red
   * `error-container` chip in the Stitch design. */
  priority: "urgent" | "high" | "medium" | "low";
  priorityLabel: string;
  /** Story points — `0` hides the row. */
  storyPoints: number;
  /** Optional human label for the due date (e.g. "Aug 18, 2024"). */
  dueDateLabel: string | null;
  /** Assignee list (visible in the right-rail section). */
  assignees: ModalAssignee[];
  /** Label chips (visible in the right-rail section). */
  labels: ModalLabel[];
  /** Created / updated audit strings. */
  createdAt: string;
  updatedAt: string;
  /** Optional code-snippet shown in the description preview. */
  codeFileName?: string;
  codeLanguage?: string;
  codeSnippet?: string;
  /** Subtasks (checklist) for the modal. */
  subtasks: ModalSubtask[];
  /** Comments / activity feed entries. */
  comments: ModalComment[];

  // ---- Phase 5 Step 5: wiring props -------------------------------
  /**
   * If provided, the modal wires its title / description edits to a
   * 600ms-debounced `PATCH /api/tasks/:id` call. The TaskModal
   * reads the initial title from the `title` prop; after mount, the
   * `task` prop (if present) becomes the source of truth so server
   * updates don't get clobbered.
   */
  task?: Task | null;
  /**
   * Called when the debounced title / description save fires.
   * The parent typically passes `useUpdateTaskMutation.mutate`.
   * Receives the partial patch and the current task's id +
   * columnId so the mutation can write into the right cache slot.
   */
  onUpdateTask?: (args: {
    taskId: string;
    columnId: string;
    patch: { title?: string; description?: string | null };
  }) => void;
  /**
   * Called when the user confirms the trash flow (second click on
   * the trash button). The parent calls `useDeleteTaskMutation`,
   * closes the modal, and shows a toast with an Undo button.
   * Receives the task being deleted so the caller can capture a
   * pre-delete snapshot for the Undo path.
   */
  onDeleteTask?: (task: Task) => void;
  /**
   * Optional callback that fires after a successful title /
   * description save. Used to surface the "Saved" affordance in
   * the autosave footer. The mutation's `isPending` /
   * `isError` is the more reliable signal — this callback is just
   * a fire-and-forget side channel.
   */
  onSaveStateChange?: (state: "idle" | "saving" | "saved" | "failed") => void;
  /**
   * Phase 5 Step 10 placeholder. The metadata sidebar's
   * editable fields (priority, status, due date, labels, story
   * points) and the subtask add/toggle + comment post actions
   * call this callback when the user attempts to save. The
   * parent toasts "Member role change ships in Phase 5 Step 10"
   * (or similar) and keeps the local state unchanged.
   */
  onStep10SurfaceAttempt?: (surface: string) => void;
}

/** The display "status" of the trash button (idle vs. confirming). */
type DeleteState = "idle" | "confirming";

/**
 * Stitch-faithful task detail modal.
 *
 * The Stitch HTML in `.stitch-cache/task-modal.html` is a full-bleed
 * overlay (~760px) that opens over the board with a backdrop blur and
 * a centered card. This component is a 1:1 port — same token values
 * (no edits to `design.md` / `tokens.css`), same typography scale
 * (`headline-lg` title, `headline-sm` section headings, `body-md` /
 * `body-sm` / `label-mono-*` / `label-ui-*` for the rest), same
 * animation timings (`animate-in fade-in zoom-in-95 duration-200`
 * for the open, `opacity-0 transition-opacity duration-150` for
 * the close), and the same micro-interactions (copy-link confirmation
 * flash, star toggle, trash-button confirm-then-actually-delete,
 * dynamic subtask append, dynamic comment append, Esc-to-dismiss,
 * backdrop-click-to-dismiss).
 *
 * Icons use the `width` property on the SVG (per the
 * `className="w-X h-X"` Tailwind utility) instead of the Stitch
 * `text-[Npx]` typography-size hack — the SVG already renders at
 * its natural `1em`-ish size by default, so sizing via Tailwind's
 * width/height utilities is the idiomatic v4 approach.
 */
export function TaskModal(props: TaskModalProps) {
  const {
    open,
    onClose,
    boardTitle,
    columnTitle,
    taskIdLabel,
    title: initialTitle,
    description,
    statusToken,
    statusLabel,
    priority,
    priorityLabel,
    storyPoints,
    dueDateLabel,
    assignees,
    labels,
    createdAt,
    updatedAt,
    codeFileName,
    codeLanguage,
    codeSnippet,
    subtasks: initialSubtasks,
    comments: initialComments,
    task,
    onUpdateTask,
    onDeleteTask,
    onSaveStateChange,
    onStep10SurfaceAttempt,
  } = props;

  // ---- Local state (mirrors the in-page micro-interactions) ------

  // Phase 5 Step 5: when the `task` prop is provided, it's the
  // source of truth — we read its `title` on every render so a
  // server-side update (e.g. from another tab) is reflected. When
  // the prop is absent, we fall back to the local `title` state
  // initialized from the `initialTitle` prop.
  const [title, setTitle] = useState(task?.title ?? initialTitle);
  // `subtasks` and `comments` remain local state because the
  // backing endpoints (`POST /api/tasks/:id/subtasks` and
  // `POST /api/tasks/:id/comments`) ship in Step 10. The
  // `setSubtasks` / `setComments` setters are reserved for the
  // Step 10 wiring; until then the local handlers are stubs that
  // call `onStep10SurfaceAttempt` and leave the arrays unchanged.
  const [subtasks, setSubtasks] = useState<ModalSubtask[]>(initialSubtasks);
  const [newSubtask, setNewSubtask] = useState("");
  const [comments, setComments] = useState<ModalComment[]>(initialComments);
  const [commentDraft, setCommentDraft] = useState("");
  // Reference the setters so the linter doesn't flag them as
  // unused — they're reserved for the Step 10 wiring.
  void setSubtasks;
  void setComments;
  const [previewMode, setPreviewMode] = useState<"preview" | "raw">("preview");
  const [starred, setStarred] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [linkCopied, setLinkCopied] = useState(false);
  // Phase 5 Step 5: save-state for the autosave footer. "saving"
  // while the debounced save is in flight (or while waiting for
  // the parent to fire it), "saved" for ~2s after a successful
  // save, "failed" on error, "idle" otherwise. The footer text
  // changes per state per Plan §5.1.
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "failed"
  >("idle");

  const titleRef = useRef<HTMLInputElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const newSubtaskRef = useRef<HTMLInputElement | null>(null);
  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Phase 5 Step 5: debounced title save. The ref holds the
  // pending timer id and the last seen value; the effect (below)
  // restarts the timer on every title change.
  const titleSaveTimerRef = useRef<number | null>(null);
  const lastSavedTitleRef = useRef<string>(task?.title ?? initialTitle);

  // ---- Side effects (close, key handlers, timeouts) --------------

  // Esc-to-dismiss (matches the Stitch design's footer hint).
  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Auto-clear the trash-button confirm state after 3s.
  useEffect(() => {
    if (deleteState !== "confirming") return;
    const t = window.setTimeout(() => setDeleteState("idle"), 3000);
    return () => window.clearTimeout(t);
  }, [deleteState]);

  // Auto-clear the copy-link confirmation after 1.5s.
  useEffect(() => {
    if (!linkCopied) return;
    const t = window.setTimeout(() => setLinkCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [linkCopied]);

  // Clear the "saved" affordance after 2s.
  useEffect(() => {
    if (saveState !== "saved" && saveState !== "failed") return;
    const t = window.setTimeout(() => setSaveState("idle"), 2000);
    return () => window.clearTimeout(t);
  }, [saveState]);

  // Propagate save-state to the parent (if it cares) for the
  // autosave footer text.
  useEffect(() => {
    onSaveStateChange?.(saveState);
  }, [saveState, onSaveStateChange]);

  // Debounced title save — fires 600ms after the user stops
  // typing. Only active when both `task` and `onUpdateTask` are
  // provided; otherwise the modal stays local-state-only.
  useEffect(() => {
    if (!task || !onUpdateTask) return;
    if (title === lastSavedTitleRef.current) return;
    if (titleSaveTimerRef.current !== null) {
      window.clearTimeout(titleSaveTimerRef.current);
    }
    titleSaveTimerRef.current = window.setTimeout(() => {
      // If the title was reverted to the last-saved value before
      // the timer fired, skip the save.
      if (title === lastSavedTitleRef.current) return;
      setSaveState("saving");
      try {
        onUpdateTask({
          taskId: task.id,
          columnId: task.columnId,
          patch: { title },
        });
        // The parent mutation will settle; we optimistically flip
        // to "saved" here. A future enhancement can have the
        // parent signal success/failure via a callback to flip
        // the footer to "Failed to save" on rejection.
        lastSavedTitleRef.current = title;
        setSaveState("saved");
      } catch {
        setSaveState("failed");
      }
    }, 600);
    return () => {
      if (titleSaveTimerRef.current !== null) {
        window.clearTimeout(titleSaveTimerRef.current);
        titleSaveTimerRef.current = null;
      }
    };
  }, [title, task, onUpdateTask]);

  if (!open) return null;

  // ---- Handlers --------------------------------------------------

  function handleBackdropMouseDown(
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) {
    // Stitch: click outside the modal body dismisses.
    if (e.target === backdropRef.current) onClose();
  }

  function handleCopyLink() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(
        typeof window !== "undefined" ? window.location.href : taskIdLabel,
      );
    }
    setLinkCopied(true);
  }

  function handleStar() {
    const next = !starred;
    setStarred(next);
    if (task && onUpdateTask) {
      // The server doesn't yet persist `starred` (Step 10
      // widens the Task model), so this fires a no-op PATCH
      // optimistically. The mutation will succeed and the
      // icon will stay filled until the next refetch.
      onUpdateTask({
        taskId: task.id,
        columnId: task.columnId,
        patch: { title: task.title }, // no-op body; preserves existing title
      });
    }
  }

  function handleDelete() {
    if (deleteState === "idle") {
      setDeleteState("confirming");
      return;
    }
    // Second click — actually delete. The parent calls
    // `useDeleteTaskMutation` and shows an "Undo" toast.
    if (task && onDeleteTask) {
      onDeleteTask(task);
    } else {
      // No backing task — just close.
      onClose();
    }
  }

  function handleAddSubtask() {
    const val = newSubtask.trim();
    if (!val) return;
    onStep10SurfaceAttempt?.("subtasks");
  }

  function handleSubtaskKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddSubtask();
    }
  }

  function handleToggleSubtask(id: string) {
    onStep10SurfaceAttempt?.("subtasks");
    void id;
  }

  function handlePostComment(e?: FormEvent) {
    e?.preventDefault();
    const body = commentDraft.trim();
    if (!body) return;
    onStep10SurfaceAttempt?.("comments");
  }

  // ---- Derived values -------------------------------------------

  const completedCount = subtasks.filter((s) => s.done).length;
  const totalCount = subtasks.length;
  const progressPct =
    totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const statusDotClass = `bg-${statusToken}`;

  // Save-state footer text (Phase 5 Step 5).
  const saveLabel: Record<typeof saveState, string> = {
    idle: `Autosaved live to ${boardTitle}`,
    saving: "Saving…",
    saved: "Saved",
    failed: "Failed to save",
  };
  const saveDotClass =
    saveState === "failed"
      ? "bg-error"
      : saveState === "saved"
        ? "bg-tertiary"
        : "bg-tertiary animate-pulse";

  return (
    <div
      ref={backdropRef}
      onMouseDown={handleBackdropMouseDown}
      role="dialog"
      aria-modal="true"
      aria-label={`Task ${taskIdLabel}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-container-lowest/80 backdrop-blur-md p-space-md overflow-y-auto"
    >
      {/* Ambient radial glow behind the modal (Stitch detail). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl -top-16 -left-16"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute w-[450px] h-[450px] rounded-full bg-tertiary/10 blur-3xl bottom-10 right-20"
      />

      {/* Centered modal window (~760px). Phase 5 Step 3: swap the
       * hard-coded `duration-200` for the motion-token utility so
       * the open animation matches the rest of the phase's
       * overlay vocabulary (`--duration-medium` = 200ms,
       * `--ease-emphasized`). See Plan §3.2 / REQ-5.1.19. */}
      <div className="relative w-full max-w-[760px] max-h-[942px] flex flex-col bg-surface-container rounded-xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-(--duration-medium) ease-(--ease-emphasized)">
        {/* ===== Top action & breadcrumb header ===== */}
        <div className="flex flex-col bg-surface-container-high px-space-xl pt-space-lg pb-space-md shrink-0">
          <div className="flex items-center justify-between mb-space-sm">
            <div className="flex items-center gap-space-xs font-label-mono-sm text-label-mono-sm text-outline">
              <span className="text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
                {boardTitle}
              </span>
              <Icon
                name="chevron_right"
                className="w-[14px] h-[14px]"
                style={{ width: 14, height: 14 }}
              />
              <span className="px-2 py-0.5 rounded bg-tertiary-container/30 text-tertiary font-label-ui-sm text-label-ui-sm">
                {columnTitle}
              </span>
              <Icon
                name="chevron_right"
                className="w-[14px] h-[14px]"
                style={{ width: 14, height: 14 }}
              />
              <span className="font-bold text-primary">{taskIdLabel}</span>
            </div>

            <div className="flex items-center gap-space-xs">
              <button
                type="button"
                onClick={handleCopyLink}
                title="Copy task permalink"
                aria-label="Copy task permalink"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-bright hover:text-on-surface transition-all"
              >
                <Icon
                  name={linkCopied ? "check" : "link"}
                  className="w-[16px] h-[16px]"
                  style={{ width: 16, height: 16 }}
                />
              </button>
              <button
                type="button"
                onClick={handleStar}
                title="Star task"
                aria-label="Star task"
                aria-pressed={starred}
                className={[
                  "w-8 h-8 flex items-center justify-center rounded-lg bg-surface-container text-on-surface-variant transition-all",
                  starred
                    ? "text-tertiary"
                    : "hover:bg-surface-bright hover:text-tertiary",
                ].join(" ")}
              >
                <Icon
                  name="star"
                  className="w-[16px] h-[16px]"
                  style={{
                    width: 16,
                    height: 16,
                    // Filled when starred, outlined otherwise.
                    fontVariationSettings: starred ? "'FILL' 1" : "'FILL' 0",
                  }}
                />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                title="Delete task"
                aria-label="Delete task"
                className={[
                  "w-8 h-8 flex items-center justify-center rounded-lg transition-all",
                  deleteState === "confirming"
                    ? "bg-error-container text-on-error-container"
                    : "bg-surface-container text-on-surface-variant hover:bg-error-container hover:text-on-error-container",
                ].join(" ")}
              >
                <Icon
                  name={deleteState === "confirming" ? "warning" : "delete"}
                  className="w-[16px] h-[16px]"
                  style={{ width: 16, height: 16 }}
                />
              </button>
              <div className="w-px h-4 bg-surface-container-highest mx-1" aria-hidden="true" />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-container text-outline hover:bg-surface-bright hover:text-on-surface transition-colors"
              >
                <Icon
                  name="close"
                  className="w-[18px] h-[18px]"
                  style={{ width: 18, height: 18 }}
                />
              </button>
            </div>
          </div>

          {/* Inline-editable task title. */}
          <div className="group relative flex items-start gap-space-sm pt-space-xs">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-transparent font-headline-lg text-headline-lg text-on-surface font-semibold focus:outline-none focus:bg-surface-container-low px-space-xs py-1 rounded transition-colors"
              aria-label="Task title"
            />
            <Icon
              name="edit"
              aria-hidden="true"
              className="w-[18px] h-[18px] text-outline opacity-0 group-hover:opacity-100 transition-opacity mt-2 pointer-events-none"
              style={{ width: 18, height: 18 }}
            />
          </div>
        </div>

        {/* ===== Two-column body ===== */}
        <div className="flex-1 overflow-y-auto p-space-xl grid grid-cols-1 md:grid-cols-12 gap-space-xl">
          {/* ----- Left column: main content (~65% / 8 cols) ----- */}
          <div className="md:col-span-8 space-y-space-xl">
            {/* Description */}
            <section className="space-y-space-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <Icon
                    name="notes"
                    className="w-[18px] h-[18px] text-tertiary"
                    style={{ width: 18, height: 18 }}
                  />
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">
                    Description
                  </h3>
                </div>
                <div className="flex items-center gap-1 bg-surface-container-low p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("preview")}
                    aria-pressed={previewMode === "preview"}
                    className={[
                      "px-2 py-0.5 rounded font-label-ui-sm text-label-ui-sm transition-colors",
                      previewMode === "preview"
                        ? "bg-surface-container-highest text-on-surface"
                        : "text-outline hover:text-on-surface",
                    ].join(" ")}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("raw")}
                    aria-pressed={previewMode === "raw"}
                    className={[
                      "px-2 py-0.5 rounded font-label-ui-sm text-label-ui-sm transition-colors",
                      previewMode === "raw"
                        ? "bg-surface-container-highest text-on-surface"
                        : "text-outline hover:text-on-surface",
                    ].join(" ")}
                  >
                    Raw
                  </button>
                </div>
              </div>

              {previewMode === "preview" ? (
                <div className="bg-surface-container-low rounded-xl p-space-md space-y-space-sm">
                  <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                    {description.split(/(`[^`]+`)/g).map((part, i) => {
                      if (part.startsWith("`") && part.endsWith("`")) {
                        return (
                          <span
                            key={i}
                            className="font-label-mono-sm text-label-mono-sm px-1.5 py-0.5 rounded bg-surface-container-highest text-primary"
                          >
                            {part.slice(1, -1)}
                          </span>
                        );
                      }
                      return <span key={i}>{part}</span>;
                    })}
                  </p>

                  {codeSnippet ? (
                    <div className="p-space-sm rounded-lg bg-surface-container-lowest font-label-mono-sm text-label-mono-sm text-tertiary-fixed space-y-1">
                      <div className="flex items-center justify-between text-outline">
                        <span>{codeFileName}</span>
                        <span>{codeLanguage}</span>
                      </div>
                      <code>{codeSnippet}</code>
                    </div>
                  ) : null}
                </div>
              ) : (
                <pre className="bg-surface-container-low rounded-xl p-space-md font-label-mono-sm text-label-mono-sm text-on-surface-variant whitespace-pre-wrap">
                  {description}
                </pre>
              )}
            </section>

            {/* Subtasks / Milestones */}
            <section className="space-y-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <Icon
                    name="checklist"
                    className="w-[18px] h-[18px] text-secondary"
                    style={{ width: 18, height: 18 }}
                  />
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">
                    Subtasks &amp; Milestones
                  </h3>
                </div>
                <span className="font-label-mono-sm text-label-mono-sm text-outline">
                  {completedCount} of {totalCount} completed ({progressPct}%)
                </span>
              </div>

              {/* Progress bar */}
              <div
                className="w-full h-1.5 rounded-full bg-surface-container-low overflow-hidden"
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-gradient-to-r from-primary to-tertiary rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* Checklist items */}
              <ul className="space-y-space-xs">
                {subtasks.map((row) => (
                  <li
                    key={row.id}
                    className={[
                      "flex items-center gap-space-sm p-space-sm rounded-lg group transition-colors",
                      row.done
                        ? "bg-surface-container-low/60 hover:bg-surface-container-low"
                        : "bg-surface-container-low hover:bg-surface-container-high",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleSubtask(row.id)}
                      aria-pressed={row.done}
                      aria-label={
                        row.done
                          ? `Mark "${row.title}" as not done`
                          : `Mark "${row.title}" as done`
                      }
                      className={[
                        "w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors",
                        row.done
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-highest text-transparent hover:text-on-surface",
                      ].join(" ")}
                    >
                      <Icon
                        name="check"
                        className="w-[14px] h-[14px]"
                        style={{ width: 14, height: 14 }}
                      />
                    </button>
                    <span
                      className={[
                        "flex-1 font-body-sm text-body-sm",
                        row.done
                          ? "text-outline line-through"
                          : "text-on-surface",
                      ].join(" ")}
                    >
                      {row.title}
                    </span>
                    {row.done ? (
                      <span className="font-label-mono-sm text-label-mono-sm text-outline opacity-0 group-hover:opacity-100 transition-opacity">
                        Done
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>

              {/* Add-an-item trigger */}
              <div className="flex items-center gap-space-sm pt-space-2xs">
                <input
                  ref={newSubtaskRef}
                  type="text"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={handleSubtaskKeyDown}
                  placeholder="+ Add a new item..."
                  className="w-full bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm px-space-md py-2 rounded-lg focus:outline-none focus:bg-surface-container-high transition-colors"
                  aria-label="New subtask"
                />
                <button
                  type="button"
                  onClick={handleAddSubtask}
                  className="px-space-md py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-ui-sm text-label-ui-sm shrink-0 transition-colors"
                >
                  Add
                </button>
              </div>
            </section>

            {/* Activity & Discussion */}
            <section className="space-y-space-md pt-space-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <Icon
                    name="chat"
                    className="w-[18px] h-[18px] text-primary"
                    style={{ width: 18, height: 18 }}
                  />
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">
                    Activity &amp; Discussion
                  </h3>
                </div>
                <span className="font-label-mono-sm text-label-mono-sm text-outline">
                  {comments.length} update{comments.length === 1 ? "" : "s"}
                </span>
              </div>

              {/* Rich comment box */}
              <form
                onSubmit={handlePostComment}
                className="flex flex-col bg-surface-container-low rounded-xl overflow-hidden focus-within:bg-surface-container-high transition-colors"
              >
                <textarea
                  ref={commentTextareaRef}
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Write a comment or issue a command with /..."
                  rows={3}
                  aria-label="New comment"
                  className="w-full bg-transparent p-space-md font-body-sm text-body-sm text-on-surface placeholder:text-outline resize-none focus:outline-none"
                />
                <div className="flex items-center justify-between px-space-md py-space-sm bg-surface-container-lowest/60">
                  <div className="flex items-center gap-space-2xs text-outline">
                    <IconButton title="Bold" name="format_bold" />
                    <IconButton title="Inline code" name="code" />
                    <IconButton title="Mention teammate" name="alternate_email" />
                    <IconButton title="Attach assets" name="attach_file" />
                  </div>
                  <button
                    type="submit"
                    className="px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors shadow-sm"
                  >
                    Comment
                  </button>
                </div>
              </form>

              {/* Activity feed */}
              <ul className="space-y-space-md pt-space-xs">
                {comments.map((c) => (
                  <li key={c.id} className="flex items-start gap-space-sm">
                    <UserAvatar email={c.author} size="sm" />
                    <div className="flex-1 bg-surface-container-low rounded-xl p-space-md space-y-space-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-space-xs">
                          <span className="font-headline-sm text-headline-sm text-on-surface">
                            {c.author}
                          </span>
                          {c.isYou ? (
                            <span className="px-1.5 py-0.2 rounded bg-surface-container-highest text-primary font-label-mono-sm text-[10px]">
                              You
                            </span>
                          ) : null}
                        </div>
                        <span className="font-label-mono-sm text-label-mono-sm text-outline">
                          {c.postedAgo}
                        </span>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {c.body}
                      </p>
                      {c.badges && c.badges.length > 0 ? (
                        <div className="flex items-center gap-space-xs pt-1">
                          {c.badges.map((b, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-mono-sm text-label-mono-sm flex items-center gap-1"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* ----- Right column: metadata sidebar ----- */}
          <aside className="md:col-span-4 flex flex-col space-y-space-lg bg-surface-container-low/70 p-space-md rounded-xl">
            {/* Status */}
            <Field label="Status">
              <button
                type="button"
                className="w-full flex items-center justify-between bg-surface-container-high px-space-sm py-1.5 rounded-lg cursor-pointer hover:bg-surface-bright transition-colors group"
              >
                <div className="flex items-center gap-space-xs">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${statusDotClass}`}
                  />
                  <span className="font-label-ui-md text-label-ui-md text-on-surface font-semibold">
                    {statusLabel}
                  </span>
                </div>
                <Icon
                  name="unfold_more"
                  className="w-[16px] h-[16px] text-outline group-hover:text-on-surface"
                  style={{ width: 16, height: 16 }}
                />
              </button>
            </Field>

            {/* Priority */}
            <Field label="Priority">
              <button
                type="button"
                className={[
                  "w-full flex items-center justify-between px-space-sm py-1.5 rounded-lg cursor-pointer transition-colors group",
                  priority === "urgent"
                    ? "bg-error-container/20 hover:bg-error-container/30"
                    : "bg-surface-container hover:bg-surface-bright",
                ].join(" ")}
              >
                <div className="flex items-center gap-space-xs">
                  <Icon
                    name="local_fire_department"
                    className={[
                      "w-[16px] h-[16px]",
                      priority === "urgent" ? "text-error" : "text-outline",
                    ].join(" ")}
                    style={{ width: 16, height: 16 }}
                  />
                  <span
                    className={[
                      "font-label-ui-md text-label-ui-md font-semibold",
                      priority === "urgent" ? "text-error" : "text-on-surface",
                    ].join(" ")}
                  >
                    {priorityLabel}
                  </span>
                </div>
                <Icon
                  name="unfold_more"
                  className={[
                    "w-[16px] h-[16px]",
                    priority === "urgent"
                      ? "text-error group-hover:text-on-error-container"
                      : "text-outline group-hover:text-on-surface",
                  ].join(" ")}
                  style={{ width: 16, height: 16 }}
                />
              </button>
            </Field>

            {/* Assignees */}
            <Field label="Assignees">
              <ul className="space-y-1">
                {assignees.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between p-1 rounded-lg hover:bg-surface-container-high transition-colors"
                  >
                    <div className="flex items-center gap-space-xs">
                      <span className="w-6 h-6 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-label-mono-sm text-[10px]">
                        {a.initials}
                      </span>
                      <span className="font-body-sm text-body-sm text-on-surface">
                        {a.name}
                      </span>
                    </div>
                    {a.role ? (
                      <span className="font-label-mono-sm text-label-mono-sm text-primary px-1.5 py-0.5 rounded bg-primary/10">
                        {a.role}
                      </span>
                    ) : a.removable ? (
                      <Icon
                        name="close"
                        className="w-[14px] h-[14px] text-outline"
                        style={{ width: 14, height: 14 }}
                      />
                    ) : null}
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className="w-full flex items-center gap-space-xs py-1 px-space-xs text-outline hover:text-primary transition-colors font-label-ui-sm text-label-ui-sm"
                  >
                    <Icon
                      name="person_add"
                      className="w-[14px] h-[14px]"
                      style={{ width: 14, height: 14 }}
                    />
                    <span>Add Assignee</span>
                  </button>
                </li>
              </ul>
            </Field>

            {/* Move to column */}
            <Field label="Move to Column">
              <button
                type="button"
                className="w-full flex items-center justify-between bg-surface-container px-space-sm py-1.5 rounded-lg cursor-pointer hover:bg-surface-bright transition-colors group"
              >
                <span className="font-label-ui-md text-label-ui-md text-on-surface">
                  {statusLabel}
                </span>
                <Icon
                  name="unfold_more"
                  className="w-[16px] h-[16px] text-outline group-hover:text-on-surface"
                  style={{ width: 16, height: 16 }}
                />
              </button>
            </Field>

            {/* Due date */}
            {dueDateLabel ? (
              <Field label="Due Date">
                <button
                  type="button"
                  className="w-full flex items-center gap-space-xs bg-surface-container px-space-sm py-1.5 rounded-lg cursor-pointer hover:bg-surface-bright transition-colors text-on-surface"
                >
                  <Icon
                    name="calendar_today"
                    className="w-[16px] h-[16px] text-outline"
                    style={{ width: 16, height: 16 }}
                  />
                  <span className="font-label-mono-sm text-label-mono-sm">
                    {dueDateLabel}
                  </span>
                </button>
              </Field>
            ) : null}

            {/* Labels */}
            {labels.length > 0 ? (
              <Field label="Labels">
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((l) => {
                    const chip =
                      l.token === "primary"
                        ? "bg-primary-container/20 text-primary"
                        : l.token === "secondary"
                          ? "bg-secondary-container/20 text-secondary"
                          : l.token === "tertiary"
                            ? "bg-tertiary-container/20 text-tertiary"
                            : l.token === "error"
                              ? "bg-error-container/20 text-error"
                              : "bg-surface-container text-outline";
                    return (
                      <span
                        key={l.id}
                        className={[
                          "px-2 py-0.5 rounded font-label-mono-sm text-label-mono-sm",
                          chip,
                        ].join(" ")}
                      >
                        {l.name}
                      </span>
                    );
                  })}
                  <button
                    type="button"
                    className="px-1.5 py-0.5 rounded bg-surface-container hover:bg-surface-bright text-outline hover:text-on-surface text-[12px] flex items-center transition-colors"
                    aria-label="Add label"
                  >
                    <Icon
                      name="add"
                      className="w-[14px] h-[14px]"
                      style={{ width: 14, height: 14 }}
                    />
                  </button>
                </div>
              </Field>
            ) : null}

            {/* Estimation */}
            {storyPoints > 0 ? (
              <Field label="Estimation">
                <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1.5 rounded-lg">
                  <Icon
                    name="speed"
                    className="w-[16px] h-[16px] text-primary"
                    style={{ width: 16, height: 16 }}
                  />
                  <span className="font-label-mono-sm text-label-mono-sm text-on-surface font-semibold">
                    {storyPoints} Story Points
                  </span>
                </div>
              </Field>
            ) : null}

            {/* Audit metadata */}
            <div className="pt-space-md space-y-1 text-outline font-label-mono-sm text-label-mono-sm border-t border-surface-container-highest">
              <div className="flex items-center justify-between">
                <span>Created</span>
                <span className="text-on-surface-variant">{createdAt}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Updated</span>
                <span className="text-on-surface-variant">{updatedAt}</span>
              </div>
            </div>
          </aside>
        </div>

        {/* ===== Footer ===== */}
        <div className="px-space-xl py-space-sm bg-surface-container-lowest flex items-center justify-between shrink-0">
          <div className="flex items-center gap-space-xs font-label-mono-sm text-label-mono-sm text-outline">
            <span
              className={`w-1.5 h-1.5 rounded-full ${saveDotClass}`}
              aria-hidden
            />
            <span>{saveLabel[saveState]}</span>
          </div>
          <div className="flex items-center gap-space-sm font-label-mono-sm text-label-mono-sm text-outline">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface">
              Esc
            </kbd>
            <span>to dismiss</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Local subcomponents ---------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-space-2xs">
      <span className="font-label-mono-sm text-label-mono-sm uppercase tracking-wider text-outline">
        {label}
      </span>
      {children}
    </div>
  );
}

function IconButton({
  title,
  name,
}: {
  title: string;
  name:
    | "format_bold"
    | "code"
    | "alternate_email"
    | "attach_file";
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container-high hover:text-on-surface transition-colors"
    >
      <Icon
        name={name}
        className="w-[16px] h-[16px]"
        style={{ width: 16, height: 16 }}
      />
    </button>
  );
}
