// OpenCITE — origin-blind regression check (R3/B.6).
//
// CRITICAL guardrail: proves that a NON-admin identity CANNOT pierce
// origin-blindness by sending `debug=1`. This script is the standing
// regression test for the product-defining privacy invariant.
//
// Usage:  node scripts/admin/probe-blind-check.mjs "<query>" [limit]
//
// Env:
//   BASE                — endpoint base (default https://citation.today/api/search)
//   OPENCITE_TEST_KEY   — REQUIRED plaintext NON-admin (free/student/pro/machine)
//                         key, sent as x-api-key. Must be a real provisioned key.
//
// Exit codes:
//   0 — PASS: origin-blind invariant held (meta.debug absent, no source fields)
//   1 — FAIL: invariant violated; the exact leak is described on stderr
//   2 — bad usage / missing env

const BASE = process.env.BASE || "https://citation.today/api/search";
const TEST_KEY = process.env.OPENCITE_TEST_KEY;

const q = process.argv[2];
const limit = process.argv[3] || "5";

// ── guard: required env ────────────────────────────────────────────────────────

if (!TEST_KEY) {
  process.stderr.write(
    "ERROR: OPENCITE_TEST_KEY is not set.\n" +
      "  Export a NON-admin (free/customer) key before running:\n" +
      "  OPENCITE_TEST_KEY=oc_live_... node scripts/admin/probe-blind-check.mjs \"<query>\"\n"
  );
  process.exit(2);
}

if (!q) {
  process.stderr.write(
    'Usage: node scripts/admin/probe-blind-check.mjs "<query>" [limit]\n'
  );
  process.exit(2);
}

// ── fetch with debug=1 using a NON-admin key ───────────────────────────────────

const url = `${BASE}?q=${encodeURIComponent(q)}&limit=${limit}&debug=1`;
const t0 = Date.now();

let res, body;
try {
  res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-api-key": TEST_KEY,
    },
  });
} catch (e) {
  process.stderr.write(`fetch error: ${e}\n`);
  process.exit(2);
}

const wallMs = Date.now() - t0;
const ct = res.headers.get("content-type") || "";

if (!ct.includes("json")) {
  process.stderr.write(
    `ERROR: non-JSON response (HTTP ${res.status}) — cannot assert invariant.\n` +
      `  wallMs=${wallMs}\n`
  );
  process.exit(2);
}

body = await res.json();

// ── assert origin-blind invariants ─────────────────────────────────────────────
//
// A non-admin key with debug=1 MUST yield:
//   (a) meta.debug absent — the debug envelope must not materialize
//   (b) no result.source field — the upstream adapter id must stay stripped
//
// Both are checked independently so a partial leak is caught and described
// precisely: a future regression might plug one gap but miss the other.

const results = Array.isArray(body.results) ? body.results : [];
const meta = body.meta ?? {};
const failures = [];

// Check (a): meta.debug must be absent
if (meta.debug !== undefined && meta.debug !== null) {
  failures.push(
    "LEAK(a): meta.debug was present in the non-admin response.\n" +
      "  debug=1 was honored for a non-admin identity — origin-revealing\n" +
      "  adapter telemetry (per-adapter ms/candidates, dedup trace, coverage\n" +
      "  internals) is visible to non-admin callers. Fix: gate debug envelope\n" +
      "  creation on `identity.admin === true` in search.js."
  );
}

// Check (b): no result may carry a `source` field
const leakingResults = results.filter(
  (r) => r.source !== undefined && r.source !== null
);
if (leakingResults.length > 0) {
  const examples = leakingResults
    .slice(0, 3)
    .map((r) => `    rank=${results.indexOf(r) + 1} source="${r.source}" title="${(r.title || "").slice(0, 60)}"`)
    .join("\n");
  failures.push(
    `LEAK(b): ${leakingResults.length} result(s) carry a \`source\` field in the non-admin response.\n` +
      "  The upstream adapter id is visible to non-admin callers despite debug=1.\n" +
      "  Examples:\n" +
      examples + "\n" +
      "  Fix: ensure toPublicResult (not toDebugResult) is used for non-admin results."
  );
}

// ── report ─────────────────────────────────────────────────────────────────────

console.log("");
console.log(`  query    : ${body.query ?? q}`);
console.log(`  HTTP     : ${res.status}`);
console.log(`  coverage : ${body.coverage ?? "(none)"}`);
console.log(`  count    : ${body.count ?? 0}  (wallMs=${wallMs})`);
console.log("");

if (failures.length === 0) {
  console.log("PASS — origin-blind invariant held for non-admin identity with debug=1.");
  console.log("  meta.debug: absent  |  source fields: none");
  console.log("");
  process.exit(0);
} else {
  console.error("FAIL — origin-blind invariant VIOLATED. Details:");
  console.error("");
  for (const f of failures) {
    console.error(f);
    console.error("");
  }
  process.exit(1);
}
