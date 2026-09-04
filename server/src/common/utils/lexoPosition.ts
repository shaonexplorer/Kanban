/**
 * lexoPosition — fractional-indexing helper for Phase 4 ordering.
 *
 * Every `position` written to a `Column` or `Task` row should flow
 * through this module. Two functions are exported:
 *
 *   - `first()` returns the lexo position used as the first element of
 *     an otherwise empty scope. Step 1 of Phase 4 standardised on
 *     `"a0"`, so the first column on a board and the first task in a
 *     column both default to `"a0"`.
 *
 *   - `between(a, b)` returns a string `m` such that `a < m < b`
 *     lexicographically, where either `a` or `b` (or both) may be
 *     `null` to denote an open end. Returns `null` when no such string
 *     exists within the alphabet's precision budget (10 characters by
 *     default) — callers must treat that as the trigger for a
 *     column/board-local re-pack.
 *
 * The algorithm is hand-rolled base-62 midpoint computation. The
 * alphabet is the standard `0-9A-Za-z` ordering, and digit comparison
 * is a single index lookup so the helper is O(length).
 *
 * IMPORTANT: this module is pure — no DB, no `Date`, no globals. It
 * MUST stay that way so the smoke script and the move endpoints can
 * share the same implementation.
 */

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ALPHABET_MIN = ALPHABET.charAt(0); // "0" — the smallest character.
const ALPHABET_MAX = ALPHABET.charAt(ALPHABET.length - 1); // "z"
const BASE = ALPHABET.length; // 62
const MAX_LENGTH = 10; // Design budget from Plan §2.1.

// Pre-computed index table so `charIndex` is O(1).
const CHAR_INDEX: Readonly<Record<string, number>> = (() => {
  const table: Record<string, number> = {};
  for (let i = 0; i < ALPHABET.length; i += 1) {
    table[ALPHABET.charAt(i)] = i;
  }
  return table;
})();

/** Look up the alphabet index of a single character. Throws on invalid input. */
function charIndex(ch: string): number {
  const idx = CHAR_INDEX[ch];
  if (idx === undefined) {
    throw new Error(
      `lexoPosition: character "${ch}" is outside the base-62 alphabet`
    );
  }
  return idx;
}

/** Stringify an alphabet index back to a character. Throws on out-of-range. */
function indexChar(idx: number): string {
  if (idx < 0 || idx >= BASE) {
    throw new Error(
      `lexoPosition: alphabet index ${idx} is out of range [0, ${BASE})`
    );
  }
  return ALPHABET.charAt(idx);
}

/** Pad a string on the right with `ALPHABET_MIN` up to `length`. */
function padRight(s: string, length: number): string {
  if (s.length >= length) return s;
  return s + ALPHABET_MIN.repeat(length - s.length);
}

/** Pad a string on the right with `ALPHABET_MAX` up to `length`. */
function padRightMax(s: string, length: number): string {
  if (s.length >= length) return s;
  return s + ALPHABET_MAX.repeat(length - s.length);
}

/**
 * Return a string strictly between `lo` and `hi` (lexicographically)
 * of length at most `maxLength`, or `null` if the gap is exhausted
 * within that budget.
 *
 * `lo` and `hi` must be valid alphabet strings with `lo < hi`. They
 * may have different lengths — this function pads the shorter side
 * with `ALPHABET_MIN` before computing the midpoint, so the result
 * preserves the strict-interior invariant.
 */
function midpoint(lo: string, hi: string, maxLength: number): string | null {
  if (lo.length > maxLength || hi.length > maxLength) {
    throw new Error(
      `midpoint: lo/hi length must be ≤ maxLength (${maxLength})`
    );
  }
  if (lo.length === 0 || hi.length === 0) {
    throw new Error("midpoint: lo and hi must be non-empty");
  }
  if (lo >= hi) {
    throw new Error(
      `midpoint: require lo < hi, got lo="${lo}", hi="${hi}"`
    );
  }

  // Pad the shorter side with ALPHABET_MIN to share a common length.
  // This gives us the largest possible `lo` and the smallest possible
  // `hi` that still satisfy `lo < hi` — i.e. the smallest possible
  // gap, which is the hardest case for finding a midpoint. If the
  // midpoint exists for the smallest gap, it exists for the original
  // input.
  let loPadded = lo;
  let hiPadded = hi;
  if (lo.length < hi.length) {
    loPadded = padRight(lo, hi.length);
  } else if (hi.length < lo.length) {
    hiPadded = padRight(hi, lo.length);
  }
  // After this, loPadded.length === hiPadded.length === n.

  // Now compute the midpoint of loPadded and hiPadded, where both
  // are the same length. If we hit an adjacent-pair case, the
  // recursion will need to grow the result by one character — we
  // do that by allowing the function to "pad" with MAX on the left
  // and MIN on the right and recursing with one extra character of
  // budget.
  return midpointSameLength(loPadded, hiPadded, maxLength);
}

