"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/useAuth";
import { Icon } from "./Icon";

export interface EmptyBoardsStateProps {
  /** Called when the user clicks "Create your first board". The
   *  parent (the home page) wires this to a state flag that opens
   *  the `CreateBoardDrawer`. The wiring to `POST /api/boards`
   *  lands in Phase 5 Step 5; until then the drawer's `onCreate`
   *  toasts "Board creation lands in Phase 5 Step 5." */
  onCreateBoard: () => void;
}

/**
 * Empty-state card for the home page (Phase 5 Step 4, Plan §4.3).
 *
 * Renders when the user is signed in but `GET /api/boards` returned
 * an empty list. Replaces the previous developer-facing
 * `<p role="status">` with a centered card + a "Create your first
 * board" primary button that opens the `CreateBoardDrawer`.
 *
 * A quiet "Sign out" button (Phase 5 Step 8) sits below the primary
 * CTA so a freshly-registered user with no boards can switch
 * accounts without first having to create something. Same `signOut`
 * + `router.replace("/")` shape as the sidebar's sign-out button.
 *
 * This component is purely presentational — it owns no state and
 * has no `useEffect`. The home page decides *when* to show it
 * (after the boards fetch resolves with an empty array).
 */
export function EmptyBoardsState({ onCreateBoard }: EmptyBoardsStateProps) {
  const router = useRouter();
  const { signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <div
      role="region"
      aria-label="No boards yet"
      data-testid="empty-boards"
      className="flex flex-1 items-center justify-center px-space-md py-space-3xl"
    >
      <div className="max-w-md w-full rounded-xl bg-surface-container-lowest/90 border border-outline/20 p-space-xl text-center shadow-md">
        <div className="mx-auto mb-space-md flex items-center justify-center size-14 rounded-2xl bg-primary/15 text-primary">
          <Icon name="view_kanban" className="w-7 h-7" />
        </div>
        <p className="font-headline-md text-headline-md text-on-surface">
          No boards yet
        </p>
        <p className="mt-space-xs font-body-md text-body-md text-on-surface-variant">
          Boards are where your team&apos;s tasks live. Create your first
          board to get started.
        </p>
        <button
          type="button"
          onClick={onCreateBoard}
          className="mt-space-lg inline-flex items-center justify-center gap-space-xs rounded-lg bg-primary text-on-primary px-space-lg py-space-sm font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors"
        >
          <Icon name="add" className="w-4 h-4" />
          Create your first board
        </button>
        <div className="mt-space-md">
          <button
            type="button"
            onClick={handleSignOut}
            data-testid="empty-boards-signout"
            className="inline-flex items-center justify-center gap-space-xs text-outline hover:text-on-surface font-label-ui-sm text-label-ui-sm transition-colors"
          >
            <Icon name="logout" className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
