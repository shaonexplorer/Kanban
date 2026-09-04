/**
 * Board loading skeleton (Phase 5 Step 4, Plan §4.1).
 *
 * Renders three ghost columns with five ghost task cards each. The
 * skeleton is mounted *inside* the same `<main>` slot the real board
 * uses, so the surrounding chrome (header, sidebar, control bar) is
 * already on screen — the user never sees a layout shift when the
 * real data lands.
 *
 * The column widths mirror the real columns
 * (`w-column-width-min md:w-column-width-max`) and the wrapper uses
 * the same `flex items-start gap-gutter-board min-w-max` the real
 * board uses, so the loading and post-load surfaces take the same
 * space. On the compact tier the same shape is rendered as a single
 * full-width column (mirroring `LaneFocusView`'s single-column
 * layout).
 *
 * Each ghost is `animate-pulse bg-surface-container-lowest
 * rounded-(--radius-md)` — the same vocabulary the rest of the app
 * uses for placeholder surfaces. No state, no effects, no async;
 * purely presentational so it can be dropped into any layout.
 */

export type BoardSkeletonTier = "compact" | "tablet" | "desktop";

export interface BoardSkeletonProps {
  /** Layout tier — drives the column shape (single full-width on
   *  compact, multi-column on tablet/desktop). Matches the tier
   *  that `BoardView` derives from `useMediaQuery`. */
  tier?: BoardSkeletonTier;
}

/** Number of ghost columns. Matches the typical new-board column
 *  count (Backlog / In Progress / Done) so the skeleton has a
 *  familiar shape on first paint. */
const GHOST_COLUMNS = 3;
/** Number of ghost task cards per column. Mirrors a typical mid-
 *  populated lane so the skeleton doesn't look empty. */
const GHOST_CARDS_PER_COLUMN = 5;

export function BoardSkeleton({ tier = "desktop" }: BoardSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading board"
      data-testid="board-skeleton"
      className="flex-1 overflow-x-auto kanban-scroll px-space-xl py-space-lg select-none"
    >
      <div className="flex items-start gap-gutter-board min-w-max pb-space-3xl">
        {Array.from({ length: GHOST_COLUMNS }).map((_, columnIdx) => (
          <GhostColumn key={columnIdx} tier={tier} />
        ))}
      </div>
    </div>
  );
}

/** Single ghost column. On compact the column is rendered at
 *  `w-full max-w-none` (no `shrink-0`, no fixed width) so the
 *  single-column shape the `LaneFocusView` will use after the data
 *  lands is preserved. */
function GhostColumn({ tier }: { tier: BoardSkeletonTier }) {
  const isCompact = tier === "compact";
  return (
    <div
      className={[
        isCompact
          ? "w-full max-w-none"
          : "w-column-width-min md:w-column-width-max",
        "flex flex-col",
        isCompact ? "" : "shrink-0",
        "bg-surface-container-lowest/90 rounded-xl",
        "p-space-sm shadow-md",
        "gap-space-sm",
      ].join(" ")}
    >
      {/* Header: a colored status dot + a wider title bar + a
       * counter pill. Uses the same height as the real header. */}
      <div className="flex items-center gap-2 px-space-xs py-space-sm mb-space-xs">
        <span className="size-2.5 rounded-full bg-surface-container" />
        <span className="h-4 w-32 rounded bg-surface-container animate-pulse" />
        <span className="h-5 w-6 rounded-full bg-surface-container animate-pulse" />
      </div>

      {/* Task cards. Each card is a thin bar with a couple of inner
       * skeletons so the shape matches a real card. */}
      <div className="flex flex-col gap-space-sm">
        {Array.from({ length: GHOST_CARDS_PER_COLUMN }).map((_, taskIdx) => (
          <GhostCard key={taskIdx} cardIndex={taskIdx} />
        ))}
      </div>
    </div>
  );
}

/** Single ghost task card. Renders a thin primary bar (title) plus
 *  a shorter secondary bar (subtitle / metadata) so the height
 *  matches a real card. The variation in width is intentional — it
 *  makes the skeleton feel less like a grid of identical boxes. */
function GhostCard({ cardIndex }: { cardIndex: number }) {
  // Cycle the title width so each card looks slightly different
  // without needing a real random source (which would create SSR /
  // hydration drift).
  const titleWidths = ["w-3/4", "w-2/3", "w-4/5", "w-1/2", "w-3/5"];
  const subtitleWidths = ["w-1/2", "w-1/3", "w-2/5", "w-1/4", "w-2/3"];
  const titleWidth = titleWidths[cardIndex % titleWidths.length];
  const subtitleWidth =
    subtitleWidths[cardIndex % subtitleWidths.length];

  return (
    <div className="rounded-lg bg-surface-container p-space-sm flex flex-col gap-2 animate-pulse">
      <span className={`h-3 ${titleWidth} rounded bg-surface-container-high`} />
      <span className={`h-2.5 ${subtitleWidth} rounded bg-surface-container-high`} />
    </div>
  );
}
