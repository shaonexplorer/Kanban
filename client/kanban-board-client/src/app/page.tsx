"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/useAuth";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { fetchMyBoards } from "@/features/board/api";
import { useCreateBoardMutation } from "@/features/board/useCreateBoardMutation";
import { EmptyBoardsState } from "@/features/board/components/EmptyBoardsState";
import { CreateBoardDrawer } from "@/features/board/components/CreateBoardDrawer";
import { Toast } from "@/features/board/components/Toast";
import { useOverlayState } from "@/features/board/overlays/useOverlayState";

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
 * Phase 5 Step 5: the `createBoardOpen` flag is now lifted to the
 * `useOverlayState` context (Plan §5.4) so the same drawer is
 * opened by the board view's `<BoardControlBar />` "New Board"
 * button. The drawer's `onCreate` is wired to
 * `useCreateBoardMutation`; on success the new board id is used
 * to navigate to `/boards/:newId`.
 */
export default function Home() {
  const router = useRouter();
  const { token } = useAuth();
  const { createBoardOpen, closeCreateBoard, openCreateBoard } =
    useOverlayState();
  const createBoard = useCreateBoardMutation();
  const [boardsState, setBoardsState] = useState<
    | { kind: "loading" }
    | { kind: "empty" }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
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
            onCreateBoard={() => openCreateBoard()}
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
        onClose={closeCreateBoard}
        leadEmail={null}
        onCreate={(args) => {
          createBoard.mutate(
            {
              title: args.title,
              projectKey: args.projectKey,
              colorIdentity:
                args.colorToken === "primary"
                  ? "PRIMARY"
                  : args.colorToken === "tertiary"
                    ? "TERTIARY"
                    : args.colorToken === "secondary"
                      ? "SECONDARY"
                      : args.colorToken === "error"
                        ? "ERROR"
                        : "OUTLINE",
              template:
                args.workflowTemplate === "software-engineering"
                  ? "SOFTWARE_ENG"
                  : "INCIDENT_MGMT",
            },
            {
              onSuccess: (created) => {
                closeCreateBoard();
                router.push(`/boards/${created.id}`);
              },
              onError: () => {
                setToast({
                  message: "Couldn't create board — please retry.",
                  variant: "error",
                });
              },
            },
          );
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
