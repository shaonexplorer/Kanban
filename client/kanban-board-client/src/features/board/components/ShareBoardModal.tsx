"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { UserAvatar } from "./UserAvatar";
import type { BoardMember } from "../types";

/**
 * Shareable-link role selectors in the invite row, ordered
 * most-permissive first. The default is `Editor` to match the
 * Stitch HTML's `<option selected>Editor</option>`.
 */
type InviteRole = "Admin" | "Editor" | "Viewer";

/** Member row role. Owners render as a non-editable shield badge. */
type MemberRole = "Owner" | "Admin" | "Editor" | "Viewer";

export interface ShareBoardModalProps {
  open: boolean;
  onClose: () => void;
  boardTitle: string;
  /** Members that pre-populate the collaborators list. */
  members: BoardMember[];
  /**
   * User id of the currently signed-in viewer. Used to render the
   * "(You)" affordance next to the row that represents the caller.
   */
  currentUserId: string | null;
  /**
   * Total seat cap (e.g. 10 for the Team plan). The footer renders
   * `{members.length} of {seatCap} member seats utilized`.
   */
  seatCap?: number;
  /**
   * Persisted role for the *invite* row's role selector. Defaults
   * to `Editor` to mirror the Stitch HTML.
   */
  defaultInviteRole?: InviteRole;
  /**
   * Optional click handler for the Send Invite button. The parent
   * can wire this to `POST /api/boards/:id/members` once Phase 5
   * ships that mutation.
   */
  onSendInvite?: (args: { email: string; role: InviteRole }) => void;
  /**
   * Optional click handler for a per-row "remove collaborator" press.
   * Owners (row with `role === "OWNER"`) never expose this button.
   */
  onRemoveMember?: (args: { userId: string }) => void;
  /**
   * Optional per-row role change. Owners are not editable so this
   * fires only for `MEMBER` rows.
   */
  onChangeMemberRole?: (args: { userId: string; role: MemberRole }) => void;
  /**
   * Optional "save changes" handler — called from the footer's Save
   * button. The Phase 4 server has no batched update endpoint, so
   * the modal currently short-circuits per-row mutations and this
   * callback fires for any deferred writes.
   */
  onSave?: () => void;
  /**
   * Phase 5 Step 5 — fired when the user toggles the
   * "Anyone with the link can view" switch. The parent (BoardView)
   * wires this to `PATCH /api/boards/:id` with `{ linkSharing }`.
   * The body is server-side widened to accept the new field; the
   * `linkSharing` column itself ships in Step 10's migration.
   */
  onLinkSharingChange?: (enabled: boolean) => void;
  /**
   * Initial state of the link-sharing toggle. The toggle is purely
   * UI state until the server exposes a `publicAccess` flag.
   */
  initialLinkSharing?: boolean;
  /**
   * Override the share URL preview (the long `https://kandor.app/...`
   * string). Defaults to a placeholder until a real public-link
   * token endpoint exists.
   */
  shareUrl?: string;
}

/**
 * Stitch-faithful "Share Board" modal — a port of the `#shareModal`
 * block in `.stitch-cache/share.html` onto the Kinetic Grid tokens.
 *
 * Layout (matches the Stitch HTML one-for-one):
 *   1. Header — `share` icon, `Share "<board title>"`, close X.
 *   2. Scrollable body — invite row, link-sharing card,
 *      collaborators list (owner first, then members newest-first
 *      by `joinedAt`).
 *   3. Footer — Team-plan seat count, Cancel, Save Changes.
 *
 * Tokens are consumed verbatim from `design/tokens.css` — no token
 * values are overridden. The `w-7 h-7` icon-button squares, the
 * `rounded-xl` modal shell, the `bg-surface-container-high/40`
 * header wash, the `px-space-xl` content gutters, the
 * `font-headline-lg` title, the `font-label-mono-sm` URL preview,
 * and the `text-label-mono-md` `text-on-tertiary-container`
 * initials all match the Stitch design without modification.
 *
 * Behavior mirrors the existing `TaskModal` patterns:
 *   - `Escape` and backdrop click close the modal.
 *   - The component is "presentation-only" — interactive state lives
 *     locally in `useState` and is exposed via the optional
 *     callbacks so the parent can wire it to future mutations
 *     (`POST /api/boards/:id/members`).
 */
