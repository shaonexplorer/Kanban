"use client";

import { useEffect } from "react";
import { Icon } from "./Icon";

export interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

/**
 * One-screen list of keyboard shortcuts (REQ-5.1.43).
 *
 * The list is a static `<dl>` (no new state) so this component is
 * a pure presentational layer. The `?` button in
 * `BoardControlBar` opens it; pressing `?` from the board view
 * also opens it (per `BoardView`'s keydown handler).
 *
 * Layout:
 *   - Backdrop with the standard blur + close-on-click.
 *   - Centered card (max-w ~480px) with header (icon + title +
 *     close X) and body (a `<dl>` of shortcut rows).
 *
 * Behaviour:
 *   - Open animation: `animate-in fade-in zoom-in-95
 *     duration-(--duration-medium) ease-(--ease-emphasized)` —
 *     matches the other overlays.
 *   - Esc closes; backdrop click closes; both are
 *     `preventDefault`-on the `keydown` handler.
 *   - Body scroll lock while open.
 *
 * Reference: `specs/Phase05/Plan.md` §6 + `Requirements.md`
 * REQ-5.1.43.
 */
export function KeyboardShortcutsHelp({
  open,
  onClose,
}: KeyboardShortcutsHelpProps) {
  // Esc-to-close + body-scroll lock. Same pattern as the other
  // overlays. The `capture` flag on the keydown listener makes
  // sure the modal's Esc handler runs before the board-level
  // `keydown` subscription (otherwise the board would re-open
  // its own quick-add modal on the same press).
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface/70 backdrop-blur-sm p-space-md"
      onClick={onClose}
      data-testid="keyboard-shortcuts-help-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-help-title"
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
              name="sensors"
              className="w-5 h-5 text-primary shrink-0"
              aria-hidden
            />
            <h2
              id="keyboard-shortcuts-help-title"
              className="font-headline-lg text-headline-lg text-on-surface tracking-tight"
            >
              Keyboard shortcuts
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close shortcuts"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors shrink-0"
          >
            <Icon name="close" className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* ---- BODY --------------------------------------------- */}
        <div className="px-space-xl pb-space-lg flex flex-col gap-space-md">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Stay on the keyboard. These shortcuts work anywhere on
            the board view as long as no input is focused.
          </p>

          <dl className="grid grid-cols-1 gap-space-xs">
            <ShortcutRow
              keys={["c"]}
              label="Quick-add a task"
            />
            <ShortcutRow
              keys={["b"]}
              label="New board"
            />
            <ShortcutRow
              keys={["m"]}
              label="Manage access / share"
            />
            <ShortcutRow
              keys={["?"]}
              label="Show this help"
            />
            <ShortcutRow
              keys={["Esc"]}
              label="Dismiss any open modal or drawer"
            />
          </dl>
        </div>
      </div>
    </div>
  );
}

/** A single row in the shortcuts list — one or more kbd keys +
 *  a human label. Kept inline so the dl stays readable. */
function ShortcutRow({
  keys,
  label,
}: {
  keys: string[];
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-space-md py-space-xs px-space-sm rounded-lg hover:bg-surface-container transition-colors">
      <dt className="font-body-md text-body-md text-on-surface">{label}</dt>
      <dd className="flex items-center gap-space-xs shrink-0">
        {keys.map((k, i) => (
          <kbd
            key={`${k}-${i}`}
            className="inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded bg-surface-container-high border border-outline-variant/40 font-label-mono-sm text-label-mono-sm text-on-surface"
          >
            {k}
          </kbd>
        ))}
      </dd>
    </div>
  );
}
