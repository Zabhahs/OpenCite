---
machine_ids: [lib.scoring, lib.rrf, adapters.extensions.internetArchive]
findings: [F-200, F-201, F-202, F-203, F-204, F-205, F-206, F-207, F-208, F-209]
runtime: shared
status: mixed
tags: [defects, relevance, audit, pipeline]
---
<!-- AUTO-GENERATED from docs/wiki/03-Search-Pipeline/Known-Defects.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Known Defects (D1–D5 + Structural)

> **Forensic audit of the five v0.35 ranker defects.** Each section states what it is, where it lives (file:line), its current fix status verified against source code, and the proposed fix. Cross-links to the relevant pipeline note.

---

<a id="d1"></a>
## D1 — Internet Archive download counts inflate rank as `citedBy`

**What it is:** `internetArchive.js` maps the IA `downloads` field into `result.citedBy` for every result (both metadata and FTS paths). The scorer adds `Math.min((citedBy||0)/5000, CITED_BY_CAP=0.3)` to all results where `capability.rankFields.citedBy === true`. Because IA download counts reach into the hundreds of thousands (e.g. `shaikh` query: 231,971 downloads), the cap saturates on every IA result, giving them the full 0.3 tiebreak regardless of academic relevance.

**Code location:**
- `src/adapters/extensions/internetArchive.js:100` — `citedBy: downloads > 0 ? downloads : null` (metadata path)
- `src/adapters/extensions/internetArchive.js:141` — same in the FTS path
- `src/lib/scoring.js:327-329` — tiebreak fires when `capability.rankFields.citedBy === true`

**Status: FIXED in v0.35.** Verified at `src/adapters/extensions/internetArchive.js:163`:
```
rankFields: { abstract: "full", subjects: "full", citedBy: false, nativeRelevance: "rank" }
```
The comment explicitly documents the fix: "citedBy carries download counts, not citations — emitted for display only, NOT honored for rank (citedBy:false)." The `citedBy` field is still populated for display purposes; only the rank signal is disabled.

**v0.36 confirmation:** IA results with `citedBy=50998` still appear in the raw simple-mode pool, but they no longer get the scoring tiebreak — `rankFields.citedBy: false` correctly prevents the bonus.

**See also:** [Ranking-Scoring](Ranking-Scoring.md#citation-tiebreak) · [F-202]

---

<a id="d2"></a>
## D2 — IA retrieval sorted by popularity, not relevance

**What it is:** The IA adapter previously fetched results with `sort=downloads+desc` — explicitly requesting the most-downloaded items containing the query token. Combined with D1, this double-counted popularity: the most popular items were both *fetched* and *re-rewarded*. Topical relevance was never consulted.

**Code location (original):**
- `src/adapters/extensions/internetArchive.js:175` (historical — the sort param was here)

**Status: FIXED in v0.35.** Verified at `src/adapters/extensions/internetArchive.js:184`:
```
const metaParams = `q=${encodeURIComponent(metaQ)}&${flParams}&rows=${pageSize}&page=${page}&output=json`;
```
No `sort=` parameter — IA's Solr default relevance order applies. The comment at line 180-183 explicitly documents: "v.35 (D2): NO sort param → IA's Solr default relevance order. Previously this forced `sort=downloads+desc`."

Additionally, IA now stamps `nativeRank` from position in the merged metadata+FTS result list (line 230): `results.forEach((r, i) => { r.nativeRank = offset + i; })`. This makes IA's native ordering available for RRF fusion as a "rank" signal (not "score" since IA's advancedsearch.php strips the Solr score field).

