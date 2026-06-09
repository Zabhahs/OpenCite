---
machine_ids: [lib.semantic, workers.embed, hooks.useSemanticRerank]
findings: [F-205]
runtime: client
status: healthy
tags: [semantic, embeddings, rerank, pipeline, worker]
---

# Semantic Rerank

> **Client-side dense retrieval.** Embeds query + corpus with a ~23 MB MiniLM model in a Web Worker; the cosine similarity ranks feed the three-input RRF fusion alongside native and BM25F lexical ranks.

## What it is

Three files cooperate:
- `src/workers/embed.worker.js` — loads and runs `Xenova/all-MiniLM-L6-v2` via `@xenova/transformers@2.17.2` (CDN, browser-cached). Receives `{type:"embed", texts, id}` messages, responds with `{type:"result", embeddings, id}` or `{type:"error"}`.
- `src/lib/semantic.js` — manages the worker singleton, dispatches embed jobs via a promise map, computes cosine similarity, returns a rank Map.
- `src/hooks/useSemanticRerank.js` — React hook integrating two-phase rerank into the search result lifecycle.

## Key exports / surface

| Symbol | Kind | Source | Purpose |
|---|---|---|---|
| `computeSemanticRanks(query, results)` | async fn | `semantic.js` | Embeds query+corpus, returns `Map<index, rank>` |
| `useSemanticRerank(sectionStates, query, enabled, semanticWeight)` | hook | `useSemanticRerank.js` | Two-phase RRF reranker; returns `{rerankedStates, rerankStatus}` |

## Dependencies

- `semantic.js` imports: none (manages worker inline)
- `embed.worker.js` imports: `@xenova/transformers` from CDN
- `useSemanticRerank.js` imports: `lib.semantic`, `lib.rrf`, `adapters/index.js` (for `CAP_BY_SOURCE`)
- Imported by: `hooks.useSearch` (or App.jsx) consuming `useSemanticRerank`

## Behaviour / data flow

### Model loading (`embed.worker.js`, lines 1-13)

On first `embed` message: dynamic import of `@xenova/transformers@2.17.2` from jsDelivr CDN. `env.useBrowserCache = true` means the ~23 MB WASM + ONNX model files are cached in IndexedDB after first load. Singleton: `pipe` is module-level; subsequent calls skip the pipeline setup.

Pooling strategy: `{pooling: "mean", normalize: true}` — embeddings are L2-normalized, so dot product = cosine similarity.

### `computeSemanticRanks` (`semantic.js`, lines 41-67)

**Text construction** (lines 43-56): for each result, builds a string up to `EMBED_MAX=512` chars:
- Title first
- Abstract up to `abstractBudget = EMBED_MAX - title.len - kwPart.len - 2` chars
- Keywords/subjects reserved last `KW_BUDGET=140` chars

This guarantees keywords always make it into the embedding window even when abstracts are long — the same fields BM25F weights also feed the semantic arm.

**Embedding dispatch**: sends `[query, ...texts]` in one batch message. Worker processes all in parallel via the transformer pipeline.

**Rank construction** (lines 63-66): sorts `(index, similarity)` pairs descending, assigns 1-based rank. Returns `Map<resultIndex, rank>`.

### Two-phase design in `useSemanticRerank`

**Expensive effect** (lines 48-96): runs once per new result set (guarded by `didRerankRef`). Builds:
- Lexical rank map from `_score` order (lines 64-68)
- Native rank map via `buildNativeRanks` (line 73)
- Semantic rank map via `computeSemanticRanks` (line 75)

Stores all three in `fusionInputs` state. **Never re-embeds on slider drag** — the costly CDN model inference is amortized over the query, not per UI interaction.

**Cheap effect** (lines 99-126): runs whenever `fusionInputs` or `semanticWeight` changes (including slider drag). Calls `fuseRanks` with three weighted rank-lists — pure arithmetic, instant. Re-slices the fused flat list back into per-section shapes using the `shape` snapshot.

**Reset logic**: any section in `loading` state resets all cached inputs and `didRerankRef` — a new search wipes the slate.

**Error handling** (line 85): on embed failure, `rerankStatus = "error"` and `rerankedStates` stays null. The caller falls back to BM25F order (`effectiveStates` falls through to `sectionStates`).

### Lifecycle / gating

`enabled` = `settings.semanticSearch` (default `true` since v0.31 one-time migration). When `enabled=false`, reset clears all state and the hook returns `{rerankedStates: null, rerankStatus: "idle"}` — the UI uses the unmodified BM25F order.

The model is lazy: not loaded until the first search completes and the expensive effect fires. On a slow connection or first-ever use, there will be a rerank-pending state while the ~23 MB model downloads.

## Overengineering assessment

The two-phase split (expensive embed once + cheap re-fuse on slider) is **justified**:
- MiniLM inference over 30-45 docs + query takes ~300-800ms in the worker. Doing this on every slider tick would make the UI unusable.
- The cheap effect is pure arithmetic and fires in <1ms.
- The `shape` snapshot avoids re-reading `sectionStates` from the closure, preventing stale-closure bugs.

The worker singleton pattern is idiomatic and correct. The `pending` Map with promise resolve/reject handles concurrent requests safely (each gets a unique `msgId`).

**Not overengineered.** The complexity is structurally necessary given the model size.

## Correctness notes

**Worker message ordering:** responses are matched by `id` via the `pending` Map — out-of-order responses are handled correctly.

**Cancellation:** the expensive effect returns `() => { cancelled = true }` — prevents `setFusionInputs` on unmount or re-run. Correct.

**`CAP_BY_SOURCE` cache:** built once at module load from `ADAPTERS` registry. Static — correct as long as the adapter registry doesn't change at runtime (it doesn't).

**semanticWeight clamp** (line 102): `Math.min(1, Math.max(0, semanticWeight ?? 0.4))` — safe against NaN/undefined slider values.

## 🩺 Health audit

- **Verdict:** healthy.
- **Findings:** [F-205] Model runs client-only — server `/api/search` has no semantic rerank path. Acceptable for the current architecture (CDN model can't run in Vercel serverless), but means API consumers don't get semantic reranking.
- **Reuse:** client-only by design (worker API unavailable server-side). See [[09-Audit/Duplication-and-Reuse#r-202]].
- **Smells:** `KW_BUDGET=140` and `EMBED_MAX=512` are magic numbers with no comments explaining the derivation. The model truncates at ~256 tokens (~350-400 chars for English text); 512 chars is a reasonable conservative ceiling but not principled.

## See also

[[RRF-Fusion]] · [[Ranking-Scoring]] · [[Known-Defects#f-205]] · [[09-Audit/Duplication-and-Reuse#r-202]]
