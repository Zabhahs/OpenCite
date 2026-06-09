---
machine_ids: [lib.synonyms, constant.vocabulary]
findings: [F-207]
runtime: client
status: healthy
tags: [synonyms, vocabulary, pipeline, scoring]
---
<!-- AUTO-GENERATED from docs/wiki/03-Search-Pipeline/Synonyms-Vocab.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Synonyms & Vocabulary

> **Score-side term expansion.** `synonyms.js` widens what BM25F treats as a match without touching the upstream API query; `vocabulary.js` provides controlled-vocabulary enumerations for adapter tags.

## What it is

Two separate concerns in one note:

**`src/lib/synonyms.js`** — on-demand term expansion. Query goes to APIs unchanged; expanded terms feed `scoreResults` as additional scoring terms. Two sources: (1) 16 hand-curated academic clusters (always available, synchronous); (2) Moby Thesaurus II shards (public-domain, 30K roots, 26 letter-keyed JSON files under `public/synonyms/*.json`, async/cached).

**`src/constants/vocabulary.js`** — controlled-vocabulary exports: `ADAPTER_CATEGORY`, `TAG_VOCAB` (region, archiveType, contentType enums). Used by adapters and the UI tag system; not part of the scoring pipeline directly.

## Key exports / surface

| Symbol | Kind | Source | Purpose |
|---|---|---|---|
| `expandTerms(terms, enabled?)` | async fn | `synonyms.js` | Returns expanded term set (includes originals); no-op when `enabled=false` |
| `ADAPTER_CATEGORY` | const | `vocabulary.js` | `{CORE, EXTENSION}` enum |
| `TAG_VOCAB` | const | `vocabulary.js` | Nested enum: region × archiveType × contentType display labels |

## Dependencies

- `synonyms.js` imports: none (pure fetch-based)
- `vocabulary.js` imports: none
- Imported by: `hooks.useSearch` calls `expandTerms` before `scoreResults`; `adapters/index.js` and every adapter use `ADAPTER_CATEGORY`

## Behaviour / data flow

### `expandTerms(terms, enabled)` (`synonyms.js`, lines 75-93)

When `enabled=false` (default changes not shown, but `DEFAULT_SETTINGS.synonyms = true` from `defaults.js:40`): returns `terms` unchanged. No fetches.

When enabled:
1. **Academic clusters** (synchronous, ~16 clusters, inline): builds `ACADEMIC_INDEX` at module load as a Map from each cluster member → Set of its synonyms. For each input term, looks up synonyms and adds them to `expanded` Set.
2. **Moby Thesaurus** (async, per-letter shard): fetches `/synonyms/{letter}.json` for the first letter of each term. Response is a flat JSON object `{"term": ["syn1","syn2",...]}`. Capped at `MAX_MOBY_SYNS = 24` synonyms per root. Shard is cached in `shardCache` Map after first fetch — subsequent queries to the same letter are O(1).

Returns `[...expanded]` — original terms are always in the expanded set (line 78: `expanded = new Set(terms.map(t => t.toLowerCase()))`).

### `ACADEMIC` clusters (`synonyms.js`, lines 13-30)

16 pre-curated sets covering: climate change, ML/AI, COVID-19, DNA/RNA, biodiversity, deforestation, renewable energy, genome/proteome/microbiome, antibiotic resistance, mental health, water scarcity, food security.

**ACADEMIC_INDEX** (lines 33-41): built at module load, O(1) lookup. Each term maps to all *other* members of its cluster. Bidirectional.

### Moby shard shape

Each shard file is a large JSON object: `{"word": ["synonym1", "synonym2", ...]}`. Keys are lowercase root words. Values are arrays of lowercase synonyms (no deduplication within the array). Files are large (some letters several MB) — hence the 26-shard split. Only the first letter of each query term determines which shard is loaded. Non-alphabetic first characters skip Moby lookup entirely (line 66: `!/^[a-z]$/.test(first)`).

### `DEFAULT_SETTINGS.synonyms` and the relevance-settings toggle

`synonyms: true` in `defaults.js:40` — enabled by default since the v0.31 migration. User can toggle in Search settings. When disabled, `expandTerms` is a pass-through.

### `vocabulary.js` — controlled vocab

`ADAPTER_CATEGORY = {CORE: "core", EXTENSION: "extension"}` — used by every adapter to categorize itself.

`TAG_VOCAB` — three-level object:
- `region`: 11 keys (global through east-asia) → display labels
- `archiveType`: 12 keys (aggregator, scholarly-index, museum, library, etc.)
- `contentType`: 12 keys (peer-reviewed, textual, visual, manuscript, etc.)

Used by the UI to display adapter tags and filter chips. Not part of scoring.

## Correctness notes

**Async shard failure:** `loadShard` catches fetch/parse errors and caches an empty Map. Subsequent calls to the same letter are O(1) empty hits — graceful degradation. No error propagates to `expandTerms`.

**Multi-word terms:** `expandTerms` passes `terms` directly to `mobyLookup` per term. A multi-word term like `"machine learning"` looks up `shardCache.get("m")` for the key `"machine learning"`. Moby is keyed by single words, so multi-word lookups will almost always return `[]`. This is expected — academic clusters cover the important multi-word cases. Single-word Moby expansion is the intended use.

**No NaN or divide-by-zero** paths — pure Set/Map operations.

## 🩺 Health audit

- **Verdict:** healthy.
- **Findings:** [F-207] Moby shard files are very large (letter `c` is ~4 MB JSON). First load of a shard blocks the main thread briefly if not deferred. The fetch is async but the `JSON.parse` is synchronous on the main thread. For very large shards this could cause a jank spike.
- **Reuse:** `synonyms.js` is client-only (uses `fetch` API). Could in theory be used server-side with Node fetch, but is not currently. `vocabulary.js` is shared (pure constants).
- **Smells:** `MAX_MOBY_SYNS = 24` is a magic number. No tests for `expandTerms`. The `ACADEMIC` clusters are inline — adding new ones requires a code change rather than a data file update.

## See also

[Ranking-Scoring](Ranking-Scoring.md) · [Known-Defects](Known-Defects.md#f-207) · [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md)