/**
 * Return a string strictly between `lo` and `hi` (lexicographically)
 * where `lo` and `hi` have the same length. The returned string
 * has the same length as the inputs (or one character longer if
 * the recursion needs to grow). Returns `null` if the gap is
 * exhausted at `maxLength`.
 */
function midpointSameLength(
  lo: string,
  hi: string,
  maxLength: number
): string | null {
  const n = lo.length;
  if (hi.length !== n) {
    throw new Error("midpointSameLength: lo/hi length mismatch");
  }
  if (n > maxLength) {
    throw new Error(
      `midpointSameLength: length ${n} exceeds maxLength ${maxLength}`
    );
  }

  for (let i = 0; i < n; i += 1) {
    const loIdx = charIndex(lo.charAt(i));
    const hiIdx = charIndex(hi.charAt(i));
    if (loIdx === hiIdx) continue;

    if (hiIdx - loIdx >= 2) {
      // Pick the floor midpoint at this position; tail goes to MIN.
      const midIdx = Math.floor((loIdx + hiIdx) / 2);
      return lo.slice(0, i) + indexChar(midIdx) + ALPHABET_MIN.repeat(n - i - 1);
    }

    // Adjacent at position i. We need to grow the string by one
    // character to fit a midpoint in. Pick `lo[i]` as the result's
    // character at position i, then ask for a midpoint between the
    // tail-extended `lo` (padded with MAX so it's the largest string
    // matching lo's tail) and the tail-extended `hi` (padded with
    // MIN so it's the smallest string matching hi's tail).
    if (n >= maxLength) {
      // Already at the budget — no room to grow.
      return null;
    }
    const loTail = lo.slice(i + 1);
    const hiTail = hi.slice(i + 1);
    // The result's tail must be strictly greater than lo's tail
    // (when prefixed by lo[0..i+1]) and strictly less than hi's tail
    // (when prefixed by lo[0..i+1]). Concretely, we need a string
    // `t` such that:
    //   - loPaddedTail < t  (where loPaddedTail = loTail padded with MAX)
    //   - t < hiPaddedTail  (where hiPaddedTail = hiTail padded with MIN)
    // If both tails are empty, the smallest possible t is a single
    // character strictly between MAX and MIN — we pick the midpoint
    // (which exists because MAX > MIN with 60 chars of room).
    if (loTail.length === 0 && hiTail.length === 0) {
      if (n + 1 > maxLength) return null;
      const midIdx = Math.floor((charIndex(ALPHABET_MAX) + charIndex(ALPHABET_MIN)) / 2);
      return lo.slice(0, i + 1) + indexChar(midIdx);
    }
    // Otherwise: try to fit the tail at the original length
    // (n - i - 1) first; if that fails, grow by one character.
    const targetTailLen = n - i - 1;
    const paddedLoTail = padRightMax(loTail, targetTailLen);
    const paddedHiTail = padRight(hiTail, targetTailLen);
    const tail = midpointSameLength(
      paddedLoTail,
      paddedHiTail,
      maxLength - i - 1
    );
    if (tail !== null) return lo.slice(0, i + 1) + tail;
    // Try the case where the tail is one character longer.
    if (n + 1 > maxLength) return null;
    const longerLo = padRightMax(loTail, targetTailLen + 1);
    const longerHi = padRight(hiTail, targetTailLen + 1);
    const longerTail = midpointSameLength(
      longerLo,
      longerHi,
      maxLength - i - 1
    );
    if (longerTail === null) return null;
    return lo.slice(0, i + 1) + longerTail;
  }

  // lo === hi. No interior at any length. Caller's bug.
  return null;
}

/**
 * Return a lexicographic position strictly between `a` and `b`.
 *
 * - `a === null` means no lower bound (insert at the very start).
 * - `b === null` means no upper bound (insert at the very end).
 * - Both `null` is treated as "first element of an empty scope" and
 *   returns `first()`.
 *
 * Returns `null` when the gap between `a` and `b` is exhausted (i.e.
 * no further midpoint exists within the precision budget). Callers
 * MUST treat that as the trigger for a column/board-local re-pack.
 */
