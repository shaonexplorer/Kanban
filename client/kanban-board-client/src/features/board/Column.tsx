"use client";

/**
 * Compatibility re-export.
 *
 * The Stitch-styled implementation now lives in
 * `./components/ColumnShell.tsx`. This file is kept as a shim so
 * existing `import { Column } from "./Column"` call-sites in
 * `BoardView.tsx` and any tests continue to work unchanged.
 */

export { ColumnShell as Column } from "./components/ColumnShell";
export type { ColumnShellProps as ColumnProps } from "./components/ColumnShell";
