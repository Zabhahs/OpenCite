---
machine_ids: [lib.semantic]
findings: [F-205]
runtime: server
status: spike
tags: [semantic, embeddings, server, spike, pipeline]
---
<!-- AUTO-GENERATED from docs/wiki/03-Search-Pipeline/Semantic-Server-Spike.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Semantic Server Signal — Spike (F-205)

> **Question:** can `/api/search` (and the MCP endpoint) gain a semantic rank arm? The
> client embeds query+corpus with a ~23 MB MiniLM model in a Web Worker (`src/lib/semantic.js`),
> which cannot run in a Vercel Function. Server callers get **two-input** RRF (native + BM25F)
> only. **This is a desk spike — no code committed.**

## The architectural constraint that frames everything

OpenCITE is a **live federated meta-search with no persistent index**. The candidate pool is
assembled per query from upstream APIs, deduped, then scored. There is nothing to *pre-embed*:
any embedding must happen **at query time**, over the ~14–50 deduped candidates, inside the
function's timeout. This rules out the whole "pre-embed at index time" class of options.

## Options & go/no-go

| Option | Latency fit (10 s fn budget) | Cost @ 100 q/day | Cold-start size | Verdict |
|---|---|---|---|---|
| **A. Hosted API — OpenAI `text-embedding-3-small`** (1 batched call: query + ~30 docs, `dimensions=256–384`) | ~100–300 ms one hop; comfortable | ≈ negligible (<$0.01/day; ~$0.02/1M tok) | none (no local model) | **GO — primary** |
| **B. Hosted API — Cohere `embed-english-light-v3.0`** (384-dim) | comparable to A | negligible | none | GO — alt vendor |
| **C. `@vercel/ai` `embed()`** | = whichever provider it wraps | = A/B | none | GO — thin convenience layer over A/B, not a local model |
| **D. In-function ONNX/WASM (Jina v2-small ~33 MB via transformers.js/onnxruntime-node)** | model load + ONNX init on cold start blows the budget; memory pressure | $0 marginal | ~33 MB load per cold start | **NO-GO — cold start** |
| **E. Vector DB pre-embed (Upstash / Supabase pgvector)** | n/a | n/a | n/a | **NO-GO — no index to pre-embed (see constraint)** |

## Recommendation

If pursued in **v0.43+**: prototype **Option A**. One server-side batched embed call over the
deduped pool, reduced `dimensions` (256–384) for speed, fused through the **existing `rrf.js`**
by adding a third (sem) arm to the server path — mirroring the client's three-input fusion.
Cost is negligible and latency fits well inside the adapter/function budget. Gate behind an
env key (`OPENAI_API_KEY` / `EMBEDDINGS_API_KEY`) so the arm is optional and degrades to today's
two-input RRF when unset.

**Otherwise defer.** Native + lexical RRF is adequate for current traffic, and the browser UI
already runs full three-input fusion client-side. The gap is real **only** for `/api/search` +
MCP consumers — a quality delta, not a correctness bug. Not a priority until MCP/API traffic
justifies the added dependency and per-query cost.

*Cross-ref: `[Semantic-Rerank](Semantic-Rerank.md#overengineering-assessment)` · `[RRF-Fusion](RRF-Fusion.md)` · F-205.*
