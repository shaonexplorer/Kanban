"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/features/board/components/Icon";
import { useMyInvitationsQuery } from "../useMyInvitationsQuery";
import { useAcceptInvitationMutation } from "../useAcceptInvitationMutation";
import { useDeclineInvitationMutation } from "../useDeclineInvitationMutation";
import type { BoardInvitation } from "../types";

export interface InvitationsInboxProps {
  /** Whether the modal is rendered. Mirrors the pattern of every
   *  other Phase 5 modal — the parent owns the open flag (in
   *  `useOverlayState().invitationsInboxOpen`). */
  open: boolean;
  /** Called when the user dismisses the modal (backdrop click,
   *  close button, or Esc). */
  onClose: () => void;
  /** Called on a successful accept, with the just-joined board's
   *  id so the parent can navigate. The parent is responsible for
   *  closing the modal first (the call site typically does
   *  `onAccepted={(id) => { onClose(); router.push(...); }}`). */
  onAccepted?: (boardId: string) => void;
  /** Called when an accept or decline errors. The parent surfaces
   *  the message as a toast (the inbox itself owns no toast state
   *  — matches every other modal in the codebase). */
  onError?: (message: string) => void;
}

/**
 * Centered modal that lists the caller's PENDING board invitations
 * (Phase 5 Step 9a — `specs/Phase05/Plan.md` §9a).
 *
 * Visual language matches the existing `TaskModal`, `ShareBoardModal`,
 * and `KeyboardShortcutsHelp` — `bg-surface-container-low` card,
 * 480px max-w, the standard `animate-in fade-in zoom-in-95
 * duration-(--duration-medium) ease-(--ease-emphasized)` open
 * animation, Esc + backdrop close, body scroll-lock while open.
 *
 * Data flow:
 *   - `useMyInvitationsQuery()` → renders loading / empty / list.
 *   - `Accept` → `useAcceptInvitationMutation` → on success, the
 *     hook invalidates `["my-invitations"]` + `["my-boards"]` and
 *     the inbox calls `onAccepted(boardId)` so the parent can
 *     navigate. The mutation's `onMutate` snapshot already removed
 *     the row from the cache, so the user sees the row disappear
 *     immediately.
 *   - `Decline` → `useDeclineInvitationMutation` → on success, the
 *     row is gone and the bell badge decrements on the next
 *     `["my-invitations"]` settle. The inbox does not navigate.
 *
 * Errors are surfaced through the parent's `onError` callback (the
 * pattern used by `TaskModal`, `QuickAddTaskModal`, and
 * `ShareBoardModal`) so the toast lives in the same place as every
 * other toast in the codebase.
 *
 * Decline uses a two-step confirm: the first click flips the row's
 * button to "Click again to confirm" for 3 seconds; the second
 * click dispatches the decline. The trash button on `TaskModal`
 * uses the same anti-misclick pattern.
 */
export function InvitationsInbox({
  open,
  onClose,
  onAccepted,
  onError,
}: InvitationsInboxProps) {
  const { data, isLoading, error } = useMyInvitationsQuery();
  const accept = useAcceptInvitationMutation();
  const decline = useDeclineInvitationMutation();
  // Per-row "armed" state for the two-step decline confirm.
  // Keyed by invitation id; the row is "armed" for 3 seconds after
  // the first click, after which the timer clears the state.
  const [armedDecline, setArmedDecline] = useState<string | null>(null);

  // Esc-to-close + body-scroll-lock. Same pattern as the other
  // overlays — `capture: true` so the modal's handler runs before
  // the board-level keydown subscription would re-open the
  // quick-add modal on the same keypress.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey, { capture: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey, { capture: true });
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // The "armed" decline state clears on its own after 3 seconds
  // (set in `handleDecline`). We don't add a useEffect to clear
  // it on close — the project lint config rejects `setState`
  // inside effects (`react-hooks/set-state-in-effect`), and the
  // worst-case stale `armedDecline` after a quick close is
  // harmless: the next click either confirms (in which case the
  // user re-armed the row anyway) or it arms fresh. When the
  // modal is closed, the row is unmounted so the armed state has
  // no visual effect.

  if (!open) return null;

  function handleAccept(invitation: BoardInvitation) {
    accept.mutate(
      { invitationId: invitation.id },
      {
        onSuccess: (result) => {
          onAccepted?.(result.boardId);
        },
        onError: () => {
          onError?.("Couldn't accept invitation — please retry.");
        },
      },
    );
  }

  function handleDecline(invitation: BoardInvitation) {
    if (armedDecline !== invitation.id) {
      // First click — arm for 3 seconds, then auto-disarm.
      setArmedDecline(invitation.id);
      window.setTimeout(() => {
        setArmedDecline((current) =>
          current === invitation.id ? null : current,
        );
      }, 3000);
      return;
    }
    // Second click within the window — actually decline.
    setArmedDecline(null);
    decline.mutate(
      { invitationId: invitation.id },
      {
        onError: () => {
          onError?.("Couldn't decline invitation — please retry.");
        },
      },
    );
  }

  // Normalise the network error into a short human string. The
  // server's central error middleware returns `{ error: "..." }`
  // so the most common path is `axios`-shaped with a response
  // payload; we fall back to a generic message otherwise.
  const errorMessage =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "Couldn't load your invitations.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface/70 backdrop-blur-sm p-space-md"
      onClick={onClose}
      data-testid="invitations-inbox-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invitations-inbox-title"
        onClick={(e) => e.stopPropagation()}
        className={[
          "w-full max-w-[480px]",
          "bg-surface-container-low shadow-2xl rounded-2xl",
          "flex flex-col max-h-[80vh]",
          "animate-in fade-in zoom-in-95",
          "duration-(--duration-medium) ease-(--ease-emphasized)",
        ].join(" ")}
      >
        {/* ---- HEADER ------------------------------------------- */}
        <div className="px-space-xl pt-space-lg pb-space-md flex items-start justify-between gap-space-md">
          <div className="flex items-center gap-space-xs min-w-0">
            <Icon
              name="mail"
              className="w-5 h-5 text-primary shrink-0"
              aria-hidden
            />
            <h2
              id="invitations-inbox-title"
              className="font-headline-lg text-headline-lg text-on-surface tracking-tight"
            >
              Invitations
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close invitations"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors shrink-0"
          >
            <Icon name="close" className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* ---- BODY --------------------------------------------- */}
        <div className="px-space-xl pb-space-lg flex flex-col gap-space-md overflow-y-auto">
          {isLoading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={errorMessage} />
          ) : data && data.length > 0 ? (
            <ul
              className="flex flex-col gap-space-sm"
              data-testid="invitations-inbox-list"
            >
              {data.map((inv) => (
                <InvitationRow
                  key={inv.id}
                  invitation={inv}
                  isAccepting={
                    accept.isPending && accept.variables?.invitationId === inv.id
                  }
                  isDeclining={
                    decline.isPending && decline.variables?.invitationId === inv.id
                  }
                  declineArmed={armedDecline === inv.id}
                  onAccept={() => handleAccept(inv)}
                  onDecline={() => handleDecline(inv)}
                />
              ))}
            </ul>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </div>
  );
}

