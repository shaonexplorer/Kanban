"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import { SidebarHeader } from "./SidebarHeader";
import { UserAvatar } from "./UserAvatar";
import { useAuth } from "@/features/auth/useAuth";
import { useMyBoardsQuery } from "../useMyBoardsQuery";

/**
 * Stable hash → token-color bucket for the colored dots in front
 * of each board entry. The Stitch mocks give every board a single
 * semantic color (tertiary, secondary, primary, outline); we
 * rotate the same four so the active list doesn't look uniform.
 */
const boardDotTokens = ["tertiary", "secondary", "primary", "outline"] as const;

function dotTokenForBoard(id: string): (typeof boardDotTokens)[number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return boardDotTokens[Math.abs(hash) % boardDotTokens.length];
}

const dotClass: Record<(typeof boardDotTokens)[number], string> = {
  tertiary: "bg-tertiary",
  secondary: "bg-secondary",
  primary: "bg-primary",
  outline: "bg-outline",
};

interface PrimaryNavItem {
  label: string;
  icon: IconName;
  href: string;
}

const primaryNav: PrimaryNavItem[] = [
  { label: "Boards", icon: "dashboard", href: "/" },
  { label: "My Tasks", icon: "check_circle", href: "#" },
  { label: "Analytics", icon: "insights", href: "#" },
  { label: "Team Members", icon: "group", href: "#" },
  { label: "Settings", icon: "settings", href: "#" },
];

/**
 * The Stitch-style fixed left sidebar.
 *
 * The "Active Boards" list is fed by `useMyBoardsQuery()` (real
 * `GET /api/boards`). The primary nav (Boards / My Tasks / …) is
 * visual-only for now — only Boards links somewhere real (`/`).
 *
 * The bottom card shows the registered email from `useAuth()`. If
 * the user signed in via token paste (no `auth.user` in
 * localStorage), the email is `null` and the card shows a generic
 * "Workspace user" placeholder.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { userEmail } = useAuth();
  const boards = useMyBoardsQuery();

  return (
    <aside className="fixed left-0 top-0 h-full w-sidebar-expanded bg-surface-container-lowest z-50 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
      <div className="flex flex-col flex-1 min-h-0">
        <SidebarHeader />

        {/* Quick search (read-only — ⌘K handler is Phase 5). */}
        <div className="px-space-md py-space-xs">
          <div className="relative flex items-center">
            <Icon
              name="search"
              className="absolute left-space-sm text-outline text-[16px] pointer-events-none"
            />
            <input
              type="text"
              readOnly
              placeholder="Quick search…"
              className="w-full bg-surface-container-low text-on-surface placeholder:text-outline pl-8 pr-12 py-1.5 rounded-lg font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-high transition-colors"
            />
            <kbd className="absolute right-space-sm font-label-mono-sm text-label-mono-sm text-on-surface-variant bg-surface-container-high px-1 py-0.5 rounded">
              ⌘K
            </kbd>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto board-scroll px-space-md py-space-sm space-y-space-md">
          {/* Primary nav */}
          <nav className="space-y-space-2xs">
            {primaryNav.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              const baseClass =
                "flex items-center gap-space-sm px-space-sm py-space-xs rounded-lg transition-colors";
              const stateClass = isActive
                ? "bg-surface-container-high text-on-surface font-headline-sm"
                : "font-label-ui-md text-label-ui-md text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface";
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`${baseClass} ${stateClass}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon name={item.icon} className="text-[18px]" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Active boards list — real data from GET /api/boards */}
          <div className="pt-space-xs">
            <div className="flex items-center justify-between px-space-sm mb-space-2xs">
              <span className="font-label-mono-sm text-label-mono-sm uppercase text-outline tracking-wider">
                Active Boards
              </span>
              <button
                type="button"
                aria-label="Create board"
                title="Create board (coming in Phase 5)"
                className="size-5 flex items-center justify-center rounded text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                <Icon name="add" className="text-[16px]" />
              </button>
            </div>

            {boards.isPending ? (
              <div className="px-space-sm py-space-xs font-label-mono-sm text-label-mono-sm text-outline">
                Loading…
              </div>
            ) : boards.isError ? (
              <div className="px-space-sm py-space-xs space-y-space-xs">
                <p className="font-label-mono-sm text-label-mono-sm text-error">
                  Failed to load boards.
                </p>
                <button
                  type="button"
                  onClick={() => boards.refetch()}
                  className="font-label-ui-sm text-label-ui-sm text-primary hover:text-primary-fixed transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : (boards.data?.length ?? 0) === 0 ? (
              <div className="px-space-sm py-space-xs font-label-mono-sm text-label-mono-sm text-outline">
                No boards yet.
              </div>
            ) : (
              <nav className="space-y-space-2xs">
                {boards.data!.map((b) => {
                  const href = `/boards/${b.id}`;
                  const isActive = pathname === href;
                  const baseClass =
                    "flex items-center justify-between px-space-sm py-space-xs rounded-lg transition-colors group";
                  const stateClass = isActive
                    ? "bg-surface-container-high text-on-surface font-headline-sm"
                    : "font-body-sm text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface";
                  const count = b.role === "OWNER" ? "★" : "•";
                  return (
                    <Link
                      key={b.id}
                      href={href}
                      className={`${baseClass} ${stateClass}`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <div className="flex items-center gap-space-sm min-w-0">
                        <span
                          className={`size-2 rounded-full shrink-0 ${dotClass[dotTokenForBoard(b.id)]}`}
                        />
                        <span className="truncate">{b.title}</span>
                      </div>
                      <span
                        className={`font-label-mono-sm text-label-mono-sm ${
                          isActive ? "text-on-surface-variant" : "text-outline group-hover:text-on-surface-variant"
                        }`}
                        title={b.role === "OWNER" ? "Owner" : "Member"}
                      >
                        {count}
                      </span>
                    </Link>
                  );
                })}
              </nav>
            )}

            <div className="mt-space-sm px-space-sm">
              <button
                type="button"
                title="Create board (coming in Phase 5)"
                className="w-full flex items-center gap-space-sm py-space-xs text-outline hover:text-primary transition-colors font-label-ui-md text-label-ui-md"
              >
                <Icon name="add" className="text-[16px]" />
                <span>Create Board</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom user card — real email from useAuth() when known. */}
      <div className="p-space-md bg-surface-container-low">
        <div className="flex items-center justify-between p-space-xs rounded-xl hover:bg-surface-container transition-colors">
          <div className="flex items-center gap-space-sm min-w-0">
            <UserAvatar size="md" presence="tertiary" />
            <div className="flex flex-col min-w-0">
              <span className="font-label-ui-md text-label-ui-md text-on-surface truncate">
                {userEmail ?? "Workspace user"}
              </span>
              <span className="font-label-mono-sm text-label-mono-sm text-outline truncate">
                {userEmail ? "Member" : "Signed in"}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="User preferences"
            title="Preferences (coming in Phase 5)"
            className="size-7 flex items-center justify-center rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <Icon name="more_horiz" className="text-[18px]" />
          </button>
        </div>
      </div>
    </aside>
  );
}
