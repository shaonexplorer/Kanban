import BoardViewGate from "@/features/board/BoardViewGate";

/**
 * `/boards/:id` — the Phase 4 board view route.
 *
 * The page is an async server component (Next.js 16 pattern) that
 * awaits the dynamic `params` promise. The actual data fetching,
 * dnd-kit wiring, and auth redirect happen in the client-side
 * `BoardViewGate` (which can't be a server component because it
 * reads `localStorage` and renders interactive dnd-kit).
 */
export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BoardViewGate boardId={id} />;
}