/** A single invitation row — board title, inviter email, age, and
 *  the Accept / Decline buttons. */
function InvitationRow({
  invitation,
  isAccepting,
  isDeclining,
  declineArmed,
  onAccept,
  onDecline,
}: {
  invitation: BoardInvitation;
  isAccepting: boolean;
  isDeclining: boolean;
  declineArmed: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <li className="flex items-start gap-space-md p-space-md rounded-xl bg-surface-container-lowest/60 border border-outline/15">
      <div className="flex-1 min-w-0">
        <p className="font-headline-sm text-headline-sm text-on-surface truncate">
          {invitation.boardTitle}
        </p>
        <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant truncate">
          {invitation.inviterEmail} · {relativeTime(invitation.createdAt)}
        </p>
        <div className="mt-space-md flex items-center gap-space-xs">
          <button
            type="button"
            onClick={onAccept}
            disabled={isAccepting || isDeclining}
            data-testid="invitations-inbox-accept"
            className="inline-flex items-center justify-center gap-space-xs px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors disabled:opacity-60"
          >
            {isAccepting ? (
              <span
                aria-hidden
                className="size-3.5 rounded-full border-2 border-on-primary border-t-transparent animate-spin"
              />
            ) : (
              <Icon name="check" className="w-4 h-4" aria-hidden />
            )}
            <span>Accept</span>
          </button>
          <button
            type="button"
            onClick={onDecline}
            disabled={isAccepting || isDeclining}
            data-testid="invitations-inbox-decline"
            className={[
              "inline-flex items-center justify-center gap-space-xs px-space-md py-1.5 rounded-lg font-label-ui-md text-label-ui-md transition-colors disabled:opacity-60",
              declineArmed
                ? "bg-error text-on-primary hover:bg-error/90"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high",
            ].join(" ")}
          >
            {isDeclining ? (
              <span
                aria-hidden
                className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
              />
            ) : (
              <Icon name="close" className="w-4 h-4" aria-hidden />
            )}
            <span>{declineArmed ? "Click to confirm" : "Decline"}</span>
          </button>
        </div>
      </div>
    </li>
  );
}

function LoadingState() {
  return (
    <ul
      className="flex flex-col gap-space-sm"
      data-testid="invitations-inbox-loading"
    >
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="flex items-center gap-space-md p-space-md rounded-xl bg-surface-container-lowest/60 border border-outline/15"
        >
          <div className="flex-1 min-w-0 flex flex-col gap-space-xs">
            <div className="h-4 w-2/3 rounded bg-surface-container animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-surface-container animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-space-sm py-space-xl"
      data-testid="invitations-inbox-empty"
    >
      <div className="size-14 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
        <Icon name="mail" className="w-7 h-7" />
      </div>
      <p className="font-headline-md text-headline-md text-on-surface">
        No pending invitations
      </p>
      <p className="font-body-sm text-body-sm text-on-surface-variant text-center max-w-sm">
        When someone invites you to a board, it&apos;ll show up here.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="flex flex-col items-center gap-space-sm py-space-xl"
      data-testid="invitations-inbox-error"
    >
      <div className="size-14 rounded-2xl bg-error/15 text-error flex items-center justify-center">
        <Icon name="warning" className="w-7 h-7" />
      </div>
      <p className="font-headline-md text-headline-md text-on-surface">
        Couldn&apos;t load your invitations
      </p>
      <p className="font-body-sm text-body-sm text-on-surface-variant text-center max-w-sm">
        {message}
      </p>
    </div>
  );
}

/**
 * Tiny relative-time helper ("3 minutes ago", "2 days ago", etc.).
 * No external dep — matches the project's "no moment.js / date-fns"
 * stance. Returns the absolute ISO string as a fallback if the
 * input can't be parsed (which shouldn't happen — the server
 * always sends a valid timestamp).
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const month = Math.floor(day / 30);
  if (month < 12)
    return `${month} month${month === 1 ? "" : "s"} ago`;
  const year = Math.floor(day / 365);
  return `${year} year${year === 1 ? "" : "s"} ago`;
}
