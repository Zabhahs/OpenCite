---
machine_ids: []
findings: []
runtime: infra
status: mixed
tags: [audit, dashboard, moc]
---
<!-- AUTO-GENERATED from docs/wiki/09-Audit/Health-Dashboard.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Health Dashboard

> **One-line role.** The master scorecard — every cluster's verdict, the headline numbers, and the
> ranked must-fix list. Start here; drill into [Bugs](Bugs.md), [Security](Security.md),
> [Duplication-and-Reuse](Duplication-and-Reuse.md), [Tech-Debt-Overengineering](Tech-Debt-Overengineering.md), [What-We-Did-Well](What-We-Did-Well.md).
> Full machine registry: `_machine/findings.json` (71), `_machine/modules.json` (151), `_machine/reuse.json` (26).

## Headline numbers
> Counts are generated — see `_machine/manifest.json` for the live figures (this prose tracks it).
- **155 modules**, 297 dependency edges (incl. 4 quarantined virtuals). Authoritative split in `_machine/manifest.json`.
- **71 findings**: 🔴 5 high · 🟠 23 med · 🟡 43 low. Status: **31 fixed · 3 wontfix · 1 confirmed · 36 open**. By type: 17 security · 15 bug · 11 debt · 10 ux · 8 deadcode · 7 perf · 3 dup.
- **All 5 high-severity findings are resolved + SHIPPED to prod** (commit `b5cd7ab`): F-202/F-203 (v0.35 IA fixes) + F-107/F-109/F-110 (dead-adapter quarantine, v0.38). F-208 (systemic coverage) reassessed **high→med**: real impact was a guaranteed ~1% per-query *undercharge* (band could never be `full`), **not** a free-search discount; fixed in v0.38 (quarantine + circuit-breaker) — see [Bugs](Bugs.md#f-208).
- **Also shipped (v0.39, in prod):** all 18 security findings closed — CSP/HSTS headers, authenticated keyed routes, proxy SSRF fix, timing-safe key compare, startup env guards. See [Security](Security.md).
- **Verdict:** architecture is sound — shared adapter/scoring core, DRY MCP contract, P3005-safe migrations, **no billing bypass**. With v0.38+v0.39 shipped, the headline security/coverage rot is **fixed**. Largest *open* items now: **server `/api/search` returns BM25F-only order (no RRF) so it disagrees with the browser** ([Known-Defects](../03-Search-Pipeline/Known-Defects.md#f-209)); dead frontend providers + triplicated hooks ([Tech-Debt-Overengineering](Tech-Debt-Overengineering.md)); the v0.40–v0.42 backlog.

## Cluster scorecard

| Cluster | Verdict | Worst issues |
|---|---|---|
| [Adapters](../02-Adapters/Adapter-Architecture.md) | 🟡 needs-work | 3 dead adapters in live array ([Bugs](Bugs.md#f-208)), IA citedBy=downloads ([Bugs](Bugs.md#f-104)), Mexicana load-more broken ([Bugs](Bugs.md#f-106)), BnF isOA hardcoded ([Bugs](Bugs.md#f-114)) |
| [Search pipeline](../03-Search-Pipeline/Ranking-Scoring.md) | 🟡 needs-work | **server `/api/search` returns BM25F-only order — RRF runs in the browser only, so the two front doors disagree** ([Known-Defects](../03-Search-Pipeline/Known-Defects.md#f-209), ~5-line fix); degenerate BM25F micro-pool IDF ([Tech-Debt-Overengineering](Tech-Debt-Overengineering.md#f-200)); semantic is client-only ([Duplication-and-Reuse](Duplication-and-Reuse.md#f-205)) |
| [Frontend/UI](../01-Frontend/UI-Map.md) | 🟡 needs-work | dead providers shipped ([Tech-Debt-Overengineering](Tech-Debt-Overengineering.md#f-300)), search race / no AbortController ([Bugs](Bugs.md#f-307)), triplicated DB-sync hooks ([Duplication-and-Reuse](Duplication-and-Reuse.md#r-300)) |
| [Backend API](../04-Backend-API/Search-Endpoint.md) | 🟠 security-gaps | no CSP/HSTS ([Security](Security.md#f-406)), unauth keyed routes ([Security](Security.md#f-407)), proxy SSRF chain ([Security](Security.md#f-410)/[Security](Security.md#f-411)) — **billing integrity verified** |
| [Billing](../05-Billing/Billing-Credits.md) | 🟢 healthy | webhook trusts metadata ([Security](Security.md#f-417), low); checkout `*.vercel.app` redirect ([Security](Security.md#f-415)) |
| [MCP](../06-MCP-Server/MCP-Server.md) | 🟢 healthy | `^` semver on SDK ([Tech-Debt-Overengineering](Tech-Debt-Overengineering.md#f-500)) — genuinely DRY |
| [Data layer](../07-Data-Layer/Data-Layer.md) | 🟡 needs-work | `relevance_labels` missing from migration ([Bugs](Bugs.md#f-503)); env-var mismatch ([Bugs](Bugs.md#f-508)); `ApiUsage` missing FK ([Tech-Debt-Overengineering](Tech-Debt-Overengineering.md#f-502)) |
| [Build/Deploy](../08-Build-Deploy/Build-Deploy.md) | 🟢 healthy | committed `output.css` ([Tech-Debt-Overengineering](Tech-Debt-Overengineering.md#f-506)); `^` semver on `@auth/*` ([Tech-Debt-Overengineering](Tech-Debt-Overengineering.md#f-507)) |

> **Remediation roadmap:** [Index](../10-Sprints/Index.md) — these items are scheduled across sprints **v0.38–v0.42**.

## 🔴 Ranked must-fix (by revenue/security impact, not severity label)

1. **Retire the 3 dead adapters** (SciELO/OpenNeuro/ENA) — ✅ **QUARANTINED (done):** removed from `src/adapters/index.js`, source preserved in [_index](../99-Archive/_quarantine/_index.md), build verified. **Remaining (v0.38):** chronic-failure circuit-breaker + coverage/billing-discount verification. → [Bugs](Bugs.md#f-208), [v0.38](../10-Sprints/Index.md)
2. **Add CSP/HSTS/X-Frame-Options** to `vercel.json` — one XSS = full session theft today. → [Security](Security.md#f-406)
3. **Authenticate the keyed per-source routes** (Europeana/DPLA/Smithsonian) — open quota-drain. → [Security](Security.md#f-407)
4. **Close the proxy SSRF chain** — enforce `https:` + re-validate redirect targets. → [Security](Security.md#f-410), [Security](Security.md#f-411)
5. **Validate `AUTH_SECRET` / `API_KEY_PEPPER` at startup** + fix the `.env.example` DB var-name mismatch + add `relevance_labels` migration. → [Security](Security.md#f-414), [Security](Security.md#f-509), [Bugs](Bugs.md#f-508), [Bugs](Bugs.md#f-503)
6. **Fix Mexicana load-more** + BnF `isOA` hardcode + stop displaying IA downloads as citations. → [Bugs](Bugs.md#f-106), [Bugs](Bugs.md#f-114), [Bugs](Bugs.md#f-104)
7. **Add AbortController to `useSearch`** — stale-response race. → [Bugs](Bugs.md#f-307)
8. **Delete dead providers** (`BillingProvider`, `SettingsContext`, Apple/MS OAuth buttons). → [Tech-Debt-Overengineering](Tech-Debt-Overengineering.md#f-300), [Tech-Debt-Overengineering](Tech-Debt-Overengineering.md#f-301)

## Quick-win refactors (high payoff, low risk)
- Extract `useSyncedStore` — kills ~120 lines triplicated across `useHistory`/`useLibrary`/`useSettings`. → [Duplication-and-Reuse](Duplication-and-Reuse.md#r-300)
- Extract `BookGroupHeader` (~60 lines copy-pasted in `SourceSection` + `UnifiedResultList`). → [Duplication-and-Reuse](Duplication-and-Reuse.md#f-314)
- Share XML + spoof-header helpers between client adapters and `api/` routes. → [Duplication-and-Reuse](Duplication-and-Reuse.md#f-100), [Duplication-and-Reuse](Duplication-and-Reuse.md#f-101)

## See also
[home](../home.md) · [System-Architecture](../00-Overview/System-Architecture.md) · [Search-Lifecycle](../00-Overview/Search-Lifecycle.md)
