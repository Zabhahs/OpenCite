---
machine_ids: []
findings: [F-100, F-101, F-314, F-205, F-209]
runtime: infra
status: mixed
tags: [audit, reuse, duplication, client-server]
---
<!-- AUTO-GENERATED from docs/wiki/09-Audit/Duplication-and-Reuse.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Duplication & Reuse (client ↔ server)

> **One-line role.** The "don't do it twice" map. What is *already* shared (keep it), what is
> *needlessly duplicated* (extract it), and what *can't* be shared (and why). Full registry:
> `_machine/reuse.json` — 26 records: 9 already-shared, 8 divergent-duplicate, 7 extract-shared, 2 cross-reuse.

## ✅ Already shared — the wins to protect
- **Adapters run on both runtimes** (`runtime: both`). The same `src/adapters/*` files power the browser app *and* the origin-blind `/api/search` fan-out. One fetch/parse/sanitize implementation, two surfaces — the single best architectural decision in the repo. See [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md).
- <a id="r-209"></a><a id="f-209"></a>**Scoring + RRF fusion run server-side too.** `api/search.js:349-364` imports `buildNativeRanks`/`nativeWeight`/`rrfScores` from `lib/rrf.js` and runs native+lexical RRF; all four core adapters stamp `nativeScore`/`nativeRank`. The v0.35 sprint docs called this "open" — **the source refutes them; it's live.** See [What-We-Did-Well](What-We-Did-Well.md#f-209), [RRF-Fusion](../03-Search-Pipeline/RRF-Fusion.md).
- **MCP contract is DRY.** `mcp/src/contract.js` re-exports `api/_shared/apiContract.js` (no copy-paste); MCP/OpenAI/Anthropic/OpenAPI schemas all derive from one SSOT. See [MCP-Server](../06-MCP-Server/MCP-Server.md).

## 🟠 Needless duplication — extract to shared (ranked by payoff)

<a id="r-300"></a>
### r-300 — Triplicated DB-sync pattern across hooks [biggest, ~120 LOC]
`useHistory`, `useLibrary`, `useSettings` each reimplement ~40 identical lines of localStorage⇄server sync. Any one can silently diverge. **Fix:** extract `useSyncedStore(key, opts)`. Zero-risk, high payoff. See [Hooks](../01-Frontend/Hooks.md).

<a id="f-314"></a>
### f-314 — `BookGroupHeader` JSX copy-pasted [~60 LOC] <a id="r-301"></a>
The book-chapter group header is duplicated between `SourceSection.jsx:75-103` and `UnifiedResultList.jsx:136-164`. **Fix:** extract `<BookGroupHeader>`. See [_index](../01-Frontend/Components/_index.md#sourcesection-vs-unifiedresultlist).

<a id="f-100"></a>
### f-100 — XML helpers duplicated client→server <a id="r-100"></a>
`xmlUtils.js` (`dcOne/dcAll/oaiRecords/oaiResumptionToken`) is reimplemented inline in `api/search/mexicana.js` because Edge routes can't import from `src/`. **Fix:** a shared-utils workspace importable by both `src/` and `api/`. See [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md#f-100--xmlutils-duplicated-into-apisearchmexicanajs).

<a id="f-101"></a>
### f-101 — Proxy spoof-headers duplicated client→server <a id="r-101"></a>
Browser-spoof `User-Agent`/`Accept`/`Referer` exist in both `src/adapters/_shared/proxy.js:19` and `api/proxy.js:69`. **Fix:** one shared constants module (same constraint as f-100). See [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md#f-101--proxiedfetch-spoof-headers-duplicated-with-apiproxyjs).

### log.js twins
`api/_shared/log.js` and `src/lib/log.js` are parallel logging implementations — low stakes, a candidate for one isomorphic logger. See [Shared-Modules](../04-Backend-API/Shared-Modules.md).

### admin gating, two enforcements (intentional)
Client `isAdmin()` (`VITE_ADMIN_EMAILS`) and server `resolveSessionAdmin()` (`ADMIN_EMAILS`) deliberately double-gate — correct defense-in-depth — but the allowlist is configured twice. Keep the dual gate; document the two env vars together. See [Auth-Sessions](../04-Backend-API/Auth-Sessions.md).

> The 8 `divergent-duplicate` records in `reuse.json` (the cross-import-constrained pairs: xmlUtils, proxy headers, log, normalize helpers, plus the per-source routes that re-implement adapter fetch logic server-side) all trace to one root cause: **Vercel Edge routes can't import `src/`.** The durable fix is a shared package both can import — see fix_hint on [f-100](#f-100).

## 🔴 Cannot be shared (and why) — don't waste time trying

<a id="f-205"></a>
### f-205 — Semantic rerank is client-only
`useSemanticRerank` + `embed.worker.js` need a Web Worker and the ~23MB MiniLM model — neither runs in a Vercel function. So **`/api/search` consumers get lexical+native RRF but no semantic signal.** Closing it needs a server-side embedding service (hosted model or vector API), not code-sharing. See [Semantic-Rerank](../03-Search-Pipeline/Semantic-Rerank.md#overengineering-assessment).

## See also
[Health-Dashboard](Health-Dashboard.md) · [Tech-Debt-Overengineering](Tech-Debt-Overengineering.md) · `_machine/reuse.json`
