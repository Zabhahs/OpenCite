---
machine_ids: [hooks.useSearch, adapters.index, lib.dedup, api.search]
runtime: both
status: healthy
tags: [overview, dataflow, search]
---

# Search Lifecycle

> **One-line role.** The end-to-end trace of one search — both the browser path and the metered
> `/api/search` path — so you can find *where* any behaviour lives. Since v0.44 both paths are
> **pass-through**: no local scoring, no rerank — see [[03-Search-Pipeline/Pipeline]].

## A. Browser app path (keystroke → rendered results)

1. **Input.** User types in [[01-Frontend/Components/_index|SearchInput]]; submits. [[01-Frontend/Components/_index|SearchControls]] holds view-mode + author-search controls. Owned by [[01-Frontend/App-Shell|App.jsx]].
2. **Eligibility.** `useSearch` reads enabled sources from settings (localStorage); keyed sources drop if no key.
3. **Fan-out.** `adapters/index.js → runSearch()` fires every eligible adapter **in parallel**, each fetch under a 15 s abort timeout. CORS-blocked hosts go through [[04-Backend-API/Proxy|api/proxy.js]] via `proxiedFetch`. Each adapter returns `{ results, hasMore }` in its upstream's native relevance order, every result through `AbstractAdapter.sanitize()`. See [[02-Adapters/Adapter-Architecture]].
4. **Stream in + dedupe.** Sections populate as adapters settle ([[01-Frontend/Components/_index|SearchStatusBar]] shows progress). Streaming first-wins dedup (normalized-DOI key, then title fingerprint) collapses cross-source duplicates — [[03-Search-Pipeline/Dedup-Grouping]].
5. **Reveal.** `resultsReady` fires when all adapters are done; [[01-Frontend/Components/_index|FilterBar]] + result views render. Order is native upstream order — unified view interleaves sources round-robin; explicit year/citations sorts remain available.
6. **Render.** [[01-Frontend/Components/_index|ResultCard]] in Unified ([[01-Frontend/Components/_index|UnifiedResultList]]) or per-source ([[01-Frontend/Components/_index|SourceSection]]) layout, each with MLA9/APA7 citations ([[03-Search-Pipeline/Citations]]).
7. **Persist.** Save → library, query → history (localStorage, synced via `useSyncedStore`).

## B. Metered `/api/search` path (AI agents / MCP)

1. **Request** hits [[04-Backend-API/Search-Endpoint|api/search.js]] with body per `apiContract` (shared with [[06-MCP-Server/MCP-Server|MCP]]).
2. **Auth** — API key or session-admin (`apiAuth` / `resolveSessionAdmin`). Non-admin cannot reach `debug=1`. See [[04-Backend-API/Auth-Sessions]].
3. **Rate limit** (KV leaky-bucket; fail-open, [[09-Audit/Security#f-403]]) → **cache** check (charge-on-hit).
4. **Pre-authorize credits** → **fan-out** same adapters (`serverInjectedKeys` supplies backend source keys) → pooled dedup with field-merge → **round-robin interleave** of native-order lists, then `limit`. No score, no gate — the response order is the upstreams' own relevance, interleaved.
5. **Coverage** computed; the chronically-dead adapters were quarantined in v0.38 so `failedCount` can reach 0 → band `full` ([[09-Audit/Bugs#f-208]]).
6. **Settle / refund** credits → serialize via `publicResult` (origin-blind) or `debugResult` (admin). See [[05-Billing/Billing-Credits]].

## Where to change what
- Result order / dedup → [[03-Search-Pipeline/Pipeline]] (`src/lib/dedup.js`, interleave rule).
- A source's behaviour → its adapter; status in [[02-Adapters/Adapter-Health-Matrix]].
- What the API returns/charges → [[04-Backend-API/Search-Endpoint]] + [[05-Billing/Billing-Credits]].
- What the user sees/does → [[01-Frontend/UI-Map]].

## See also
[[00-Overview/System-Architecture]] · [[03-Search-Pipeline/Known-Defects]] · [[09-Audit/Health-Dashboard]]
