---
machine_ids: [lib.dedup, lib.groupResults]
findings: [F-206]
runtime: shared
status: healthy
tags: [dedup, grouping, pipeline]
---
<!-- AUTO-GENERATED from docs/wiki/03-Search-Pipeline/Dedup-Grouping.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Dedup & Grouping

> **Identity collapse and book-chapter clustering.** `dedup.js` merges duplicate results across sources using DOI and title fingerprints; `groupResults.js` clusters book chapters under their container title for the source-view layout.

## What it is

Two independent pure-JS modules with no shared state:
- `src/lib/dedup.js` — result identity and deduplication (two merge strategies).
- `src/lib/groupResults.js` — groups book-chapter results under their container/book title.

Both are confirmed sound by the v0.36 diagnostic: "dedup / confidence-gate are NOT the culprit" — candidate counts track the simple pool within expected dedup margins.

## Key exports / surface

| Symbol | Kind | Source | Purpose |
|---|---|---|---|
| `doiKey(r)` | fn | `dedup.js` | Strongest identity key: `r.doi` or `null` |
| `titleFingerprint(r)` | fn | `dedup.js` | Fuzzy same-paper key: `normalized_title\|year\|first_author_surname` |
| `dedupFirstWins(records, keyFn, seen)` | fn | `dedup.js` | Streaming dedup: first occurrence wins, mutates `seen` Set |
| `dedupHighestScore(records, keyFn)` | fn | `dedup.js` | Pooled dedup: keep highest-scored copy per key |
| `groupByParentWork(results)` | fn | `groupResults.js` | Cluster book chapters under container title |

## Dependencies

- Imports: none (pure JS)
- Imported by: `hooks.useSearch` (streaming path uses `dedupFirstWins`), `api.search` (pooled path uses `dedupHighestScore`)

## Behaviour / data flow

### Identity keys

`doiKey` (line 9): `r.doi || null`. DOI is canonical — when present it's the exact identity. `null` means "no DOI, don't dedup on this key" — such records always pass through.

`titleFingerprint` (lines 13-18):
1. Normalize title: lowercase, replace all non-`[a-z0-9]` with space, collapse spaces, trim.
2. Extract first-author surname: last space-separated token of `r.authors?.[0]`.
3. Key: `${normalizedTitle}|${year}|${surname}`.

This catches JSTOR-DOI vs publisher-DOI duplicates for the same paper. Note: if `title` is empty, returns `null` (always kept). No false-positive: two papers with the same normalized title, same year, and same first-author surname are treated as duplicates — which is correct in practice.

### `dedupFirstWins` (lines 22-30)

Streaming mode — used per-adapter batch or across successive load-more pages. Mutates the `seen` Set so state persists across calls. `null` key → always kept (no dedup risk). First occurrence wins because later batches haven't arrived yet and scores aren't comparable across batches.

### `dedupHighestScore` (lines 33-49)

Pooled mode — all sources scored together, so scores ARE comparable. Maintains `byKey` Map for the current winner. When a higher-scored record arrives for the same key: `out[out.indexOf(existing)] = r` — finds and replaces the old record in-place. This is O(n) per replacement (indexOf scan), but pool sizes are ≤50 so it's negligible.

**Note:** the dual-key strategy (DOI first, then title fingerprint) is typically applied by calling `dedupFirstWins`/`dedupHighestScore` twice — once with `doiKey` then once with `titleFingerprint`. The caller (`useSearch` or `api.search`) controls this orchestration.

### `groupByParentWork` (`groupResults.js`, lines 6-37)

Iterates results in order. A result is a "chapter" if `_type` or `type` is one of `book-chapter`, `book-section`, `book-part`, `reference-entry`. If it has a `journal` field (which carries the container/book title in the NCR schema), it's bucketed by `journal.toLowerCase().trim()` into a shared group.

Non-chapters and chapterless chapters are wrapped in single-item groups (`{parentTitle: null, items: [r]}`). Preserves original order; chapters of the same book appear consecutive only if they were already consecutive in the input.

**Output shape:** `[{parentTitle, publisher, editors, year, items: [result, ...]}]`

## The v0.36 verdict on dedup

The diagnostic (`SEARCH_DIAGNOSTIC_v0_36.md §4`) found one dedup near-miss: the "Borg, Omega, and Kubernetes" OPENALEX paper appeared twice in the raw pool with different `citedBy` values (565 vs 399 — likely two editions or DOI variants). These were NOT merged by dedup. This is a fingerprint edge case: if DOIs differ (two DOIs for different editions of the same work) and `citedBy` makes the title fingerprints diverge only if year differs. Worth noting but not a blocker — the v0.36 conclusion is explicitly "don't refactor dedup."

## Correctness notes

**`dedupHighestScore` indexOf:** O(n) scan per replacement. For pools of ≤50 this is O(1) in practice. For large pools, a Map from key→index would be O(1). Acceptable technical debt at current scale.

**`titleFingerprint` surname extraction:** `(r.authors?.[0] || "").split(" ").pop().toLowerCase()` — takes the last token as the surname. For authors stored as "Firstname Lastname" this is correct. For "Lastname, Firstname" (some sources), this would take the full string as the surname. Inconsistency across adapters could cause false non-matches. Low probability, accepted.

**Empty corpus:** `dedupFirstWins([], keyFn, seen)` returns `[]` — safe. `groupByParentWork([])` returns `[]` (line 7 guard) — safe.

## 🩺 Health audit

- **Verdict:** healthy. Confirmed sound by v0.36 diagnostic.
- **Findings:** [F-206] The `indexOf` scan in `dedupHighestScore` is O(n) per replacement — acceptable for current pool sizes but would degrade if pools grow significantly.
- **Reuse:** pure JS shared — both client (`hooks.useSearch`) and server (`api.search`) import `dedup.js`. `groupResults.js` is client-only (source-view layout). See [Duplication-and-Reuse](../09-Audit/Duplication-and-Reuse.md#r-203).
- **Smells:** No dead code. Both strategies are used. `groupByParentWork` is render-time only (not called during scoring).

## See also

[Confidence-Gate](Confidence-Gate.md) · [Ranking-Scoring](Ranking-Scoring.md) · [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md) · [Bugs](../09-Audit/Bugs.md#f-206)
