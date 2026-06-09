<!-- AUTO-GENERATED from docs/wiki/99-Archive/sprint_log_v0_33.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->
# OpenCITE — Sprint Log v0.33

> **PM + architecture document for the next Claude instance(s).** Brainstorm + scoped plan for an
> **internal admin console** whose single purpose is making the **search algorithm and adapters
> measurably better, faster** — turning relevance/adapter work from guesswork into a tight,
> instrumented loop.
> Read `architecture_report_v0_30.md` for project context, `sprint_log_v0_32.md` for the debug
> substrate this builds on, and `sprint_log_v0_31.md` for the RRF/BM25F control work it productizes.
>
> **Created:** 2026-05-31 · **Status:** BRAINSTORM → to be scoped to a buildable T1 on approval.
> **Mode:** C (plan → approval → execute → checklist).

---

## 0. TL;DR

v0.32 gives my agent a machine-readable **debug envelope** (origin-revealing cards, per-adapter
telemetry, dedup trace, coverage internals). v0.33 puts a **human-facing console** on top of that
same data so Shahbaz can *see* why ranking behaves as it does, change a tunable, and measure the
effect against a fixed gold set — without a redeploy.

**The console is admin-gated and reuses the v0.32 `admin` identity + `debug=1` endpoint as its only
data source** — no new origin-blind violations, one auth gate, one telemetry contract.

Features below are grouped into tiers by value-per-effort. **Recommended T1** (build this sprint):
F1 (Score Explainer) + F2 (Gold-Set Regression Harness). Everything else is the menu to pick from.

| # | Feature | Tier | Effort | Core dependency |
|---|---|---|---|---|
| **F1** | **Score Explainer** (per-result signal breakdown) | **T1** | ~½ day | v0.32 debug cards |
| **F2** | **Gold-Set Regression Harness** (saved queries + nDCG/MRR) | **T1** | ~1.5 day | v0.32 debug + a labels table |
| F3 | Live Tunable Playground (RRF / BM25F sliders → instant re-rank) | T2 | ~1 day | scoring.js override refactor (v0.31 T2) |
| F4 | A/B Scoring Diff (two configs, same query, side-by-side) | T2 | ~1 day | F3 |
| F5 | Adapter Health Dashboard (latency / yield / error / coverage over time) | T2 | ~1 day | v0.32 per-adapter telemetry + a metrics sink |
| F6 | Adapter Playground (test one adapter in isolation against a query) | T2 | ~½ day | adapter registry |
| F7 | Dedup Inspector (merge decisions, fingerprint collisions) | T3 | ~½ day | v0.32 dedup trace |
| F8 | Relevance Labeling UI (build/curate the gold set) | T3 | ~1 day | F2 labels table |
| F9 | Coverage Band Calibration (tune the multiplier curve) | T3 | ~½ day | coverage.js |

---

## 1. Context — why a console, and why now

Relevance work today is blind: scoring lives in `src/lib/scoring.js` (BM25F: `FIELD_WEIGHTS
{title:3, abstract:1, keywords:2}`, `K1:1.5`, `B:0.75`) and RRF fusion at `0.6/0.4`
(`useSemanticRerank.js`), and the *only* feedback is eyeballing result order. There is no way to ask
"did this change make ranking better or worse, and by how much?" The v0.32 debug envelope makes the
pipeline observable; v0.33 makes it **steerable and measurable**. The unlock is a **gold set** —
once a handful of queries have known-good rankings, every tuning change gets a number.

**Architectural spine (shared by all features):** a single admin-only console route group that calls
`/api/search?...&debug=1` with the v0.32 admin key, plus one new table for human relevance labels.
No feature reaches into the search pipeline directly — they all consume the debug contract, so the
console can never drift from (or weaken) the production response.

---

## 2. Feature catalog

### F1 — Score Explainer  *(T1)*
**What:** paste a query → ranked list where each card expands into its score math: BM25F per-field
contribution (title/abstract/keywords), phrase/proximity/thin-source bonuses, the RRF lexical vs
semantic rank inputs, and the confidence-gate disposition (kept / dropped / best-guess).
**Why:** the fastest possible "why is *this* above *that*?" answer — converts the v0.32 debug JSON
into something readable, and is the prerequisite intuition for every tuning decision.
**Data:** v0.32 debug cards (`_score` + per-signal breakdown) directly. **Effort:** ~½ day (render-only).

### F2 — Gold-Set Regression Harness  *(T1)*
**What:** a stored set of `{ query → expected top-N (DOIs) with graded relevance }`. One click runs
every gold query through the live pipeline and reports **nDCG@10 / MRR / recall@N** per query and in
aggregate, with a diff vs the last run. Becomes the objective gate for any scoring/adapter change.
**Why:** turns "feels better" into a number; catches relevance regressions (cf. the v0.27 confidence
-gate incident) before they ship. This is the single highest-leverage thing on the list.
**Data:** v0.32 debug (stable DOIs per result) + a new `relevance_labels` table
(`query, doi, grade, created_at`). **Effort:** ~1.5 day. Seed the gold set with F8 or by hand/SQL.

