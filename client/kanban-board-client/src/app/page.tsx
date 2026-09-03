"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/useAuth";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { fetchMyBoards } from "@/features/board/api";

/**
 * Landing page (Phase 5).
 *
 * Two branches:
 *   - Logged-out → render the Stitch-faithful `AuthScreen` (the
 *     real sign-in / create-account form).
 *   - Logged-in  → auto-redirect to the user's first board. The
 *     "Open my first board / Sign out" dev affordances are gone
 *     because every board view's chrome now exposes its own
 *     sign-out path.
 *
 * The redirect uses `useEffect` (not `useState`+`useTransition`)
 * because it must fire once on mount when `token` is already
 * present — the Phase 4 form-driven flow only ran when the user
 * clicked Quick Register.
 */
export default function Home() {
  const router = useRouter();
  const { token } = useAuth();
  const [redirectStatus, setRedirectStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const boards = await fetchMyBoards();
        if (cancelled) return;
        if (boards.length === 0) {
          setRedirectStatus(
            "Signed in, but no boards exist yet. Create one via the API and reload.",
          );
          return;
        }
        router.push(`/boards/${boards[0].id}`);
      } catch {
        if (cancelled) return;
        setRedirectStatus(
          "Signed in, but couldn't load boards. Reload to try again.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-surface font-sans">
        <main className="container mx-auto px-6 py-16 text-center max-w-2xl">
          <p
            role="status"
            className="font-body-md text-body-md text-on-surface-variant"
          >
            {redirectStatus ?? "Loading your workspace…"}
          </p>
        </main>
      </div>
    );
  }

  return <AuthScreen />;
}
