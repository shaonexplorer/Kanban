"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/useAuth";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { fetchMyBoards } from "@/features/board/api";
import { EmptyBoardsState } from "@/features/board/components/EmptyBoardsState";
import { CreateBoardDrawer } from "@/features/board/components/CreateBoardDrawer";
import { Toast } from "@/features/board/components/Toast";

/**
 * Landing page (Phase 5).
 *
 * Three branches:
 *   - Logged-out → render the Stitch-faithful `AuthScreen` (the
 *     real sign-in / create-account form).
 *   - Logged-in + loading → render a thin "Loading your workspace…"
 *     status. Transient state, not a real view.
 *   - Logged-in + no boards → render the `<EmptyBoardsState />`
 *     card (Phase 5 Step 4, Plan §4.3) with a "Create your first
 *     board" button that opens the `<CreateBoardDrawer>`.
 *   - Logged-in + boards present → auto-redirect to the user's
 *     first board (the existing Phase 4 / Phase 5 behavior).
 *
 * The "Create your first board" button opens a local-state drawer.
 * The drawer's `onCreate` callback toasts "Board creation lands in
 * Phase 5 Step 5." and closes; the real `POST /api/boards` wiring
 * is a Step 5 deliverable. The Plan §5.4 `useOverlayState` context
 * (so `BoardControlBar` and this empty state share the same flag)
 * is also Step 5.
 */
export default function Home() {
  const router = useRouter();
  const { token } = useAuth();
  const [boardsState, setBoardsState] = useState<
    | { kind: "loading" }
    | { kind: "empty" }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [toast, setToast] = useState<
    { message: string; variant: "info" | "error" | "success" } | null
  >(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const boards = await fetchMyBoards();
        if (cancelled) return;
        if (boards.length === 0) {
          setBoardsState({ kind: "empty" });
          return;
        }
        router.push(`/boards/${boards[0].id}`);
      } catch {
        if (cancelled) return;
        setBoardsState({
          kind: "error",
          message: "Couldn't load your boards. Reload to try again.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (!token) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <main
        className="flex-1 flex flex-col"
        role="main"
      >
        {boardsState.kind === "loading" ? (
          <div className="flex flex-1 items-center justify-center">
            <p
              role="status"
              className="font-body-md text-body-md text-on-surface-variant"
            >
              Loading your workspace…
            </p>
          </div>
        ) : null}

        {boardsState.kind === "empty" ? (
          <EmptyBoardsState
            onCreateBoard={() => setCreateBoardOpen(true)}
          />
        ) : null}

        {boardsState.kind === "error" ? (
          <div className="flex flex-1 items-center justify-center px-space-md py-space-3xl">
            <div className="max-w-md w-full rounded-xl bg-surface-container-lowest/90 border border-outline/20 p-space-xl text-center shadow-md">
              <p className="font-headline-sm text-headline-sm text-on-surface">
                Couldn&apos;t load your boards
              </p>
              <p className="mt-space-xs font-body-md text-body-md text-on-surface-variant">
                {boardsState.message}
              </p>
              <button
                type="button"
                onClick={() => {
                  setBoardsState({ kind: "loading" });
                  // The dependency-driven effect re-runs only when
                  // `token` changes; trigger it manually by setting
                  // a fresh state and re-pushing the same token via
                  // a router refresh.
                  router.refresh();
                }}
                className="mt-space-lg inline-flex items-center justify-center rounded-lg bg-primary text-on-primary px-space-lg py-space-sm font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        ) : null}
      </main>

      <CreateBoardDrawer
        open={createBoardOpen}
        onClose={() => setCreateBoardOpen(false)}
        onCreate={() => {
          setCreateBoardOpen(false);
          setToast({
            message:
              "Board creation lands in Phase 5 Step 5 — new boards are not yet persisted.",
            variant: "info",
          });
        }}
      />

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