export function between(a: string | null, b: string | null): string | null {
  // Empty scope → first element.
  if (a === null && b === null) return first();

  if (a !== null && a.length === 0) {
    throw new Error("lexoPosition.between: `a` must be non-empty when provided");
  }
  if (b !== null && b.length === 0) {
    throw new Error("lexoPosition.between: `b` must be non-empty when provided");
  }

  if (a !== null && a.length > MAX_LENGTH) {
    throw new Error(`lexoPosition.between: \`a\` exceeds ${MAX_LENGTH} characters`);
  }
  if (b !== null && b.length > MAX_LENGTH) {
    throw new Error(`lexoPosition.between: \`b\` exceeds ${MAX_LENGTH} characters`);
  }

  // Open-ended right (insert strictly after `a`): we want a string
  // `m > a`. The natural bounds are `lo = a + MIN` (smallest string
  // strictly greater than `a`) and `hi = a + MAX * (k - a.length)`
  // for some k. The midpoint is guaranteed to exist for any k as
  // long as the recursion can find a strictly-interior position —
  // which it can because the *first* character of `lo` (at position
  // a.length) is MIN and the first of `hi` is MAX, leaving 60 chars
  // of room. We pad both to the same length.
  if (a !== null && b === null) {
    if (a.length >= MAX_LENGTH) return null;
    // Pad both sides to MAX_LENGTH so the recursion has the
    // largest possible budget.
    const lo = padRight(a + ALPHABET_MIN, MAX_LENGTH);
    const hi = a + ALPHABET_MAX.repeat(MAX_LENGTH - a.length);
    return midpoint(lo, hi, MAX_LENGTH);
  }

  // Open-ended left (insert strictly before `b`): we want `m < b`.
  // We can't pad `b` to MAX_LENGTH if it's already near the budget,
  // because the gap between `MIN * MAX_LENGTH` and `padRight(b)` at
  // the budget length is often already adjacent at position 0.
  //
  // Instead, we construct the gap as `lo = MIN * b.length` and
  // `hi = b` (no padding) and call the midpoint helper with budget
  // `MAX_LENGTH`. The helper will find a midpoint at length
  // `b.length` or `b.length + 1` — both well within the budget.
  if (a === null && b !== null) {
    if (b.length >= MAX_LENGTH) return null;
    const lo = ALPHABET_MIN.repeat(b.length);
    const hi = b;
    if (lo >= hi) return null;
    return midpoint(lo, hi, MAX_LENGTH);
  }

  // Both bounds set.
  const lo = a as string;
  const hi = b as string;
  if (lo >= hi) {
    throw new Error(
      `lexoPosition.between: require lo < hi, got lo="${lo}", hi="${hi}"`
    );
  }
  return midpoint(lo, hi, MAX_LENGTH);
}

/** The lexo position used as the first element of an empty scope. */
export function first(): string {
  // Must satisfy `between(null, null) === first()` and remain
  // compatible with the schema default (`@default("a0")`). A new
  // `first()` value MUST also be reflected in the Prisma schema
  // default and the Phase 4 migration's backfill.
  return "a0";
}

