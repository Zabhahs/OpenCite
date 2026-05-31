// v0.36 T1.3 — local smoke test for ?simple=1 diagnostic mode.
// Invokes the /api/search handler in-process with a mock req/res, authed as the
// admin master key, so we exercise the real adapter fan-out + the new simple-mode
// branch WITHOUT needing Vercel, Supabase, or the production master key.
//
// Usage:  node scripts/stress/simple_smoke.mjs "<query>" [sources]
//   sources defaults to OPENALEX,CROSSREF,DOAJ (fast keyless core).
//   pass "ALL" to omit the sources param entirely → the full server-safe tier set.
//
// Sets OPENCITE_API_KEY locally so resolveApiKey() grants the admin identity.

process.env.OPENCITE_API_KEY = process.env.OPENCITE_API_KEY || "local-smoke-master";

const q = process.argv[2] || "kubernetes";
const sourcesArg = process.argv[3] ?? "OPENALEX,CROSSREF,DOAJ";
const sources = sourcesArg.toUpperCase() === "ALL" ? "" : sourcesArg;

const { default: handler } = await import("../../api/search.js");

function mockRes() {
  return {
    statusCode: 200,
    _headers: {},
    _body: "",
    setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
    end(body) { this._body = body ?? ""; this._done = true; },
  };
}

async function call(simple) {
  const req = {
    method: "GET",
    headers: { "x-api-key": process.env.OPENCITE_API_KEY, accept: "application/json" },
    query: { q, limit: "10", ...(sources ? { sources } : {}), ...(simple ? { simple: "1" } : {}) },
  };
  const res = mockRes();
  await handler(req, res);
  let parsed;
  try { parsed = JSON.parse(res._body); } catch { parsed = res._body; }
  return { status: res.statusCode, body: parsed };
}

console.log(`\n=== query="${q}"  sources=${sources} ===\n`);

const simple = await call(true);
console.log("SIMPLE  http", simple.status,
  "| simpleMode:", simple.body?.simpleMode,
  "| count:", simple.body?.count,
  "| failed:", JSON.stringify(simple.body?.failedAdapters));
console.log("  perAdapter:", JSON.stringify(simple.body?.perAdapter));
console.log("  first 5 raw (source VISIBLE, no score):");
for (const r of (simple.body?.results || []).slice(0, 5)) {
  console.log(`    [${r.source}] ${(r.title || "").slice(0, 70)}  (yr=${r.year}, cit=${r.citedBy})`);
}
// Invariants we assert for T1.3:
const ok =
  simple.status === 200 &&
  simple.body?.simpleMode === true &&
  simple.body?.pipeline === "raw" &&
  Array.isArray(simple.body?.results) &&
  simple.body.results.every((r) => "source" in r) &&             // source NOT stripped
  simple.body.results.every((r) => !("score" in r) && !("_score" in r)); // no score
console.log("\n  T1.3 invariants (200 + simpleMode + source visible + no score):", ok ? "PASS ✅" : "FAIL ❌");

const prod = await call(false);
console.log("\nPROD    http", prod.status,
  "| coverage:", prod.body?.coverage,
  "| count:", prod.body?.count,
  "| cand:", prod.body?.totalCandidates);
console.log("  first 3 public (source STRIPPED, has score):");
for (const r of (prod.body?.results || []).slice(0, 3)) {
  console.log(`    sc=${r.score} ${(r.title || "").slice(0, 70)}  (hasSource=${"source" in r})`);
}
console.log("");