**See also:** [RRF-Fusion](RRF-Fusion.md#buildnativeranks) · [F-203]

---

<a id="d3"></a>
## D3 — Native upstream relevance discarded; micro-pool IDF is degenerate

**What it is:** Every core scholarly adapter requests and receives a full-corpus relevance score from its upstream engine (OpenAlex `relevance_score`, Crossref Solr `score`, DOAJ `_score`). Before v0.35, these were discarded. Instead, `scoreResults` computed BM25F with IDF over the pooled candidate set — typically 14–45 documents (measured). IDF over ~20 docs is noise: a term's "rarity" is computed from a micro-sample, so ranking is driven by raw term-frequency, field length, and the phrase/proximity bonuses rather than genuine discriminative weight.

**Code location:**
- `src/lib/scoring.js:160-171` — `idf()` computes `N = docsFieldTokens.length`, the batch size
- `src/adapters/core/openalex.js:45` — requests `sort=relevance_score:desc` (the real signal)
- `src/adapters/core/crossref.js` — receives Solr score per item

**Status: FIXED in v0.35 (both client and server paths).** Verified:

*Client path:* `useSemanticRerank.js:73` calls `buildNativeRanks` and includes the native rank-list in the three-input `fuseRanks` call (native + lexical + semantic).

*Server path:* `api/search.js:349-364` — `buildNativeRanks` + `rrfScores` with two-input fusion (native weight from `nativeWeight(pool)`, lexical = `1 - wNative`). Results sorted by `_fused`. Raw BM25F `_score` preserved for gate/debug only.

*Native signal sources (verified):*
- OpenAlex: `parseOpenAlex.js:69` — `nativeScore: w.relevance_score`, `nativeRank: rank`, `capability.nativeRelevance: "score"`
- Crossref: `crossref.js:79-80` — `nativeScore: it.score`, `nativeRank: offset + i`, `capability.nativeRelevance: "score"`
- DOAJ: `doaj.js:63` — `nativeRank: offset + i`, `capability.nativeRelevance: "rank"` (no score field)
- Internet Archive: `internetArchive.js:230` — `nativeRank: offset + i`, `capability.nativeRelevance: "rank"` (advancedsearch.php strips Solr score)

**Blast radius:** Every query. This is the root cause of the `memon` gap (1.79 vs 16.17 scores) and the RIJKS-beats-Mughal-scholarship reordering observed in v0.36.

**Proposed fix (v0.35 T2):** Populate `nativeScore`/`nativeRank` in each core adapter parser; fuse via `fuseRanks` in `api/search.js` as well (single fusion call, three weighted inputs).

**See also:** [RRF-Fusion](RRF-Fusion.md) · [Ranking-Scoring](Ranking-Scoring.md#corpus-stats) · [F-200]

---

<a id="d4"></a>
## D4 — Cross-query score incomparability

**What it is:** Because IDF is computed per-pool and phrase/proximity boosts are length-dependent, a score of "16.17" (two-word query `kutchi memon`) and "1.79" (one-word query `memon`) are not on the same scale. Longer queries structurally score higher. Measured: `mughal`→`mughal architecture` = 13.5× score jump; `sufi`→`chishti sufi order` = 12.6×; `gujarat`→`gujarat textile trade` = 9.2×.

**Code location:**
- `src/lib/scoring.js:285-293` — per-pool avgLens and idfs
- `src/lib/scoring.js:196-235` — `phraseBonus` + `proximityBonus` scale with query length

**Status: FIXED on client UI path; open on server path.** 

*Fixed:* `fuseRanks` in `useSemanticRerank` outputs RRF values (not raw BM25F scores) — RRF is scale-free by construction. The `_score` field after fusion is a dimensionless RRF value, not a BM25F magnitude. Cross-query comparison of RRF scores is valid.

*Open:* The server `api/search.js` returns raw BM25F scores in the `score` field of public results. API consumers see non-comparable cross-query scores.

*Open:* Display normalization (0–100 per query's top hit) was proposed in v0.35 §5.6 / T3.4 but not implemented. The raw score is still shown in the UI (admin debug cards).

**See also:** [RRF-Fusion](RRF-Fusion.md) · [F-201]

---

<a id="d5"></a>
## D5 — No transliteration / diacritic normalization (FIXED)

**What it is:** `Quran`/`Qur'an`/`Koran` produced 0/5 top-title overlap before the fix; `Muhammad`/`Mohammed` had only 20% overlap. The tokenizer split on `\W+` so `Qur'an` → `qur` + `an`, losing the whole-token alias lookup. No diacritic folding existed.

**Code location (original):** `src/lib/scoring.js:64` — old `tokenize()` with `\W+` split, no normalize step.

**Status: FIXED in v0.35.** Verified in `src/lib/scoring.js`:
- `normalizeForMatch` (line 124): NFKD decompose → strip combining diacritics → strip intra-word apostrophes → alias lookup via `ALIAS_MAP`
- `TOKENIZE_SPLIT_RE` (line 136): `/[^a-z0-9''ʾʿÀ-ɏ]+/` — keeps intra-word apostrophes joined
- `ALIAS_CLUSTERS` (lines 93-105): 4 Islamic-scholarship clusters curated; rejected items documented with rationale (e.g. `ali` too ambiguous)
- `tokenize` (line 138): calls `normalizeForMatch` on each token

**Risk guard:** the comment at line 89-91 explicitly documents the conservative curation policy: "only fold clusters that are unambiguously co-referential in the academic context." The ALIAS_MAP is small (4 clusters, ~15 aliases) to avoid false synonymy.

**Scope:** score-side only — original query goes to upstream APIs unchanged (same contract as `synonyms.js`).

**See also:** [Ranking-Scoring](Ranking-Scoring.md#tokenisation) · [Synonyms-Vocab](Synonyms-Vocab.md) · [F-204]

---

<a id="d6"></a>
## D6 — Surname-as-content collision (deferred)

**What it is:** Single-token queries that are common surnames (`khan`, `ali`, `shaikh`, `qureshi`) return papers *authored by* someone of that name as rank #1. BM25F scores title/abstract/keywords with no awareness the token is a person name. 4/5 surnames in the v0.35 stress test returned a non-subject top result.

**Status: OPEN, explicitly deferred.** Requires NER or a "did you mean a person?" intent affordance. Not in v0.35 scope. Tracked as a future sprint item.

**See also:** `sprint_log_v0_35.md §7`

---

<a id="d7"></a>
## D7 — Non-deterministic coverage / pool variance (adapter-level)

**What it is:** Identical queries across runs produce different candidate pools because the 12-second adapter timeout (`ADAPTER_TIMEOUT_MS=12000`) causes different adapters to drop out depending on network conditions. Pool size varies (39–45 for `climate change`); this changes IDF values and which results survive the confidence gate. Results are not reproducible.

**Status: OPEN, adapter-hygiene workstream.** The v0.36 diagnostic identified 3 always-dead adapters (SCIELO 404, OPENNEURO 400, ENA syntax reject on every query) and confirmed their presence drags every query to `partial` coverage — systematically discounting paid searches via coverage-prorated billing.

**See also:** `SEARCH_DIAGNOSTIC_v0_36.md §6` · [F-208]

---

<a id="f-208"></a>
## F-208 — Always-dead adapters drag every query to `partial` coverage

**What it is:** SCIELO (HTTP 404 on every query), OPENNEURO (HTTP 400 on every query), ENA (syntax reject on every query) fail 100% of the time in local testing. WIKIDATA fails with 429 (rate-limited on the dev IP; may work in prod). These dead adapters are counted as "failed" in the coverage calculation — dragging every search to `partial` coverage and triggering billing discounts.

**Code location:** `api/search.js` (coverage classification logic); adapter files under `src/adapters/extensions/`

**Status: OPEN.** Proposed fix: retire or disable SCIELO/OPENNEURO/ENA; add circuit-breaker for chronic failures.

**See also:** `SEARCH_DIAGNOSTIC_v0_36.md §3`

---

## Server path RRF fusion — CONFIRMED IMPLEMENTED

**What it is:** `api/search.js` (lines 341-364) calls `buildNativeRanks` + `rrfScores` with a two-input fusion (native weight from `nativeWeight(pool)`, lexical weight = `1 - wNative`). Results are sorted by `_fused` (the RRF value), with raw BM25F `_score` preserved for the confidence gate and admin debug cards. This correctly eliminates D4 cross-query incomparability on the server path.

**The one remaining gap:** The server uses a two-input fusion (native + lexical) while the client UI path has a three-input fusion (native + lexical + semantic). The semantic arm is unavailable server-side (Web Worker API, ~23MB model — cannot run in Vercel Functions). This is an accepted architectural constraint, not an open bug.

**See also:** [RRF-Fusion](RRF-Fusion.md) · [Semantic-Rerank](Semantic-Rerank.md#overengineering-assessment)

---

## Defect status summary

| ID | Title | Severity | Status | Fixed version |
|---|---|---|---|---|
| D1 | IA downloads inflate `citedBy` rank | Critical | **FIXED** | v0.35 |
| D2 | IA popularity sort | Critical | **FIXED** | v0.35 |
| D3 | Native relevance discarded | High | **FIXED** | v0.35 (both paths) |
| D4 | Cross-query score incomparability | High | **FIXED** | v0.35 (RRF both paths) |
| D5 | Diacritic/transliteration fragmentation | Medium | **FIXED** | v0.35 |
| D6 | Surname-as-content collision | Medium | **DEFERRED** | future sprint |
| D7 | Non-deterministic coverage | Medium | **OPEN** | adapter hygiene sprint |
| — | Always-dead adapters (SCIELO/OPENNEURO/ENA) | High | **OPEN** | adapter hygiene sprint |
| — | Server two-input RRF (native+lexical) | — | **FIXED** | v0.35 (api/search.js:349-364) |

## See also

[Ranking-Scoring](Ranking-Scoring.md) · [RRF-Fusion](RRF-Fusion.md) · [Semantic-Rerank](Semantic-Rerank.md) · [Confidence-Gate](Confidence-Gate.md) · [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md) · [Bugs](../09-Audit/Bugs.md)
