"use client";

import { useEffect, useRef, useState } from "react";
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
import { useCreateColumnMutation } from "./useCreateColumnMutation";
import { useUpdateTaskMutation } from "./useUpdateTaskMutation";
import { useDeleteTaskMutation } from "./useDeleteTaskMutation";
import { useCreateBoardMutation } from "./useCreateBoardMutation";
import { useInviteMemberMutation } from "./useInviteMemberMutation";
import { useRemoveMemberMutation } from "./useRemoveMemberMutation";
import { useUpdateBoardMutation } from "./useUpdateBoardMutation";
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
import { TaskModal } from "./components/TaskModal";
import { QuickAddTaskModal } from "./components/QuickAddTaskModal";
import { KeyboardShortcutsHelp } from "./components/KeyboardShortcutsHelp";
import { InvitationsInbox } from "@/features/invitations/components/InvitationsInbox";
import { useAuth } from "@/features/auth/useAuth";
import { readErrorStatus } from "@/lib/api";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { Toast } from "./components/Toast";
import { BoardSkeleton } from "./components/BoardSkeleton";
import { BoardErrorState, type BoardErrorReason } from "./components/BoardErrorState";
import { useOverlayState } from "./overlays/useOverlayState";

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
  const createColumn = useCreateColumnMutation(boardId);
  // Phase 5 Step 5: the new mutations backing the TaskModal
  // (title autosave, star, trash) and the ShareBoardModal
  // (invite, remove, link-sharing toggle) and the
  // CreateBoardDrawer (new board with widened body).
  const updateTask = useUpdateTaskMutation(boardId);
  const deleteTaskMutation = useDeleteTaskMutation(boardId);
  const createBoard = useCreateBoardMutation();
  const inviteMember = useInviteMemberMutation(boardId);
  const removeMember = useRemoveMemberMutation(boardId);
  const updateBoardMutation = useUpdateBoardMutation(boardId);

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
  // Phase 5 Step 5: optional `action` button (used by the trash
  // "Undo" toast).
  const [toast, setToast] = useState<
    | {
        message: string;
        variant: "info" | "error" | "success";
        action?: { label: string; onClick: () => void };
      }
    | null
  >(null);

  // Phase 5 Step 5: lifted overlay state (Plan §5.4) owns the
  // share modal's open flag, the create-board drawer's open flag,
  // and the `TaskModal`'s selected task id. The home page's
  // `<EmptyBoardsState />` writes to the same `createBoardOpen`
  // flag through the same context, so a logged-in user without
  // boards and a logged-in user on a board can both open the
  // drawer without prop-drilling.
  //
  // Phase 5 Step 9a: the same context also owns
  // `invitationsInboxOpen` (Plan §9a) so the bell button in
  // `<BoardHeader />` and the home page's `<EmptyBoardsState />`
  // share the inbox open flag without prop-drilling. The
  // `InvitationsInbox`'s accept callback also navigates to the
  // newly-joined board, which is why the router lives here rather
  // than inside the inbox itself.
  const overlay = useOverlayState();
  const {
    createBoardOpen,
    selectedTaskId,
    selectedTaskBoardId,
    invitationsInboxOpen,
    closeCreateBoard,
    openTask,
    closeTask,
    closeInvitationsInbox,
  } = overlay;

  // Phase 5 Step 1: sidebar visibility. On compact/tablet the
  // drawer is closed by default; on desktop the visible sidebar
  // is shown expanded by default. The desktop user can collapse
  // the visible sidebar to icons-only via the header chevron.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Phase 5 Step 5: the share modal's open flag stays local to
  // the board view (it's only ever opened from the control bar on
  // a board — never from the home page), but the create-board
  // drawer's open flag + the task modal's selected task live in
  // the lifted `useOverlayState` context (Plan §5.4) so the home
  // page's empty state can open the same drawer.
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Phase 5 Step 6: keyboard-shortcut open flags. The `c` /
  // `b` / `m` / `?` shortcuts all open overlays; the underlying
  // state stays local to the board view because none of these
  // surfaces are opened from the home page (the `c` shortcut is
  // a board-level affordance). Per Plan §6 the base shortcut
  // (`c`) is the only required piece — `b` and `m` are
  // explicitly stretch goals and ship together with the base.
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);

  const { userId, userEmail, signOut } = useAuth();

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

  // ----- keyboard shortcuts (Phase 5 Step 6) -------------------------
  //
  // The board view subscribes to `keydown` while the board is
  // mounted and reacts to:
  //   - `c` → opens the centered `<QuickAddTaskModal />` (REQ-5.1.41).
  //   - `b` → opens the `<CreateBoardDrawer />` (REQ-5.1.44 stretch).
  //   - `m` → opens the `<ShareBoardModal />` (REQ-5.1.44 stretch).
  //   - `?` → opens the `<KeyboardShortcutsHelp />` modal
  //           (REQ-5.1.43).
  //
  // Per REQ-5.1.42, the handler short-circuits if the active
  // element is an `<input>`, `<textarea>`, or
  // `[contenteditable]` so the user can still type `c` in a
  // task title. The handler also short-circuits if a modal is
  // already open (only the help shortcut is allowed to layer on
  // top of an existing overlay) and if the user is holding a
  // modifier key (Cmd/Ctrl/Alt) so the shortcuts don't fight
  // with browser-level hotkeys.
  //
  // The subscription is on the `document` so the user can
  // press the keys from anywhere on the board, not just when
  // the kanban canvas has focus. The handler is a no-op when
  // the board is still loading or in an error state — there's
  // nothing to add a task to without a cached `board` shape.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire on Cmd/Ctrl/Alt — those belong to the browser
      // and the OS. `?` requires Shift on most keyboards, so we
      // allow Shift and check it per-shortcut below.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Don't fire while a text-entry field is focused.
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      // Only `?` (the help shortcut) is allowed to layer on top
      // of an already-open overlay. All others short-circuit if
      // any overlay is open so the user can't, e.g., open a
      // second quick-add modal on top of an existing one.
      const anyOverlayOpen =
        quickAddOpen ||
        shortcutsHelpOpen ||
        shareModalOpen ||
        createBoardOpen ||
        selectedTaskId !== null;
      const isHelp = e.key === "?";
      if (anyOverlayOpen && !isHelp) return;
      // The `?` shortcut also fires when the user presses
      // Shift+`/` (most keyboards) — handle both forms.
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShortcutsHelpOpen(true);
        return;
      }
      // The `c` / `b` / `m` shortcuts are bare letters. If the
      // user is holding Shift, the keypress is something else
      // (e.g. Shift+c = `C` in a search box) and we should not
      // open an overlay.
      if (e.shiftKey) return;
      switch (e.key) {
        case "c":
          if (!board) return;
          e.preventDefault();
          setQuickAddOpen(true);
          return;
        case "b":
          e.preventDefault();
          overlay.openCreateBoard();
          return;
        case "m":
          e.preventDefault();
          setShareModalOpen(true);
          return;
        default:
          return;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    board,
    quickAddOpen,
    shortcutsHelpOpen,
    shareModalOpen,
    createBoardOpen,
    selectedTaskId,
    overlay,
  ]);

  // ----- render states -------------------------------------------------

  // Phase 5 Step 4: downcast the `useBoardQuery` error to a
  // discriminated reason. The `BoardErrorState` component handles
  // the per-status copy + button(s) so this view stays thin.
  const errorReason = useBoardErrorReason(error);

  // Sign-out handler for the `auth` error branch. The board view
  // owns the router; `signOut` lives on `AuthContext` and clears
  // the httpOnly `token` cookie via `POST /api/auth/logout`. The
  // handler is created unconditionally (no hook inside) so the
  // callback identity stays stable across renders and the
  // `BoardErrorState`'s "Sign in again" button is wired the moment
  // the 401 is detected.
  const router = useRouter();
  async function handleSignOut() {
    await signOut();
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

  // Add a new column. Called by the desktop/tablet `AddColumnGhost`
  // and by the compact tier's empty-state ghost. The mutation
  // optimistically appends a placeholder column; on success the
  // cache is swapped for the server-authoritative row.
  function handleNewColumn({ title }: { title: string }) {
    createColumn.mutate(
      { title },
      {
        onError: () => {
          setToast({
            message: "Couldn't create column — please retry.",
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
            onOpenCreateBoard={() => overlay.openCreateBoard()}
            onOpenShortcutsHelp={() => setShortcutsHelpOpen(true)}
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
              onSelectTask={(taskId) => openTask(boardId, taskId)}
              onCreateColumn={handleNewColumn}
              createColumnInFlight={createColumn.isPending}
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
                    <div className="flex flex-col items-center gap-space-lg">
                      <p className="font-headline-sm text-headline-sm text-on-surface-variant text-center">
                        No columns yet
                      </p>
                      <p className="font-body-md text-body-md text-outline text-center max-w-sm">
                        Use the tile below to add your first column. Each
                        column becomes a workflow status on this board.
                      </p>
                      <AddColumnGhost
                        onCreate={handleNewColumn}
                        inFlight={createColumn.isPending}
                      />
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
                            onSelectTask={(taskId) => openTask(boardId, taskId)}
                          />
                        );
                      })}
                    </SortableContext>
                  )}

                  {board.columns.length > 0 ? (
                    <AddColumnGhost
                      onCreate={handleNewColumn}
                      inFlight={createColumn.isPending}
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
          {...(toast.action ? { action: toast.action } : {})}
          // The trash "Undo" toast needs a 5-second window to
          // match Plan §5.1; every other toast keeps the default
          // 4-second auto-dismiss.
          autoDismissMs={toast.action ? 5000 : 4000}
        />
      ) : null}

      {/* ---- Share modal + create-board drawer + TaskModal
       *      (Phase 5 Step 5) ----
       *
       * All three overlays are rendered at the board root so the
       * body scroll-lock and Esc-to-close handlers they own never
       * need to be re-implemented. The share modal's open flag
       * stays local; the create-board drawer's open flag and the
       * `TaskModal`'s selected task live in the lifted
       * `useOverlayState` context (Plan §5.4) so the home page's
       * `<EmptyBoardsState />` can open the same drawer. */}
      {board ? (
        <ShareBoardModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          boardTitle={board.title}
          members={board.members}
          currentUserId={userId}
          onSendInvite={({ email, role }) => {
            inviteMember.mutate(
              { email, role: role === "Admin" ? "ADMIN" : "MEMBER" },
              {
                onError: () => {
                  setToast({
                    message: "Couldn't send invite — please retry.",
                    variant: "error",
                  });
                },
                onSuccess: () => {
                  setToast({
                    message: `Invite sent to ${email}.`,
                    variant: "success",
                  });
                },
              },
            );
          }}
          onRemoveMember={({ userId: targetUserId }) => {
            // Pending-invitation rows have a `userId` like
            // `pending-<email>`. The server endpoint expects a
            // real UUID; for now we surface a "Step 10" toast
            // for those and only call the real endpoint for
            // real member rows.
            if (targetUserId.startsWith("pending-")) {
              setToast({
                message:
                  "Revoking a pending invite ships in Phase 5 Step 10.",
                variant: "info",
              });
              return;
            }
            removeMember.mutate(
              { userId: targetUserId },
              {
                onError: () => {
                  setToast({
                    message: "Couldn't remove member — please retry.",
                    variant: "error",
                  });
                },
              },
            );
          }}
          onLinkSharingChange={(enabled) => {
            updateBoardMutation.mutate(
              { patch: { linkSharing: enabled ? "VIEW" : "DISABLED" } },
              {
                onError: () => {
                  setToast({
                    message: "Couldn't update share settings — please retry.",
                    variant: "error",
                  });
                },
                onSuccess: () => {
                  setToast({
                    message: enabled
                      ? "Public link sharing is on."
                      : "Public link sharing is off.",
                    variant: "success",
                  });
                },
              },
            );
          }}
        />
      ) : null}

      <CreateBoardDrawer
        open={createBoardOpen}
        onClose={closeCreateBoard}
        leadEmail={userEmail}
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

      {/* Phase 5 Step 5 — TaskModal. Looked up from the cache (no
       * separate fetch). The modal is fed a `Task` from the
       * current `board` shape; when a `board` is in the cache
       * AND a task id is selected, the modal renders. The
       * modal's own `useEffect` keys handle the close + body
       * scroll-lock. */}
      {board && selectedTaskId
        ? renderTaskModal({
            board,
            taskId: selectedTaskId,
            expectedBoardId: selectedTaskBoardId ?? boardId,
            onClose: closeTask,
            onUpdateTask: ({ taskId, columnId, patch }) =>
              updateTask.mutate({ taskId, columnId, patch }),
            onDeleteTask: (task) => {
              // Capture the pre-delete task so the toast can
              // re-create it via `useCreateTaskMutation` within
              // the 5-second undo window.
              const snapshot = task;
              deleteTaskMutation.mutate(
                { taskId: task.id, columnId: task.columnId },
                {
                  onSuccess: () => {
                    closeTask();
                    setToast({
                      message: `Task "${snapshot.title}" deleted.`,
                      variant: "info",
                      action: {
                        label: "Undo",
                        // Phase 5 Plan §5.1 — the Undo re-creates
                        // the task via the existing
                        // `useCreateTaskMutation` (Phase 5 Step 2).
                        // We extend the toast's auto-dismiss to 5s
                        // so the Undo button stays active for the
                        // full window. After the toast dismisses
                        // the button is gone (the simple Undo
                        // pattern from the plan, not a true
                        // soft-delete with history).
                        onClick: () => {
                          createTask.mutate(
                            {
                              columnId: snapshot.columnId,
                              title: snapshot.title,
                            },
                            {
                              onSuccess: () => {
                                setToast({
                                  message: `Task "${snapshot.title}" restored.`,
                                  variant: "success",
                                });
                              },
                              onError: () => {
                                setToast({
                                  message: "Couldn't restore task.",
                                  variant: "error",
                                });
                              },
                            },
                          );
                        },
                      },
                    });
                    // 5-second Undo window — see the comment in
                    // `action.onClick`. The 4s default toast
                    // dismiss would close the Undo too early.
                    // The Toast's `autoDismissMs` is set to 5000
                    // by the parent (see the JSX below).
                  },
                  onError: () => {
                    setToast({
                      message: "Couldn't delete task — please retry.",
                      variant: "error",
                    });
                  },
                },
              );
            },
            onStep10SurfaceAttempt: (surface) => {
              setToast({
                message: `${surface} support ships in Phase 5 Step 10.`,
                variant: "info",
              });
            },
          })
        : null}

      {/* Phase 5 Step 6 — Quick-add keyboard shortcut modal
       * (REQ-5.1.41). Opens on the `c` keypress from
       * `BoardView`'s keydown handler. Renders only when the
       * board is loaded so the column list is non-empty. */}
      {board ? (
        <QuickAddTaskModal
          open={quickAddOpen}
          onClose={() => setQuickAddOpen(false)}
          columns={board.columns.map((c) => ({
            id: c.id,
            title: c.title,
          }))}
          inFlight={createTask.isPending}
          onCreate={({ columnId, title }) => {
            createTask.mutate(
              { columnId, title },
              {
                onError: () => {
                  setToast({
                    message: "Couldn't create task — please retry.",
                    variant: "error",
                  });
                },
              },
            );
          }}
        />
      ) : null}

      {/* Phase 5 Step 6 — Keyboard shortcuts help modal
       * (REQ-5.1.43). Opens on the `?` keypress or via the
       * "?" button in the control bar. Static list; no
       * additional state. */}
      <KeyboardShortcutsHelp
        open={shortcutsHelpOpen}
        onClose={() => setShortcutsHelpOpen(false)}
      />

      {/* Phase 5 Step 9a — Invitations inbox. Opened by the bell
       * button in `<BoardHeader />`. The accept callback closes
       * the inbox and navigates to the newly-joined board; the
       * decline path leaves the user where they are. Errors
       * surface through the same `toast` state the rest of the
       * board uses. */}
      <InvitationsInbox
        open={invitationsInboxOpen}
        onClose={closeInvitationsInbox}
        onAccepted={(boardId) => {
          closeInvitationsInbox();
          router.push(`/boards/${boardId}`);
        }}
        onError={(msg) => setToast({ message: msg, variant: "error" })}
      />
    </div>
  );
}

