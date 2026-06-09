---
machine_ids: [lib.rrf, hooks.useSemanticRerank]
findings: [F-200, F-201]
runtime: shared
status: healthy
tags: [rrf, fusion, ranking, pipeline]
---

# RRF Fusion

> **Scale-free rank merger.** Reciprocal Rank Fusion combines native upstream relevance, local BM25F lexical ranks, and semantic embedding ranks into a single order without comparing raw scores.

## What it is

`src/lib/rrf.js` implements Weighted Reciprocal Rank Fusion. RRF's key property: it consumes *ranks* (positions), not raw scores, so a degenerate 20-doc BM25F IDF cannot override a full-corpus relevance engine, and cross-query score magnitudes (D4) cannot exist. The formula: `WeightedRRF(d) = Σ w_r / (k + rank_r(d))`, `k=60` by default.

Three rank inputs are fused (as of v0.35 / `useSemanticRerank`):
1. **Native** — each result's position in its own source's native (full-corpus) relevance order.
2. **Lexical** — position in BM25F order over the pooled candidate set.
3. **Semantic** — position in cosine-similarity order from MiniLM embeddings.

## Key exports / surface

| Symbol | Kind | Purpose |
|---|---|---|
| `fuseRanks(results, rankLists, k=60)` | fn | Main UI entry point: returns results with `_score` = fused RRF value |
| `rrfScores(count, rankLists, k=60)` | fn | Core primitive: returns Float array of fused scores, no mutation |
| `buildNativeRanks(results, getCapability)` | fn | Builds per-source native rank map from `nativeRank` + capability |
| `nativeWeight(poolSize)` | fn | Pool-size-aware native share (0.5–0.7) |

## Dependencies

- Imports: none (pure JS)
- Imported by: [[Semantic-Rerank]] (`hooks.useSemanticRerank` calls `fuseRanks`, `buildNativeRanks`, `nativeWeight`); also available for `api.search` server-side use (not yet called there — see [[09-Audit/Duplication-and-Reuse#r-201]])

## Behaviour / data flow

### `rrfScores` (line 11)

```
out[idx] += weight / (k + rank)
```

Iterates each rank-list's `Map<resultIndex, rank>`. Indices out of range or with `null` rank are skipped. Returns a plain Array aligned to results. No mutation.

### `fuseRanks` (line 23)

Thin wrapper: calls `rrfScores`, maps back to `results.map((r,i) => ({...r, _score: s[i]}))`.

### `buildNativeRanks` (lines 39-55)

Groups results by source; only includes results where `capability.rankFields.nativeRelevance` is `"score"` or `"rank"` and `result.nativeRank` is a finite number. Within each source group, sorts ascending by `nativeRank` and assigns dense 0-based rank (`idxs.forEach((idx, dense) => out.set(idx, dense))`). Per-source densification means every source's best hit starts at rank 0 — comparable across heterogeneous sources.

Sources with `nativeRelevance: "none"` or no `nativeRank` are absent from the native rank map; they fuse on lexical+semantic only. This is an accepted weak-signal gap (documented in the comment at line 36).

### `nativeWeight(poolSize)` (lines 61-65)

| Pool size | Native weight | Rationale |
|---|---|---|
| < 20 | 0.7 | Tiny pool — BM25F IDF is very noisy; trust native almost entirely |
| < 50 | 0.6 | Small pool — lean native |
| ≥ 50 | 0.5 | Larger pool — equal split |

### Three-input fusion in `useSemanticRerank` (cheap effect, line 111)

```js
const wNative = nativeRanks.size ? nativeWeight(allResults.length) : 0;
const rest = 1 - wNative;
fuseRanks(allResults, [
  { ranks: nativeRanks, weight: wNative },
  { ranks: lexicalRanks, weight: rest * (1 - w) },   // w = semanticWeight slider
  { ranks: semanticRanks, weight: rest * w },
]);
```

The `semanticWeight` slider (0=pure lexical, 1=pure semantic) splits only the **remainder** after native gets its share. At `w=0`, fusion is native+lexical; at `w=1`, native+semantic. Native weight is pool-size-aware and recalculated per query.

## `semanticWeight` slider mapping

`DEFAULT_SETTINGS.rrfSemanticWeight = 0.4` (`src/constants/defaults.js:45`). The slider range is 0–1. At 0.4 with a pool of 30 results:
- `wNative = 0.6` (pool < 50)
- `rest = 0.4`
- lexical weight = `0.4 * 0.6 = 0.24`
- semantic weight = `0.4 * 0.4 = 0.16`

## `nativeRelevance` descriptor values

Set per-adapter in `capability.rankFields.nativeRelevance`:
- `"score"` — adapter emits a real full-corpus relevance score (OpenAlex `relevance_score`, Crossref Solr `score`, DOAJ `_score`)
- `"rank"` — adapter emits only position (Internet Archive: `nativeRank = offset + i`)
- `"none"` or absent — no native signal; result is excluded from native rank map

## Correctness notes

**No NaN:** `weight / (k + rank)` — `k=60` so denominator is always ≥ 60. `rank` values come from 0-based dense integers. If `ranks` Map is empty, the loop body never executes and `out` stays 0 — safe.

**Off-by-one:** `computeSemanticRanks` (semantic.js:64) uses `rank + 1` (1-indexed), while `buildNativeRanks` uses 0-based. Both are consumed by `fuseRanks` as positions in `k + rank`. The +1 difference shifts the semantic RRF value by `w/(61) - w/(60)` ≈ 0.0003 — negligible. The lexical ranks in `useSemanticRerank` (line 70) also use `rank + 1`. Native is 0-based. The slight asymmetry is harmless at `k=60` but worth noting for any future weight-tuning.

**Empty results:** `fuseRanks([], ...)` returns `[]` — the map over empty array is safe.

## 🩺 Health audit

- **Verdict:** healthy — clean, scale-free primitive. Correctly implemented.
- **Findings:** [F-200] The BM25F rank is still one input (degenerate micro-pool IDF, now weighted at most 50–30%) — mitigated but not eliminated. [F-201] Display-side score normalisation not done (admin cards still show raw BM25F _score).
- **Reuse:** `lib.rrf` is pure/shared — used by both `hooks.useSemanticRerank` (client, three-input) and `api/search.js` (server, two-input). See [[09-Audit/Duplication-and-Reuse#r-201]].
- **Smells:** `rrfScores` is a separate export from `fuseRanks` for the test/score-explainer admin use-case — good DRY split. The dual-export is justified.

## See also

[[Ranking-Scoring]] · [[Semantic-Rerank]] · [[Known-Defects#f-200]] · [[09-Audit/Duplication-and-Reuse#r-201]]
