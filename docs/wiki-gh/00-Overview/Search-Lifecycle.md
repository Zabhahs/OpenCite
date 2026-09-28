---
machine_ids: [hooks.useSearch, adapters.index, lib.dedup, api.search]
runtime: both
status: healthy
tags: [overview, dataflow, search]
---
<!-- AUTO-GENERATED from docs/wiki/00-Overview/Search-Lifecycle.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Search Lifecycle

> **One-line role.** The end-to-end trace of one search — both the browser path and the metered
> `/api/search` path — so you can find *where* any behaviour lives. Since v0.44 both paths are
> **pass-through**: no local scoring, no rerank — see [Pipeline](../03-Search-Pipeline/Pipeline.md).

## A. Browser app path (keystroke → rendered results)

1. **Input.** User types in [SearchInput](../01-Frontend/Components/_index.md); submits. [SearchControls](../01-Frontend/Components/_index.md) holds view-mode + author-search controls. Owned by [App.jsx](../01-Frontend/App-Shell.md).
2. **Eligibility.** `useSearch` reads enabled sources from settings (localStorage); keyed sources drop if no key.
3. **Fan-out.** `adapters/index.js → runSearch()` fires every eligible adapter **in parallel**, each fetch under a 15 s abort timeout. CORS-blocked hosts go through [api/proxy.js](../04-Backend-API/Proxy.md) via `proxiedFetch`. Each adapter returns `{ results, hasMore }` in its upstream's native relevance order, every result through `AbstractAdapter.sanitize()`. See [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md).
4. **Stream in + dedupe.** Sections populate as adapters settle ([SearchStatusBar](../01-Frontend/Components/_index.md) shows progress). Streaming first-wins dedup (normalized-DOI key, then title fingerprint) collapses cross-source duplicates — [Dedup-Grouping](../03-Search-Pipeline/Dedup-Grouping.md).
5. **Reveal.** `resultsReady` fires when all adapters are done; [FilterBar](../01-Frontend/Components/_index.md) + result views render. Order is native upstream order — unified view interleaves sources round-robin; explicit year/citations sorts remain available.
6. **Render.** [ResultCard](../01-Frontend/Components/_index.md) in Unified ([UnifiedResultList](../01-Frontend/Components/_index.md)) or per-source ([SourceSection](../01-Frontend/Components/_index.md)) layout, each with MLA9/APA7 citations ([Citations](../03-Search-Pipeline/Citations.md)).
7. **Persist.** Save → library, query → history (localStorage, synced via `useSyncedStore`).

## B. Metered `/api/search` path (AI agents / MCP)

1. **Request** hits [api/search.js](../04-Backend-API/Search-Endpoint.md) with body per `apiContract` (shared with [MCP](../06-MCP-Server/MCP-Server.md)).
2. **Auth** — API key or session-admin (`apiAuth` / `resolveSessionAdmin`). Non-admin cannot reach `debug=1`. See [Auth-Sessions](../04-Backend-API/Auth-Sessions.md).
3. **Rate limit** (KV leaky-bucket; fail-open, [Security](../09-Audit/Security.md#f-403)) → **cache** check (charge-on-hit).
4. **Pre-authorize credits** → **fan-out** same adapters (`serverInjectedKeys` supplies backend source keys) → pooled dedup with field-merge → **round-robin interleave** of native-order lists, then `limit`. No score, no gate — the response order is the upstreams' own relevance, interleaved.
5. **Coverage** computed; the chronically-dead adapters were quarantined in v0.38 so `failedCount` can reach 0 → band `full` ([Bugs](../09-Audit/Bugs.md#f-208)).
6. **Settle / refund** credits → serialize via `publicResult` (origin-blind) or `debugResult` (admin). See [Billing-Credits](../05-Billing/Billing-Credits.md).

## Where to change what
- Result order / dedup → [Pipeline](../03-Search-Pipeline/Pipeline.md) (`src/lib/dedup.js`, interleave rule).
- A source's behaviour → its adapter; status in [Adapter-Health-Matrix](../02-Adapters/Adapter-Health-Matrix.md).
- What the API returns/charges → [Search-Endpoint](../04-Backend-API/Search-Endpoint.md) + [Billing-Credits](../05-Billing/Billing-Credits.md).
- What the user sees/does → [UI-Map](../01-Frontend/UI-Map.md).

## See also
[System-Architecture](System-Architecture.md) · [Known-Defects](../03-Search-Pipeline/Known-Defects.md) · [Health-Dashboard](../09-Audit/Health-Dashboard.md)
