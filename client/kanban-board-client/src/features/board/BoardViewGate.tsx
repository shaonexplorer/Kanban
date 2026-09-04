"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/useAuth";
import BoardView from "./BoardView";

export interface BoardViewGateProps {
  boardId: string;
}

/**
 * Auth gate for the board view. The Next.js 16 page (`page.tsx`) is
 * a server component that resolves `params`; this client wrapper
 * checks the auth context's `isAuthenticated` flag (backed by
 * `GET /api/auth/me` and the httpOnly `token` cookie in Phase 5
 * Step 8) and renders the heavy `BoardView` only when the user
 * has a valid session.
 */
export default function BoardViewGate({ boardId }: BoardViewGateProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        Redirecting to sign-in…
      </div>
    );
  }

  return <BoardView boardId={boardId} />;
}
