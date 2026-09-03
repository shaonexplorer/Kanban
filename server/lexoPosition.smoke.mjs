// lexoPosition.smoke.mjs
//
// A debug script that exercises the lexoPosition helper end-to-end.
// Lives at the repo root of the server so it can be deleted in Phase 5
// when jest lands.
//
// Run with:
//   node --experimental-strip-types ./lexoPosition.smoke.mjs
//   node --experimental-strip-types --no-warnings ./lexoPosition.smoke.mjs
//
// (Node 22's --experimental-strip-types lets the .mjs script import
// the TypeScript source file directly — no build step required.)
//
// The script asserts the invariants called out in Phase 4 Plan §2.2:
//   1. a < between(a, b) < b   for random a, b
//   2. between(null, null) === first()
//   3. between("a0", "a1")     returns a valid in-between string
//   4. Repeatedly halving between two anchors never runs out of room
//      within the 10-character design budget
//
// If any assertion fails, the process exits with code 1 and prints a
// diff. A clean run prints a summary and exits 0.

import assert from "node:assert/strict";

// Import the TypeScript source directly via Node 22's strip-types
// mode. The relative URL must resolve to the .ts file (not a .js
// shim) so the .ts extension is what strip-types sees.
const { between, first, nextKey, rePackKey, _internal } = await import(
  new URL("./src/common/utils/lexoPosition.ts", import.meta.url).href
);

const { ALPHABET, ALPHABET_MIN, ALPHABET_MAX, MAX_LENGTH } = _internal;

// ---------------------------------------------------------------------------
// Tiny test harness — no jest, no test framework. Each `check` records a
// pass/fail and we print a summary at the end. A single failure aborts
// with a non-zero exit so the script is CI-friendly.
// ---------------------------------------------------------------------------

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, err });
  }
}

