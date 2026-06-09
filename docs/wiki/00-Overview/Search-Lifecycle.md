---
machine_ids: [hooks.useSearch, adapters.index, lib.scoring, lib.rrf, api.search]
runtime: both
status: healthy
tags: [overview, dataflow, search]
---

# Search Lifecycle

> **One-line role.** The end-to-end trace of one search — both the browser path and the metered
> `/api/search` path — so you can find *where* any behaviour lives.

## A. Browser app path (keystroke → rendered, ranked results)

1. **Input.** User types in [[01-Frontend/Components/_index|SearchInput]]; submits. [[01-Frontend/Components/_index|SearchControls]] holds the `Lexical↔Semantic` slider (`rrfSemanticWeight`) + Search-settings toggles. Owned by [[01-Frontend/App-Shell|App.jsx]].
2. **Eligibility.** `useSearch` reads enabled sources from [[01-Frontend/Contexts|settings]] (localStorage); keyed sources drop if no key.
3. **Fan-out.** `adapters/index.js → runSearch()` fires every eligible adapter **in parallel**. CORS-blocked hosts go through [[04-Backend-API/Proxy|api/proxy.js]] via `proxiedFetch`. Each adapter returns `{ results, hasMore }`, every result through `AbstractAdapter.sanitize()`. See [[02-Adapters/Adapter-Architecture]].
4. **Stream in.** Sections populate as adapters settle ([[01-Frontend/Components/_index|SearchStatusBar]] shows progress).
5. **Rank.** [[03-Search-Pipeline/Ranking-Scoring|BM25F]] scores locally → [[03-Search-Pipeline/Confidence-Gate|confidence gate]] (`hasContentMatch`) → [[03-Search-Pipeline/Dedup-Grouping|dedup]] → [[03-Search-Pipeline/RRF-Fusion|RRF]] fuses native+lexical(+semantic) ranks.
6. **Semantic (optional).** [[03-Search-Pipeline/Semantic-Rerank|useSemanticRerank]] two-phase: expensive embed once (MiniLM in a Web Worker), then cheap re-fuse on every slider drag.
7. **Reveal gate.** `resultsReady` holds the list until the final order is known (no populate-then-reshuffle). Then [[01-Frontend/Components/_index|FilterBar]] + result views render.
8. **Render.** [[01-Frontend/Components/_index|ResultCard]] in Unified ([[01-Frontend/Components/_index|UnifiedResultList]]) or per-source ([[01-Frontend/Components/_index|SourceSection]]) layout, each with MLA9/APA7 citations ([[03-Search-Pipeline/Citations]]).
9. **Persist.** Save → library, query → history (localStorage; both via the triplicated sync pattern flagged in [[09-Audit/Duplication-and-Reuse#r-300]]).

## B. Metered `/api/search` path (AI agents / MCP)

1. **Request** hits [[04-Backend-API/Search-Endpoint|api/search.js]] with body per `apiContract` (shared with [[06-MCP-Server/MCP-Server|MCP]]).
2. **Auth** — API key or session-admin (`apiAuth` / `resolveSessionAdmin`). Non-admin cannot reach `debug=1`/`simple=1`. See [[04-Backend-API/Auth-Sessions]].
3. **Rate limit** (KV leaky-bucket; fail-open, [[09-Audit/Security#f-403]]) → **cache** check (charge-on-hit).
4. **Pre-authorize credits** → **fan-out** same adapters (`serverInjectedKeys` supplies backend source keys) → **scoring only** — ⚠ the server sorts by BM25F `_score` and does **not** apply RRF ([[03-Search-Pipeline/Known-Defects#f-209]]); RRF + semantic are browser-only ([[09-Audit/Duplication-and-Reuse#f-205]]). API/MCP result *order* therefore differs from the SPA.
5. **Coverage** computed; the 3 dead adapters were quarantined in v0.38 so `failedCount` can now reach 0 → band `full` ([[09-Audit/Bugs#f-208]]).
6. **Settle / refund** credits → serialize via `publicResult` (origin-blind) or `debugResult` (admin). See [[05-Billing/Billing-Credits]].

## Where to change what
- Ranking weights/order → [[03-Search-Pipeline/Ranking-Scoring]] + [[03-Search-Pipeline/RRF-Fusion]].
- A source's behaviour → its adapter; status in [[02-Adapters/Adapter-Health-Matrix]].
- What the API returns/charges → [[04-Backend-API/Search-Endpoint]] + [[05-Billing/Billing-Credits]].
- What the user sees/does → [[01-Frontend/UI-Map]].

## See also
[[00-Overview/System-Architecture]] · [[03-Search-Pipeline/Known-Defects]] · [[09-Audit/Health-Dashboard]]