/**
 * Tiny adapter that looks the selected task up in the cached
 * `board` and renders the `TaskModal` with the right props. Lives
 * as a `useMemo`-cached helper at the bottom of the file so
 * `BoardView`'s render tree stays readable. The `expectedBoardId`
 * check prevents a stale `selectedTaskId` from a different board
 * (e.g. after a navigation) from rendering against the wrong
 * `board`'s cache.
 */
function renderTaskModal(args: {
  board: BoardDetail;
  taskId: string;
  expectedBoardId: string;
  onClose: () => void;
  onUpdateTask: (a: {
    taskId: string;
    columnId: string;
    patch: { title?: string; description?: string | null };
  }) => void;
  onDeleteTask: (task: Task) => void;
  onStep10SurfaceAttempt: (surface: string) => void;
}): React.ReactNode {
  const { board, taskId, expectedBoardId, onClose, onUpdateTask, onDeleteTask, onStep10SurfaceAttempt } = args;
  if (board.id !== expectedBoardId) return null;
  // Find the task + its column.
  let foundTask: Task | null = null;
  let foundColumn: ColumnT | null = null;
  for (const col of board.columns) {
    const t = col.tasks.find((x) => x.id === taskId);
    if (t) {
      foundTask = t;
      foundColumn = col;
      break;
    }
  }
  if (!foundTask || !foundColumn) return null;

  // The modal's `statusToken` / `statusLabel` are derived from the
  // column (the wire Task shape doesn't carry a status field —
  // the column title is the closest analogue). The other
  // metadata fields (priority, story points, due date, labels,
  // assignees) are sentinels until Step 10 widens the Task
  // model.
  return (
    <TaskModal
      open
      onClose={onClose}
      boardTitle={board.title}
      columnTitle={foundColumn.title}
      taskIdLabel={`${board.title.slice(0, 3).toUpperCase()}-${foundTask.id.slice(0, 3).toUpperCase()}`}
      title={foundTask.title}
      description={foundTask.description ?? ""}
      statusToken="primary"
      statusLabel={foundColumn.title}
      priority="medium"
      priorityLabel="Medium"
      storyPoints={0}
      dueDateLabel={null}
      assignees={[]}
      labels={[]}
      createdAt={foundTask.createdAt}
      updatedAt={foundTask.createdAt}
      subtasks={[]}
      comments={[]}
      task={foundTask}
      onUpdateTask={onUpdateTask}
      onDeleteTask={onDeleteTask}
      onStep10SurfaceAttempt={onStep10SurfaceAttempt}
    />
  );
}

/**
 * Downcast a `useBoardQuery` error to a `BoardErrorReason`.
 *
 *   - 401 → `auth` (session expired; the error state routes the
 *     user to `/` via `signOut`, which clears the httpOnly
 *     `token` cookie server-side).
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