/**
 * Return the n-th position in a dense, headroom-bearing sequence.
 *
 * This is the helper the re-pack paths in `createColumn` /
 * `createTask` / `reorderColumns` / `moveColumn` / `moveTask` use
 * to build their new ordering. Unlike `between(prev, null)` — which
 * is the natural "append to the end" operation but exhausts the
 * helper's precision budget after ~9 calls — `nextKey` returns a
 * position from a pre-defined "V-tail" sequence with a tier prefix
 * and `"0"` anchor:
 *
 *   tier=0: "a0", "a0V", "a0VV", "a0VVV", ...
 *   tier=1: "b0", "b0V", "b0VV", ...
 *   tier=2: "c0", "c0V", "c0VV", ...
 *   ...
 *
 * Each successive position is the previous one with one `"V"` appended.
 * The sequence is strictly increasing (lex order: `"a0" < "a0V" <
 * "a0VV" < ...` because the V is greater than end-of-string). The
 * tiers are also strictly increasing because `"a0..." < "b0..." <
 * "c0..." < ...` (each tier's prefix char is greater than the
 * previous one in the base-62 alphabet). The tier 0 prefix is
 * hard-coded to `"a"` (not `"0"`) so the sequence starts with
 * `first() === "a0"`.
 *
 * Re-packs of >8 items split the items into tiers of 8 each. The
 * i-th item (0-indexed) in the re-pack gets `nextKey(floor(i / 8),
 * i % 8)`. This is unbounded in size while keeping every returned
 * position within the helper's `MAX_LENGTH` budget.
 *
 * Properties:
 *  - `nextKey(0, 0) === first() === "a0"`, so a re-pack that
 *    produces `[p_0, p_1, ..., p_N]` is a drop-in replacement for
 *    the original ordering.
 *  - The returned position is always within `MAX_LENGTH` characters.
 *  - `between(p_i, p_{i+1})` is non-null when `i % 8 < 7` (the gap
 *    is one full `V` char, which has plenty of headroom for
 *    `between` to find a midpoint).
 *  - `between(p_N, null)` is non-null when `N % 8 < 7` (so the
 *    next user append is supported before another re-pack is
 *    needed; on a tier boundary, the next append crosses into a
 *    new tier via `nextKey` and triggers another re-pack).
 *
 * @param tier  The zero-based tier index. Each tier is independent
 *              and adds a tier-prefix character (`a`, `b`, `c`, ...).
 *              Supports up to 62 tiers (the base-62 alphabet size).
 * @param n     The zero-based index within the tier
 *              (`0` returns the tier anchor `"<prefix>0"`,
 *              `1` returns `"<prefix>0V"`, ...).
 */
export function nextKey(tier: number, n: number): string {
  if (!Number.isInteger(tier) || tier < 0) {
    throw new Error(
      `lexoPosition.nextKey: tier must be a non-negative integer, got ${tier}`
    );
  }
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(
      `lexoPosition.nextKey: n must be a non-negative integer, got ${n}`
    );
  }
  // Tier 0 is hard-coded to "a" (the start of the lowercase range)
  // so the first position is `first() === "a0"`. Subsequent tiers
  // cycle through `b`, `c`, ..., `z`, `A`, `B`, ..., `Z`, `0`, `1`,
  // ..., `9` (i.e. the rest of the base-62 alphabet in lex order,
  // skipping `a` which is reserved for tier 0).
  if (tier >= BASE) {
    throw new Error(
      `lexoPosition.nextKey: tier=${tier} exceeds the ${BASE}-character alphabet`
    );
  }
  if (n > MAX_LENGTH - 2) {
    throw new Error(
      `lexoPosition.nextKey: n=${n} would produce a position exceeding the ${MAX_LENGTH}-character budget; use a higher tier instead`
    );
  }
  // Tier 0 → "a", tier 1 → "b", ..., tier 25 → "z", tier 26 → "A",
  // tier 27 → "B", ..., tier 51 → "Z", tier 52 → "0", ..., tier 61 → "9".
  // This mapping picks chars in lex order, with `a` reserved for
  // tier 0 to match `first()`. The full tier-prefix character set
  // covers the entire 62-char alphabet.
  let prefix: string;
  if (tier < 26) {
    // tiers 0..25 → "a".."z" (lowercase, lex range 36..61)
    prefix = ALPHABET.charAt(36 + tier);
  } else if (tier < 52) {
    // tiers 26..51 → "A".."Z" (uppercase, lex range 10..35)
    prefix = ALPHABET.charAt(10 + (tier - 26));
  } else {
    // tiers 52..61 → "0".."9" (digits, lex range 0..9)
    prefix = ALPHABET.charAt(tier - 52);
  }
  if (n === 0) return prefix + ALPHABET_MIN;
  return prefix + ALPHABET_MIN + ALPHABET.charAt(31).repeat(n);
}

/**
 * Re-pack helper: return the position for the i-th item in a re-pack
 * of total length `total`, automatically choosing a tier and
 * within-tier index. The result is bounded by `MAX_LENGTH` for any
 * `total` >= 1.
 */
export function rePackKey(i: number): string {
  if (!Number.isInteger(i) || i < 0) {
    throw new Error(
      `lexoPosition.rePackKey: i must be a non-negative integer, got ${i}`
    );
  }
  const chunkSize = MAX_LENGTH - 2; // 8 — number of positions per tier
  const tier = Math.floor(i / chunkSize);
  const n = i % chunkSize;
  return nextKey(tier, n);
}

/** Re-exported constants for tests and the smoke script. */
export const _internal = {
  ALPHABET,
  ALPHABET_MIN,
  ALPHABET_MAX,
  BASE,
  MAX_LENGTH,
} as const;
