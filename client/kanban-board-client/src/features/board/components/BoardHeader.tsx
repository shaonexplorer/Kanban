"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { useBoardQuery } from "../useBoardQuery";
import { useMyInvitationsQuery } from "@/features/invitations/useMyInvitationsQuery";
import { useOverlayState } from "../overlays/useOverlayState";
import { useAuth } from "@/features/auth/useAuth";
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
  /** Phase 5 — true while the board title is being edited
   *  inline. The parent (`BoardView`) flips this and supplies the
   *  draft value + change / commit / cancel handlers. While true,
   *  the title `<span>` is replaced with an `<input>` so the user
   *  can type the new name in place. */
  editingTitle?: boolean;
  /** The current draft value for the inline title input. Required
   *  when `editingTitle` is true; ignored otherwise. */
  draftTitle?: string;
  /** Called on every keystroke in the inline title input. */
  onDraftTitleChange?: (next: string) => void;
  /** Called on Enter / blur in the inline title input. The parent
   *  is responsible for the validation + mutation + toast. */
  onCommitRename?: () => void;
  /** Called on Esc in the inline title input. Resets the draft
   *  to the canonical title and flips `editingTitle` to false. */
  onCancelRename?: () => void;
  /** Called when the user picks "Rename" from the board-settings
   *  menu. The parent flips `editingTitle` to true (and seeds
   *  the draft to the current title). Keeping the open in the
   *  parent means the input and the mutation share the same
   *  `draftTitle` state. */
  onStartRename?: () => void;
  /** Phase 5 — called when the user confirms the two-step delete
   *  from the board-settings menu. The parent fires the
   *  `useDeleteBoardMutation` mutation + toast + redirect. */
  onDeleteBoard?: (boardId: string) => void;
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
  editingTitle = false,
  draftTitle = "",
  onDraftTitleChange,
  onCommitRename,
  onCancelRename,
  onStartRename,
  onDeleteBoard,
}: BoardHeaderProps) {
  const { data: board } = useBoardQuery(boardId);
  const title = board?.title ?? "…";
  // Phase 5 Step 9a — the bell button reads the cached invitation
  // list length for the count badge and the lifted `useOverlayState`
  // open flag for the click handler. The query refetches on
  // navigation and on every accept / decline invalidate, so the
  // badge stays accurate without any prop-drilling.
  const { data: invitations } = useMyInvitationsQuery();
  const { openInvitationsInbox } = useOverlayState();
  const invitationCount = invitations?.length ?? 0;
  // Cap the displayed count at "9+" so a 3-digit pill doesn't
  // break the header layout once the user is invited to many
  // boards at once.
  const badgeText = invitationCount > 9 ? "9+" : String(invitationCount);

  // Phase 5 — board settings menu (Rename + Delete). The menu
  // is owner-only: a non-owner sees only the bell + avatar. The
  // owner check is computed here (not lifted) because the header
  // is the natural place for the affordance and the cached
  // `BoardDetail` already carries `ownerId`. `useAuth().userId`
  // is `null` until the `/me` fetch resolves; we treat that as
  // "not the owner" to avoid a one-render flash of the menu.
  const { userId } = useAuth();
  const isOwner = Boolean(userId && board && userId === board.ownerId);

  // ---- Menu: open / close / confirm state ---------------------
  // `menuOpen` toggles the dropdown. `confirmingDelete` is the
  // two-step "Click to confirm" arming flag for the destructive
  // delete action — same anti-misclick pattern as
  // `ColumnShell.tsx:242-251` (also used by `TaskModal` trash
  // and `InvitationsInbox` decline). 3s auto-disarm via inline
  // `setTimeout` to avoid the project's `setState-in-effect`
  // lint rule.
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // Outside-click + capture-phase Esc to close. Mirrors
  // `ColumnShell.tsx:150-173`. The capture-phase handler fires
  // before the board-level keydown subscription, so closing the
  // menu via Esc doesn't double-fire with the `?` shortcuts
  // help shortcut or similar.
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMenuOpen(false);
        setConfirmingDelete(false);
      }
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
      setConfirmingDelete(false);
    }
    document.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [menuOpen]);

  // Auto-focus + select the inline title input when edit mode
  // opens. Skipped on first render (when `editingTitle` is
  // `false`).
  useEffect(() => {
    if (editingTitle && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingTitle]);

  // Enter / Esc / blur on the inline title input. Same contract
  // as the column-header rename in `ColumnShell.tsx:211-226`.
  function onRenameKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onCommitRename?.();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancelRename?.();
    }
  }

  // Two-step "Click to confirm" delete. First click arms; second
  // click within 3s fires the mutation via the parent callback.
  function handleDeleteClick() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      window.setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    setMenuOpen(false);
    setConfirmingDelete(false);
    onDeleteBoard?.(boardId);
  }

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
          {editingTitle ? (
            // Inline rename input. Same Enter / Esc / blur
            // contract as the column-header rename in
            // `ColumnShell.tsx:282-297`. The parent owns the
            // draft value + validation + mutation + toast.
            <input
              ref={renameInputRef}
              type="text"
              value={draftTitle}
              maxLength={100}
              onChange={(e) => onDraftTitleChange?.(e.target.value)}
              onKeyDown={onRenameKeyDown}
              onBlur={() => onCommitRename?.()}
              aria-label="Board title"
              data-testid={`board-title-rename-input-${boardId}`}
              className="font-headline-sm text-headline-sm text-on-surface bg-surface-container-low rounded px-2 py-1 min-w-0 w-72 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          ) : (
            <span
              className="font-headline-sm text-headline-sm text-on-surface truncate"
              data-testid={`board-title-${boardId}`}
            >
              {title}
            </span>
          )}
        </div>
        {/* <span className="hidden md:inline-block px-2 py-0.5 rounded bg-tertiary-container/20 text-tertiary font-label-mono-sm text-label-mono-sm uppercase tracking-wider shrink-0">
          Sprint Active
        </span> */}
        {/* Phase 5 — board-settings menu (owner-only). Hidden
         * for non-owners and while the title is being edited
         * inline (the input would collide with the dropdown
         * placement). The dropdown itself mirrors the column
         * menu's `bg-surface-container-highest rounded-lg
         * shadow-lg p-1 border border-outline/10` styling so the
         * affordance feels uniform across the app. */}
        {isOwner && !editingTitle ? (
          <div className="relative">
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Board settings"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              data-testid={`board-settings-${boardId}`}
              onClick={() => {
                setMenuOpen((o) => !o);
                setConfirmingDelete(false);
              }}
              className="size-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
            >
              <Icon name="more_horiz" className="w-5 h-5" />
            </button>
            {menuOpen ? (
              <div
                ref={menuRef}
                role="menu"
                aria-label="Board actions"
                className="absolute right-0 top-full mt-1 z-30 min-w-[10rem] bg-surface-container-highest rounded-lg shadow-lg p-1 border border-outline/10"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmingDelete(false);
                    // Ask the parent to flip `editingTitle` on
                    // and seed the draft. The input mounts
                    // here on the next render.
                    onStartRename?.();
                  }}
                  data-testid={`board-rename-${boardId}`}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-label-ui-md text-label-ui-md text-on-surface hover:bg-surface-container transition-colors"
                >
                  <Icon
                    name="edit"
                    className="w-4 h-4 text-on-surface-variant"
                  />
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDeleteClick}
                  data-testid={
                    confirmingDelete
                      ? `board-delete-confirm-${boardId}`
                      : `board-delete-${boardId}`
                  }
                  className={[
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded",
                    "text-left font-label-ui-md text-label-ui-md",
                    "transition-colors",
                    confirmingDelete
                      ? "bg-error-container text-on-error-container"
                      : "text-error hover:bg-error-container/40",
                  ].join(" ")}
                >
                  <Icon
                    name={confirmingDelete ? "warning" : "delete"}
                    className="w-4 h-4"
                  />
                  {confirmingDelete ? "Click to confirm" : "Delete"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
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

        {/* <button
          type="button"
          title="Share board (coming in Phase 5)"
          className="flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors shadow-sm"
        >
          <Icon name="share" className="w-4 h-4" />
          <span className="hidden md:inline">Share Board</span>
        </button> */}

        <button
          type="button"
          onClick={openInvitationsInbox}
          aria-label={
            invitationCount === 0
              ? "Notifications"
              : `${invitationCount} pending invitation${invitationCount === 1 ? "" : "s"}`
          }
          title={
            invitationCount === 0
              ? "No pending invitations"
              : `${invitationCount} pending invitation${invitationCount === 1 ? "" : "s"}`
          }
          data-testid="invitations-bell"
          className="relative size-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
        >
          <Icon name="notifications" className="w-5 h-5" />
          {invitationCount > 0 ? (
            <span
              aria-hidden
              data-testid="invitations-bell-badge"
              className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-primary text-on-primary font-label-mono-sm text-label-mono-sm leading-none shadow-sm"
            >
              {badgeText}
            </span>
          ) : null}
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
