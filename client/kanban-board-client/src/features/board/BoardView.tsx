"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useBoardQuery, boardQueryKey } from "./useBoardQuery";
import { useMoveTaskMutation } from "./useMoveTaskMutation";
import { useMoveColumnMutation } from "./useMoveColumnMutation";
import { useCreateTaskMutation } from "./useCreateTaskMutation";
import {
  findColumnOfTask,
  moveTaskWithinBoard,
  snapshotBoard,
} from "./reorderBoard";
import { Column } from "./Column";
import { TaskCard } from "./TaskCard";
import type { BoardDetail, Column as ColumnT, Task } from "./types";
import { Sidebar } from "./components/Sidebar";
import { SidebarOverlay } from "./components/SidebarOverlay";
import { BoardHeader } from "./components/BoardHeader";
import { BoardControlBar } from "./components/BoardControlBar";
import { AddColumnGhost } from "./components/AddColumnGhost";
import { LaneFocusView } from "./components/LaneFocusView";
import { ScrollToEndChevron } from "./components/ScrollToEndChevron";
import { ShareBoardModal } from "./components/ShareBoardModal";
import { CreateBoardDrawer } from "./components/CreateBoardDrawer";
import { useAuth } from "@/features/auth/useAuth";
import { readErrorStatus } from "@/lib/api";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { Toast } from "./components/Toast";
import { BoardSkeleton } from "./components/BoardSkeleton";
import { BoardErrorState, type BoardErrorReason } from "./components/BoardErrorState";

export interface BoardViewProps {
  boardId: string;
}

type ActiveDrag =
  | { type: "task"; id: string; task: Task }
  | { type: "column"; id: string; column: ColumnT }
  | null;

type LayoutTier = "compact" | "tablet" | "desktop";

/**
 * Top-level board view. Owns the dnd-kit `DndContext`, the snapshot
 * ref, the in-flight set, and the toast. The two move mutations are
 * called from `onDragEnd`; the live cross-column preview is applied
 * through `onDragOver` so the user sees the card land in the target
 * column before they release the pointer.
 *
 * The visual shell (sidebar / top bar / sub-header / columns /
 * add-column ghost) is composed from the Stitch-style components
 * in `./components/`. The dnd-kit handlers and the snapshot /
 * optimistic-update contract are unchanged from Phase 4.
 *
 * Phase 5 Step 1 adds a tiered responsive layout:
 *   - `compact` (< 640px) — sidebar collapsed to a hamburger
 *     drawer, board is a single-column "lane focus" view, no
 *     drag-and-drop.
 *   - `tablet` (640–1023px) — sidebar collapsed by default to a
 *     hamburger drawer (320px wide when opened), horizontal-
 *     scrolling board, pointer-only drag-and-drop.
 *   - `desktop` (≥ 1024px) — full sidebar (icon + label), can be
 *     collapsed to icons-only via the header chevron, full
 *     pointer + keyboard drag-and-drop.
 */
