// OpenCITE — admin debug probe for /api/search.
//
// Drives /api/search with an admin API key and `debug=1`, then pretty-prints
// the origin-REVEALING envelope (source fields, per-adapter latency, dedup
// trace, coverage internals). This script is INTENTIONALLY not origin-blind:
// it exercises the admin-only debug path and is a dev/CI tool only.
//
// Usage:  node scripts/admin/probe.mjs "<query>" [limit]
//
// Env:
//   BASE               — endpoint base (default https://citation.today/api/search)
//   OPENCITE_ADMIN_KEY — REQUIRED plaintext admin API key (sent as x-api-key)
//
// Flags:
//   --assert-admin  Exit 1 if the admin debug envelope failed to materialize
//                   (no result carries `source`, or meta.debug is absent).
//                   Useful as a CI/preview smoke check.

const BASE = process.env.BASE || "https://citation.today/api/search";
const ADMIN_KEY = process.env.OPENCITE_ADMIN_KEY;

const q = process.argv.filter((a) => !a.startsWith("--"))[2];
const limit = process.argv.filter((a) => !a.startsWith("--"))[3] || "10";
const assertAdmin = process.argv.includes("--assert-admin");

// ── guard: required env ────────────────────────────────────────────────────────

if (!ADMIN_KEY) {
  process.stderr.write(
    "ERROR: OPENCITE_ADMIN_KEY is not set.\n" +
      "  Export the plaintext admin key before running:\n" +
      "  OPENCITE_ADMIN_KEY=oc_live_... node scripts/admin/probe.mjs \"<query>\"\n"
  );
  process.exit(2);
}

if (!q) {
  process.stderr.write(
    'Usage: node scripts/admin/probe.mjs "<query>" [limit] [--assert-admin]\n'
  );
  process.exit(2);
}

// ── helpers ────────────────────────────────────────────────────────────────────

// Right-pad or truncate a string to a fixed column width for table alignment.
const col = (s, w) => String(s ?? "").slice(0, w).padEnd(w);
// Right-align a number in a fixed column width.
const rcol = (n, w) => String(n ?? "").slice(0, w).padStart(w);

// ── fetch ──────────────────────────────────────────────────────────────────────

const url = `${BASE}?q=${encodeURIComponent(q)}&limit=${limit}&debug=1`;
const t0 = Date.now();

let res, body;
try {
  res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-api-key": ADMIN_KEY,
    },
  });
  const wallMs = Date.now() - t0;
  const ct = res.headers.get("content-type") || "";

  if (!ct.includes("json")) {
    console.log(`HTTP ${res.status}  (non-JSON response, wallMs=${wallMs})`);
    console.log(await res.text());
    process.exit(0);
  }

  body = await res.json();

  // ── top-level envelope ────────────────────────────────────────────────────

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("  OpenCITE admin debug probe");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  query            : ${body.query ?? q}`);
  console.log(`  HTTP status      : ${res.status}`);
  console.log(`  coverage         : ${body.coverage ?? "(none)"}`);
  console.log(`  count            : ${body.count ?? 0}`);
  console.log(`  totalCandidates  : ${body.totalCandidates ?? "(none)"}`);
  console.log(`  tookMs           : ${body.tookMs ?? "(none)"}`);
  console.log(`  wallMs           : ${wallMs}`);
  console.log(`  lowConfidence    : ${body.lowConfidence ?? false}`);
  console.log("");

  // ── meta / billing ─────────────────────────────────────────────────────────

  const meta = body.meta ?? {};
  if (Object.keys(meta).length > 0) {
    console.log("── meta ────────────────────────────────────────────────────────");
    if (meta.creditsCharged !== undefined) console.log(`  creditsCharged   : ${meta.creditsCharged}`);
    if (meta.balance !== undefined)        console.log(`  balance          : ${meta.balance}`);
    console.log("");
  }

  // ── meta.debug ─────────────────────────────────────────────────────────────

  const dbg = meta.debug ?? null;
  if (dbg) {
    console.log("── meta.debug ──────────────────────────────────────────────────");

    // per-adapter table
    const adapters = Array.isArray(dbg.perAdapter) ? dbg.perAdapter : [];
    if (adapters.length > 0) {
      console.log("");
      console.log("  Per-adapter breakdown:");
      console.log(
        "  " +
          col("id", 16) +
          rcol("ms", 6) +
          rcol("cands", 7) +
          "  errored"
      );
      console.log("  " + "─".repeat(38));
      for (const a of adapters) {
        console.log(
          "  " +
            col(a.id, 16) +
            rcol(a.ms, 6) +
            rcol(a.candidates, 7) +
            "  " +
            (a.errored ? "YES" : "no")
        );
      }
      console.log("");
    }

    // dedup trace
    const dedup = dbg.dedup ?? null;
    if (dedup) {
      console.log("  Dedup trace:");
      console.log(`    raw          : ${dedup.raw ?? "(none)"}`);
      console.log(`    afterDoi     : ${dedup.afterDoi ?? "(none)"}`);
      console.log(`    afterTitle   : ${dedup.afterTitle ?? "(none)"}`);
      console.log("");
    }

    // coverage internals
    const cov = dbg.coverage ?? null;
    if (cov) {
      console.log("  Coverage internals:");
      console.log(`    rawPercent   : ${cov.rawPercent ?? "(none)"}`);
      console.log(`    failedCount  : ${cov.failedCount ?? "(none)"}`);
      console.log(`    band         : ${cov.band ?? "(none)"}`);
      console.log("");
    }
  } else {
    console.log("── meta.debug: (absent — admin debug envelope did not materialize) ──");
    console.log("");
  }

  // ── result rows ────────────────────────────────────────────────────────────

  const results = Array.isArray(body.results) ? body.results : [];
  if (results.length > 0) {
    console.log("── results ─────────────────────────────────────────────────────");
    console.log("");
    console.log(
      "  " +
        col("#", 3) +
        col("source", 18) +
        rcol("score", 7) +
        rcol("year", 5) +
        rcol("citedBy", 8) +
        "  title"
    );
    console.log("  " + "─".repeat(80));
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const title = (r.title || "(no title)").slice(0, 78);
      console.log(
        "  " +
          col(i + 1, 3) +
          col(r.source ?? "(hidden)", 18) +
          rcol(r.score != null ? Number(r.score).toFixed(4) : "(n/a)", 7) +
          rcol(r.year ?? "", 5) +
          rcol(r.citedBy ?? "", 8) +
          "  " +
          title
      );
    }
    console.log("");
  } else {
    console.log("  (no results)");
    console.log("");
  }

  // ── --assert-admin check ───────────────────────────────────────────────────

  if (assertAdmin && results.length > 0) {
    const hasSource = results.some((r) => r.source !== undefined && r.source !== null);
    const hasDebug = !!dbg;
    if (!hasSource || !hasDebug) {
      const missing = [];
      if (!hasSource) missing.push("no result carries a `source` field");
      if (!hasDebug)  missing.push("`meta.debug` is absent");
      console.error("ASSERT-ADMIN FAILED: admin debug envelope did not materialize.");
      for (const m of missing) console.error(`  - ${m}`);
      process.exit(1);
    }
    console.log("ASSERT-ADMIN PASSED: source fields present + meta.debug materialized.");
    console.log("");
  }
} catch (e) {
  const wallMs = Date.now() - t0;
  console.error(`fetch error after ${wallMs}ms: ${e}`);
  process.exit(1);
}
