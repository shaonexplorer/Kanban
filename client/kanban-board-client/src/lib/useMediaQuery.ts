"use client";

import { useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query and returns a stable boolean
 * reflecting whether it currently matches.
 *
 * On the server (and during the first client render) the value is
 * `false` — `useSyncExternalStore`'s `getServerSnapshot` returns
 * `false`, so the SSR markup matches the initial client render
 * (no hydration mismatch). The value flips to the real media-query
 * state on the first client render after mount, and again on
 * every `change` event the `matchMedia` instance emits.
 *
 * Implemented with `useSyncExternalStore` to satisfy the project's
 * "don't call setState in an effect" ESLint rule — the underlying
 * `subscribe` callback is the only place React state is touched,
 * and it happens inside a subscription callback (not the effect
 * body).
 *
 * Used by `BoardView`, `Sidebar`, and `BoardHeader` to drive the
 * compact / tablet / desktop tier switch in Phase 5 Step 1.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined" || !window.matchMedia) {
        return () => {};
      }
      const mql = window.matchMedia(query);
      // `addEventListener` is the modern API; `addListener` is the
      // Safari < 14 fallback. Both are no-ops when not supported.
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", onStoreChange);
        return () => mql.removeEventListener("change", onStoreChange);
      }
      mql.addListener(onStoreChange);
      return () => mql.removeListener(onStoreChange);
    },
    () => {
      if (typeof window === "undefined" || !window.matchMedia) {
        return false;
      }
      return window.matchMedia(query).matches;
    },
    () => false,
  );
}
