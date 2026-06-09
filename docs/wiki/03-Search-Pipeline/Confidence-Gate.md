---
machine_ids: [lib.scoring]
findings: []
runtime: shared
status: healthy
tags: [confidence, gate, filter, pipeline]
---

# Confidence Gate

> **Noise suppression.** `applyConfidenceGate` discards zero-score loose matches when at least one genuine match exists, and surfaces low-confidence placeholders when none do. `hasContentMatch` guards the author-bleed filter for sources that can't query content-only upstream.

## What it is

Both functions live in `src/lib/scoring.js` — they share tokenization and `FIELD_WEIGHTS` with BM25F, so the content definition is always consistent.

The v0.36 diagnostic confirmed: "dedup / confidence-gate are NOT the culprit … The gate never starved a query of keepers." Do not refactor.

## Key exports / surface

| Symbol | Kind | Lines | Purpose |
|---|---|---|---|
| `applyConfidenceGate(scored, meaningful)` | fn | 73-82 | Drop zero-score results when any non-zero exists; flag all as `_lowConfidence` otherwise |
| `hasContentMatch(result, terms)` | fn | 53-64 | Content-scope predicate: does this result match in title/abstract/keywords? |
| `meaningfulTerms(terms)` | fn | 42-44 | Stopword filter; SSOT for "are there meaningful query words?" |

## Dependencies

- `scoring.js` imports: none
- These symbols imported by: `hooks.useSearch` (calls `applyConfidenceGate` + `hasContentMatch`), `api.search` (same), adapter unit tests

## Behaviour / data flow

### `meaningfulTerms(terms)` (line 42)

Maps to lowercase, filters: `length > 1` AND not in `STOPWORDS`. Returns the meaningful subset. **Used as the gateway condition** — if `meaningfulTerms` returns empty, both `applyConfidenceGate` and `hasContentMatch` pass everything through (stopword-only query is never penalised).

### `applyConfidenceGate(scored, meaningful)` (lines 73-82)

Three cases:
1. `meaningful.length === 0` → return all, `lowConfidence: false` (stopword-only query, no filtering).
2. Any result has `_score > 0` → return only the non-zero results, `lowConfidence: false`. This is the normal path.
3. All results scored zero (topic absent from this source) → return all with `_lowConfidence: true` added, `lowConfidence: true`. The caller can display these as "best guesses" rather than nothing.

The gate fires **per-adapter** in the streaming path (each adapter's batch is gated independently) and **pooled** in the server path (all candidates gated together). Used per-adapter (streaming) and pooled (API) alike — the comment at line 71 is the SSOT for this contract.

### `hasContentMatch(result, terms)` (lines 53-64)

The author-bleed fix for sources (e.g. Crossref `query.bibliographic`) that query author names inclusively upstream and can't filter them out. Checks whether any meaningful query word appears in the content fields:

1. Tokenizes each raw term through the same `tokenize()` pipeline (including `normalizeForMatch`) — so `"Koran"` becomes `"quran"` on the query side.
2. Filters stopwords the same way `meaningfulTerms` does.
3. Builds a Set of all tokens from `title`, `abstract`, `keywords+subjects`.
4. Returns `true` if ANY meaningful term appears in that Set.

**Stopword-only query**: `words.length === 0` → returns `true` (no filter). Correct.

**Contract with adapters:** adapters that query author-inclusively upstream call `hasContentMatch` to drop results that match only on author name. This is documented in `scoring.js:47-50` and `crossref.js` uses it explicitly (via `hasContentMatch` guard in its result map). See [[02-Adapters/Core-Adapters#crossref]].

## Correctness notes

**`_score || 0`**: safe for `undefined`, `null`, `NaN` — all falsy, treated as zero. Correct.

**`lowConfidence` vs `_lowConfidence`:** the return object has `lowConfidence` (boolean, for the caller to set section/coverage state) and each result gets `_lowConfidence: true` added as a property. The naming is slightly inconsistent (boolean flag vs result property) but both are used correctly downstream.

**Empty `scored` input:** `scored.some(...)` on empty array → false. Falls to the third branch → `lowConfidence: scored.length > 0` → `false`. Returns `{results: [], lowConfidence: false}`. Safe.

## 🩺 Health audit

- **Verdict:** healthy. Confirmed by v0.36 diagnostic — gate is sound and load-bearing.
- **Findings:** none open.
- **Reuse:** shared module, both client and server import it. See [[09-Audit/Duplication-and-Reuse#r-200]].
- **Smells:** none. Compact, single-purpose, well-commented.

## See also

[[Ranking-Scoring]] · [[02-Adapters/Adapter-Architecture]] · [[Dedup-Grouping]]
