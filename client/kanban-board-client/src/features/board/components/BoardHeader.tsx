"use client";

import Link from "next/link";
import { useBoardQuery } from "../useBoardQuery";
import { Icon } from "./Icon";
import { UserAvatar } from "./UserAvatar";

export interface BoardHeaderProps {
  boardId: string;
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
 */
export function BoardHeader({ boardId }: BoardHeaderProps) {
  const { data: board } = useBoardQuery(boardId);
  const title = board?.title ?? "…";

  return (
    <header className="fixed top-0 left-sidebar-expanded right-0 h-16 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.25)] z-40 flex items-center justify-between px-space-xl">
      <div className="flex items-center gap-space-md min-w-0">
        <div className="flex items-center gap-space-xs font-body-sm text-body-sm text-outline min-w-0">
          <span className="hover:text-on-surface transition-colors cursor-pointer truncate">
            Core Product Engine
          </span>
          <Icon name="chevron_right" className="text-[16px] shrink-0" />
          <span className="font-headline-sm text-headline-sm text-on-surface truncate">
            {title}
          </span>
        </div>
        <span className="px-2 py-0.5 rounded bg-tertiary-container/20 text-tertiary font-label-mono-sm text-label-mono-sm uppercase tracking-wider shrink-0">
          Sprint Active
        </span>
      </div>

      <div className="flex items-center gap-space-lg">
        <div className="relative flex items-center">
          <Icon
            name="filter_list"
            className="absolute left-space-sm text-outline text-[16px] pointer-events-none"
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
            <Icon name="tune" className="text-[16px]" />
          </button>
        </div>

        {/* Facepile — only the current user is known to the client. */}
        <div className="flex items-center -space-x-2">
          <UserAvatar size="sm" presence="tertiary" />
        </div>

        <button
          type="button"
          aria-label="Notifications"
          title="Notifications (coming in Phase 5)"
          className="relative size-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
        >
          <Icon name="notifications" className="text-[20px]" />
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
        </button>

        <button
          type="button"
          title="Share board (coming in Phase 5)"
          className="flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors shadow-sm"
        >
          <Icon name="share" className="text-[16px]" />
          <span>Share Board</span>
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
