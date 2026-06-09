---
machine_ids: [hooks.useSearch, adapters.index, lib.scoring, lib.rrf, api.search]
runtime: both
status: healthy
tags: [overview, dataflow, search]
---
<!-- AUTO-GENERATED from docs/wiki/00-Overview/Search-Lifecycle.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Search Lifecycle

> **One-line role.** The end-to-end trace of one search — both the browser path and the metered
> `/api/search` path — so you can find *where* any behaviour lives.

## A. Browser app path (keystroke → rendered, ranked results)

1. **Input.** User types in [SearchInput](../01-Frontend/Components/_index.md); submits. [SearchControls](../01-Frontend/Components/_index.md) holds the `Lexical↔Semantic` slider (`rrfSemanticWeight`) + Search-settings toggles. Owned by [App.jsx](../01-Frontend/App-Shell.md).
2. **Eligibility.** `useSearch` reads enabled sources from [settings](../01-Frontend/Contexts.md) (localStorage); keyed sources drop if no key.
3. **Fan-out.** `adapters/index.js → runSearch()` fires every eligible adapter **in parallel**. CORS-blocked hosts go through [api/proxy.js](../04-Backend-API/Proxy.md) via `proxiedFetch`. Each adapter returns `{ results, hasMore }`, every result through `AbstractAdapter.sanitize()`. See [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md).
4. **Stream in.** Sections populate as adapters settle ([SearchStatusBar](../01-Frontend/Components/_index.md) shows progress).
5. **Rank.** [BM25F](../03-Search-Pipeline/Ranking-Scoring.md) scores locally → [confidence gate](../03-Search-Pipeline/Confidence-Gate.md) (`hasContentMatch`) → [dedup](../03-Search-Pipeline/Dedup-Grouping.md) → [RRF](../03-Search-Pipeline/RRF-Fusion.md) fuses native+lexical(+semantic) ranks.
6. **Semantic (optional).** [useSemanticRerank](../03-Search-Pipeline/Semantic-Rerank.md) two-phase: expensive embed once (MiniLM in a Web Worker), then cheap re-fuse on every slider drag.
7. **Reveal gate.** `resultsReady` holds the list until the final order is known (no populate-then-reshuffle). Then [FilterBar](../01-Frontend/Components/_index.md) + result views render.
8. **Render.** [ResultCard](../01-Frontend/Components/_index.md) in Unified ([UnifiedResultList](../01-Frontend/Components/_index.md)) or per-source ([SourceSection](../01-Frontend/Components/_index.md)) layout, each with MLA9/APA7 citations ([Citations](../03-Search-Pipeline/Citations.md)).
9. **Persist.** Save → library, query → history (localStorage; both via the triplicated sync pattern flagged in [Duplication-and-Reuse](../09-Audit/Duplication-and-Reuse.md#r-300)).

## B. Metered `/api/search` path (AI agents / MCP)

1. **Request** hits [api/search.js](../04-Backend-API/Search-Endpoint.md) with body per `apiContract` (shared with [MCP](../06-MCP-Server/MCP-Server.md)).
2. **Auth** — API key or session-admin (`apiAuth` / `resolveSessionAdmin`). Non-admin cannot reach `debug=1`/`simple=1`. See [Auth-Sessions](../04-Backend-API/Auth-Sessions.md).
3. **Rate limit** (KV leaky-bucket; fail-open, [Security](../09-Audit/Security.md#f-403)) → **cache** check (charge-on-hit).
4. **Pre-authorize credits** → **fan-out** same adapters (`serverInjectedKeys` supplies backend source keys) → **scoring + RRF** (server RRF is live, [What-We-Did-Well](../09-Audit/What-We-Did-Well.md#f-209); **no semantic** server-side, [Duplication-and-Reuse](../09-Audit/Duplication-and-Reuse.md#f-205)).
5. **Coverage** computed (sub-band → discount); the 3 dead adapters force `partial` here ([Bugs](../09-Audit/Bugs.md#f-208)).
6. **Settle / refund** credits → serialize via `publicResult` (origin-blind) or `debugResult` (admin). See [Billing-Credits](../05-Billing/Billing-Credits.md).

## Where to change what
- Ranking weights/order → [Ranking-Scoring](../03-Search-Pipeline/Ranking-Scoring.md) + [RRF-Fusion](../03-Search-Pipeline/RRF-Fusion.md).
- A source's behaviour → its adapter; status in [Adapter-Health-Matrix](../02-Adapters/Adapter-Health-Matrix.md).
- What the API returns/charges → [Search-Endpoint](../04-Backend-API/Search-Endpoint.md) + [Billing-Credits](../05-Billing/Billing-Credits.md).
- What the user sees/does → [UI-Map](../01-Frontend/UI-Map.md).

## See also
[System-Architecture](System-Architecture.md) · [Known-Defects](../03-Search-Pipeline/Known-Defects.md) · [Health-Dashboard](../09-Audit/Health-Dashboard.md)
