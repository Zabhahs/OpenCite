---
machine_ids: []
findings: []
runtime: infra
status: mixed
tags: [audit, dashboard, moc]
---

# Health Dashboard

> **One-line role.** The master scorecard — every cluster's verdict, the headline numbers, and the
> ranked must-fix list. Start here; drill into [[09-Audit/Bugs]], [[09-Audit/Security]],
> [[09-Audit/Duplication-and-Reuse]], [[09-Audit/Tech-Debt-Overengineering]], [[09-Audit/What-We-Did-Well]].
> Full machine registry: `_machine/findings.json` (71), `_machine/modules.json` (151), `_machine/reuse.json` (26).

## Headline numbers
- **151 modules**, 305 dependency edges. Runtime split: 35 `both` · 55 client · 39 server · 7 shared.
- **71 findings**: 🔴 5 high · 🟠 22 med · 🟡 44 low. By type: 17 security · 14 bug · 11 debt · 10 ux · 8 deadcode · 8 perf · 3 dup.
- **All 5 high-severity findings are now resolved:** F-202/F-203 (v0.35 IA fixes) + F-107/F-109/F-110 (dead-adapter quarantine, v0.38). F-208 (systemic coverage) was reassessed **high→med** on-branch (2026-06-08): real impact is a guaranteed ~1% per-query *undercharge* (band can never be `full`), **not** a free-search discount — see [[09-Audit/Bugs#f-208]].
- **Verdict:** the *architecture* is sound — shared adapter/scoring core, DRY MCP contract, P3005-safe migrations, **no billing bypass**. The *rot* is concentrated in: **dead adapters poisoning coverage/billing**, **missing HTTP security headers**, **unauthenticated keyed routes**, a **proxy SSRF chain**, and a cluster of **dead frontend providers + triplicated hooks**.

## Cluster scorecard

| Cluster | Verdict | Worst issues |
|---|---|---|
| [[02-Adapters/Adapter-Architecture\|Adapters]] | 🟡 needs-work | 3 dead adapters in live array ([[09-Audit/Bugs#f-208]]), IA citedBy=downloads ([[09-Audit/Bugs#f-104]]), Mexicana load-more broken ([[09-Audit/Bugs#f-106]]), BnF isOA hardcoded ([[09-Audit/Bugs#f-114]]) |
| [[03-Search-Pipeline/Ranking-Scoring\|Search pipeline]] | 🟢 mostly-healthy | degenerate BM25F micro-pool IDF ([[09-Audit/Tech-Debt-Overengineering#f-200]]); semantic is client-only ([[09-Audit/Duplication-and-Reuse#f-205]]) — **server RRF fusion is already LIVE**, see [[09-Audit/What-We-Did-Well#f-209]] |
| [[01-Frontend/UI-Map\|Frontend/UI]] | 🟡 needs-work | dead providers shipped ([[09-Audit/Tech-Debt-Overengineering#f-300]]), search race / no AbortController ([[09-Audit/Bugs#f-307]]), triplicated DB-sync hooks ([[09-Audit/Duplication-and-Reuse#r-300]]) |
| [[04-Backend-API/Search-Endpoint\|Backend API]] | 🟠 security-gaps | no CSP/HSTS ([[09-Audit/Security#f-406]]), unauth keyed routes ([[09-Audit/Security#f-407]]), proxy SSRF chain ([[09-Audit/Security#f-410]]/[[09-Audit/Security#f-411]]) — **billing integrity verified** |
| [[05-Billing/Billing-Credits\|Billing]] | 🟢 healthy | webhook trusts metadata ([[09-Audit/Security#f-417]], low); checkout `*.vercel.app` redirect ([[09-Audit/Security#f-415]]) |
| [[06-MCP-Server/MCP-Server\|MCP]] | 🟢 healthy | `^` semver on SDK ([[09-Audit/Tech-Debt-Overengineering#f-500]]) — genuinely DRY |
| [[07-Data-Layer/Data-Layer\|Data layer]] | 🟡 needs-work | `relevance_labels` missing from migration ([[09-Audit/Bugs#f-503]]); env-var mismatch ([[09-Audit/Bugs#f-508]]); `ApiUsage` missing FK ([[09-Audit/Tech-Debt-Overengineering#f-502]]) |
| [[08-Build-Deploy/Build-Deploy\|Build/Deploy]] | 🟢 healthy | committed `output.css` ([[09-Audit/Tech-Debt-Overengineering#f-506]]); `^` semver on `@auth/*` ([[09-Audit/Tech-Debt-Overengineering#f-507]]) |

> **Remediation roadmap:** [[10-Sprints/Index]] — these items are scheduled across sprints **v0.38–v0.42**.

## 🔴 Ranked must-fix (by revenue/security impact, not severity label)

1. **Retire the 3 dead adapters** (SciELO/OpenNeuro/ENA) — ✅ **QUARANTINED (done):** removed from `src/adapters/index.js`, source preserved in [[99-Archive/_quarantine/_index]], build verified. **Remaining (v0.38):** chronic-failure circuit-breaker + coverage/billing-discount verification. → [[09-Audit/Bugs#f-208]], [[10-Sprints/Index|v0.38]]
2. **Add CSP/HSTS/X-Frame-Options** to `vercel.json` — one XSS = full session theft today. → [[09-Audit/Security#f-406]]
3. **Authenticate the keyed per-source routes** (Europeana/DPLA/Smithsonian) — open quota-drain. → [[09-Audit/Security#f-407]]
4. **Close the proxy SSRF chain** — enforce `https:` + re-validate redirect targets. → [[09-Audit/Security#f-410]], [[09-Audit/Security#f-411]]
5. **Validate `AUTH_SECRET` / `API_KEY_PEPPER` at startup** + fix the `.env.example` DB var-name mismatch + add `relevance_labels` migration. → [[09-Audit/Security#f-414]], [[09-Audit/Security#f-509]], [[09-Audit/Bugs#f-508]], [[09-Audit/Bugs#f-503]]
6. **Fix Mexicana load-more** + BnF `isOA` hardcode + stop displaying IA downloads as citations. → [[09-Audit/Bugs#f-106]], [[09-Audit/Bugs#f-114]], [[09-Audit/Bugs#f-104]]
7. **Add AbortController to `useSearch`** — stale-response race. → [[09-Audit/Bugs#f-307]]
8. **Delete dead providers** (`BillingProvider`, `SettingsContext`, Apple/MS OAuth buttons). → [[09-Audit/Tech-Debt-Overengineering#f-300]], [[09-Audit/Tech-Debt-Overengineering#f-301]]

## Quick-win refactors (high payoff, low risk)
- Extract `useSyncedStore` — kills ~120 lines triplicated across `useHistory`/`useLibrary`/`useSettings`. → [[09-Audit/Duplication-and-Reuse#r-300]]
- Extract `BookGroupHeader` (~60 lines copy-pasted in `SourceSection` + `UnifiedResultList`). → [[09-Audit/Duplication-and-Reuse#f-314]]
- Share XML + spoof-header helpers between client adapters and `api/` routes. → [[09-Audit/Duplication-and-Reuse#f-100]], [[09-Audit/Duplication-and-Reuse#f-101]]

## See also
[[home]] · [[00-Overview/System-Architecture]] · [[00-Overview/Search-Lifecycle]]
