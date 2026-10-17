---
machine_ids: [lib.semanticSearch, lib.semantic, hook.useSemanticRerank, admin.semanticCompare]
runtime: browser
status: built
tags: [sprint, semantic-search, ranking, admin-console]
---
<!-- AUTO-GENERATED from docs/wiki/10-Sprints/sprint_log_v0_49.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Sprint v0.49 — Semantic search toggle (on-device) + A/B harness

**Date:** 2026-10-17 · **Baseline:** `main` @ `5e8e248` (working tree also carries the uncommitted v0.48 evidence work) · **Status:** BUILT, NOT committed, NOT deployed (awaiting Shahbaz)

## 0. Directives of record (Shahbaz, 2026-10-17)

1. "Natural-language search that doesn't suck" — build it from scratch, cheaply, as a toggleable **Semantic search** setting.
2. No paid embedding provider: solve it on our end or on the user's device. → **On-device.**
3. Smallest model that doesn't sacrifice function. → **Snowflake arctic-embed-xs** (22 MB, same download as the old MiniLM, ~8 points better on MTEB retrieval; bge-small is +1.5 points for +10 MB, not worth it).
4. Bulk-test semantic vs baseline against stored user searches. → **Finding:** no user searches are stored server-side (only a 50-entry per-browser history in localStorage; `api_usage` is a counter; the KV cache is a response cache). The harness therefore runs over **gold set ∪ the admin's local history ∪ any pasted list**. Adding server-side query logging is a product/privacy decision left to Shahbaz.

## 1. How it works (plain language)

With the toggle **off**, nothing changes: each source returns its own order, the unified list interleaves them, dedup runs. That is the v0.44 pipeline, untouched.

With the toggle **on**, three things happen, in this order:

1. **The query is cleaned for the sources that can't read sentences.** OpenAlex gets the full sentence (its `title_and_abstract.search` stems and strips stopwords itself). Every other source gets the keyword form: the sentence with filler words removed. *"how does sleep loss affect teenagers' working memory"* → *"sleep loss affect teenagers working memory"*. This is a stopword filter (the list already used by `contentMatch.js`), not an AI call. It is what stops Crossref returning personal-name monographs for a sentence.
2. **OpenAlex is asked for 100 results instead of 3.** It is the only source that reliably returns abstracts, so it is the only one worth going deep on. A reranker can only reorder what was fetched; this is where the wider net comes from. Free.
3. **Results are ordered by meaning, on the device.** After all sources settle, the browser hands the query plus each result's title, abstract and keywords to a Web Worker. The worker runs a small embedding model that turns each text into 384 numbers; texts that mean similar things get similar numbers ("sleep loss" lands near "sleep deprivation"). Each result's closeness to the query (cosine similarity) becomes `_sim`, and the list is sorted by it, highest first. Nothing is dropped, nothing leaves the browser, nothing is stored.

The model (~22 MB) downloads once from the Hugging Face hub and is cached by the browser. The results list stays hidden until the ordering is known (the v.31 no-reshuffle contract), with a status line: *"Downloading semantic model (one time, 22 MB) · 63%"* then *"Ordering results by meaning…"*. If anything fails (CDN blocked, old browser), the app falls back to native order and logs a warning. Never a blank screen.

**Honest limits.** English-only model (queries in French/German against Gallica/ONB will order poorly). Title-only sources are judged on title alone. 1–5 s of compute per search depending on device. Load-more pages embed only the new rows (per-search embedding cache).

## 2. What was built

