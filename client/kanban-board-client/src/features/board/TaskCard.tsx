"use client";

/**
 * Compatibility re-export.
 *
 * The Stitch-styled implementation now lives in
 * `./components/TaskCardShell.tsx`. This file is kept as a shim so
 * existing `import { TaskCard } from "./TaskCard"` call-sites in
 * `Column.tsx` and any tests continue to work unchanged.
 */

export { TaskCardShell as TaskCard } from "./components/TaskCardShell";
export type {
  TaskCardShellProps as TaskCardProps,
} from "./components/TaskCardShell";
