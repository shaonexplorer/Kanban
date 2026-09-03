"use client";

import { useAuth } from "@/features/auth/useAuth";

export interface UserAvatarProps {
  /** Override the email used to derive initials (e.g. when rendering
   * another user in a future multi-member sidebar). */
  email?: string | null;
  /** Avatar size in pixels. Tailwind v4 utility classes are applied
   * proportionally (size-6 = 24px, size-7 = 28px, size-8 = 32px). */
  size?: "xs" | "sm" | "md";
  /** Optional status dot color (semantic token name). When set, a
   * 6–8px dot is rendered in the lower-right. */
  presence?: "tertiary" | "outline" | null;
  /** Optional tooltip text (rendered as the `title` attribute). */
  title?: string;
}

const sizeMap = {
  xs: "size-6 text-[10px]",
  sm: "size-7 text-[10px]",
  md: "size-8 text-[12px]",
} as const;

const dotSizeMap = {
  xs: "size-2",
  sm: "size-2",
  md: "size-2.5",
} as const;

const ringClass = "ring-1 ring-surface";

/**
 * Derive a 1-2 character uppercase initial from an email.
 * `alex.chen@acme.dev` -> `AC`. Falls back to `?` for null/empty.
 */
function initialsFor(email: string | null | undefined): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Pick a container / on-container color pair from a stable hash of
 * the email. Keeps the avatar palette from collapsing onto a single
 * tone when several users appear in a facepile.
 */
function containerFor(email: string | null | undefined): {
  container: string;
  onContainer: string;
} {
  if (!email) {
    return {
      container: "bg-surface-container-highest",
      onContainer: "text-on-surface",
    };
  }
  const buckets = [
    {
      container: "bg-primary-container",
      onContainer: "text-on-primary-container",
    },
    {
      container: "bg-secondary-container",
      onContainer: "text-on-secondary-container",
    },
    {
      container: "bg-tertiary-container",
      onContainer: "text-on-tertiary-container",
    },
  ] as const;
  // Tiny djb2 hash; stable across renders, no crypto needed.
  let hash = 5381;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 33) ^ email.charCodeAt(i);
  }
  const idx = Math.abs(hash) % buckets.length;
  return buckets[idx];
}

/**
 * Circular initials avatar used by the sidebar user-card, the
 * sub-header facepile, and the top-bar profile chip. Color pair is
 * derived from the email so the same user always gets the same
 * tone, but the palette rotates across users.
 */
export function UserAvatar({
  email,
  size = "md",
  presence = null,
  title,
}: UserAvatarProps) {
  const { userEmail } = useAuth();
  const resolvedEmail = email ?? userEmail;
  const { container, onContainer } = containerFor(resolvedEmail);
  const initials = initialsFor(resolvedEmail);

  return (
    <div
      className="relative inline-block shrink-0"
      title={title}
    >
      <div
        className={[
          sizeMap[size],
          "rounded-full",
          "flex items-center justify-center",
          "font-mono font-medium",
          ringClass,
          container,
          onContainer,
        ].join(" ")}
        aria-label={resolvedEmail ?? "unknown user"}
      >
        {initials}
      </div>
      {presence ? (
        <span
          className={[
            "absolute bottom-0 right-0",
            dotSizeMap[size],
            "rounded-full",
            "ring-2 ring-surface-container-lowest",
            presence === "tertiary" ? "bg-tertiary" : "bg-outline",
          ].join(" ")}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
