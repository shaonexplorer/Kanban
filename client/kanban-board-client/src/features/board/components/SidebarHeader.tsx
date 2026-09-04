"use client";

import { Icon } from "./Icon";

export interface SidebarHeaderProps {
  /** When true, only the brand mark is rendered — labels are
   *  hidden and the collapse button is replaced by an expand
   *  chevron. The collapse/expand button click is owned by
   *  `BoardView` and surfaces through `onToggleSidebarCollapse`
   *  on `BoardHeader` instead. */
  collapsed?: boolean;
}

/**
 * Brand mark + collapse button at the top of the Stitch sidebar.
 *
 * The Stitch brand reads "Kandor / v2.4 Core" — kept as-is so the
 * design chrome matches the mock. Phase 5 will rename to
 * "Mini Kanban Board" when the real identity lands.
 */
export function SidebarHeader({ collapsed = false }: SidebarHeaderProps = {}) {
  return (
    <div
      className={[
        "pt-space-md pb-space-sm flex items-center",
        collapsed ? "justify-center px-0" : "justify-between px-space-md",
      ].join(" ")}
    >
      <div
        className={[
          "flex items-center min-w-0",
          collapsed ? "" : "gap-space-sm",
        ].join(" ")}
      >
        <div className="size-8 rounded-lg bg-gradient-to-tr from-secondary-container via-primary-container to-tertiary flex items-center justify-center shrink-0">
          <Icon name="view_kanban" className="text-on-primary w-5 h-5" />
        </div>
        {collapsed ? null : (
          <div className="flex flex-col min-w-0">
            <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight truncate">
              Kandor
            </span>
            <span className="font-label-mono-sm text-label-mono-sm text-primary tracking-tight uppercase">
              v2.4 Core
            </span>
          </div>
        )}
      </div>
      {collapsed ? null : (
        <button
          type="button"
          aria-label="Collapse sidebar"
          className="size-7 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
        >
          <Icon name="dock_to_left" className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
