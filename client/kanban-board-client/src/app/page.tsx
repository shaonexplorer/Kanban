"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/useAuth";
import { fetchMyBoards } from "@/features/board/api";

/**
 * Landing page.
 *
 * Phase 4 deliberately ships without a real login UI (per Plan §5.5
 * and REQ-4.6.13). The two helper affordances below — "Quick
 * register" and the "paste a token" panel — exist ONLY so the
 * interview demo can run end-to-end. They are labelled "dev only"
 * and removed in Phase 5 when the real auth UI lands.
 */
export default function Home() {
  const router = useRouter();
  const { token, setToken, registerWithEmail } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [pastedToken, setPastedToken] = useState("");

  async function quickRegister() {
    setStatus("Registering…");
    try {
      const email = `demo+${Date.now()}@local.test`;
      const password = "demo-password-not-secret";
      await registerWithEmail(email, password);
      await routeToFirstBoard();
    } catch (err) {
      setStatus(`Registration failed: ${describeError(err)}`);
    }
  }

  function savePastedToken() {
    const trimmed = pastedToken.trim();
    if (!trimmed) {
      setStatus("Paste a token first.");
      return;
    }
    setToken(trimmed);
    startTransition(async () => {
      await routeToFirstBoard();
    });
  }

  async function routeToFirstBoard() {
    try {
      const boards = await fetchMyBoards();
      if (boards.length === 0) {
        setStatus(
          "Account created / token set, but no boards exist yet. Create one via the API and reload.",
        );
        return;
      }
      router.push(`/boards/${boards[0].id}`);
    } catch (err) {
      setStatus(`Couldn't load boards: ${describeError(err)}`);
    }
  }

  function signOut() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("token");
    }
    setStatus("Signed out (token cleared). Reload to start over.");
    // Hard reload to re-run the page with no token.
    window.location.reload();
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950 font-sans">
      <main className="container mx-auto px-6 py-16 text-center max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-5xl">
          Mini Kanban Board
        </h1>
        <p className="mt-6 text-lg text-zinc-600 dark:text-zinc-400">
          A collaborative workspace for organizing tasks, tracking progress,
          and shipping work — built with Next.js, Express, and PostgreSQL.
        </p>

        {token ? (
          <div className="mt-10 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => routeToFirstBoard()}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 dark:bg-zinc-100 px-6 py-2.5 text-sm font-medium text-white dark:text-zinc-900 transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
            >
              {isPending ? "Loading…" : "Open my first board"}
            </button>
            <button
              type="button"
              onClick={signOut}
              className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline"
            >
              Sign out (clear token)
            </button>
          </div>
        ) : (
          <div className="mt-10 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={quickRegister}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 dark:bg-zinc-100 px-6 py-2.5 text-sm font-medium text-white dark:text-zinc-900 transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
            >
              {isPending ? "Working…" : "Quick register (dev only)"}
            </button>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Creates a throwaway account, stores the JWT, and opens your
              first board. Replaced by the real auth UI in Phase 5.
            </p>

            <details className="mt-4 text-left w-full max-w-md rounded-md border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 p-4">
              <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Or paste an existing JWT
              </summary>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                If you already have a token from
                <code className="mx-1 px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                  POST /api/auth/register
                </code>
                or
                <code className="mx-1 px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                  /api/auth/login
                </code>
                , paste it here.
              </p>
              <textarea
                value={pastedToken}
                onChange={(e) => setPastedToken(e.target.value)}
                placeholder="eyJhbGciOi…"
                rows={3}
                className="mt-2 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={savePastedToken}
                disabled={isPending}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                Save token
              </button>
            </details>
          </div>
        )}

        {status ? (
          <p
            role="status"
            className="mt-6 text-sm text-zinc-600 dark:text-zinc-400"
          >
            {status}
          </p>
        ) : null}
      </main>
    </div>
  );
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}
