"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Phase 5 Step 5 — Lifted overlay state (Plan §5.4).
 *
 * The `CreateBoardDrawer` can be opened from two places:
 *   1. The home page's `<EmptyBoardsState />` card (when the user
 *      has no boards yet).
 *   2. The board view's `<BoardControlBar />` "New Board" button
 *      (Phase 5 Plan §1 makes the control bar a global
 *      affordance).
 *
 * Both would otherwise need a prop-drilled open flag. Instead, this
 * tiny context (~50 lines, no external dep) owns the open state at
 * the app root, so both call sites read and write the same flag.
 *
 * The same context also owns `selectedTaskId: string | null` so the
 * `TaskModal` can be opened from anywhere — currently the card
 * click in `BoardView` (and the compact-mode tap path through
 * `LaneFocusView` → `ColumnShell` → `TaskCardShell`) — without
 * having to thread an `onSelect` callback through every layer.
 *
 * **Why a 50-line context instead of zustand (per Plan §5.4's
 * "Why a tiny context instead of zustand" note):** the
 * `specs/Techstack.md` lists `zustand` as a *planned* library;
 * adding it for one overlay-flag use case is overkill. The
 * existing `AuthContext` already uses a 5-file, ~150-line
 * pattern; this context is even smaller (one file) because it
 * doesn't need to subscribe to `localStorage` or do anything
 * async.
 */

export interface OverlayState {
  /** `true` while the `CreateBoardDrawer` should be rendered. */
  createBoardOpen: boolean;
  /** The id of the task whose `TaskModal` is open, or `null`. */
  selectedTaskId: string | null;
  /** The id of the board the open `TaskModal` belongs to. Used
   *  to scope the `useBoardQuery` lookup so a stale `selectedTaskId`
   *  doesn't try to render a task from a different board. `null`
   *  when no modal is open. */
  selectedTaskBoardId: string | null;
}

export interface OverlayStateValue extends OverlayState {
  openCreateBoard: () => void;
  closeCreateBoard: () => void;
  openTask: (boardId: string, taskId: string) => void;
  closeTask: () => void;
}

const OverlayStateContext = createContext<OverlayStateValue | null>(null);

export interface OverlayStateProviderProps {
  children: ReactNode;
}

/**
 * Provider component. Mount this once near the root of the app
 * (e.g. in `app/layout.tsx`) so every page (home, board) reads
 * the same flag values.
 */
export function OverlayStateProvider({ children }: OverlayStateProviderProps) {
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskBoardId, setSelectedTaskBoardId] = useState<
    string | null
  >(null);

  const openCreateBoard = useCallback(() => setCreateBoardOpen(true), []);
  const closeCreateBoard = useCallback(() => setCreateBoardOpen(false), []);
  const openTask = useCallback((boardId: string, taskId: string) => {
    setSelectedTaskBoardId(boardId);
    setSelectedTaskId(taskId);
  }, []);
  const closeTask = useCallback(() => {
    setSelectedTaskId(null);
    setSelectedTaskBoardId(null);
  }, []);

  const value = useMemo<OverlayStateValue>(
    () => ({
      createBoardOpen,
      selectedTaskId,
      selectedTaskBoardId,
      openCreateBoard,
      closeCreateBoard,
      openTask,
      closeTask,
    }),
    [
      createBoardOpen,
      selectedTaskId,
      selectedTaskBoardId,
      openCreateBoard,
      closeCreateBoard,
      openTask,
      closeTask,
    ],
  );

  return (
    <OverlayStateContext.Provider value={value}>
      {children}
    </OverlayStateContext.Provider>
  );
}

/**
 * Consumer hook. Throws if used outside the provider — that's a
 * programmer error (the provider must wrap the whole app).
 */
export function useOverlayState(): OverlayStateValue {
  const ctx = useContext(OverlayStateContext);
  if (!ctx) {
    throw new Error(
      "useOverlayState must be used inside <OverlayStateProvider>",
    );
  }
  return ctx;
}
