# OpenCITE — Sprint Log v0.35

> **PM + architecture document for the next Claude instance(s).** Self-contained execution
> plan for the **search-relevance integrity** sprint — fixing the structural reasons the
> ranker produces wrong, non-comparable, and non-reproducible results.
>
> Read `architecture_report_v0_19.md` (project context) + `sprint_log_v0_31.md`
> (relevance-control sliders — adjacent, partly superseded by §6 here) first.
>
> **Created:** 2026-05-31 · **Status:** PLANNED — not executed.
> **Mode:** C (plan → approval → execute → checklist). No padding; precise execution.
> **Companion artifacts (this sprint's evidence base):**
> `search_quality_stress_plan.md` (test architecture), `search_quality_findings.md`
> (synthesis), `scripts/stress/probe.mjs` (reusable live-API probe harness).

---

## 0. TL;DR

The ranker has four structural defects that compound into visibly wrong results (the
"`memon` vs `kutchi memon`" gap). All four trace to **one root cause: we throw away the
upstream APIs' native relevance signal and re-rank a tiny heterogeneous pool with a
local BM25F whose IDF is computed over 14–45 documents — which is statistical noise.**

| ID | Defect | Severity | Fix class | This sprint? |
|---|---|---|---|---|
| **D1** | Internet Archive download counts used as `citedBy` rank signal | **Critical** | config (1 line) | **Yes — T1** |
| **D2** | IA queried `sort=downloads+desc` — retrieval biased to popularity, not relevance | **Critical** | adapter (1 line) | **Yes — T1** |
| **D3** | Native upstream relevance (`relevance_score`, Solr `score`) discarded; local IDF over a micro-pool is degenerate | **High** | architecture | **Yes — T2** |
| **D4** | Cross-query score magnitude is meaningless (per-pool IDF + length-dependent phrase/proximity boost) | **High** | architecture + UX | **T2 + T3** |
| **D5** | No transliteration / diacritic normalization — variants fragment into disjoint pools | Medium | score-side layer | **T3** |
| **D6** | Surname-as-content collision (no author/topic separation) | Medium | deferred | No — §7 |
| **D7** | Coverage band + result set non-deterministic run-to-run (12 s timeout flap) | Medium | ops | **T4 (investigate)** |

**Thesis:** D1+D2 are near-free and remove the most egregious garbage immediately. D3 is
the real architectural correction — **fuse native upstream relevance with our signals
instead of replacing them** — and it subsumes D4's score-comparability problem. We have
full API documentation for every adapter (§4), so every fix below is grounded in a
verified native capability of the specific upstream, not a guess.

---

## 1. How this conclusion was reached (methodology)

This is not a hunch — it is the output of a designed, executed stress battery against the
**live** `https://citation.today/api/search` endpoint on 2026-05-31.

### 1.1 Harness
`scripts/stress/probe.mjs` — one query in, one compact JSON line out: `coverage`,
`count`, `totalCandidates` (pool size), `tookMs` (server) + `wallMs` (client),
`lowConfidence`, and per-result `{score, inferred-source, citedBy, year, language,
title}`. Source origin is inferred from `url`/`publisher` because the public API is
origin-blind (`api/_shared/publicResult.js` strips `source`). Re-runnable against any
deploy via the `BASE` env var.

### 1.2 Test architecture
An 8-category taxonomy mapped to the live pipeline
(`retrieval → scoreResults → dedup → applyConfidenceGate → coverage`), full spec in
`search_quality_stress_plan.md`:

| Cat | Hunts |
|---|---|
| A | specificity / cross-query score incomparability |
| B | dirty corpus / OCR noise |
| C | surname-as-content collision |
| D | diacritics / transliteration / script variants |
| E | degenerate / adversarial (robustness) |
| F | multi-keyword `;` semantics |
| G | known-good baselines (regression floor) |
| H | latency / coverage stability |

### 1.3 Execution
**5 Haiku sub-agents** ran in parallel, each owning a category band, ~55 distinct
queries total, calling the live API through the shared harness, each assigning per-query
verdicts (`top_relevant`, `garbage_in_top3`, `score_artifact`) and returning structured
findings tables. Raw results are in `search_quality_findings.md`.

### 1.4 Root-cause confirmation
Every defect below was then traced to a specific line in the codebase (file:line refs in
§3), so the architecture work is grounded in source, not inference.

---

## 2. The reference defect — `memon` vs `kutchi memon`

The user-reported anomaly, reproduced and dissected:

| Query | Pool | Top score | Top #1 | Relevant? |
|---|---|---|---|---|
| `memon` | 41 | **1.79** | "VIC Revealed (1982)(Hayden Book Company)" | ❌ OCR: "memory" → "memon" |
| `kutchi memon` | 14 | **16.17** | "Spice Sorcery: The Kutchi Memon Cookbook" | ✅ |

**Why they differ — and why neither is a bug in isolation, but the system is:**

1. **No query containment.** Retrieval is a literal-string fan-out, run fresh per query.
   `memon` (pool 41) and `kutchi memon` (pool 14) share **zero top titles** — one is not
   a subset of the other. There is no faceted hierarchy where "memon" is the parent of
   "kutchi/halai/sindhi memon". (This part is correct behavior, just unintuitive.)
2. **Scores are not comparable across queries.** Local IDF is computed over *each query's
   own micro-pool*, and the 2-word query earns a verbatim **phrase boost (×2/field)** +
   proximity bonus a single token cannot. The 9× jump is a **query-length artifact**.
   Confirmed across Category A: `mughal`→`mughal architecture` = 13.5×; `sufi`→`chishti
   sufi order` = 12.6×; `gujarat`→`gujarat textile trade` = 9.2×.
3. **The bare token `memon` is a retrieval trap** — dominated by (a) OCR garbage
   (`memon/` = mis-scanned "memory" in a VIC-20 manual), (b) surname collisions, and (c)
   Internet Archive download counts (973; 16 209) used as the `citedBy` rank tiebreak.

`kutchi memon` isn't "more of memon" — it is a cleaner query that dodges all three traps.
**The bare term is the broken case.** Fixing D1–D4 fixes it.

---

## 3. The defects, traced to source

### D1 — IA download counts inflate rank as `citedBy` *(Critical)*
IA items carried `citedBy` of **231 971** (`shaikh` — a "BEST ISLAMIC BOOKS" list at #1),
**225 600** (`ali`), **174 733** (`khan`), **64 378** (`qureshi`), **32 838** (`patel`),
**32 554** (`qabar`). These are downloads, not citations.
- `src/adapters/extensions/internetArchive.js:100` & `:141` — `citedBy: downloads > 0 ? downloads : null`.
- `src/adapters/extensions/internetArchive.js:158` — `rankFields: { …, citedBy: true }`
  (the inline comment on `:157` *already warns* the value is downloads, not citations).
- `src/lib/scoring.js:249-251` — adds `Math.min((r.citedBy||0)/5000, CITED_BY_CAP)` when
  `rankFields.citedBy === true`. With downloads in the slot, the cap (0.3) is always
  saturated, so every IA hit gets the full tiebreak.

### D2 — IA retrieval sorted by popularity, not relevance *(Critical)*
- `src/adapters/extensions/internetArchive.js:175` — `…&sort=downloads+desc…`.
  IA's Solr endpoint **can** sort by relevance, but we explicitly request most-downloaded.
  So we fetch the most popular items containing the token, then (D1) re-reward that same
  popularity. Popularity is double-counted; topical relevance is never consulted.

### D3 — native upstream relevance is discarded *(High — the architectural core)*
The core scholarly adapters already request and receive a *real* relevance score from a
full-corpus engine, then we drop it on the floor:
- OpenAlex — `…&sort=relevance_score:desc…` (`openalex.js:45`); each work carries a
  `relevance_score`. **Not captured into the UnifiedResult.**
- Crossref — `query.bibliographic` returns a Solr `score` per item. **Not captured.**
- DOAJ — Elasticsearch `_score` available. **Not captured.**
- IA — Solr relevance available (once D2 stops forcing `downloads` sort). **Not captured.**

Instead, `scoreResults` (`src/lib/scoring.js:191`) computes BM25F with **IDF over the
pooled candidate set** (`idf()` `:82`, `N = docsFieldTokens.length`). After dedup that
pool is **14–45 documents** (measured). IDF over ~20 docs is statistically meaningless —
a term's "rarity" is computed from a sample far too small to be a corpus signal, so the
ranking is driven by raw term-frequency, field length, and the phrase/proximity bonuses
rather than by genuine discriminative weight. **We replaced four full-corpus relevance
engines with one degenerate 20-doc one.**

### D4 — cross-query score magnitude is meaningless *(High)*
Consequence of per-pool IDF (`:215`) + length-dependent phrase (`PHRASE_BOOST=2.0`,
`:13`) and proximity (`:14`) boosts (`:236-239`). A "16.17" and a "1.79" are not on the
same scale; users cannot compare confidence across searches, and longer queries
structurally score higher regardless of true relevance.

### D5 — no transliteration / diacritic normalization *(Medium)*
`Quran` / `Qur'an` / `Koran` → **0/5 top-title overlap**; the apostrophe variant scored
12.47 vs 1.60. `Muhammad` / `Mohammed` → 20 % overlap. `tokenize()`
(`src/lib/scoring.js:64`) splits on `\W+` (so `Qur'an` → `qur`+`an`) and there is no
fold/alias step. `src/lib/synonyms.js` already proves the pattern (score-side widening
without changing the upstream query) — D5 is the same shape for orthographic variants.

### D6 — surname-as-content collision *(Medium, deferred)*
4 of 5 surnames (`khan`, `ali`, `shaikh`, `qureshi`; `patel` partial) returned an
author/passing-mention #1. BM25F scores title/abstract/keywords with no awareness the
token is a person name. Hard to fix well without NER or query-intent — deferred (§7).

### D7 — non-deterministic coverage / result set *(Medium, ops)*
Identical `climate change` × 5 → `tookMs` {1575, 3331, 12006, 12003, 12006}; coverage
flapped `high ↔ partial`; pool 39–45. Adapters that time out (`ADAPTER_TIMEOUT_MS=12000`,
`api/search.js:47`) on a given run drop out of the pool → change IDF → change ordering
*and* which results survive `applyConfidenceGate`. Results are not reproducible.

### What is NOT broken (verified, do not touch)
- **Robustness (Cat E): clean.** XSS/SQLi/emoji/DOI-slash/stopword-only → all HTTP 200,
  valid JSON, injection treated as literal strings, no reflection, gate sane.
- **Baselines (Cat G): 6/6 on-topic #1** — relevance floor holds.
- **Multi-keyword `;` (Cat F):** OR-union semantics + dedup work as designed.

---

## 4. Native API capabilities we can exploit (full-docs survey)

Per-adapter, what the *upstream* natively offers for relevance — the foundation for the
D3/D4 fix. (Capabilities below are documented features of each API; verify the exact
field name against the live response when wiring.)

| Source | Native relevance signal | Genuine citation count | Native sort | Notes |
|---|---|---|---|---|
| **OpenAlex** | `relevance_score` per work | `cited_by_count` (real) | `relevance_score:desc` ✓ already used | Also supports `search` group stemming; `select=` already trims payload |
| **Crossref** | Solr `score` per item | `is-referenced-by-count` (real) | relevance default on `query.bibliographic` | `score` is comparable within one query |
| **DOAJ** | Elasticsearch `_score` | none | relevance default | currently `rankFields.citedBy:false` ✓ correct |
| **Curated** | `relevance_score` (OpenAlex-backed) | `cited_by_count` (real) | `relevance_score:desc` ✓ | inherits OpenAlex |
| **Internet Archive** | Solr relevance `score` (when not forced to `downloads` sort) | **none — `downloads` only** | `downloads desc` ✗ (D2) | flip to relevance; stop downloads→citedBy (D1) |
| **NCBI/PubMed** | E-utilities relevance sort | citation via separate elink | `sort=relevance` | keyless, server-safe candidate |
| **SciELO / CORE / BASE / OAPEN / OpenEdition / NDLI** | engine `_score` (Solr/ES/OAI varies) | mostly none | varies | capture `_score` where the API exposes it; else rely on fused local + position prior |

**Architectural takeaway:** every *core* adapter (the only ones in `/api/search` v1, per
`api/search.js:9`) already has a real, full-corpus relevance number. We must capture it.
For sources that genuinely expose nothing (some heritage/OAI endpoints), upstream
**result position** is itself a weak relevance prior we can use as a fallback.

---

## 5. Recommended architecture

### 5.1 Capture a normalized native relevance signal (D3)
Add an optional field to `UnifiedResult`: `nativeScore` (number) and `nativeRank`
(0-based position as fallback). Each adapter's parser populates `nativeScore` from its
documented field (OpenAlex `relevance_score`, Crossref `score`, DOAJ/IA `_score`); if
absent, leave null and let `nativeRank` carry the position prior. Extend
`AdapterRankFields` with `nativeRelevance: "score" | "rank" | "none"` so the ranker knows
which to trust (mirrors the existing capability-descriptor pattern, `base.js:101`).

### 5.2 Fuse, don't replace (D3 + D4)
Replace "BM25F over a micro-pool" with **Reciprocal Rank Fusion of two rankings**:
- **Rank L** — each result's position in its *own source's* native relevance order
  (full-corpus signal, the part we currently throw away).
- **Rank K** — our local BM25F order (good for cross-source normalization *within* the
  pooled set, and the only signal for sources with no native score).

RRF (`src/lib/rrf.js` — `fuseRanks` already exists, per `sprint_log_v0_31.md §2`) is
**scale-free**: it consumes ranks, not raw scores, which **structurally eliminates D4**
(no more 1.79-vs-16.17 incomparability) and stops a degenerate 20-doc IDF from
overriding a full-corpus engine. This also unifies cleanly with the v0.31 lexical↔semantic
slider — that slider becomes one more weighted input to the same fusion (see §6).

### 5.3 Down-weight / gate the local IDF when the pool is tiny (D3)
When the pooled candidate set is below a floor (e.g. < 50 docs), the BM25F IDF term is
unreliable; lean harder on native rank in the fusion weights. Make the BM25F→native
weight a function of pool size.

### 5.4 IA hygiene (D1 + D2) — ship first, independently
- `internetArchive.js:158` → `rankFields.citedBy: false` (keep emitting `citedBy` for
  *display*, stop honoring it for *rank*).
- `internetArchive.js:175` → `sort=` relevance (or drop the explicit `downloads+desc` so
  IA's default relevance applies); capture Solr `score` into `nativeScore`.

### 5.5 Orthographic normalization layer (D5)
A score-side `normalizeForMatch(token)` (fold diacritics via `String.normalize("NFKD")`
+ strip combining marks; map a small curated transliteration alias table —
Quran/Qur'an/Koran, Muhammad/Mohammed, etc.). Applied in `tokenize()`
(`scoring.js:64`) and to the synonym/alias expansion, **score-side only** — the original
query still goes to the upstream APIs unchanged (same contract as `synonyms.js:2-3`).
Optional stretch: pass documented script-aware query params where an upstream supports
them (some APIs accept normalized/ASCII-folded search).

### 5.6 Display-side score normalization (D4)
Even with RRF, if a raw number is shown, normalize per result set to 0–100 relative to
that query's top hit — or drop the raw score from the public card entirely. Decide in T3.

---

## 6. Relationship to v0.31 (lexical↔semantic slider)

v0.31 exposes an RRF weight between **lexical (BM25F)** and **semantic (embeddings)**.
v0.35 adds a **third input to the same fusion: native upstream relevance.** The clean
end-state is one `fuseRanks` call over up to three weighted rank-lists
(`native`, `lexical`, `semantic`). **Coordinate:** if v0.31 ships first, T2 here extends
its fusion call rather than introducing a parallel one. If v0.35 ships first, leave the
semantic slot wired but zero-weighted. No duplicate fusion paths.

---

## 7. Out of scope this sprint

- **D6 (surname collision)** — needs author/topic separation (NER or an author-field-aware
  penalty, or a "did you mean a person?" intent affordance). Largest effort, lowest
  certainty. Carry forward.
- **D7 root fix** — raising/streaming past the 12 s adapter ceiling and stabilizing the
  eligible-adapter set. T4 here only *investigates + documents*; the fix is its own sprint.
- Expanding `/api/search` beyond the 4 core adapters (tracked separately in roadmap).

---

## 8. Execution plan (ordered)

**T1 — IA hygiene (D1 + D2). ~½ day. Ship independently first.**
- [ ] T1.1 `internetArchive.js:158` → `rankFields.citedBy: false`.
- [ ] T1.2 `internetArchive.js:175` → relevance sort; capture Solr `score` → `nativeScore`.
- [ ] T1.3 Verify: `node scripts/stress/probe.mjs "shaikh" 8` / `"ali" 8` / `"khan" 8` —
      high-download IA items fall out of top-3; baselines (Cat G) unchanged.

**T2 — Native-relevance capture + RRF fusion (D3 + D4). ~2 days. Core.**
- [ ] T2.1 Add `nativeScore` / `nativeRank` to `UnifiedResult` (`base.js`) + `nativeRelevance`
      to `AdapterRankFields`.
- [ ] T2.2 Populate in each core parser (OpenAlex `relevance_score`, Crossref `score`,
      DOAJ `_score`, IA Solr `score`); fallback to upstream position → `nativeRank`.
- [ ] T2.3 Build the per-source native rank-list; fuse with the BM25F rank-list via
      `fuseRanks` in `api/search.js` (and the UI path `useSemanticRerank`/`useSearch`).
- [ ] T2.4 Pool-size-aware weighting (§5.3): native weight ↑ as pool ↓.
- [ ] T2.5 Re-run the full Category A battery; confirm the cross-query magnitude artifact
      is gone (RRF ranks, not raw scores) and `memon` #1 is no longer OCR garbage.

**T3 — Orthographic normalization + display score (D5 + D4-UX). ~1 day.**
- [ ] T3.1 `normalizeForMatch()` (NFKD fold + transliteration alias table) in `scoring.js`.
- [ ] T3.2 Apply in `tokenize()` + alias expansion; original query to APIs unchanged.
- [ ] T3.3 Verify Quran/Qur'an/Koran + Muhammad/Mohammed top-5 overlap rises materially.
- [ ] T3.4 Decide + implement display-side score normalization (0–100) or hide raw score.

**T4 — Determinism investigation (D7). ~½ day, doc-only this sprint.**
- [ ] T4.1 Instrument which adapters time out per run; quantify pool variance.
- [ ] T4.2 Document options (raise ceiling / stream / stabilize eligible set) → next sprint.

---

## 9. Acceptance criteria

- [ ] **D1/D2:** no Internet Archive result with a large download count appears in top-3
      for single-token surname/community queries (`shaikh`, `ali`, `khan`, `memon`); the
      `memon` #1 is no longer the VIC-20 OCR artifact.
- [ ] **D3/D4:** ranking fuses native upstream relevance with local BM25F via RRF; the
      cross-query score-magnitude artifact (1.79 vs 16.17) is eliminated (ranks, not raw
      scores, drive order). Baselines (Cat G) remain 6/6 on-topic.
- [ ] **D5:** Quran/Qur'an/Koran and Muhammad/Mohammed top-5 overlap materially increases.
- [ ] **No regressions:** Cat E robustness still all-200/injection-safe; Cat F `;` union
      semantics intact.
- [ ] **D7:** timeout/pool-variance behavior measured and documented with a fix proposal.
- [ ] Harness (`probe.mjs`) re-run on a preview deploy before merge; before/after tables
      appended to `search_quality_findings.md`.

---

## 10. Risk register

| ID | Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | T2.2 | Native score field names differ from docs / change per API version | Med | Med | Verify against live response; fall back to `nativeRank` (position) when absent |
| R2 | T2.3 | RRF fusion regresses a baseline that BM25F currently gets right | Low | High | Gate behind a flag; A/B via probe harness on Cat G before merge |
| R3 | T2 | Heterogeneous pool — sources with no native score get only `nativeRank` | High | Low | Position prior is a documented, acceptable weak signal; weighted low |
| R4 | T3.1 | Over-aggressive folding merges distinct terms (false synonymy) | Med | Med | Curated alias table, not blanket phonetic collapse; NFKD fold only for diacritics |
| R5 | §6 | Duplicate fusion path vs v0.31 slider | Med | Med | Single `fuseRanks` call, three weighted inputs; coordinate ship order (§6) |
| R6 | T1 | Removing IA download signal drops genuinely useful popular items | Low | Low | Still retrieved & displayed; only the *rank tiebreak* changes |

---

## 11. Definition of done

- [ ] D1, D2, D3, D4, D5 fixed and verified via the stress harness; before/after appended
      to `search_quality_findings.md`.
- [ ] `nativeScore`/`nativeRank` flowing from all 4 core adapters; RRF fusion is the SSOT
      ranking path, coordinated with v0.31's slider (one fusion call).
- [ ] D6 + D7-fix carried forward with concrete next-sprint scope.
- [ ] `APP_VERSION` bumped to `v.35`; this log updated with actuals.

---

*End v0.35 sprint plan. T1 is shippable on its own and should go first. T2 is the
architectural core (capture + fuse native relevance). D6/D7-fix carried forward.*