| File | Role |
|---|---|
| `src/lib/semanticSearch.js` | **SSOT policy.** R1 `queryForAdapter` (keyword rewrite), R2 `optsForAdapter` (100-deep OpenAlex), R3 `orderBySimilarity`; plus `interleaveLists` (the D-3 default order, now shared) and `toKeywordQuery`. |
| `src/workers/embed.worker.js` | transformers.js 2.17.2 from jsDelivr (already CSP-allowed), `Snowflake/snowflake-arctic-embed-xs`, **CLS pooling** (verified: `1_Pooling/config.json`), normalize, download progress events. |
| `src/lib/semantic.js` | Worker client: `embedTexts`, `docText` (title → abstract → keywords within 700 chars), `scoreResults` (query prefix `Represent this sentence for searching relevant passages: ` on the query only, per model card; per-id embedding cache). |
| `src/hooks/useSemanticRerank.js` | Runs once per settled pool, returns `rerankedStates` (sections with `_sim`, ordered) + `status` + download `progress`. Resets on new search, incremental on load-more, clears on toggle-off, `done` on empty pool. |
| `src/hooks/useSearch.js` | Retrieval-only change: every `runSearch` call goes through `queryForAdapter`/`optsForAdapter`. Exposes `executedQuery` as state (reranker embeds the query that produced the results, never the live input). |
| `src/App.jsx` | Layers `rerankedStates` over raw `sectionStates`; `resultsReady` also waits for the reranker; loading copy for model download / ordering. Passes `settings` + `isEnabled` to `AdminConsole`. |
| `src/components/UnifiedResultList.jsx` | Default order = `orderBySimilarity` when the pool is scored, else `interleaveLists` (both from the SSOT). |
| `src/components/SearchControls.jsx` | **Semantic search** On/Off toggle beside Author search, with the 22 MB / English-only note. |
| `src/constants/defaults.js` | `semanticSearch: false` (opt-in; syncs to DB for signed-in users like every other setting). |
| `src/adapters/_shared/contentMatch.js` | `STOPWORDS` exported (was module-private) so the rewriter reuses it. |
| `src/lib/semanticCompare.js` | **A/B runner.** `compareQuery(query, settings, isEnabled, labels)` runs both arms through the SAME policy + adapters as the live app, dedups in registry order (reproducible), returns both ordered lists, per-arm metrics when labels exist, overlap@10, where the baseline top-5 landed, timings. |
| `src/components/admin/SemanticCompare.jsx` + `AdminConsole.jsx` | New **Semantic A/B (v0.49)** tab: textarea prefilled with gold set ∪ local history, Run, aggregate table (nDCG@10 / MRR / recall@10 / recall@20 per arm with Δ), avg overlap, timings, per-query expandable side-by-side top-10 with `_sim`, Export JSON, last 10 runs kept in `opencite:semantic_ab_runs`. |

Not touched: `/api/search` (paid API keeps native order), billing, dedup, grouping, filters, the v0.48 working-tree files.

## 3. How to run the A/B

1. Sign in as admin → `#/admin/console` → **Semantic A/B (v0.49)**.
2. The list is prefilled; paste more queries (one per line) if wanted. Unlabeled queries give overlap + side-by-side only; add gold queries in the F2 tab to get nDCG/MRR/recall.
3. **Run.** First run downloads the model once. Each query runs 2 arms × enabled adapters (core = 4) with a 400 ms pause between queries.
4. Read: `Δ` column on the labeled aggregate; `baseline top-5 now at [...]` per query shows whether the semantic arm buried things people expected; expand any query to eyeball both top-10s.
5. **Export JSON** for the record (`docs/audit-…` or the backups folder, not localStorage).

Caveat: the F2 Gold-Set tab grades `/api/search` output (server, origin-blind, 25 results). This harness runs the **browser** pipeline for both arms so the comparison is apples-to-apples with what the toggle changes. Labels are keyed by DOI-or-title, so they transfer.

## 4. Verification performed

- `node --check` on all plain modules; esbuild JSX transform on every touched component/hook (syntax only — no Vite build, per operating rules).
- Node smoke test of the pure policy: keyword rewrite (`"how does sleep loss affect teenagers' working memory?"` → `"sleep loss affect teenagers working memory"`; `"the"` falls back to itself), per-adapter query/opts routing, `orderBySimilarity` stability (ties keep original order, unscored trail), interleave, `docText` 700-char cap.
- Model facts verified live against the Hugging Face repo: `onnx/model_quantized.onnx` = 22,972,992 bytes; CLS pooling; query prefix; Apache-2.0.
- **Not yet verified in a browser:** the worker's CDN import + model load end to end. First real run = first smoke test (fallback path keeps the app usable if it fails).

## 5. Decisions / open items for Shahbaz

- **Deploy.** The working tree also holds the uncommitted v0.48 evidence work (API handlers, `vercel.json`). A push or dirty `vercel --prod` ships both. Needs an explicit call on sequencing.
- **Server-side query log** (so future A/Bs can use real traffic): not built. Privacy/product decision.
- `APP_VERSION` left at `v.46` (bumping it belongs to whichever sprint commits first).
- Paid API semantic ordering: not in scope; API callers have no device, so that would need a hosted embedder and a credit price.
- Machine wiki twin (`scripts/wiki/build-machine-map.mjs`) not rebuilt; the `machine_ids` above are provisional.
