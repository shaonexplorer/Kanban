"use client";

import { Icon } from "./Icon";

/**
 * Brand mark + collapse button at the top of the Stitch sidebar.
 *
 * The Stitch brand reads "Kandor / v2.4 Core" — kept as-is so the
 * design chrome matches the mock. Phase 5 will rename to
 * "Mini Kanban Board" when the real identity lands.
 */
export function SidebarHeader() {
  return (
    <div className="px-space-md pt-space-md pb-space-sm flex items-center justify-between">
      <div className="flex items-center gap-space-sm min-w-0">
        <div className="size-8 rounded-lg bg-gradient-to-tr from-secondary-container via-primary-container to-tertiary flex items-center justify-center shrink-0">
          <Icon name="view_kanban" className="text-on-primary w-5 h-5" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight truncate">
            Kandor
          </span>
          <span className="font-label-mono-sm text-label-mono-sm text-primary tracking-tight uppercase">
            v2.4 Core
          </span>
        </div>
      </div>
      <button
        type="button"
        aria-label="Collapse sidebar"
        className="size-7 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
      >
        <Icon name="dock_to_left" className="w-5 h-5" />
      </button>
    </div>
  );
}
