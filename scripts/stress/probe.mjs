// OpenCITE search-quality stress probe.
// Usage:  node scripts/stress/probe.mjs "<query>" [limit]
// Calls the live API and prints ONE compact JSON line of the signals that
// matter for relevance QA. Source origin is inferred from url/publisher
// (the public API is origin-blind by design).
//
// Env: BASE overrides the endpoint (default https://citation.today/api/search).

const BASE = process.env.BASE || "https://citation.today/api/search";
const q = process.argv[2];
const limit = process.argv[3] || "10";

if (!q) {
  console.error('need a query: node probe.mjs "<query>" [limit]');
  process.exit(2);
}

// Infer a coarse source label from the public fields (origin-blind API).
function origin(r) {
  const u = (r.url || "").toLowerCase();
  const p = (r.publisher || "").toLowerCase();
  if (u.includes("archive.org") || p.includes("internet archive")) return "IA";
  if (u.includes("openalex") || u.includes("//doi.org") && r.citedBy != null) return "OA?";
  if (u.includes("doaj") || p.includes("doaj")) return "DOAJ";
  if (r.doi) return "DOI";
  return p.slice(0, 14) || "?";
}

const t0 = Date.now();
try {
  const res = await fetch(`${BASE}?q=${encodeURIComponent(q)}&limit=${limit}`, {
    headers: { Accept: "application/json" },
  });
  const wallMs = Date.now() - t0;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) {
    console.log(JSON.stringify({ q, error: `non-json ${res.status}`, wallMs }));
    process.exit(0);
  }
  const d = await res.json();
  const out = {
    q,
    http: res.status,
    coverage: d.coverage,
    count: d.count,
    cand: d.totalCandidates,
    tookMs: d.tookMs,
    wallMs,
    lowConf: d.lowConfidence,
    results: (d.results || []).map((r) => ({
      sc: Number((r.score ?? 0).toFixed(3)),
      src: origin(r),
      cit: r.citedBy ?? null,
      yr: r.year || "",
      lang: r.language || "",
      title: (r.title || "").slice(0, 90),
    })),
  };
  console.log(JSON.stringify(out));
} catch (e) {
  console.log(JSON.stringify({ q, error: String(e), wallMs: Date.now() - t0 }));
}