export function ShareBoardModal({
  open,
  onClose,
  boardTitle,
  members,
  currentUserId,
  seatCap = 10,
  defaultInviteRole = "Editor",
  onSendInvite,
  onRemoveMember,
  onChangeMemberRole,
  onSave,
  onLinkSharingChange,
  initialLinkSharing = true,
  shareUrl = "https://kandor.app/boards/b_9f82a17c?token=sh_29a",
}: ShareBoardModalProps) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>(defaultInviteRole);
  const [linkSharing, setLinkSharing] = useState(initialLinkSharing);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const copyResetTimer = useRef<number | null>(null);

  // ----- Esc-to-close + body-scroll lock -------------------------------
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current);
        copyResetTimer.current = null;
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  // ----- Order members: owner first, then members newest-first by
  //      joinedAt. The board shape from the API has the owner in
  //      `members` already (the API tags role OWNER for them), so a
  //      single sort handles both axes.
  const orderedMembers = [...members].sort((a, b) => {
    if (a.role !== b.role) return a.role === "OWNER" ? -1 : 1;
    return a.joinedAt < b.joinedAt ? 1 : -1;
  });

  const isValidEmail = inviteEmail.trim().length > 0;

  function handleSendInvite() {
    if (!isValidEmail) return;
    onSendInvite?.({ email: inviteEmail.trim(), role: inviteRole });
    setInviteEmail("");
    setInviteRole(defaultInviteRole);
  }

  function handleCopyLink() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      // Fall back to the visual feedback only — the URL is the
      // shareUrl prop so the user can still select-and-copy it.
      setCopyState("copied");
    } else {
      void navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
    }
    if (copyResetTimer.current !== null) {
      window.clearTimeout(copyResetTimer.current);
    }
    copyResetTimer.current = window.setTimeout(() => {
      setCopyState("idle");
      copyResetTimer.current = null;
    }, 2000);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-space-base bg-surface-container-lowest/60 backdrop-blur-md animate-in fade-in duration-(--duration-medium) ease-(--ease-emphasized)"
      onClick={(e) => {
        // Backdrop click closes, but clicks inside the modal panel
        // must not bubble up to the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[620px] bg-surface-container rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-(--duration-medium) ease-(--ease-emphasized)">
        {/* ---- MODAL HEADER ---------------------------------------- */}
        <div className="px-space-xl pt-space-xl pb-space-md bg-surface-container-high/40 flex items-start justify-between gap-space-md">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-space-xs min-w-0">
              <Icon name="share" className="w-5 h-5 text-primary shrink-0" />
              <h2
                id="share-modal-title"
                className="font-headline-lg text-headline-lg text-on-surface tracking-tight truncate"
              >
                Share &ldquo;{boardTitle}&rdquo;
              </h2>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Invite teammates, manage access levels, and configure public
              link sharing.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors shrink-0"
          >
            <Icon name="close" className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* ---- MODAL SCROLLABLE BODY ------------------------------- */}
        <div className="px-space-xl py-space-md overflow-y-auto space-y-space-lg flex-1">
          {/* ---- INVITE INPUT ROW ---------------------------------- */}
          <div className="flex flex-col gap-space-xs">
            <label className="font-label-ui-md text-label-ui-md text-on-surface uppercase tracking-wider">
              Add Collaborator
            </label>
            <div className="flex items-center gap-space-xs bg-surface-container-low p-1 rounded-xl shadow-sm">
              <div className="flex items-center gap-space-xs flex-1 px-space-sm min-w-0">
                <Icon
                  name="mail"
                  className="w-[18px] h-[18px] text-outline shrink-0"
                />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendInvite();
                  }}
                  placeholder="Enter email addresses or team names…"
                  className="w-full bg-transparent font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none py-1.5"
                />
              </div>
              <div className="relative shrink-0">
                <select
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as InviteRole)
                  }
                  aria-label="Invite role"
                  className="appearance-none bg-surface-container-high text-on-surface font-label-ui-md text-label-ui-md pl-3 pr-7 py-2 rounded-lg cursor-pointer focus:outline-none hover:bg-surface-container-highest transition-colors"
                >
                  <option value="Admin">Admin</option>
                  <option value="Editor">Editor</option>
                  <option value="Viewer">Viewer</option>
                </select>
                <Icon
                  name="expand_more"
                  className="w-[14px] h-[14px] text-outline absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                />
              </div>
              <button
                type="button"
                onClick={handleSendInvite}
                disabled={!isValidEmail}
                className="px-space-md py-2 rounded-lg bg-primary text-on-primary font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors whitespace-nowrap shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send Invite
              </button>
            </div>
          </div>

          {/* ---- LINK SHARING SECTION ------------------------------ */}
          <div className="flex flex-col gap-space-sm p-space-md rounded-xl bg-surface-container-low shadow-sm">
            <div className="flex items-center justify-between gap-space-sm">
              <div className="flex items-center gap-space-sm min-w-0">
                <div className="w-8 h-8 rounded-lg bg-tertiary-container/30 text-tertiary flex items-center justify-center shrink-0">
                  <Icon name="link" className="w-[18px] h-[18px]" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-label-ui-md text-label-ui-md text-on-surface font-semibold">
                    Anyone with the link can view
                  </span>
                  <span className="font-label-mono-sm text-label-mono-sm text-outline">
                    Public read-only snapshot for stakeholders
                  </span>
                </div>
              </div>

              {/* Toggle switch (matches share.html#shareToggle markup). */}
              <button
                type="button"
                role="switch"
                aria-checked={linkSharing}
                aria-label="Toggle public link sharing"
                onClick={() => {
                  const next = !linkSharing;
                  setLinkSharing(next);
                  onLinkSharingChange?.(next);
                }}
                className={[
                  "w-11 h-6 rounded-full relative p-0.5 transition-colors cursor-pointer shrink-0",
                  linkSharing
                    ? "bg-primary"
                    : "bg-surface-container-highest",
                ].join(" ")}
              >
                <div
                  className={[
                    "w-5 h-5 rounded-full bg-on-primary shadow-sm transition-all transform",
                    linkSharing ? "ml-auto" : "mr-auto",
                  ].join(" ")}
                />
              </button>
            </div>

            {/* URL input + copy + QR row. */}
            <div className="flex items-center gap-space-xs bg-surface-container-highest/60 rounded-lg p-space-xs">
              <div className="flex items-center gap-space-xs flex-1 px-space-sm min-w-0 overflow-hidden">
                <Icon
                  name="lock_open"
                  className="w-4 h-4 text-tertiary shrink-0"
                />
                <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant truncate">
                  {shareUrl}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-1 px-space-sm py-1.5 rounded bg-surface-container text-on-surface hover:bg-surface-bright font-label-ui-md text-label-ui-md transition-colors shadow-sm shrink-0"
              >
                <Icon
                  name="content_copy"
                  className="w-4 h-4"
                  aria-hidden
                />
                <span>{copyState === "copied" ? "Copied!" : "Copy Link"}</span>
              </button>
              <button
                type="button"
                aria-label="View QR code"
                title="View QR code"
                className="w-8 h-8 rounded bg-surface-container text-outline hover:text-on-surface hover:bg-surface-bright flex items-center justify-center transition-colors shadow-sm shrink-0"
              >
                <Icon name="qr_code_2" className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>

          {/* ---- COLLABORATORS LIST -------------------------------- */}
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center justify-between pb-space-xs">
              <span className="font-label-ui-md text-label-ui-md text-on-surface uppercase tracking-wider">
                Board Collaborators
              </span>
              <span className="font-label-mono-sm text-label-mono-sm text-outline">
                {orderedMembers.length} Users · 1 Group
              </span>
            </div>

            <div className="space-y-space-xs">
              {orderedMembers.map((member) => {
                const isOwner = member.role === "OWNER";
                const isYou = member.userId === currentUserId;
                return (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container-high transition-colors gap-space-md"
                  >
                    <div className="flex items-center gap-space-sm min-w-0 flex-1">
                      <UserAvatar
                        size="md"
                        email={member.email}
                        presence={isOwner ? "tertiary" : "outline"}
                      />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">
                            {nameFromEmail(member.email)}
                          </span>
                          {isYou ? (
                            <span className="font-label-mono-sm text-label-mono-sm text-outline shrink-0">
                              (You)
                            </span>
                          ) : null}
                        </div>
                        <span className="font-body-sm text-body-sm text-outline truncate">
                          {member.email} ·{" "}
                          {isOwner ? "Lead Engineer" : "Collaborator"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-space-sm shrink-0">
                      {isOwner ? (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-highest text-on-surface font-label-mono-sm text-label-mono-sm">
                          <Icon
                            name="shield"
                            className="w-[14px] h-[14px] text-tertiary"
                            aria-hidden
                          />
                          <span>Owner</span>
                        </span>
                      ) : (
                        <>
                          <div className="relative">
                            <select
                              aria-label="Change role"
                              defaultValue={
                                member.role === "OWNER"
                                  ? "Admin"
                                  : "Editor"
                              }
                              onChange={(e) =>
                                onChangeMemberRole?.({
                                  userId: member.userId,
                                  role: e.target.value as MemberRole,
                                })
                              }
                              className="appearance-none bg-surface-container-high text-on-surface font-label-ui-md text-label-ui-md pl-2.5 pr-6 py-1 rounded cursor-pointer hover:bg-surface-container-highest focus:outline-none"
                            >
                              <option value="Admin">Admin</option>
                              <option value="Editor">Editor</option>
                              <option value="Viewer">Viewer</option>
                            </select>
                            <Icon
                              name="expand_more"
                              className="w-[14px] h-[14px] text-outline absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none"
                            />
                          </div>
                          <button
                            type="button"
                            aria-label="Remove collaborator"
                            onClick={() =>
                              onRemoveMember?.({ userId: member.userId })
                            }
                            className="w-7 h-7 rounded text-outline hover:text-error hover:bg-error-container/30 flex items-center justify-center transition-colors"
                          >
                            <Icon name="close" className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ---- MODAL FOOTER ---------------------------------------- */}
        <div className="px-space-xl py-space-md bg-surface-container-low flex flex-wrap items-center justify-between gap-space-sm border-t border-outline-variant/30">
          <div className="flex items-center gap-space-xs text-outline font-label-mono-sm text-label-mono-sm">
            <Icon
              name="groups"
              className="w-4 h-4 text-tertiary"
              aria-hidden
            />
            <span>
              Team plan:{" "}
              <strong className="text-on-surface">
                {orderedMembers.length} of {seatCap}
              </strong>{" "}
              member seats utilized.
            </span>
          </div>
          <div className="flex items-center gap-space-sm">
            <button
              type="button"
              onClick={onClose}
              className="px-space-md py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-ui-md text-label-ui-md transition-colors shadow-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSave?.();
                onClose();
              }}
              className="px-space-lg py-2 rounded-lg bg-primary text-on-primary font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors shadow-sm"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Derive a human display name from an email address — the API
 * doesn't carry a `displayName` yet, so we use the local part of
 * the email with the first letter uppercased and dots /
 * underscores expanded to spaces (e.g. `sarah.kowalski` →
 * "Sarah Kowalski", `david_miller` → "David Miller").
 */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const spaced = local.replace(/[._-]+/g, " ").trim();
  return spaced
    .split(/\s+/)
    .map((w) => (w[0] ?? "").toUpperCase() + w.slice(1))
    .join(" ");
}
