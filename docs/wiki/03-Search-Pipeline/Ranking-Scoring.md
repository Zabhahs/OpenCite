---
machine_ids: [lib.scoring]
findings: [F-200, F-201, F-202, F-203, F-204]
runtime: shared
status: healthy
tags: [scoring, bm25f, relevance, pipeline]
---

# Ranking & Scoring (BM25F)

> **SSOT relevance scorer.** Computes a BM25F score over content fields (title/abstract/keywords) for every result in a batch; drives the `_score` field that all downstream ranking uses.

## What it is

`src/lib/scoring.js` is the content-relevance engine. It implements BM25F (Best Match 25 with Field weighting) over three fields: `title` (weight 3.0), `abstract` (1.0), and `keywords`+`subjects` (2.0). It also applies phrase and proximity boosts, a citation tiebreak, and a thin-source prior. It is pure JS with no side-effects — importable on client or server.

**No author matching** — the scoring comment on line 1 is the SSOT: `title`, `abstract`, `keywords` only. Author-inclusive search is handled at the adapter query layer, gated by `settings.authorSearch`.

## Key exports / surface

| Symbol | Kind | Purpose |
|---|---|---|
| `scoreResults(results, terms, getCapability?)` | fn | BM25F batch scorer; returns results with `_score` |
| `applyConfidenceGate(scored, meaningful)` | fn | Low-confidence fallback — see [[Confidence-Gate]] |
| `hasContentMatch(result, terms)` | fn | Content-scope predicate (author-bleed filter) — see [[Confidence-Gate]] |
| `meaningfulTerms(terms)` | fn | Stopword-filter; shared by gate + scorer |
| `normalizeForMatch(token)` | fn | NFKD diacritic strip + transliteration alias lookup (D5 fix) |

## Constants

| Constant | Value | Role |
|---|---|---|
| `K1` | 1.2 | BM25F term-saturation |
| `B` | 0.75 | Field-length normalization |
| `FIELD_WEIGHTS` | `{title:3, abstract:1, keywords:2}` | Per-field multiplier |
| `PHRASE_BOOST` | 2.0 | Per-field multiplier when verbatim phrase matches |
| `PROX_BOOST` | 1.0 | Per-field max bonus for nearby-word proximity |
| `PROX_WINDOW` | 6 | Token gap beyond which proximity scores 0 |
| `CITED_BY_CAP` | 0.3 | Max citation tiebreak bonus |
| `THIN_SOURCE_PRIOR` | 0.4 | Structural-fairness boost for title-only sources |

## Dependencies

- Imports: none (pure JS)
- Imported by: [[Confidence-Gate]] (re-exports `applyConfidenceGate`, `hasContentMatch`), [[RRF-Fusion]] (`fuseRanks` consumes BM25F ranks), `hooks.useSearch`, `api.search`

## Behaviour / data flow

### 1. Tokenisation (`tokenize`, line 138)

Lowercases the text, splits on `/[^a-z0-9''ʾʿÀ-ɏ]+/` (keeps intra-word apostrophes intact so `Qur'an` arrives whole), then calls `normalizeForMatch` on each token.

`normalizeForMatch` (line 124): NFKD-decomposes → strips combining diacritics (`U+0300–U+036F`) → strips intra-word apostrophes/modifier letters → maps through `ALIAS_MAP` (e.g. `koran` → `quran`, `mohammed` → `muhammad`). **D5 fix is live.**

### 2. Scoring words (`scoringWords`, line 177)

Multi-word query terms (e.g. `"machine learning"` as one element) are split into component words; stopwords stripped via `meaningfulTerms`. Falls back to all words if every word is a stopword.

### 3. Corpus stats (`avgLens`, `idfs`, lines 285-293)

Computed over the *batch* passed in — **not** a global corpus. On a 14–45 doc pool the IDF is statistically degenerate (D3/D4). Each term's IDF: `log(1 + (N - df + 0.5) / (df + 0.5))` (Robertson formula).

### 4. Per-result BM25F (lines 295-337)

For each doc, for each term, for each field:
- `tf` = raw term frequency in that field's token list
- `norm = 1 - B + B * (len / avgLen_field)`
- `weightedTf += FIELD_WEIGHTS[f] * (tf / norm)`

Then: `score += idf[t] * (weightedTf * (K1+1)) / (weightedTf + K1)`

**Phrase bonus** (lines 196–206): fires once per field per phrase if the verbatim token sequence appears. Scaled by `FIELD_WEIGHTS[f] * PHRASE_BOOST`. Only fires when `score > 0` already.

**Proximity bonus** (lines 212–235): finds positions of all query words in each field, finds smallest gap between two *distinct* words, decays linearly to zero at `PROX_WINDOW`. Scaled by `FIELD_WEIGHTS[f] * PROX_BOOST * (1 - (gap-1)/PROX_WINDOW)`.

**Citation tiebreak** (lines 326–329): `Math.min((citedBy||0)/5000, CITED_BY_CAP)` — only if `capability.rankFields.citedBy === true`. Capped at 0.3 so a highly-cited paper can't dominate a relevant one. Internet Archive has `citedBy: false` since v0.35 (D1 fixed).

**Thin-source prior** (lines 331–334): `THIN_SOURCE_PRIOR = 0.4` added when the source is "thin" (abstract=none/sparse AND subjects=none/sparse) AND every meaningful query word appears in the title (or phrase matches verbatim). Structural fairness boost — museum/heritage sources can't earn abstract/keyword score.

### 5. `fieldText(result, field)` (line 146)

- `keywords` → `result.keywords.concat(result.subjects).join(" ")`
- Others → `result[field] || ""`

## Correctness notes

**Potential NaN:** `avgLens[f] = total / docsTokens.length || 1` — the `|| 1` fallback is correct when the batch is empty, but `scoreResults` guards with `if (!results.length || !terms.length) return ...` at line 270, so this is safe.

**IDF divide-by-zero:** `idf(t, ...)` returns `Math.log(1 + (N - df + 0.5) / (df + 0.5))`. When `df=0` this is `log(1 + N/0.5) = log(1+2N)` — fine. When `N=0` this returns `log(1 + 0.5/0.5) = log(2)` — fine. No zero-division path.

**tokenize edge case:** A token that is only combining marks after NFKD + stripping → becomes empty string → filtered by `.filter(Boolean)`. Safe.

**Proximity:** positions is built by iterating token array for each word in `wordSet`. Two *same-word* occurrences won't count as a min-gap (the `wi !== wj` guard at line 229). Correct.

## 🩺 Health audit

- **Verdict:** healthy — the code is correct; the structural problem is the *context* (micro-pool IDF), not a bug in BM25F itself.
- **Findings:** [F-200] Degenerate micro-pool IDF (D3/D4 open); [F-201] Phrase+proximity boost makes scores query-length-dependent (D4 open); [F-202] D1 (IA downloads-as-citedBy) — **FIXED** in v0.35 (`citedBy:false`); [F-203] D2 (IA popularity sort) — **FIXED** in v0.35 (relevance order); [F-204] D5 (diacritic/transliteration normalization) — **FIXED** in v0.35 (`normalizeForMatch`).
- **Reuse:** pure JS, runtime=shared — see [[09-Audit/Duplication-and-Reuse#r-200]].
- **Smells:** `termFreq` (line 151) is O(n) per term per field — fine for micro-pools but degrades quadratically if corpus grows. No index built. For pools of <50 docs this is negligible.

## See also

[[RRF-Fusion]] · [[Semantic-Rerank]] · [[Confidence-Gate]] · [[Known-Defects]] · [[Synonyms-Vocab]] · [[09-Audit/Bugs#f-200]]
