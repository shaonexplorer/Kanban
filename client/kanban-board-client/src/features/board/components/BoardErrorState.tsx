"use client";

import Link from "next/link";
import { Icon } from "./Icon";

/**
 * Discriminated reason for why `useBoardQuery` failed.
 *
 * The board view downcasts whatever TanStack Query hands it (an
 * `AxiosError` for HTTP failures, a plain `Error` for transport
 * problems, etc.) to one of these reasons so this component can
 * render the right copy + button(s) without re-implementing the
 * status-code switch.
 *
 * The five branches mirror `specs/Phase05/Plan.md` §4.2:
 *   - `network`    → couldn't reach the server at all.
 *   - `auth`       → 401 — the JWT expired or was invalidated.
 *   - `forbidden`  → 403 — the viewer is not a member / owner.
 *   - `not_found`  → 404 — the board doesn't exist or was deleted.
 *   - `unknown`    → any other 4xx/5xx or untyped error.
 */
export type BoardErrorReason =
  | { kind: "network" }
  | { kind: "auth" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "unknown"; message?: string };

export interface BoardErrorStateProps {
  reason: BoardErrorReason;
  /** Called when the user clicks the "Try again" button (rendered
   *  on `network` and `unknown` branches). The board view wires
   *  this to `useBoardQuery`'s `refetch`. */
  onRetry?: () => void;
  /** Called when the user clicks the "Sign in again" button
   *  (rendered on the `auth` branch). The board view wires this
   *  to `useAuth().signOut() + router.replace("/")` so the
   *  httpOnly `token` cookie is cleared server-side via
   *  `POST /api/auth/logout` before the navigation. */
  onSignOut?: () => void;
}

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg bg-primary text-on-primary px-space-lg py-space-sm font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors";

const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-lg bg-surface-container text-on-surface px-space-lg py-space-sm font-label-ui-md text-label-ui-md hover:bg-surface-container-high transition-colors";

/**
 * Per-status error surface for the board view (Phase 5 Step 4,
 * Plan §4.2).
 *
 * Lives inside the same `<main>` slot the real board uses so the
 * chrome (header, sidebar, control bar) is already on screen when
 * the error appears — no layout shift between the loading and error
 * branches.
 */
export function BoardErrorState({
  reason,
  onRetry,
  onSignOut,
}: BoardErrorStateProps) {
  const { headline, body, primary, secondary } = copyFor(reason, {
    onRetry,
    onSignOut,
  });

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="board-error"
      data-reason={reason.kind}
      className="flex-1 flex items-center justify-center px-space-md py-space-3xl"
    >
      <div className="max-w-md w-full rounded-xl bg-surface-container-lowest/90 border border-outline/20 p-space-xl text-center shadow-md">
        <div className="mx-auto mb-space-md flex items-center justify-center size-12 rounded-full bg-error-container/30 text-error">
          <Icon name="warning" className="w-6 h-6" />
        </div>
        <p className="font-headline-sm text-headline-sm text-on-surface">
          {headline}
        </p>
        <p className="mt-space-xs font-body-md text-body-md text-on-surface-variant">
          {body}
        </p>
        <div className="mt-space-lg flex items-center justify-center gap-space-sm flex-wrap">
          {primary}
          {secondary}
        </div>
      </div>
    </div>
  );
}

/** Compute the copy + button(s) for a given error reason. Kept as
 *  a pure function so the JSX in `BoardErrorState` reads as a thin
 *  render. Returns the JSX nodes (not just the strings) because the
 *  buttons need the parent's handlers. */
function copyFor(
  reason: BoardErrorReason,
  handlers: { onRetry?: () => void; onSignOut?: () => void },
): {
  headline: string;
  body: string;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
} {
  switch (reason.kind) {
    case "network":
      return {
        headline: "Couldn't reach the server",
        body: "Check your connection and try again.",
        primary: handlers.onRetry ? (
          <button
            type="button"
            onClick={handlers.onRetry}
            className={primaryButtonClass}
          >
            Try again
          </button>
        ) : null,
      };
    case "auth":
      return {
        headline: "Your session expired",
        body: "Sign in again to keep working on this board.",
        primary: handlers.onSignOut ? (
          <button
            type="button"
            onClick={handlers.onSignOut}
            className={primaryButtonClass}
          >
            Sign in again
          </button>
        ) : (
          <Link href="/" className={primaryButtonClass}>
            Sign in again
          </Link>
        ),
      };
    case "forbidden":
      return {
        headline: "You don't have access to this board",
        body: "Ask the board owner to invite you, or return to your home view.",
        primary: (
          <Link href="/" className={primaryButtonClass}>
            Back to home
          </Link>
        ),
      };
    case "not_found":
      return {
        headline: "This board doesn't exist",
        body: "It may have been deleted, or the link you followed is incorrect.",
        primary: (
          <Link href="/" className={primaryButtonClass}>
            Back to home
          </Link>
        ),
      };
    case "unknown":
    default:
      return {
        headline: "Failed to load board",
        body: reason.message ?? "Something went wrong. Please try again.",
        primary: handlers.onRetry ? (
          <button
            type="button"
            onClick={handlers.onRetry}
            className={primaryButtonClass}
          >
            Try again
          </button>
        ) : null,
        secondary: (
          <Link href="/" className={secondaryButtonClass}>
            Back to home
          </Link>
        ),
      };
  }
}
