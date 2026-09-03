/**
 * Barrel for the design package.
 *
 * The actual values live in `tokens.css` (Tailwind v4 `@theme` block).
 * This file exists so other modules have a stable import path to the
 * design package (`@/design`) and so we can later add non-CSS exports
 * (e.g. animation easings, motion durations) without touching callers.
 */

export const DESIGN_PACKAGE = "kinetic-grid" as const;
