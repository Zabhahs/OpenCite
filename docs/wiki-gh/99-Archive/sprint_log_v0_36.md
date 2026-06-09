<!-- AUTO-GENERATED from docs/wiki/99-Archive/sprint_log_v0_36.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->
# OpenCITE — Sprint Log v0.36

> **PM + architecture document for the next Claude instance(s).** Self-contained execution
> plan for **diagnostic search isolation** — a "simple search" mode that bypasses all
> filters, scoring, dedup, and confidence gates to expose raw adapter/extension output,
> so we can identify whether the search pipeline is corrupting results or whether the
> upstream adapters are the source of issues like OpenLib 403 and BL timeout.
>
> Read `architecture_report_v0_30.md` (project context) + `sprint_log_v0_35.md`
> (the ranker defects we're investigating) first.
>
> **Created:** 2026-05-31 · **Status:** PLANNED — not executed.
> **Mode:** C (plan → approval → execute → checklist). No padding; precise execution.

---

## 0. TL;DR

**The problem:** searches return 403 (OpenLib), timeouts (BL), and suspiciously poor
relevance. We've invested heavily in filters, scoring, dedup, confidence gates, and the
ranker — but we don't know if the upstream adapters are working or if our pipeline breaks
them. **The hypothesis:** the search modules (scoring, dedup, gates) are corrupting or
filtering out good results, masking adapter issues.

**The diagnostic:** add a "Simple Search" mode — zero processing, just return raw adapter
results in the order they arrive — so we can see whether a query works at all in the
upstream, and compare side-by-side with the production pipeline. This is **not** a
user-facing feature; it is a **developer testing harness** to refactor from a known-good
baseline.

| Layer | Today | v0.36 "Simple" | Effect |
|---|---|---|---|
| **Retrieval** | Fan-out `adapter.search(query)` | Same | Baseline: does the upstream work? |
| **Normalize** | `UnifiedResult` mapping | Same | We still need a shape |
| **Dedup** | Pool-level, by inferred field | **SKIP** | Do duplicates exist upstream, or do we create them? |
| **Scoring** | BM25F + RRF (v0.35) | **SKIP** | Do bad scores corrupt ranking? |
| **Confidence gate** | Exclude `lowConfidence` results | **SKIP** | Do gates drop keepers? |
| **Coverage band** | Min threshold logic | **SKIP** | Is the band-drop from gates or timeouts? |
| **Reorder/render** | Public-facing, origin-blind | Minimal: bare order, IDs only | See what we're really getting |

**Outcome:** side-by-side queries (production vs. simple) tell us:
- Is the 403 in the adapter (will show in simple) or in the post-normalize pipeline?
- Are the BL timeouts real timeouts or a scoring/gate artifact?
- Which modules are safe to refactor and which are load-bearing?

---

## 1. Design — "simple search" endpoint

Add a **hidden, developer-only** endpoint `/api/search/simple` (or a flag `?simple=1` on
`/api/search`) that:

1. **Calls adapters** (unchanged — same retrieval).
2. **Normalizes to UnifiedResult** (unchanged — we need a shape).
3. **Skips:** dedup, scoring, confidence gates, coverage logic.
4. **Returns:** the raw merged pool, in-adapter order (first adapter's results, then second,
   etc.), with minimal fields: `{ id, title, url, year, source, authorCount, citedBy }`.
   No `score`, no `inferred-*`, no `confidence`. The **source field is NOT stripped** — we
   need to know which adapter is producing what.

**Query shape:**
```
GET /api/search?q=kubernetes&simple=1       # or ?simpleMode=true
GET /api/search?q=kubernetes&simplify=1     # (pick one flag name)
```

**Response:**
```json
{
  "results": [
    { "id": "oa_abc", "title": "...", "url": "...", "source": "openalex", "year": 2021 },
    { "id": "xrf_def", "title": "...", "url": "...", "source": "crossref", "year": 2021 },
    ...
  ],
  "simpleMode": true,
  "pipeline": "raw",
  "note": "Results in adapter order, unscored. For debugging only."
}
```

**Access control:** No `needsAuth`, but could log/meter separately. Intended for
developer + internal QA.

---

## 2. Implementation approach

**File edits:**
- `api/search.js` — add flag check + conditional skip of dedup/score/gates
- `api/_shared/publicResult.js` — option to **not strip** `source` field in simple mode
- New export from `src/lib/search.js` or inline: `export const rawPipelinePool` (the
  post-retrieve, pre-dedup state)

**Minimal code path:**
```js
// api/search.js
export default async function handler(req, res) {
  const { q, sources, simple, limit, offset } = req.query;
  const simpleMode = simple === "1" || simple === "true";
  
  if (!q) return res.status(400).json({ error: "No query" });
  
  // Standard retrieval (unchanged)
  const poolResults = await runSearch(q, settings, { sources, limit, offset });
  
  if (simpleMode) {
    // Raw pool, in order, with source visible
    const simple = poolResults.map(r => ({
      id: r.id,
      title: r.title,
      url: r.url,
      source: r.source,  // NOT stripped
      year: r.year,
      authorCount: r.authorCount || null,
      citedBy: r.citedBy || null
    }));
    return res.status(200).json({
      results: simple,
      simpleMode: true,
      pipeline: "raw",
      note: "Unprocessed adapter output for debugging."
    });
  }
  
  // Production pipeline (today's dedup → score → gate → render)
  const deduped = dedup(poolResults);
  const scored = scoreResults(deduped);
  const gated = applyConfidenceGate(scored);
  const publicCards = gated.map(r => publicResult(r));  // strips source
  
  const coverage = determineCoverageBand(gated, sources);
  return res.status(200).json({
    results: publicCards,
    coverage,
    totalCandidates: gated.length,
    ...
  });
}
```

**Why this works:**
- No new dependencies, no refactor of core modules.
- Minimal gate (early-return in `api/search.js`).
- The raw pool is already computed; we just skip the expensive ops.
- Simple mode is **explicit and labeled** — no ambiguity in logs/metrics.

---

## 3. Testing matrix

Run these side-by-side and document findings:

| Query | Production | Simple | Expected |
|---|---|---|---|
| `kubernetes` | Check pool, score range, top-3 | Check raw order, source mix | Simple should show *all* adapters' hits; Production should show post-gate hits |
| `openlib test` | HTTP 403 or results? | Raw adapter output (does it error?) | If simple returns results, the 403 is in production pipeline; if both 403, it's the adapter |
| `british library` | Timeout, partial coverage | Does retrieval even complete? | If simple hangs, BL adapter times out; if simple returns results, pipeline gates them |
| `memon` (v0.35 baseline) | OCR garbage top-3 | Raw relevance order from adapters | Should show whether the ranker is the problem or the adapter is returning garbage *first* |

**Harness reuse:** extend `scripts/stress/probe.mjs` to accept `?simple=1` and append side-by-side
columns to findings tables.

---

## 4. Execution plan

**T1 — Add simple-mode flag (~2 hours)**
- [ ] T1.1 `api/search.js`: add `simple` flag check + early-return with raw pool.
- [ ] T1.2 `api/_shared/publicResult.js`: option to preserve `source` in simple mode
      (or inline in T1.1's response map).
- [ ] T1.3 Manual test: `curl "http://localhost:3000/api/search?q=kubernetes&simple=1"`
      locally + on Vercel preview. Confirm `source` is visible, results in adapter order,
      no score.

**T2 — Diagnostic queries (~3 hours)**
- [ ] T2.1 Run baseline `{ kubernetes, openlib test, british library, memon, mughal }`
      queries on **both** production and simple modes.
- [ ] T2.2 Document findings in a new file `SEARCH_DIAGNOSTIC_v0_36.md`:
      - Per-query: production pool size vs. simple pool size.
      - Per-query: score range in production, raw order in simple.
      - Per-adapter: does it appear in simple? Does it appear in production?
      - Errors: any 403, timeout, or error message in either mode?
- [ ] T2.3 Append side-by-side comparison table to `search_quality_findings.md` (or keep
      separate for clarity).

**T3 — Root-cause assessment (~2 hours)**
- [ ] T3.1 Analyze findings:
      - If simple has results but production doesn't → **dedup/gate is the culprit**.
      - If simple has results but they're in wrong order → **scoring is the culprit**.
      - If simple hangs / 403s → **adapter or retrieval is the culprit**.
- [ ] T3.2 Write a **root-cause summary** (200 words max) in `SEARCH_DIAGNOSTIC_v0_36.md`:
      which refactor is safe, which is broken, next sprint's target.

**T4 — Clean up before merge (~1 hour)**
- [ ] T4.1 Confirm simple mode is **not** accessible to browser-app users (header check
      or API-only gate, depending on threat model).
- [ ] T4.2 Add a comment in `api/search.js`: "Simple mode is for developer diagnosis.
      Remove or gate before shipping."

---

## 5. Acceptance criteria

- [ ] `/api/search?q=X&simple=1` returns raw adapter results in-order, with `source` visible.
- [ ] Side-by-side queries (`simple=0` vs `simple=1`) run for all diagnostic queries without
      error.
- [ ] Findings table in `SEARCH_DIAGNOSTIC_v0_36.md` shows:
      - Pool size (simple vs. production) per query.
      - Per-adapter presence (appears in simple? appears in production?).
      - Error/timeout symptoms isolated to a specific layer.
- [ ] Root-cause assessment concludes which module(s) are the suspected culprit(s).
- [ ] No production search regression (simple mode does not affect `?simple=0` or absent).

---

## 6. Risk register

| ID | Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | T1.1 | Simple mode accidentally becomes user-visible or metered as a real variant | Low | Med | Comment flag the code path; no docs/UI mention; log separately if needed |
| R2 | T2.1 | OpenLib 403 persists in simple mode ⇒ issue is in the adapter, not pipeline | Med | Low | Already useful diagnosis; document as-is; out-of-scope for this sprint |
| R3 | T2.1 | BL timeout persists in simple mode ⇒ the adapter is the bottleneck | Med | Low | Useful diagnosis; accept; next sprint may explore streaming or timeout raise |
| R4 | T3.1 | Findings are inconclusive (simple ≈ production) ⇒ the problem is elsewhere | Low | Med | Expand diagnostic queries; check error logs / adapter internals separately |

---

## 7. Definition of done

- [ ] Simple mode flag implemented and tested locally + on Vercel.
- [ ] Diagnostic queries run and results documented in `SEARCH_DIAGNOSTIC_v0_36.md`.
- [ ] Root-cause assessment complete: which module(s) are suspected culprits?
- [ ] No regression on production search (`simple=0` or absent).
- [ ] Code path is commented as developer-only; ready for removal or gating before
      production release.

---

## 8. Relationship to v0.35

v0.35 (search-relevance integrity) is a refactor based on the **assumption** that the
ranker (D1–D5) is the problem. v0.36 **tests that assumption** by isolating the pipeline.
If v0.36 findings say the ranker is healthy but the adapters are broken, v0.35's work is
still valuable (a good ranker on bad input is better than a bad ranker on bad input) — but
the **real** next sprint is adapter-focused, not score-focused.

If v0.36 findings say the pipeline is dropping results, v0.35's work is prerequisite to
trusting the ranking we get *after* we fix the pipeline.

**Sequence:** v0.36 is **parallel diagnosis**, not blocking. Ship whichever unblocks the
most refactor work.

---

*End v0.36 sprint plan. T1–T4 this sprint. Outcome: a side-by-side diagnostic view that
tells us whether the adapters or the pipeline is broken, so v0.37+ can refactor with
confidence.*
