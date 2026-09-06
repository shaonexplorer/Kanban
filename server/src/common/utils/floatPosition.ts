/**
 * floatPosition — minimal Float midpoint helper for Column / Task ordering.
 *
 * Three pure functions, all O(1), no DB or globals:
 *
 *   - `nextAppend(currentMax)` returns the position to assign to the
 *     NEXT item appended to a scope. Empty scope → 1000. Otherwise
 *     `currentMax + 1000`. The 1000-step spacing leaves ~50 midpoint
 *     inserts between any two existing items before Float precision
 *     becomes a problem (see KNOWN LIMITATION below).
 *
 *   - `between(prev, next)` returns a Float strictly between `prev`
 *     and `next` (lexicographic ordering, equivalent to numeric
 *     ordering for Floats). Either `prev` or `next` may be `null` to
 *     denote an open end:
 *       - `between(null, null)`   → 1000  (empty scope, first insert)
 *       - `between(prev, null)`   → prev + 1000  (append)
 *       - `between(null, next)`   → next / 2      (prepend)
 *       - `between(prev, next)`   → (prev + next) / 2  (between)
 *
 *   - `rePack(i)` returns the position for the i-th element in a
 *     re-pack (re-keying a scope to fresh 1000-step positions in row
 *     order). Used by the `reorderColumns` endpoint when the caller
 *     supplies the full columnIds array.
 *
 * KNOWN LIMITATION: Float precision floor. After ~50 midpoint
 * insertions between two neighbors, `(prev + next) / 2` rounds to
 * `prev` because the gap is smaller than `Number.EPSILON * prev`. The
 * move still returns 200, but the card lands on the wrong neighbor.
 * Workaround: PATCH /reorder re-keys the scope to fresh 1000-step
 * positions, which resets the precision budget. In a single-user
 * kanban board with maybe a few hundred tasks per column, this is
 * unlikely to matter in practice — but the limitation is real and
 * documented.
 */
export function nextAppend(currentMax: number | null): number {
  if (currentMax === null) return 1000;
  return currentMax + 1000;
}

export function between(prev: number | null, next: number | null): number {
  if (prev !== null && next !== null) return (prev + next) / 2;
  if (prev !== null && next === null) return prev + 1000;
  if (prev === null && next !== null) return next / 2;
  return 1000;
}

export function rePack(i: number): number {
  // 1-indexed so the first position is 1000, not 0.
  return (i + 1) * 1000;
}
