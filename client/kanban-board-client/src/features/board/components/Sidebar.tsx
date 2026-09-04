"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import { SidebarHeader } from "./SidebarHeader";
import { UserAvatar } from "./UserAvatar";
import { useAuth } from "@/features/auth/useAuth";
import { useMyBoardsQuery } from "../useMyBoardsQuery";

export interface SidebarProps {
  /** When true, the sidebar collapses to icons-only (desktop tier
   *  only — `BoardView` keeps the full sidebar on compact/tablet
   *  by mounting `<SidebarOverlay>` instead). The collapse uses
   *  the `motion.css` `--duration-slow` + `--ease-standard`
   *  tokens for a smooth width transition. */
  collapsed?: boolean;
}

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
 * the server's `GET /api/auth/me` hasn't returned yet (the cookie
 * is present but the `/me` fetch is in flight), the email is
 * `null` and the card shows a generic "Workspace user" placeholder.
 */
export function Sidebar({ collapsed = false }: SidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { userEmail, signOut } = useAuth();
  const boards = useMyBoardsQuery();

  const widthClass = collapsed
    ? "w-sidebar-collapsed"
    : "w-sidebar-expanded";

  // Sign-out handler for the bottom user card's logout button
  // (Phase 5 Step 8). `signOut` clears the httpOnly `token`
  // cookie server-side via `POST /api/auth/logout`; the
  // subsequent `router.replace("/")` is what unmounts the gated
  // board view. The handler is async — `signOut` returns a
  // Promise that resolves once the server has cleared the
  // cookie (or once a network error has been swallowed).
  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={[
        "fixed left-0 top-0 h-full z-50",
        "flex flex-col justify-between",
        "bg-surface-container-lowest",
        "shadow-[0_1px_8px_rgba(0,0,0,0.4)]",
        "transition-[width] duration-(--duration-slow) ease-standard",
        widthClass,
      ].join(" ")}
    >
      <div className="flex flex-col flex-1 min-h-0">
        <SidebarHeader collapsed={collapsed} />

        {/* Quick search (read-only — ⌘K handler is Phase 5). */}
        <div className={collapsed ? "px-space-xs py-space-xs" : "px-space-md py-space-xs"}>
          <div className="relative flex items-center">
            <Icon
              name="search"
              className={[
                "absolute text-outline w-5 h-5 pointer-events-none",
                collapsed ? "left-1/2 -translate-x-1/2" : "left-space-sm",
              ].join(" ")}
            />
            <input
              type="text"
              readOnly
              placeholder="Quick search…"
              aria-label="Quick search"
              className={[
                "bg-surface-container-low text-on-surface placeholder:text-outline py-1.5 rounded-lg font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-high transition-colors",
                collapsed
                  ? "w-9 h-9 opacity-0 pointer-events-none"
                  : "w-full pl-8 pr-12",
              ].join(" ")}
              tabIndex={collapsed ? -1 : 0}
            />
            {!collapsed ? (
              <kbd className="absolute right-space-sm font-label-mono-sm text-label-mono-sm text-on-surface-variant bg-surface-container-high px-1 py-0.5 rounded">
                ⌘K
              </kbd>
            ) : null}
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
                  className={[
                    baseClass,
                    stateClass,
                    collapsed ? "justify-center px-0" : "",
                  ].join(" ")}
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon name={item.icon} className="w-5 h-5 shrink-0" />
                  {collapsed ? null : <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Active boards list — real data from GET /api/boards */}
          <div className="pt-space-xs">
            <div
              className={[
                "flex items-center mb-space-2xs",
                collapsed ? "justify-center" : "justify-between px-space-sm",
              ].join(" ")}
            >
              {collapsed ? null : (
                <span className="font-label-mono-sm text-label-mono-sm uppercase text-outline tracking-wider">
                  Active Boards
                </span>
              )}
              <button
                type="button"
                aria-label="Create board"
                title="Create board (coming in Phase 5)"
                className="size-5 flex items-center justify-center rounded text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                <Icon name="add" className="w-5 h-5" />
              </button>
            </div>

            {boards.isPending ? (
              <div className="px-space-sm py-space-xs font-label-mono-sm text-label-mono-sm text-outline">
                {collapsed ? "…" : "Loading…"}
              </div>
            ) : boards.isError ? (
              <div className="px-space-sm py-space-xs space-y-space-xs">
                <p className="font-label-mono-sm text-label-mono-sm text-error">
                  {collapsed ? "⚠" : "Failed to load boards."}
                </p>
                <button
                  type="button"
                  onClick={() => boards.refetch()}
                  className="font-label-ui-sm text-label-ui-sm text-primary hover:text-primary-fixed transition-colors"
                >
                  {collapsed ? null : "Retry"}
                </button>
              </div>
            ) : (boards.data?.length ?? 0) === 0 ? (
              <div className="px-space-sm py-space-xs font-label-mono-sm text-label-mono-sm text-outline">
                {collapsed ? null : "No boards yet."}
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
                      className={[
                        baseClass,
                        stateClass,
                        collapsed ? "justify-center px-0" : "",
                      ].join(" ")}
                      aria-current={isActive ? "page" : undefined}
                      title={collapsed ? b.title : undefined}
                    >
                      <div className="flex items-center gap-space-sm min-w-0">
                        <span
                          className={`size-2 rounded-full shrink-0 ${dotClass[dotTokenForBoard(b.id)]}`}
                        />
                        {collapsed ? null : (
                          <span className="truncate text-[13px]">
                            {b.title}
                          </span>
                        )}
                      </div>
                      {collapsed ? null : (
                        <span
                          className={`font-label-mono-sm text-label-mono-sm ${
                            isActive
                              ? "text-on-surface-variant"
                              : "text-outline group-hover:text-on-surface-variant"
                          }`}
                          title={b.role === "OWNER" ? "Owner" : "Member"}
                        >
                          {count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            )}

            <div
              className={[
                "mt-space-sm",
                collapsed ? "flex justify-center" : "px-space-sm",
              ].join(" ")}
            >
              <button
                type="button"
                title="Create board (coming in Phase 5)"
                className={[
                  "flex items-center gap-space-sm py-space-xs text-outline hover:text-primary transition-colors font-label-ui-md text-label-ui-md",
                  collapsed ? "justify-center size-8 px-0" : "w-full",
                ].join(" ")}
              >
                <Icon name="add" className="w-5 h-5" />
                {collapsed ? null : <span>Create Board</span>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom user card — real email from useAuth() when known. */}
      <div
        className={[
          "bg-surface-container-low",
          collapsed ? "p-space-xs" : "p-space-md",
        ].join(" ")}
      >
        <div
          className={[
            "flex items-center rounded-xl hover:bg-surface-container transition-colors",
            collapsed ? "justify-center p-0" : "justify-between p-space-xs",
          ].join(" ")}
        >
          <div
            className={[
              "flex items-center min-w-0",
              collapsed ? "" : "gap-space-sm",
            ].join(" ")}
          >
            <UserAvatar size="md" presence="tertiary" />
            {collapsed ? null : (
              <div className="flex flex-col min-w-0">
                <span className="font-label-ui-md text-label-ui-md text-on-surface truncate">
                  {userEmail ?? "Workspace user"}
                </span>
                <span className="font-label-mono-sm text-label-mono-sm text-outline truncate">
                  {userEmail ? "Member" : "Signed in"}
                </span>
              </div>
            )}
          </div>
          {collapsed ? null : (
            <button
              type="button"
              aria-label="Sign out"
              title="Sign out"
              data-testid="sidebar-signout"
              onClick={handleSignOut}
              className="size-7 flex items-center justify-center rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <Icon name="logout" className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