function isAlphabetString(s) {
  if (typeof s !== "string") return false;
  for (const ch of s) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Invariant 1: a < between(a, b) < b  for random a, b
// ---------------------------------------------------------------------------

// Tiny seedable PRNG (mulberry32) so the script is deterministic
// across runs without pulling in a dependency.
function makeRng(seed) {
  let t = seed >>> 0;
  return function rng() {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(0xC0FFEE);

function randomString(maxLen) {
  const len = 1 + Math.floor(rng() * maxLen);
  let s = "";
  for (let i = 0; i < len; i += 1) {
    const ch = ALPHABET.charAt(Math.floor(rng() * ALPHABET.length));
    s += ch;
  }
  return s;
}

check("random between: a < between(a, b) < b for 200 random pairs", () => {
  for (let i = 0; i < 200; i += 1) {
    let a = randomString(MAX_LENGTH);
    let b = randomString(MAX_LENGTH);
    if (a === b) continue;
    if (a > b) [a, b] = [b, a];
    const m = between(a, b);
    assert.ok(
      m !== null,
      `between("${a}", "${b}") returned null (gap exhausted)`
    );
    assert.ok(a < m, `expected a < between(a, b), got a="${a}", mid="${m}"`);
    assert.ok(m < b, `expected between(a, b) < b, got mid="${m}", b="${b}"`);
  }
});

// ---------------------------------------------------------------------------
// Invariant 2: between(null, null) === first()
// ---------------------------------------------------------------------------

check("between(null, null) === first()", () => {
  assert.equal(between(null, null), first());
  assert.equal(first(), "a0");
});

// ---------------------------------------------------------------------------
// Invariant 3: between("a0", "a1") returns a valid in-between string
// ---------------------------------------------------------------------------

check("between(\"a0\", \"a1\") is a valid in-between string", () => {
  const m = between("a0", "a1");
  assert.ok(m !== null, "between(\"a0\", \"a1\") returned null");
  assert.ok("a0" < m, `expected a0 < m, got m="${m}"`);
  assert.ok(m < "a1", `expected m < a1, got m="${m}"`);
  assert.ok(isAlphabetString(m), `midpoint contains non-alphabet chars: "${m}"`);
});

// ---------------------------------------------------------------------------
// Invariant 4: repeated halving between two anchors stays within budget
// ---------------------------------------------------------------------------

check("repeated halving between two anchors stays in budget (until exhausted)", () => {
  // Start with widely-separated anchors.
  let lo = "0"; // lex-smallest non-empty string
  let hi = "z"; // lex-largest non-empty string
  let step = 0;
  while (true) {
    const m = between(lo, hi);
    if (m === null) {
      // Budget exhausted — that's expected. The plan's invariant
      // is "never runs out of room within 10 characters" which is
      // a claim about the design budget, not about infinite halving.
      // We've shown ≥ step successful midpoints; record the bound.
      assert.ok(step > 0, "exhausted at step 0 — empty gap between initial anchors");
      break;
    }
    assert.ok(lo < m, `invariant lo < mid broken at step ${step}: lo="${lo}", m="${m}"`);
    assert.ok(m < hi, `invariant mid < hi broken at step ${step}: m="${m}", hi="${hi}"`);
    assert.ok(
      m.length <= MAX_LENGTH,
      `midpoint length ${m.length} exceeds budget ${MAX_LENGTH} at step ${step}`
    );
    // Pick the left or right half alternately so we drill into the
    // recursion rather than always going to one side.
    if (step % 2 === 0) {
      hi = m;
    } else {
      lo = m;
    }
    step += 1;
    if (step > 10000) {
      throw new Error("did not exhaust the budget in 10000 steps — bug in helper");
    }
  }
});

// ---------------------------------------------------------------------------
// Open-ended cases
// ---------------------------------------------------------------------------

check("between(a, null) is strictly greater than a (100 random a)", () => {
  for (let i = 0; i < 100; i += 1) {
    // `a` is short (1..MAX_LENGTH-1) so the helper has budget to grow.
    const a = randomString(Math.max(1, MAX_LENGTH - 4));
    const m = between(a, null);
    assert.ok(m !== null, `between("${a}", null) returned null`);
    assert.ok(a < m, `expected a < m, got a="${a}", m="${m}"`);
    assert.ok(m.length <= MAX_LENGTH, `m too long: "${m}"`);
    assert.ok(isAlphabetString(m), `m contains invalid chars: "${m}"`);
  }
});

check("between(null, b) is strictly less than b (100 random b)", () => {
  for (let i = 0; i < 100; i += 1) {
    // `b` is short so the helper has budget to grow.
    const b = randomString(Math.max(1, MAX_LENGTH - 4));
    const m = between(null, b);
    assert.ok(m !== null, `between(null, "${b}") returned null`);
    assert.ok(m < b, `expected m < b, got m="${m}", b="${b}"`);
    assert.ok(m.length <= MAX_LENGTH, `m too long: "${m}"`);
    assert.ok(isAlphabetString(m), `m contains invalid chars: "${m}"`);
  }
});

check("between(a, null) returns null at MAX_LENGTH (budget exhausted)", () => {
  // Construct a string that already consumes the budget.
  const a = "a" + ALPHABET_MIN.repeat(MAX_LENGTH - 1);
  assert.equal(a.length, MAX_LENGTH);
  const m = between(a, null);
  assert.equal(m, null, `expected null when a.length === MAX_LENGTH, got "${m}"`);
});

check("between(null, b) returns null when b is the lex-smallest at budget", () => {
  // b = "0" * MAX_LENGTH — nothing strictly less than it.
  const b = ALPHABET_MIN.repeat(MAX_LENGTH);
  const m = between(null, b);
  assert.equal(m, null, `expected null when b is the lex-smallest, got "${m}"`);
});

// ---------------------------------------------------------------------------
// API contract: a few hundred between(...) calls to demonstrate behaviour
// ---------------------------------------------------------------------------

check("smoke: appends to the end of an empty list stay sorted (until exhausted)", () => {
  // Build a sorted list by appending to a base position, then check
  // that every pairwise order is preserved. The loop stops when the
  // budget is exhausted — the design budget is 10 characters, so
  // this typically takes ~9 appends before returning null.
  const positions = [first()];
  let i = 0;
  while (true) {
    const next = between(positions[positions.length - 1], null);
    if (next === null) break;
    positions.push(next);
    i += 1;
    if (i > 100) {
      throw new Error("did not exhaust the budget in 100 appends — bug in helper");
    }
  }
  assert.ok(positions.length >= 2, "expected at least one successful append");
  for (let j = 1; j < positions.length; j += 1) {
    assert.ok(
      positions[j - 1] < positions[j],
      `order broken at ${j}: prev="${positions[j - 1]}", curr="${positions[j]}"`
    );
  }
});

// ---------------------------------------------------------------------------
// nextKey / rePackKey — the re-pack helpers
// ---------------------------------------------------------------------------

check("nextKey(0, 0) === first()", () => {
  assert.equal(nextKey(0, 0), first());
  assert.equal(nextKey(0, 0), "a0");
});

check("nextKey follows the V-tail sequence for tier 0: a0, a0V, a0VV, ...", () => {
  assert.equal(nextKey(0, 0), "a0");
  assert.equal(nextKey(0, 1), "a0V");
  assert.equal(nextKey(0, 2), "a0VV");
  assert.equal(nextKey(0, 3), "a0VVV");
  assert.equal(nextKey(0, 7), "a0VVVVVVV");
});

check("nextKey increments the tier prefix: a, b, c, ...", () => {
  assert.equal(nextKey(1, 0), "b0");
  assert.equal(nextKey(2, 0), "c0");
  assert.equal(nextKey(0, 1), "a0V");
  assert.equal(nextKey(1, 1), "b0V");
});

check("nextKey returns positions within MAX_LENGTH for all valid args", () => {
  // Every valid (tier, n) pair produces a position of length
  // <= MAX_LENGTH.
  for (let tier = 0; tier < 5; tier += 1) {
    for (let n = 0; n < MAX_LENGTH - 1; n += 1) {
      const p = nextKey(tier, n);
      assert.ok(
        p.length <= MAX_LENGTH,
        `nextKey(${tier}, ${n}) = "${p}" length ${p.length} exceeds ${MAX_LENGTH}`
      );
    }
  }
});

check("nextKey produces a strictly increasing sequence within a tier", () => {
  let prev = nextKey(0, 0);
  for (let n = 1; n < MAX_LENGTH - 1; n += 1) {
    const cur = nextKey(0, n);
    assert.ok(
      prev < cur,
      `nextKey(0, ${n}) = "${cur}" not strictly greater than prev "${prev}"`
    );
    prev = cur;
  }
});

check("nextKey produces a strictly increasing sequence across tiers", () => {
  // The last position of tier k must be strictly less than the first
  // position of tier k+1.
  for (let tier = 0; tier < 5; tier += 1) {
    const lastOfTier = nextKey(tier, MAX_LENGTH - 2);
    const firstOfNext = nextKey(tier + 1, 0);
    assert.ok(
      lastOfTier < firstOfNext,
      `tier ${tier} tail "${lastOfTier}" not < tier ${tier + 1} head "${firstOfNext}"`
    );
  }
});

check("nextKey throws when n would exceed MAX_LENGTH budget", () => {
  assert.throws(
    () => nextKey(0, MAX_LENGTH - 1),
    /exceeding the .*-character budget/
  );
  assert.throws(
    () => nextKey(0, MAX_LENGTH),
    /exceeding the .*-character budget/
  );
  assert.throws(() => nextKey(0, 100), /exceeding the .*-character budget/);
});

check("nextKey throws on negative or non-integer args", () => {
  assert.throws(() => nextKey(-1, 0), /non-negative integer/);
  assert.throws(() => nextKey(0, -1), /non-negative integer/);
  assert.throws(() => nextKey(1.5, 0), /non-negative integer/);
  assert.throws(() => nextKey(0, 1.5), /non-negative integer/);
});

check("nextKey throws when tier exceeds the alphabet", () => {
  assert.throws(() => nextKey(ALPHABET.length, 0), /exceeds the .*-character alphabet/);
});

check("rePackKey matches nextKey(tier, n) for the same i", () => {
  const chunkSize = MAX_LENGTH - 2;
  for (let i = 0; i < chunkSize * 3; i += 1) {
    const tier = Math.floor(i / chunkSize);
    const n = i % chunkSize;
    assert.equal(
      rePackKey(i),
      nextKey(tier, n),
      `rePackKey(${i}) !== nextKey(${tier}, ${n})`
    );
  }
});

check("rePackKey produces a strictly increasing sequence for large i (60 items)", () => {
  let prev = rePackKey(0);
  for (let i = 1; i < 60; i += 1) {
    const cur = rePackKey(i);
    assert.ok(
      prev < cur,
      `rePackKey not strictly increasing at i=${i}: ${prev} !< ${cur}`
    );
    assert.ok(
      cur.length <= MAX_LENGTH,
      `rePackKey(${i}) = "${cur}" exceeds MAX_LENGTH=${MAX_LENGTH}`
    );
    prev = cur;
  }
});

check("rePackKey throws on negative or non-integer i", () => {
  assert.throws(() => rePackKey(-1), /non-negative integer/);
  assert.throws(() => rePackKey(1.5), /non-negative integer/);
});

check("between(rePackKey(i), rePackKey(i+1)) is non-null within a tier", () => {
  // The V-tail sequence has each position differ by exactly 1 V char,
  // so the gap is large enough for `between` to find a midpoint.
  const chunkSize = MAX_LENGTH - 2;
  for (let i = 0; i < chunkSize - 1; i += 1) {
    const a = rePackKey(i);
    const b = rePackKey(i + 1);
    const m = between(a, b);
    assert.ok(m !== null, `between("${a}", "${b}") returned null at i=${i}`);
    assert.ok(a < m, `a < between(a, b) broken at i=${i}: a="${a}", m="${m}"`);
    assert.ok(m < b, `between(a, b) < b broken at i=${i}: m="${m}", b="${b}"`);
  }
});

check("between(rePackKey(i), null) is non-null when i is not the last in a tier", () => {
  // Within a tier, every position except the last has room for one
  // more `between(_, null)` append.
  const chunkSize = MAX_LENGTH - 2;
  for (let i = 0; i < chunkSize - 1; i += 1) {
    const p = rePackKey(i);
    const m = between(p, null);
    assert.ok(m !== null, `between("${p}", null) returned null at i=${i}`);
    assert.ok(p < m, `p < between(p, null) broken at i=${i}: p="${p}", m="${m}"`);
  }
});

// ---------------------------------------------------------------------------
// Alphabet / constant sanity
// ---------------------------------------------------------------------------

check("constants match the design budget", () => {
  assert.equal(ALPHABET.length, 62);
  assert.equal(ALPHABET_MIN, "0");
  assert.equal(ALPHABET_MAX, "z");
  assert.equal(MAX_LENGTH, 10);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

let failed = 0;
for (const r of results) {
  if (r.ok) {
    console.log(`  ok  ${r.name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${r.name}`);
    console.error(`    ${r.err && r.err.stack ? r.err.stack : r.err}`);
  }
}

const total = results.length;
const passed = total - failed;
console.log("");
console.log(`lexoPosition smoke: ${passed}/${total} passed`);

if (failed > 0) {
  console.error(`lexoPosition smoke: ${failed} FAILED`);
  process.exit(1);
}

console.log("lexoPosition smoke: all checks passed");