### F3 — Live Tunable Playground  *(T2)*
**What:** sliders for RRF lexical↔semantic (productizes v0.31 T1) **and** BM25F field weights + K1/B,
re-ranking a fixed candidate set **instantly** without re-fetching. "Apply to defaults" promotes a
config.
**Why:** closes the tuning loop to seconds. **Dependency:** requires the `scoring.js` SSOT refactor
to accept weight overrides (the v0.31 T2 deferral, `scoring.js:10-12`) — defaulting to current
constants so server behavior is unchanged until promoted. **Effort:** ~1 day after that refactor.

### F4 — A/B Scoring Diff  *(T2)*
**What:** run one query under config A and config B; show the two rankings side-by-side with
movement arrows and the F2 metrics for each. **Why:** makes the effect of a tunable change legible
beyond a single query. **Dependency:** F3. **Effort:** ~1 day.

### F5 — Adapter Health Dashboard  *(T2)*
**What:** per-adapter time series of p50/p95 latency, candidate yield, error/timeout rate, and
coverage contribution, from real traffic. **Why:** answers "which adapter is slow/empty/flaky?" —
the adapter-side counterpart to F1's algorithm view; directly informs the 12s `ADAPTER_TIMEOUT_MS`
and which sources to add/drop. **Dependency:** v0.32 emits per-adapter telemetry per request; this
needs a **metrics sink** (a `search_telemetry` table or KV rollup) to persist it. **Effort:** ~1 day
(+ the sink). Could pipe through Supabase and read via the connector.

### F6 — Adapter Playground  *(T2)*
**What:** pick one adapter + a query → its raw normalized results pre-fusion, with timing and the
capability flags (`serverSafe`, `corpusSize`, `hasCitations`) it contributes. **Why:** isolates a
new/suspect adapter from the pool so you can debug normalization without fusion noise — the natural
harness when onboarding the deferred Heritage/SRU adapters server-side. **Effort:** ~½ day.

### F7 — Dedup Inspector  *(T3)*
**What:** for a query, show what merged and why — DOI-key collisions, title-fingerprint matches, and
which copy won (highest-score). **Why:** dedup silently *changes the result set* (one work under two
DOIs, JSTOR+publisher); this surfaces false merges/splits. **Data:** v0.32 dedup trace. **Effort:** ~½ day.

### F8 — Relevance Labeling UI  *(T3)*
**What:** run a query, grade each result (0–3), save to the `relevance_labels` table that feeds F2.
**Why:** the gold set is the bottleneck for F2/F4; this makes building it fast and repeatable.
**Effort:** ~1 day.

### F9 — Coverage Band Calibration  *(T3)*
**What:** visualize the `coverageMultiplier` curve and the band thresholds against real coverage
distributions; tune where `limited`/`partial`/`high`/`near-full`/`full` fall. **Why:** coverage
proration is now a **billing** input (v0.32) — mis-calibrated bands directly mis-charge. **Effort:** ~½ day.

---

## 3. Recommended cut & sequencing

**This sprint (T1):** F1 + F2. Rationale: F1 is near-free on top of v0.32 and gives immediate
insight; F2 is the objective measurement loop everything else is judged against. Together they make
relevance work *empirical* with minimal new surface (one route group, one labels table).

**Next (T2):** F3 → F4 (tuning loop), then F5 + F6 (adapter loop). F3 is gated on the `scoring.js`
override refactor — do that refactor first as it also unblocks v0.31 T2.

**Later (T3):** F7, F8, F9 as the gold set and adapter roster grow.

**Build order within T1:** (1) admin console route group reusing the v0.32 `admin` gate; (2)
`relevance_labels` table (migration via Supabase connector); (3) F1 render of debug cards; (4) F2
metrics + diff.

---

## 4. Cross-cutting constraints

- **Admin-only, reuse v0.32 gate.** Every console route requires `identity.admin`; the console is
  the *only* consumer of `debug=1` besides my agent's harness. No new auth surface.
- **Origin-blind stays intact for the public path.** The console sees origin because it is admin;
  nothing here touches `publicResult.js` or the public envelope.
- **Console reads the contract, not the pipeline.** All data via `/api/search?debug=1`. If the debug
  contract needs a field, add it in `debugResult.js` / `meta.debug` (v0.32 SSOT), never by a second
  code path.
- **SSOT for tunables.** F3/F4 must drive the *same* `scoring.js` constants the server uses (via the
  override refactor), or the console measures something the API doesn't ship — the cardinal trap.

---

## 5. Open questions (resolve before T1 execution)

- [ ] Where does the console live — a gated route in the existing SPA, or a separate `/admin` bundle?
      (Leaning: gated route, reuses auth + build.)
- [ ] Gold-set storage: Postgres `relevance_labels` (queryable, joins to nothing sensitive) vs a
      committed JSON fixture (versioned, diffable in git). Leaning Postgres for F8's write path.
- [ ] Metrics sink for F5: Supabase table vs KV rollup vs an external (Vercel Analytics)? Affects
      whether the connector can read it directly.
- [ ] Which metric is the headline gate — nDCG@10? (Recommend nDCG@10 + MRR shown, nDCG@10 gates.)

---

*End v0.33 brainstorm. Recommend scoping to T1 (F1 + F2) on approval; T2/T3 are the carried menu.*
