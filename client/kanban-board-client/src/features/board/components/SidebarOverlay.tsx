"use client";

import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Icon } from "./Icon";

export interface SidebarOverlayProps {
  /** Whether the drawer is currently open. */
  open: boolean;
  /** Called when the user dismisses the drawer (backdrop / Esc / X). */
  onClose: () => void;
  /** Tier used to size the drawer.
   *  - `compact` (< 640px): 100% width.
   *  - `tablet`  (640–1023px): fixed 320px. */
  tier: "compact" | "tablet";
}

/**
 * The compact / tablet slide-in drawer variant of the sidebar.
 *
 * Renders the same `<Sidebar />` chrome inside a slide-in shell
 * (Phase 5 Step 1, REQ-5.1.2 / REQ-5.1.6). The drawer dismisses
 * on backdrop click or `Escape`. Body scroll is locked while the
 * drawer is open.
 *
 * The slide-in uses the `motion.css` `--duration-slow` token
 * (320ms) + `--ease-standard` curve so the entry feels
 * intentional, not abrupt.
 */
export function SidebarOverlay({ open, onClose, tier }: SidebarOverlayProps) {
  // Esc to dismiss + body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widthClass = tier === "compact" ? "w-full" : "w-80";

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Sidebar navigation"
    >
      {/* Backdrop — clicking it dismisses the drawer. */}
      <button
        type="button"
        aria-label="Close sidebar"
        onClick={onClose}
        className="flex-1 bg-surface/70 backdrop-blur-sm animate-in fade-in duration-(--duration-slow) ease-standard"
      />

      {/* Drawer — the same Sidebar chrome, inside a slide-in shell. */}
      <div
        className={[
          widthClass,
          "h-full max-w-full",
          "bg-surface-container-lowest",
          "shadow-2xl",
          "flex flex-col",
          "animate-in slide-in-from-left duration-(--duration-slow) ease-standard",
        ].join(" ")}
      >
        <div className="flex items-center justify-end px-space-md py-space-sm shrink-0">
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto board-scroll">
          {/* Render the existing Sidebar with `collapsed` left
           * undefined — the overlay wrapper owns the layout, so the
           * sidebar chrome inside can stay in its expanded form. */}
          <Sidebar />
        </div>
      </div>
    </div>
  );
}
