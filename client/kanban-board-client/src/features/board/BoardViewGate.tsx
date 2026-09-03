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
 * checks `localStorage` for a JWT (REQ-4.5.4) and renders the
 * heavy `BoardView` only when one is present.
 */
export default function BoardViewGate({ boardId }: BoardViewGateProps) {
  const { token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!token) {
      router.replace("/");
    }
  }, [token, router]);

  if (!token) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        Redirecting to sign-in…
      </div>
    );
  }

  return <BoardView boardId={boardId} />;
}
