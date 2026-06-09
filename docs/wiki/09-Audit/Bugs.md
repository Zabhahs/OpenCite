---
machine_ids: []
findings: [F-104, F-106, F-107, F-109, F-110, F-114, F-202, F-203, F-204, F-208, F-307, F-315, F-416, F-503, F-505, F-508]
runtime: infra
status: mixed
tags: [audit, bugs]
---

# Bugs

> **One-line role.** Confirmed correctness defects. Severity in brackets; ✅ = already fixed (kept for
> the record). Full detail per finding in `_machine/findings.json`.

## 🔴 High / revenue-impacting

### f-208 — Three always-dead adapters keep coverage off `full` [med, quarantine done]
SciELO (private Elasticsearch → 403/404), OpenNeuro (fetches 100 newest then client-filters to 0), ENA (wildcard syntax → 400) return **zero results on every query**. All `serverSafe:true`, so they **throw** into `failedAdapters` → `failedCount > 0` always → `coverage.js:36` can never return band `full`.
> **⚠ Corrected on-branch 2026-06-08 (was overstated):** their `corpusSize` is tiny (1M/500K/1K) vs OpenAlex/Crossref (hundreds of millions), so attrition ≈ 0.3% → band is **`near-full`** (0.99×), **not** `partial`. The real impact is a guaranteed **~1% systematic undercharge** on every query (and a meaningless coverage signal) — **not** the freeBelowBand free-waiver, which only fires on the `"limited"` band (coverage < 0.5; plans set `freeBelowBand:"limited"`, not `"partial"`). Per-adapter: [[#f-107]]/[[#f-109]]/[[#f-110]].
**Fix:** quarantine done ([[99-Archive/_quarantine/_index]]); add a circuit-breaker so `failedCount` can reach 0 → band `full` (1.0×) on clean queries. Verify empirically (v0.38 T2). See [[10-Sprints/Index|v0.38]].

### f-104 — Internet Archive `citedBy` = download count [low — product call]
`internetArchive.js:100,141` sets `citedBy = downloads`. The *ranking* use is fixed (`rankFields.citedBy:false`, [[#f-202]]).
> **⚠ Corrected on-branch 2026-06-08:** the display is **already source-aware** — `ResultCard.jsx:153` renders `{citedBy} {source==="IA" ? "downloaded" : "cited"}`, so IA shows "N **downloaded**", not "cited". So this is **not** a "shown as citations" bug. It's a **product decision**: keep the honest "downloaded" badge (recommended) or hide it (`citedBy:null`). See [[03-Search-Pipeline/Known-Defects#d1]].

### f-202 — IA download count used as a ranking signal ✅ FIXED (v0.35)
Resolved via `citedBy:false`. See [[03-Search-Pipeline/Known-Defects#d1]].

### f-203 — IA `sort=downloads desc` popularity bias ✅ FIXED (v0.35)
Now requests relevance order; `nativeRank` stamped for RRF. See [[03-Search-Pipeline/Known-Defects#d2]].

## 🟠 Medium

### f-307 — `useSearch` has no AbortController (stale-response race) [med, OPEN]
`useSearch.js:44` — a slow adapter from a previous search resolves after a new search starts and its `setSectionStates(prev=>…)` merge overwrites the new query's loading state with stale results. **Fix:** a `searchId` ref incremented per search; ignore callbacks whose id is stale. See [[01-Frontend/Hooks#usesearch]].

### f-503 — `relevance_labels` in Prisma schema but missing from migration SQL [med, OPEN]
A fresh `prisma migrate deploy` won't create the table → Gold-Set harness breaks on new environments. `prisma/migrations/20260530120000_billing/migration.sql`. **Fix:** add a migration for it. See [[07-Data-Layer/Data-Layer]].

### f-508 — `.env.example` DB var names don't match what Prisma reads [med, OPEN]
Example documents `DATABASE_URL`/`DIRECT_URL`; schema + `migrate.mjs` read `POSTGRES_PRISMA_URL`/`POSTGRES_URL_NON_POOLING`. A fresh deploy following the docs fails to connect; 8 required prod vars are undocumented. **Fix:** reconcile `.env.example`. See [[08-Build-Deploy/Build-Deploy]].

### f-204 — Diacritic / transliteration fragmentation ✅ FIXED (v0.35)
`normalizeForMatch` (NFKD fold + alias clusters) in `scoring.js`. See [[03-Search-Pipeline/Known-Defects#d5]].

## 🟡 Low

### f-106 — Mexicana "load more" silently broken
`mexicana.js:29` returns `nextToken` but `runSearch` reads `nextPageToken` (`index.js:129`) — token never threaded back, load-more re-fetches batch 1 forever. **Fix:** rename to `nextPageToken` (and mirror in `api/search/mexicana.js`). See [[02-Adapters/Extension-Adapters#mexicana]].

### f-114 — BnF `isOA` hardcoded `true`
`bnfApi.js:62` — the SRU catalogue is mostly non-OA; records leak into OA-only views. **Fix:** derive from metadata or set `false`. See [[02-Adapters/Extension-Adapters#bnfapi]].

### f-107 / f-109 / f-110 — the three dead adapters (detail of [[#f-208]])
`openNeuro.js:22` (100-newest then filter→0) · `ena.js:23` (wildcard→400) · `scielo.js:22` (private ES→403). See [[02-Adapters/Extension-Adapters]].

### f-315 — `PricingPanel` `currentPlan` hardcoded `"free"`
`Panels.jsx:190` defaultProps + `App.jsx:299` passes no prop → paying subscribers shown "Free" as current. Wire to billing once [[09-Audit/Tech-Debt-Overengineering#f-300|BillingProvider]] is mounted. See [[01-Frontend/Components/_index#panels--pricingpanel]].

### f-505 — `users.total_credits` `Decimal(12,4)` handled as JS float
Rounding-drift risk in credit math (`prisma/schema.prisma:33`). **Fix:** use Prisma atomic `$increment`/`$decrement`. See [[05-Billing/Billing-Credits]].

### f-416 — Stripe webhook silently no-ops on unresolved user
`webhook.js:104` — a paid event for an unknown user is swallowed with no alert; customer pays, gets nothing. **Fix:** log/alert on unresolved-user events. See [[05-Billing/Billing-Credits#stripe-webhook]].

## See also
[[09-Audit/Health-Dashboard]] · [[09-Audit/Security]] · [[03-Search-Pipeline/Known-Defects]]
