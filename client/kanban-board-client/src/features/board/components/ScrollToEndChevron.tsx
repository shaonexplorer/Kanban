"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface ScrollToEndChevronProps {
  /** Ref to the horizontally-scrolling container. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Pixels to scroll per click. Defaults to one column width. */
  scrollStep?: number;
}

/**
 * Floating right-edge chevron for the horizontal board on tablet /
 * desktop (Phase 5 Step 1, REQ-5.1.7).
 *
 * The chevron is positioned over the board's right edge and fades
 * in when more columns are off-screen. It uses `IntersectionObserver`
 * to watch a sentinel element at the right end of the board — when
 * the sentinel scrolls into view, the chevron hides.
 *
 * Clicking the chevron scrolls the board container to the right by
 * `scrollStep` (default 320px — one column width). The scroll is
 * smooth; the sentinel re-enters the viewport on the next paint
 * tick and re-hides the chevron if there's nothing left to scroll.
 */
export function ScrollToEndChevron({
  scrollRef,
  scrollStep = 320,
}: ScrollToEndChevronProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollRef.current;
    if (!sentinel || !container) return;

    // The sentinel is a 1px element inside the scroll container.
    // When it's outside the container's visible area, the chevron
    // is visible; when it scrolls into view, the chevron hides.
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // The sentinel is the *right* edge — if it's in view,
        // there's no more content to the right, so the chevron
        // should hide. If it's out of view, the chevron is visible.
        setVisible(!entry.isIntersecting);
      },
      {
        root: container,
        threshold: 0,
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRef]);

  function handleClick() {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollBy({ left: scrollStep, behavior: "smooth" });
  }

  return (
    <>
      {/* The sentinel — placed at the right end of the scroll
       * container so the observer knows when the end is reached. */}
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className="shrink-0 w-px h-px self-stretch"
      />
      {visible ? (
        <button
          type="button"
          aria-label="Scroll to next column"
          onClick={handleClick}
          className="fixed top-1/2 -translate-y-1/2 right-space-md z-30 size-10 flex items-center justify-center rounded-full bg-surface-container-highest/95 hover:bg-primary hover:text-on-primary text-on-surface shadow-lg backdrop-blur-md border border-outline/20 transition-all duration-(--duration-medium) ease-standard"
        >
          <Icon name="chevron_right" className="w-5 h-5" />
        </button>
      ) : null}
    </>
  );
}
