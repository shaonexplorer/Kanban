"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/** Visual variant for the toast. `error` renders a red accent border
 *  + error icon; `info` is the neutral variant. `success` is reserved
 *  for future mutations that report success (not used by the board
 *  yet, but kept here so callers don't grow a new toast type later). */
export type ToastVariant = "info" | "error" | "success";

export interface ToastProps {
  /** The toast body. Required — the toast is purely a status surface,
   *  so it has nothing to render without text. */
  message: string;
  /** Visual variant. Defaults to `"info"`. */
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms. Defaults to 4000 — matches the Phase 4
   *  placeholder's 4-second timer. Set to `0` (or `null`) to disable
   *  the auto-dismiss and let the user close manually. */
  autoDismissMs?: number | null;
  /** Called when the toast dismisses itself (timer) or the user
   *  dismisses it (close button / click). */
  onDismiss: () => void;
  /** Phase 5 Step 5 — optional action button. Renders to the
   *  right of the message (before the close button). The
   *  TaskModal's trash "Undo" flow uses this to render an
   *  "Undo" button that re-creates the deleted task. */
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Phase 5 Step 3 — Real toast surface.
 *
 * Replaces the Phase 4 placeholder `<div role="status">` in
 * `BoardView.tsx`. The toast slides in from the bottom-right,
 * pauses the dismiss timer when the user hovers over it, and
 * dismisses on click or via the close button.
 *
 * Motion (per `specs/Phase05/Plan.md` §3.2):
 *  - Slide in: `translate-y-2 → 0` + `opacity-0 → 1` over
 *    `var(--duration-medium)` (200ms).
 *  - The Tailwind `animate-in slide-in-from-bottom-2 fade-in
 *    duration-(--duration-medium) ease-(--ease-emphasized)` chain
 *    covers both the position and the opacity.
 *
 * Behavior (per `specs/Phase05/Requirements.md` REQ-5.1.17):
 *  - Auto-dismisses after 4s (matches the Phase 4 placeholder).
 *  - Pauses the dismiss timer on hover; resumes on mouse leave.
 *  - Dismisses on click anywhere on the toast (or the close button).
 *  - Exposes `role="status"` with `aria-live="polite"` so screen
 *    readers announce the new status without stealing focus.
 *
 * The toast is rendered as an *uncontrolled* overlay — the parent
 * owns the open/close flag and renders the toast conditionally. The
 * toast itself only owns the dismiss timer; the parent decides
 * whether to set/clear its own `toast` state.
 *
 * Reference: `specs/Phase05/Plan.md` §3.2 + `Requirements.md`
 * REQ-5.1.17 / VAL-5.1.13 / VAL-5.1.14.
 */
export function Toast({
  message,
  variant = "info",
  autoDismissMs = 4000,
  onDismiss,
  action,
}: ToastProps) {
  // Hover-pause state for the dismiss timer (REQ-5.1.17).
  const [paused, setPaused] = useState(false);
  // Refs for the pause-resume bookkeeping.
  const remainingRef = useRef<number>(autoDismissMs ?? 0);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  // Mirror `onDismiss` into a ref so the auto-dismiss effect below
  // doesn't re-arm on every parent re-render (the parent typically
  // passes an inline arrow — `onDismiss={() => setToast(null)}` —
  // which would change identity on every render and reset the
  // 4-second timer mid-flight). The ref always points at the
  // latest callback so `onDismiss` is still called with the
  // correct closure.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // Start (or restart) the auto-dismiss timer.
  useEffect(() => {
    if (!autoDismissMs || autoDismissMs <= 0) return;
    startedAtRef.current = Date.now();
    remainingRef.current = autoDismissMs;

    timerRef.current = window.setTimeout(() => {
      onDismissRef.current();
    }, autoDismissMs);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // The `paused` flag is intentionally NOT in the dep array — the
    // hover handlers below own the pause / resume logic and tear
    // down / restart the timer in their own effects. `onDismiss` is
    // also intentionally excluded (the ref above keeps the effect
    // stable across parent re-renders that produce new function
    // identities for the callback).
  }, [autoDismissMs]);

  // Pause on hover: clear the pending timer and stash the remaining
  // time so resume can re-arm it.
  function handleMouseEnter() {
    if (!autoDismissMs || autoDismissMs <= 0) return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const elapsed = Date.now() - startedAtRef.current;
    remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    setPaused(true);
  }

  // Resume on leave: re-arm with the stashed remaining time.
  function handleMouseLeave() {
    if (!autoDismissMs || autoDismissMs <= 0) return;
    setPaused(false);
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(() => {
      onDismissRef.current();
    }, remainingRef.current);
  }

  // The close button is the explicit dismiss affordance. Click on
  // the body itself also dismisses (REQ-5.1.17).
  function handleClick() {
    onDismiss();
  }

  // Visual treatment per variant.
  const { accentClass, iconName, iconColorClass } = variantTokens(variant);

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      data-testid="toast"
      data-variant={variant}
      data-paused={paused ? "true" : "false"}
      className={[
        "fixed bottom-space-md right-space-md z-50",
        "max-w-sm min-w-[16rem]",
        "flex items-start gap-space-sm",
        "px-space-md py-space-sm",
        "rounded-lg",
        "border bg-surface-container shadow-md",
        "cursor-pointer",
        "animate-in slide-in-from-bottom-2 fade-in",
        "duration-(--duration-medium) ease-(--ease-emphasized)",
        accentClass,
      ].join(" ")}
    >
      {iconName ? (
        <Icon
          name={iconName}
          className={[
            "w-[18px] h-[18px] shrink-0 mt-0.5",
            iconColorClass,
          ].join(" ")}
          style={{ width: 18, height: 18 }}
          aria-hidden
        />
      ) : null}
      <span className="flex-1 font-body-sm text-body-sm text-on-surface">
        {message}
      </span>
      {action ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
            // Calling the action also dismisses the toast so the
            // user sees the result of their click (the success
            // toast that the action sets).
            onDismiss();
          }}
          className="shrink-0 px-2 py-1 rounded bg-primary text-on-primary font-label-ui-sm text-label-ui-sm hover:bg-primary-fixed-dim transition-colors"
        >
          {action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          // Don't let the close button's click bubble up to the
          // toast body (which would also call onDismiss — harmless
          // because onDismiss is idempotent, but cleaner to scope).
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="Dismiss notification"
        className="shrink-0 -mr-1 -mt-1 size-6 flex items-center justify-center rounded text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
      >
        <Icon
          name="close"
          className="w-[14px] h-[14px]"
          style={{ width: 14, height: 14 }}
        />
      </button>
    </div>
  );
}

/** Visual tokens for each variant. Kept as a small lookup so the
 *  render tree stays readable.
 *
 *  - `error` renders a red `border-error` accent + `warning` icon.
 *  - `success` renders a tertiary `border-tertiary` accent +
 *    `check_circle` icon. Reserved for future success-mutation
 *    toasts; not used by the board today.
 *  - `info` is the neutral variant (no leading icon, subtle
 *    `border-outline/40`) — the most common case, used by every
 *    existing call site. */
function variantTokens(variant: ToastVariant): {
  accentClass: string;
  iconName: "warning" | "check_circle" | null;
  iconColorClass: string;
} {
  switch (variant) {
    case "error":
      return {
        accentClass: "border-error",
        iconName: "warning",
        iconColorClass: "text-error",
      };
    case "success":
      return {
        accentClass: "border-tertiary",
        iconName: "check_circle",
        iconColorClass: "text-tertiary",
      };
    case "info":
    default:
      return {
        accentClass: "border-outline/40",
        iconName: null,
        iconColorClass: "",
      };
  }
}
