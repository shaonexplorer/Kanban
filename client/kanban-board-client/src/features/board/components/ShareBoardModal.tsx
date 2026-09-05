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
  /**
   * The board id, used to build the default share URL when the
   * parent doesn't pass an explicit `shareUrl`. The URL is
   * `${origin}/boards/${boardId}` so it always points at the
   * board the modal is open for.
   */
  boardId: string;
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
   * Click handler for the Send Invite button. The parent wires this
   * to `POST /api/boards/:id/members` (Phase 5 Step 5). The handler
   * returns a Promise that resolves with `null` on success and the
   * extracted error (`{ message, httpStatus }`) on failure, so the
   * modal can surface the failure inline next to the email input.
   * `message` is the server's `error` field when available, falling
   * back to a status-aware default; `httpStatus` is `null` for
   * transport (no-response) errors.
   */
  onSendInvite?: (
    args: { email: string; role: InviteRole },
  ) => Promise<MutationError | null>;
  /**
   * Click handler for a per-row "remove collaborator" press.
   * Owners (row with `role === "OWNER"`) never expose this button.
   * Returns the same `Promise<MutationError | null>` shape as
   * `onSendInvite` so the modal can render an inline red ring +
   * message on the failed row.
   */
  onRemoveMember?: (
    args: { userId: string },
  ) => Promise<MutationError | null>;
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
   * Returns a `Promise<MutationError | null>` so the modal can show
   * an inline note under the toggle when the toggle write fails
   * (e.g. network drop, 403 after the session expires).
   */
  onLinkSharingChange?: (enabled: boolean) => Promise<MutationError | null>;
  /**
   * Called by the parent after `onLinkSharingChange` rejects so the
   * modal can snap the toggle back to the value it had before the
   * failed attempt. Without this, a failed toggle would leave the
   * visual switch in the *new* position even though the server
   * kept the previous value. The default is to leave the toggle
   * where the user pressed it; the parent is expected to pass this
   * so the visual matches the persisted state.
   */
  onLinkSharingReset?: (prev: boolean) => void;
  /**
   * Initial state of the link-sharing toggle. The toggle is purely
   * UI state until the server exposes a `publicAccess` flag.
   */
  initialLinkSharing?: boolean;
  /**
   * Override the share URL preview. The parent (BoardView) computes
   * this from the current `window.location.origin` and the board id
   * so the link points at the board the user is actually looking
   * at, rather than a hardcoded placeholder.
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
  boardId,
  members,
  currentUserId,
  seatCap = 10,
  defaultInviteRole = "Editor",
  onSendInvite,
  onRemoveMember,
  onChangeMemberRole,
  onSave,
  onLinkSharingChange,
  onLinkSharingReset,
  initialLinkSharing = true,
  shareUrl,
}: ShareBoardModalProps) {
  // Build the share URL from the current origin + the board id when
  // the parent doesn't pass an explicit `shareUrl`. Falls back to a
  // `/boards/<id>` path on the server (no `window`) so the rendered
  // markup is never empty during SSR.
  const resolvedShareUrl =
    shareUrl ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/boards/${boardId}`
      : `/boards/${boardId}`);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>(defaultInviteRole);
  const [linkSharing, setLinkSharing] = useState(initialLinkSharing);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const copyResetTimer = useRef<number | null>(null);

  // ----- Inline error state ------------------------------------------
  // The parent turns each mutation into a Promise<MutationError | null>
  // (see the prop types above). On failure we surface the message
  // inline next to the input / row that caused it, so the user sees
  // the *actual* reason — "Invitee not found" vs "Cannot invite the
  // board owner" vs "A pending invitation already exists" — instead
  // of the previous one-size-fits-all "Couldn't send invite — please
  // retry" toast. On success we clear the slot so the next attempt
  // starts fresh. The slot also clears on `open` transitioning to
  // `true` (see the effect below) so a freshly-opened modal is
  // error-free.
  const [inviteError, setInviteError] = useState<{ message: string } | null>(
    null,
  );
  const [removeErrors, setRemoveErrors] = useState<
    Record<string, { message: string }>
  >({});
  const [linkSharingError, setLinkSharingError] = useState<{
    message: string;
  } | null>(null);
  const linkSharingErrorTimer = useRef<number | null>(null);

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
      if (linkSharingErrorTimer.current !== null) {
        window.clearTimeout(linkSharingErrorTimer.current);
        linkSharingErrorTimer.current = null;
      }
    };
  }, [open, onClose]);

  // Note: inline error state is intentionally NOT cleared in a
  // `useEffect(() => { if (open) ... }, [open])` because the
  // project's ESLint config rejects `setState` inside an effect
  // (the `react-hooks/set-state-in-effect` rule). Instead, the
  // parent (`BoardView.tsx`) passes a `key` that flips on the
  // `open` transition so this component remounts with a fresh
  // `useState` initializer — see the `key={String(shareModalOpen)}`
  // wrapper there. The same pattern is already used by `TaskModal`
  // (per the comment in its own file).

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

  async function handleSendInvite() {
    if (!isValidEmail) return;
    if (!onSendInvite) return;
    const email = inviteEmail.trim();
    const role = inviteRole;
    // Clear the input immediately so the UI feels responsive; if
    // the mutation fails we restore the *same* values so the user
    // can edit and retry without re-typing the email.
    setInviteEmail("");
    setInviteRole(defaultInviteRole);
    setInviteError(null);
    const result = await onSendInvite({ email, role });
    if (result !== null) {
      // Failure: restore the user's input + show the inline error.
      setInviteEmail(email);
      setInviteRole(role);
      setInviteError({ message: result.message });
    }
    // Success: the parent's `onSuccess` is responsible for any
    // global toast; nothing left to do here.
  }

  async function handleRemoveMember(userId: string) {
    if (!onRemoveMember) return;
    setRemoveErrors((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    const result = await onRemoveMember({ userId });
    if (result !== null) {
      setRemoveErrors((prev) => ({
        ...prev,
        [userId]: { message: result.message },
      }));
    }
  }

  async function handleToggleLinkSharing() {
    if (!onLinkSharingChange) return;
    const next = !linkSharing;
    const prev = linkSharing;
    // Optimistic UI flip so the switch feels instant. On failure we
    // snap back via the parent's `onLinkSharingReset` callback (the
    // parent invalidates the board query on success so the next
    // render of the modal will re-read `initialLinkSharing`).
    setLinkSharing(next);
    setLinkSharingError(null);
    const result = await onLinkSharingChange(next);
    if (result !== null) {
      // Failure: roll the visual toggle back, show an inline note
      // for 4s (mirrors the global toast's auto-dismiss window so
      // the two feedback channels stay in sync).
      setLinkSharing(prev);
      onLinkSharingReset?.(prev);
      setLinkSharingError({ message: result.message });
      if (linkSharingErrorTimer.current !== null) {
        window.clearTimeout(linkSharingErrorTimer.current);
      }
      linkSharingErrorTimer.current = window.setTimeout(() => {
        setLinkSharingError(null);
        linkSharingErrorTimer.current = null;
      }, 4000);
    }
  }

  function handleCopyLink() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      // Fall back to the visual feedback only — the URL is the
      // shareUrl prop so the user can still select-and-copy it.
      setCopyState("copied");
    } else {
      void navigator.clipboard.writeText(resolvedShareUrl);
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
            <div
              className={[
                "flex items-center gap-space-xs bg-surface-container-low p-1 rounded-xl shadow-sm transition-colors",
                inviteError ? "ring-1 ring-error" : "",
              ].join(" ")}
            >
              <div className="flex items-center gap-space-xs flex-1 px-space-sm min-w-0">
                <Icon
                  name="mail"
                  className={[
                    "w-[18px] h-[18px] shrink-0",
                    inviteError ? "text-error" : "text-outline",
                  ].join(" ")}
                />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    // Typing clears the inline error so the user
                    // gets a clean slate on the next attempt.
                    if (inviteError) setInviteError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendInvite();
                  }}
                  placeholder="Enter email addresses or team names…"
                  aria-invalid={inviteError ? true : undefined}
                  aria-describedby={
                    inviteError ? "share-invite-error" : undefined
                  }
                  data-testid="share-invite-email"
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
                data-testid="share-invite-send"
                className="px-space-md py-2 rounded-lg bg-primary text-on-primary font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors whitespace-nowrap shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send Invite
              </button>
            </div>
            {inviteError ? (
              <p
                id="share-invite-error"
                role="alert"
                data-testid="share-invite-error"
                className="flex items-start gap-1 mt-1 text-error font-label-ui-sm text-label-ui-sm"
              >
                <Icon
                  name="warning"
                  className="w-3.5 h-3.5 shrink-0 mt-0.5"
                  style={{ width: 14, height: 14 }}
                  aria-hidden
                />
                <span>{inviteError.message}</span>
              </p>
            ) : null}
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

              {/* Toggle switch (matches share.html#shareToggle markup).
               * The new `handleToggleLinkSharing` wrapper awaits the
               * parent mutation so a failed attempt can roll the
               * visual switch back and surface an inline note. */}
              <button
                type="button"
                role="switch"
                aria-checked={linkSharing}
                aria-label="Toggle public link sharing"
                onClick={handleToggleLinkSharing}
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
                  {resolvedShareUrl}
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
            {/* Inline note shown when the toggle write failed. Sits
             * inside the same surface so the message is anchored to
             * the toggle it describes; auto-dismisses after 4s
             * (matches the global toast's window so the two feedback
             * channels stay in sync). */}
            {linkSharingError ? (
              <p
                role="alert"
                data-testid="share-link-error"
                className="flex items-start gap-1 mt-2 text-error font-label-ui-sm text-label-ui-sm"
              >
                <Icon
                  name="warning"
                  className="w-3.5 h-3.5 shrink-0 mt-0.5"
                  style={{ width: 14, height: 14 }}
                  aria-hidden
                />
                <span>{linkSharingError.message}</span>
              </p>
            ) : null}
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
                // The remove-error slot is keyed by userId so each
                // row carries its own failure surface; the X button
                // stays clickable so the user can retry the same
                // call without re-rendering the whole modal.
                const rowError = removeErrors[member.userId] ?? null;
                return (
                  <div
                    key={member.userId}
                    className="flex flex-col"
                  >
                    <div
                      data-testid="share-member-row"
                      data-user-id={member.userId}
                      className={[
                        "flex items-center justify-between p-space-sm rounded-lg transition-colors gap-space-md",
                        rowError
                          ? "bg-surface-container-low ring-1 ring-error"
                          : "bg-surface-container-low hover:bg-surface-container-high",
                      ].join(" ")}
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
                              data-testid="share-member-remove"
                              onClick={() =>
                                handleRemoveMember(member.userId)
                              }
                              className="w-7 h-7 rounded text-outline hover:text-error hover:bg-error-container/30 flex items-center justify-center transition-colors"
                            >
                              <Icon name="close" className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {rowError ? (
                      <p
                        role="alert"
                        data-testid="share-member-error"
                        data-user-id={member.userId}
                        className="flex items-start gap-1 mt-1 pl-space-2xl text-error font-label-ui-sm text-label-ui-sm"
                      >
                        <Icon
                          name="warning"
                          className="w-3.5 h-3.5 shrink-0 mt-0.5"
                          style={{ width: 14, height: 14 }}
                          aria-hidden
                        />
                        <span>{rowError.message}</span>
                      </p>
                    ) : null}
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

/**
 * Shape of a failure surfaced from one of the three mutations the
 * modal owns (`onSendInvite` / `onRemoveMember` / `onLinkSharingChange`).
 * The parent returns this from the mutation's `try`/`catch` so the
 * modal can render an inline error message + apply the right visual
 * treatment (red border on the input, red ring on the row, red note
 * under the toggle). `httpStatus` is `null` for transport errors
 * (no response received from the server).
 */
export type MutationError = {
  message: string;
  httpStatus: number | null;
};

/**
 * Pull a human-readable message + the HTTP status off any value
 * that was thrown by a TanStack Query mutation. The server emits
 * the central `{ error: string, details?: unknown }` envelope (see
 * `server/src/common/envelope.ts` and `error.middleware.ts`); on
 * an `AxiosError` that string lives at `error.response.data.error`.
 *
 * When the server's `error` string is present, it is shown as-is
 * — the server's copy is the most accurate diagnostic ("Invitee
 * not found", "Cannot invite the board owner", "A pending
 * invitation already exists", etc.). The status-classified default
 * below is only used when the response body has no `error` field
 * (e.g. a transport failure, a malformed 5xx with an empty body, or
 * a JS-side throw before the request was sent).
 *
 * Mirrors the `readErrorStatus` helper in `lib/api.ts` for the
 * status side, but does the full extraction (status + message) so
 * the caller doesn't have to compose them itself.
 */
export function extractMutationError(err: unknown): MutationError {
  const httpStatus = readStatus(err);
  // Try the server's `{ error: string }` envelope first.
  const serverMessage = readServerMessage(err);
  if (serverMessage) {
    return { message: serverMessage, httpStatus };
  }
  return { message: defaultMessageForStatus(httpStatus), httpStatus };
}

/**
 * Duck-typed replacement for `readErrorStatus` (in `lib/api.ts`) —
 * we re-implement it locally instead of importing the helper so
 * the modal stays a single-file surface that doesn't take a new
 * dependency on `lib/api`. Same logic: read `error.response?.status`
 * and return a `number | null`.
 */
function readStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const response = (err as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return null;
  const status = (response as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

/**
 * Read the server's `error` field off the axios response body.
 * Returns the trimmed string when present and non-empty, otherwise
 * `null` so the caller can fall through to the status-classified
 * default.
 */
function readServerMessage(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const response = (err as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return null;
  const data = (response as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const message = (data as { error?: unknown }).error;
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Status-classified default for the inline error message. Used
 * only when the server didn't supply a `data.error` field, so the
 * user still gets an actionable, type-aware hint rather than a
 * bare "Something went wrong" string.
 *
 *  - 0 / no response (transport) → "Couldn't reach the server.
 *    Check your connection and try again."
 *  - 400 → "That request was rejected. Please check the details
 *    and try again."
 *  - 401 → "Your session expired. Please sign in again."
 *  - 403 → "You don't have permission to do that."
 *  - 404 → "We couldn't find what you were looking for."
 *  - 409 → "That conflicts with an existing entry."
 *  - 5xx → "The server had a problem. Please try again in a
 *    moment."
 *  - any other status → "Something went wrong. Please try again."
 */
function defaultMessageForStatus(status: number | null): string {
  if (status === null) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (status === 400) {
    return "That request was rejected. Please check the details and try again.";
  }
  if (status === 401) {
    return "Your session expired. Please sign in again.";
  }
  if (status === 403) {
    return "You don't have permission to do that.";
  }
  if (status === 404) {
    return "We couldn't find what you were looking for.";
  }
  if (status === 409) {
    return "That conflicts with an existing entry.";
  }
  if (status >= 500 && status <= 599) {
    return "The server had a problem. Please try again in a moment.";
  }
  return "Something went wrong. Please try again.";
}