export default function BoardView({ boardId }: BoardViewProps) {
  const qc = useQueryClient();
  const { data: board, isLoading, error, refetch } = useBoardQuery(boardId);
  const snapshotRef = useRef<BoardDetail | null>(null);
  const moveTask = useMoveTaskMutation(boardId, snapshotRef);
  const moveColumn = useMoveColumnMutation(boardId, snapshotRef);
  const createTask = useCreateTaskMutation(boardId);

  // Phase 5 Step 1: tier detection via two media queries. The
  // canonical breakpoints match Tailwind v4 defaults (sm = 640px,
  // md = 1024px). The hook returns `false` until the first client
  // effect, so the first render shows the compact layout — this
  // matches the SSR default and avoids a hydration mismatch.
  const isTablet = useMediaQuery("(min-width: 640px)");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const tier: LayoutTier = isDesktop
    ? "desktop"
    : isTablet
      ? "tablet"
      : "compact";
  const isCompact = tier === "compact";
  const isDesktopTier = tier === "desktop";

  // Ref to the kanban scroll container — used by ScrollToEndChevron
  // for the smooth scroll-by-column-width click.
  const boardScrollRef = useRef<HTMLDivElement | null>(null);

  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(() => new Set());
  // Phase 5 Step 3: toast shape upgraded from `string | null` to
  // `{ message, variant } | null` so the new `<Toast />` component
  // can render the right accent + icon. All current call sites
  // surface failure messages, so they pass `variant: "error"`.
  const [toast, setToast] = useState<
    { message: string; variant: "info" | "error" | "success" } | null
  >(null);

  // Phase 5: Stitch-faithful share modal + create-board drawer are
  // owned by the board view so the control bar's "New Board" and
  // "Manage Access" buttons can toggle them. They are local state
  // only — the underlying `POST /api/boards/:id/members`,
  // `DELETE /api/boards/:id/members/:userId`, and `POST /api/boards`
  // endpoints are not yet wired; the modal renders the data it has
  // and the drawer is a no-op until those land.
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [createBoardOpen, setCreateBoardOpen] = useState(false);

  // Phase 5 Step 1: sidebar visibility. On compact/tablet the
  // drawer is closed by default; on desktop the visible sidebar
  // is shown expanded by default. The desktop user can collapse
  // the visible sidebar to icons-only via the header chevron.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { userId, userEmail, clearToken } = useAuth();

  // Sensors: keyboard only on desktop (compact disables the entire
  // dnd-kit context; tablet uses the pointer sensor only). The
  // sensor array is conditional, but `useSensor` is always called
  // once so the hooks order stays stable — the KeyboardSensor
  // instance is just no-op'd out on tablet.
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 6 },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(
    pointerSensor,
    ...(isDesktopTier ? [keyboardSensor] : []),
  );

  // ----- dnd-kit handlers (unchanged from Phase 4) --------------------

  function handleDragStart(event: DragStartEvent) {
    if (!board || isCompact) return;
    // Capture the pre-drag board so the mutations can roll back on
    // failure. This is preferred over the TanStack `previous`
    // snapshot — `onMutate` runs after `onDragOver` may have already
    // mutated the cache, so the dnd-kit snapshot is the only "true"
    // pre-drag value.
    snapshotRef.current = snapshotBoard(board);

    const id = String(event.active.id);
    const type = (event.active.data.current?.type as
      | "task"
      | "column"
      | undefined) ?? null;

    if (type === "column") {
      const column = board.columns.find((c) => c.id === id) ?? null;
      setActiveDrag(column ? { type: "column", id, column } : null);
    } else if (type === "task") {
      const column = findColumnOfTask(board, id);
      const task = column?.tasks.find((t) => t.id === id) ?? null;
      setActiveDrag(task ? { type: "task", id, task } : null);
    } else {
      setActiveDrag(null);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    if (isCompact) return;
    const { active, over } = event;
    if (!over || !board) return;

    const activeType = active.data.current?.type as
      | "task"
      | "column"
      | undefined;
    const overType = over.data.current?.type as "task" | "column" | undefined;
    if (activeType !== "task" || !overType) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Use the live (possibly already-mutated) cache so multiple
    // `onDragOver` ticks compose correctly.
    const live =
      qc.getQueryData<BoardDetail>(boardQueryKey(boardId)) ?? board;
    const sourceColumn = findColumnOfTask(live, activeId);
    if (!sourceColumn) return;

    let toColumnId: string;
    let toIndex: number;

    if (overType === "task") {
      const overColumn = findColumnOfTask(live, overId);
      if (!overColumn) return;
      toColumnId = overColumn.id;
      const overIdx = overColumn.tasks.findIndex((t) => t.id === overId);
      toIndex = overIdx < 0 ? overColumn.tasks.length : overIdx;
    } else {
      // Dropped on a column (e.g. its empty body). Land at the end.
      toColumnId = overId;
      const targetColumn = live.columns.find((c) => c.id === toColumnId);
      toIndex = targetColumn?.tasks.length ?? 0;
    }

    const fromIndex = sourceColumn.tasks.findIndex((t) => t.id === activeId);
    // No-op: same position, same column.
    if (sourceColumn.id === toColumnId && fromIndex === toIndex) return;

    const next = moveTaskWithinBoard(live, activeId, toColumnId, toIndex);
    qc.setQueryData(boardQueryKey(boardId), next);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (isCompact) {
      setActiveDrag(null);
      return;
    }
    const { active, over } = event;
    setActiveDrag(null);

    if (!over || !board) {
      // Dropped outside any droppable — restore the pre-drag state.
      const snap = snapshotRef.current;
      snapshotRef.current = null;
      if (snap) qc.setQueryData(boardQueryKey(boardId), snap);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeType = active.data.current?.type as
      | "task"
      | "column"
      | undefined;
    const overType = over.data.current?.type as "task" | "column" | undefined;

    // Read the post-`onDragOver` cache so we use the same destination
    // the user has been previewing.
    const live =
      qc.getQueryData<BoardDetail>(boardQueryKey(boardId)) ?? board;

    if (activeType === "column" && overType === "column" && activeId !== overId) {
      const fromIndex = live.columns.findIndex((c) => c.id === activeId);
      const toIndex = live.columns.findIndex((c) => c.id === overId);
      snapshotRef.current = null;
      if (fromIndex < 0 || toIndex < 0) return;

      setInFlightIds((s) => {
        const n = new Set(s);
        n.add(activeId);
        return n;
      });

      moveColumn.mutate(
        { columnId: activeId, toIndex },
        {
          onError: () => {
            setToast({
              message: "Couldn't reorder column — restored previous state.",
              variant: "error",
            });
          },
          onSettled: () => {
            setInFlightIds((s) => {
              const n = new Set(s);
              n.delete(activeId);
              return n;
            });
          },
        },
      );
      return;
    }

    if (activeType === "task") {
      const sourceColumn = findColumnOfTask(live, activeId);
      if (!sourceColumn) {
        snapshotRef.current = null;
        return;
      }

      let toColumnId: string;
      let toIndex: number;

      if (overType === "task") {
        const overColumn = findColumnOfTask(live, overId);
        if (!overColumn) {
          snapshotRef.current = null;
          return;
        }
        toColumnId = overColumn.id;
        const overIdx = overColumn.tasks.findIndex((t) => t.id === overId);
        toIndex = overIdx < 0 ? overColumn.tasks.length : overIdx;
      } else if (overType === "column") {
        toColumnId = overId;
        const targetColumn = live.columns.find((c) => c.id === toColumnId);
        toIndex = targetColumn?.tasks.length ?? 0;
      } else {
        snapshotRef.current = null;
        return;
      }

      const fromIndex = sourceColumn.tasks.findIndex((t) => t.id === activeId);
      if (sourceColumn.id === toColumnId && fromIndex === toIndex) {
        snapshotRef.current = null;
        return;
      }

      setInFlightIds((s) => {
        const n = new Set(s);
        n.add(activeId);
        return n;
      });

      moveTask.mutate(
        {
          taskId: activeId,
          sourceColumnId: sourceColumn.id,
          toColumnId,
          toIndex,
        },
        {
          onError: () => {
            setToast({
              message: "Couldn't move task — restored previous state.",
              variant: "error",
            });
          },
          onSettled: () => {
            setInFlightIds((s) => {
              const n = new Set(s);
              n.delete(activeId);
              return n;
            });
          },
        },
      );
      snapshotRef.current = null;
      return;
    }

    // Unhandled shape — clear the snapshot and let the cache settle.
    snapshotRef.current = null;
  }

  function handleDragCancel() {
    setActiveDrag(null);
    const snap = snapshotRef.current;
    snapshotRef.current = null;
    if (snap) qc.setQueryData(boardQueryKey(boardId), snap);
  }

  // ----- render states -------------------------------------------------

  // Phase 5 Step 4: downcast the `useBoardQuery` error to a
  // discriminated reason. The `BoardErrorState` component handles
  // the per-status copy + button(s) so this view stays thin.
  const errorReason = useBoardErrorReason(error);

  // Sign-out handler for the `auth` error branch. The board view
  // owns the router; `clearToken` lives on `AuthContext`. The
  // handler is created unconditionally (no hook inside) so the
  // callback identity stays stable across renders and the
  // `BoardErrorState`'s "Sign in again" button is wired the moment
  // the 401 is detected.
  const router = useRouter();
  function handleSignOut() {
    clearToken();
    router.replace("/");
  }

  // ----- chrome --------------------------------------------------------
  //
  // The sidebar, header, and control bar are part of the layout
  // chrome — they stay mounted across the loading, error, and
  // ready states so the user never sees a layout shift between
  // data fetch and the real board. The `<main>` slot is the only
  // thing that swaps (skeleton / error / board).

  // Show the hamburger on compact / tablet; show the chevron on
  // desktop. They are mutually exclusive.
  const showSidebarToggle = !isDesktopTier;
  const showCollapseToggle = isDesktopTier;

  // The kanban area's left padding tracks the visible sidebar:
  //   - On compact / tablet: no padding (the sidebar is a drawer).
  //   - On desktop expanded: pl-sidebar-expanded.
  //   - On desktop collapsed: pl-sidebar-collapsed.
  const mainLeftClass = isDesktopTier
    ? sidebarCollapsed
      ? "pl-sidebar-collapsed"
      : "pl-sidebar-expanded"
    : "";

  // Phase 5 Step 4: if the board is still loading, render the
  // chrome with a skeleton in place of the columns. The skeleton
  // matches the real board's column widths so the layout doesn't
  // shift when the data lands.
  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface">
        {isDesktopTier ? (
          <Sidebar collapsed={sidebarCollapsed} />
        ) : null}
        {!isDesktopTier ? (
          <SidebarOverlay
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            tier={tier === "compact" ? "compact" : "tablet"}
          />
        ) : null}
        <div
          className={[
            mainLeftClass,
            "transition-[padding-left] duration-(--duration-slow) ease-standard",
          ].join(" ")}
        >
          <BoardHeader
            boardId={boardId}
            showSidebarToggle={showSidebarToggle}
            showCollapseToggle={showCollapseToggle}
            sidebarCollapsed={isDesktopTier ? sidebarCollapsed : false}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onToggleSidebarCollapse={() => setSidebarCollapsed((v) => !v)}
          />
          <main className="pt-16 min-h-screen flex flex-col">
            <BoardControlBar
              onCreateTask={() => undefined}
              canCreateTask={false}
              onOpenShareModal={() => undefined}
              onOpenCreateBoard={() => undefined}
            />
            <BoardSkeleton tier={tier} />
          </main>
        </div>
      </div>
    );
  }

  // Phase 5 Step 4: per-status error surface (network / 401 / 403 /
  // 404 / other). Render the chrome so the user keeps the header,
  // sidebar, and control bar; the error card sits in the same
  // `<main>` slot the real board would.
  if (error || !board) {
    return (
      <div className="min-h-screen bg-surface">
        {isDesktopTier ? (
          <Sidebar collapsed={sidebarCollapsed} />
        ) : null}
        {!isDesktopTier ? (
          <SidebarOverlay
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            tier={tier === "compact" ? "compact" : "tablet"}
          />
        ) : null}
        <div
          className={[
            mainLeftClass,
            "transition-[padding-left] duration-(--duration-slow) ease-standard",
          ].join(" ")}
        >
          <BoardHeader
            boardId={boardId}
            showSidebarToggle={showSidebarToggle}
            showCollapseToggle={showCollapseToggle}
            sidebarCollapsed={isDesktopTier ? sidebarCollapsed : false}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onToggleSidebarCollapse={() => setSidebarCollapsed((v) => !v)}
          />
          <main className="pt-16 min-h-screen flex flex-col">
            <BoardControlBar
              onCreateTask={() => undefined}
              canCreateTask={false}
              onOpenShareModal={() => undefined}
              onOpenCreateBoard={() => undefined}
            />
            <BoardErrorState
              reason={errorReason}
              onRetry={() => {
                refetch();
              }}
              onSignOut={handleSignOut}
            />
          </main>
        </div>
      </div>
    );
  }

  const columnIds = board.columns.map((c) => c.id);
  const isAnyDragging = activeDrag !== null;
  const canCreateTask = board.columns.length > 0;
  const firstColumnId = board.columns[0]?.id ?? null;

  // Status token rotation — same as Phase 4.
  const statusTokens = [
    "tertiary",
    "secondary",
    "primary",
    "outline",
  ] as const;

  function handleNewTask({ title }: { title: string }) {
    if (!firstColumnId) {
      setToast({
        message: "Create a column before adding tasks.",
        variant: "error",
      });
      return;
    }
    createTask.mutate(
      { columnId: firstColumnId, title },
      {
        onError: () => {
          setToast({
            message: "Couldn't create task — please retry.",
            variant: "error",
          });
        },
      },
    );
  }

  // The kanban area's left padding tracks the visible sidebar:
  //   - On compact / tablet: no padding (the sidebar is a drawer).
  //   - On desktop expanded: pl-sidebar-expanded.
  //   - On desktop collapsed: pl-sidebar-collapsed.
  // (These are computed once at the top of the render so the
  //  loading / error / ready states can all reuse them.)

  return (
    <div className="min-h-screen bg-surface">
      {/* Desktop sidebar — visible by default. Hidden on compact /
       * tablet (where SidebarOverlay is used instead). */}
      {isDesktopTier ? (
        <Sidebar collapsed={sidebarCollapsed} />
      ) : null}

      {/* Compact / tablet slide-in sidebar drawer. */}
      {!isDesktopTier ? (
        <SidebarOverlay
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          tier={tier === "compact" ? "compact" : "tablet"}
        />
      ) : null}

      <div
        className={[
          mainLeftClass,
          "transition-[padding-left] duration-(--duration-slow) ease-standard",
        ].join(" ")}
      >
        <BoardHeader
          boardId={boardId}
          showSidebarToggle={showSidebarToggle}
          showCollapseToggle={showCollapseToggle}
          sidebarCollapsed={isDesktopTier ? sidebarCollapsed : false}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onToggleSidebarCollapse={() => setSidebarCollapsed((v) => !v)}
        />

        <main className="pt-16 min-h-screen flex flex-col">
          <BoardControlBar
            onCreateTask={handleNewTask}
            canCreateTask={canCreateTask}
            onOpenShareModal={() => setShareModalOpen(true)}
            onOpenCreateBoard={() => setCreateBoardOpen(true)}
          />

          {/* Compact tier: single-column "lane focus" view, no
           * dnd-kit context. */}
          {isCompact ? (
            <LaneFocusView
              boardId={boardId}
              board={board}
              statusTokens={statusTokens}
              inFlightIds={inFlightIds}
              isAnyDragging={isAnyDragging}
              onQuickAddError={(msg) =>
                setToast({ message: msg, variant: "error" })
              }
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div
                ref={boardScrollRef}
                className="flex-1 overflow-x-auto kanban-scroll px-space-xl py-space-lg select-none"
              >
                <div className="flex items-start gap-gutter-board min-w-max pb-space-3xl">
                  {board.columns.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-outline/30 px-space-xl py-space-3xl text-center">
                      <p className="font-headline-sm text-headline-sm text-on-surface-variant">
                        No columns yet
                      </p>
                      <p className="mt-space-xs font-body-md text-body-md text-outline">
                        Create one via
                        <code className="mx-1 px-1 py-0.5 rounded bg-surface-container-high text-on-surface font-label-mono-md text-label-mono-md">
                          POST /api/boards/:id/columns
                        </code>
                        .
                      </p>
                      <Link
                        href="/"
                        className="mt-space-md inline-block font-label-ui-sm text-label-ui-sm text-primary hover:text-primary-fixed underline underline-offset-4"
                      >
                        Back home
                      </Link>
                    </div>
                  ) : (
                    <SortableContext
                      items={columnIds}
                      strategy={horizontalListSortingStrategy}
                    >
                      {board.columns.map((column, columnIndex) => {
                        const statusToken =
                          statusTokens[columnIndex % statusTokens.length];
                        return (
                          <Column
                            key={column.id}
                            boardId={boardId}
                            column={column}
                            inFlightIds={inFlightIds}
                            isAnyDragging={isAnyDragging}
                            statusToken={statusToken}
                            onQuickAddError={(msg) =>
                              setToast({ message: msg, variant: "error" })
                            }
                          />
                        );
                      })}
                    </SortableContext>
                  )}

                  {board.columns.length > 0 ? (
                    <AddColumnGhost
                      onClick={() =>
                        setToast({
                          message: "Add column flow lands in Phase 5.",
                          variant: "info",
                        })
                      }
                    />
                  ) : null}
                </div>
              </div>

              <DragOverlay>
                {activeDrag?.type === "task" ? (
                  <TaskCard task={activeDrag.task} inFlight={false} />
                ) : activeDrag?.type === "column" ? (
                  <div className="w-column-width-min md:w-column-width-max rounded-xl bg-surface-container-lowest shadow-2xl p-space-sm">
                    <h3 className="font-headline-sm text-headline-sm text-on-surface px-space-xs">
                      {activeDrag.column.title}
                    </h3>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </main>
      </div>

      {/* Scroll-to-end chevron (tablet / desktop). Lives at the
       * bottom of the JSX tree so its `fixed` positioning
       * stacks above the kanban surface. */}
      {!isCompact ? (
        <ScrollToEndChevron scrollRef={boardScrollRef} />
      ) : null}

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      {/* ---- Share modal + create-board drawer (Phase 5) ----
       *
       * Both overlays are rendered at the board root so the body
       * scroll-lock and Esc-to-close handlers they own never need
       * to be re-implemented. The drawer's slide-in motion and
       * the modal's fade+zoom-in motion are both Tailwind
       * animate-in utilities from the kinetic-grid token set. */}
      {board ? (
        <ShareBoardModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          boardTitle={board.title}
          members={board.members}
          currentUserId={userId}
          onSendInvite={() =>
            setToast({
              message:
                "Invite endpoint lands in Phase 5 — collaboration is read-only this pass.",
              variant: "info",
            })
          }
        />
      ) : null}

      <CreateBoardDrawer
        open={createBoardOpen}
        onClose={() => setCreateBoardOpen(false)}
        leadEmail={userEmail}
        onCreate={() =>
          setToast({
            message:
              "Create-board endpoint lands in Phase 5 — new boards are not yet persisted.",
            variant: "info",
          })
        }
      />
    </div>
  );
}

/**
 * Downcast a `useBoardQuery` error to a `BoardErrorReason`.
 *
 *   - 401 → `auth` (session expired; the error state routes the
 *     user to `/` via `clearToken`).
 *   - 403 → `forbidden` (no access; the error state links home).
 *   - 404 → `not_found` (deleted board; the error state links home).
 *   - any other HTTP status, or a transport / unknown error →
 *     `unknown` with the original message (if we can read one).
 *   - no error at all → `unknown` with no message (the caller
 *     shouldn't hit this branch in practice, but the type is
 *     `BoardErrorReason` and the empty case is harmless).
 */
function useBoardErrorReason(error: unknown): BoardErrorReason {
  // Read once, with a memo — the error reference is stable across
  // re-renders unless the query state itself changes, so this
  // doesn't add meaningful overhead.
  const status = readErrorStatus(error);
  if (status === null) {
    // No HTTP response was received (network drop, DNS failure,
    // client-side throw). Treat as a network error.
    return error ? { kind: "network" } : { kind: "unknown" };
  }
  if (status === 401) return { kind: "auth" };
  if (status === 403) return { kind: "forbidden" };
  if (status === 404) return { kind: "not_found" };
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : undefined;
  return { kind: "unknown", message };
}
