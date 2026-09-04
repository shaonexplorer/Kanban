"use client";

import Link from "next/link";
import { useBoardQuery } from "../useBoardQuery";
import { Icon } from "./Icon";
import { UserAvatar } from "./UserAvatar";

export interface BoardHeaderProps {
  boardId: string;
  /** Called when the user clicks the compact/tablet hamburger
   *  button to open the slide-in sidebar drawer. */
  onToggleSidebar?: () => void;
  /** Called when the user clicks the desktop chevron to collapse
   *  or expand the visible sidebar. */
  onToggleSidebarCollapse?: () => void;
  /** True on compact / tablet; drives the hamburger's visibility. */
  showSidebarToggle?: boolean;
  /** True on desktop; drives the chevron's visibility. */
  showCollapseToggle?: boolean;
  /** True when the desktop sidebar is currently collapsed;
   *  flips the chevron icon. */
  sidebarCollapsed?: boolean;
}

/**
 * The Stitch-style top bar that sits fixed above the kanban canvas.
 *
 * Left: breadcrumb (workspace prefix is hard-coded — no workspace
 * model in the API). Right: filter input, current-user facepile,
 * notifications bell, "Share Board" placeholder, profile avatar.
 *
 * The "Share Board" button is intentionally a no-op for now (the
 * share modal is out of scope this pass — see plan §Out of scope).
 *
 * Phase 5 Step 1 adds a hamburger button (compact/tablet) and a
 * chevron (desktop) on the left edge of the header to control the
 * sidebar's visibility.
 */
export function BoardHeader({
  boardId,
  onToggleSidebar,
  onToggleSidebarCollapse,
  showSidebarToggle = false,
  showCollapseToggle = false,
  sidebarCollapsed = false,
}: BoardHeaderProps) {
  const { data: board } = useBoardQuery(boardId);
  const title = board?.title ?? "…";

  // The header's left offset tracks the sidebar's width:
  //   - On compact / tablet (no sidebar visible by default): full width.
  //   - On desktop expanded:  pl-sidebar-expanded.
  //   - On desktop collapsed: pl-sidebar-collapsed.
  const leftClass = sidebarCollapsed
    ? "left-0 md:left-sidebar-collapsed"
    : "left-0 md:left-sidebar-expanded";

  return (
    <header
      className={[
        "fixed top-0 right-0 h-16",
        "bg-surface/80 backdrop-blur-xl",
        "shadow-[0_1px_8px_rgba(0,0,0,0.25)]",
        "z-40 flex items-center justify-between",
        "px-space-md md:px-space-xl",
        "transition-[left] duration-(--duration-slow) ease-standard",
        leftClass,
      ].join(" ")}
    >
      <div className="flex items-center gap-space-sm md:gap-space-md min-w-0">
        {showSidebarToggle ? (
          <button
            type="button"
            aria-label="Open sidebar"
            aria-expanded={false}
            onClick={onToggleSidebar}
            className="size-9 shrink-0 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
          >
            <Icon name="menu" className="w-5 h-5" />
          </button>
        ) : null}
        {showCollapseToggle ? (
          <button
            type="button"
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            aria-expanded={!sidebarCollapsed}
            onClick={onToggleSidebarCollapse}
            className="size-9 shrink-0 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
          >
            <Icon
              name={sidebarCollapsed ? "chevron_right" : "chevron_left"}
              className="w-5 h-5"
            />
          </button>
        ) : null}
        <div className="flex items-center gap-space-xs font-body-sm text-body-sm text-outline min-w-0">
          {/* <span className="hidden sm:inline hover:text-on-surface transition-colors cursor-pointer truncate">
            Core Product Engine
          </span>
          <span className="hidden sm:inline">
            <Icon name="chevron_right" className="w-5 h-5 shrink-0" />
          </span> */}
          <span className="font-headline-sm text-headline-sm text-on-surface truncate">
            {title}
          </span>
        </div>
        <span className="hidden md:inline-block px-2 py-0.5 rounded bg-tertiary-container/20 text-tertiary font-label-mono-sm text-label-mono-sm uppercase tracking-wider shrink-0">
          Sprint Active
        </span>
      </div>

      <div className="flex items-center gap-space-md md:gap-space-lg">
        <div className="hidden md:flex relative items-center">
          <Icon
            name="filter_list"
            className="absolute left-space-sm text-outline w-5 h-5 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Filter sprint tasks…"
            className="bg-surface-container-low text-on-surface placeholder:text-outline pl-8 pr-9 py-1.5 rounded-lg font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-high transition-colors w-52"
          />
          <button
            type="button"
            aria-label="Filter options"
            title="Filter options (coming in Phase 5)"
            className="absolute right-space-sm text-outline hover:text-on-surface transition-colors"
          >
            <Icon name="tune" className="w-5 h-5" />
          </button>
        </div>

        {/* Facepile — only the current user is known to the client. */}
        {/* <div className="flex items-center -space-x-2">
          <UserAvatar size="sm" presence="tertiary" />
        </div> */}

        <button
          type="button"
          title="Share board (coming in Phase 5)"
          className="flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors shadow-sm"
        >
          <Icon name="share" className="w-4 h-4" />
          <span className="hidden md:inline">Share Board</span>
        </button>

        <button
          type="button"
          aria-label="Notifications"
          title="Notifications (coming in Phase 5)"
          className="relative size-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
        >
          <Icon name="notifications" className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
        </button>

        <div className="pl-space-xs">
          <Link
            href="/"
            aria-label="Sign out"
            title="Back to home"
            className="block"
          >
            <UserAvatar size="md" />
          </Link>
        </div>
      </div>
    </header>
  );
}
