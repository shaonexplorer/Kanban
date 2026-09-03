"use client";

import { Icon } from "./Icon";

export interface AddColumnGhostProps {
  /** Click handler. The real create flow is Phase 5. */
  onClick?: () => void;
}

/**
 * The Stitch "Add Column" tile that sits at the end of the
 * horizontal board. Renders the same ghost surface as the
 * Stitch HTML — `bg-surface-container-lowest/40` resting state,
 * darkens on hover, and reveals a primary-tinted plus icon when
 * the user hovers.
 */
export function AddColumnGhost({ onClick }: AddColumnGhostProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Add column (coming in Phase 5)"
      className={[
        "flex flex-col shrink-0",
        "w-column-width-min h-44",
        "rounded-xl",
        "bg-surface-container-lowest/40 hover:bg-surface-container-lowest/80",
        "p-space-lg",
        "items-center justify-center",
        "gap-space-sm",
        "cursor-pointer",
        "transition-all duration-200 group",
      ].join(" ")}
    >
      <div className="size-10 rounded-full bg-surface-container-high group-hover:bg-primary group-hover:text-on-primary flex items-center justify-center text-outline transition-all duration-200">
        <Icon name="add" className="w-7 h-7" />
      </div>
      <span className="font-headline-sm text-headline-sm text-outline group-hover:text-on-surface transition-colors">
        Add Column
      </span>
      <span className="font-label-mono-sm text-label-mono-sm text-outline/60 text-center">
        Configure custom workflow status
      </span>
    </button>
  );
}
