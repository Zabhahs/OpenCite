---
machine_ids: [api.search, api.shared.apiContract, api.shared.publicResult, api.shared.debugResult, api.shared.coverage, api.shared.serverKeys]
findings: [F-400, F-401, F-402, F-403]
runtime: server
status: healthy
tags: [api, search, billing, origin-blind, rrf]
---
<!-- AUTO-GENERATED from docs/wiki/04-Backend-API/Search-Endpoint.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Search Endpoint

> `GET /api/search` — the origin-blind, metered, RRF-fused scholarly search endpoint; serves both the browser UI and API callers with the same pipeline.

## What it is

`api/search.js` is the primary server-side endpoint (Node.js runtime). It wires together every major subsystem: identity resolution, rate limiting, caching, fan-out across adapters, BM25F scoring, dedup, RRF fusion, coverage calculation, credit billing, and result rendering. It is the **only** path that charges credits and the **only** path that may reveal source attribution (admin-only). See [Billing-Credits](../05-Billing/Billing-Credits.md) for the credit lifecycle.

The request contract is defined in `api/_shared/apiContract.js` (DRY-4 SSOT). That module is imported by `api/search.js` and is also the intended source for MCP tool schema and OpenAPI generation.

## Key exports / surface

| Symbol | Kind | Purpose |
|---|---|---|
| `default` | async fn | Vercel serverless handler for `GET /api/search` |
| `SERVER_SAFE_IDS` | `Set<string>` | Adapter IDs whose `capability.serverSafe` is true — derived from the registry, not hardcoded |
| `chargeForBand` | async fn | Cache-hit billing: pre-auth + settle in one shot (no fan-out) |

From `api/_shared/apiContract.js`:

| Symbol | Kind | Purpose |
|---|---|---|
| `DEFAULT_LIMIT` | constant | 25 |
| `MAX_LIMIT` | constant | 100 |
| `FORMATS` | array | `["json","mla","apa","bibtex","ris","csl-json"]` |
| `CITE_FORMATS` | array | Extra per-result citation formats beyond mla/apa |
| `COVERAGE_BANDS` | array | `["full","near-full","high","partial","limited"]` |
| `PARAMS` | object | Machine-readable request parameter descriptors |
| `buildUsage()` | fn | Self-documenting usage payload (returned for no-q requests) |

## Request contract

```
GET /api/search
  q        required  search query; ';' separates multi-keyword terms
  limit    optional  1..100, default 25
  sources  optional  comma-sep adapter IDs (server-authoritative tier filter applied)
  authors  optional  "1"/"true" — author-inclusive search mode
  mailto   optional  polite-pool contact email (excluded from cache key)
  cite     optional  bibtex,ris,csl-json — extra per-result citation formats
  format   optional  json|mla|apa|bibtex|ris|csl-json (default json)

Auth:
  x-api-key header  (preferred) — maps to billing identity via resolveApiKey
  ?key=             query param fallback
  session cookie    admin-only break-glass for browser admin console (resolveSessionAdmin)
```

Non-json formats return `text/plain` (or a JSON array for `csl-json`) and are not cached.

## Auth resolution (`api/search.js:127`)

```
identity = resolveApiKey(req) || resolveSessionAdmin(req)
if (!identity) → 401
```

`resolveApiKey` checks for the master key (`OPENCITE_API_KEY`) first — if it matches, returns `{ admin:true, plan:getPlan("admin"), userId:null, keyId:"master" }`. Otherwise hashes the presented key and looks it up in the `api_keys` table. A bad key yields `null` (generic 401, no disclosure of existence vs. revocation).

`resolveSessionAdmin` is a break-glass for the browser admin console: reads the Auth.js session via `/api/auth/session`, checks the email against `VITE_ADMIN_EMAILS` / `ADMIN_EMAILS`, and if matching returns `{ admin:true, plan:getPlan("admin"), userId:user.id, keyId:"session-admin" }`. If `ADMIN_EMAILS` is empty, this path short-circuits to `null`.

`admin` is **server-derived** and never read from the request. Non-admin `?debug=1` or `?simple=1` are **silent no-ops**.

## Source eligibility (`api/search.js:174–208`)

1. `tierIds` = `allowedSourceIds(identity.plan, SERVER_SAFE_IDS)` — `core` tier gets `[OPENALEX, CROSSREF, DOAJ, CURATED]`; `all` gets the full server-safe set.
2. If `?sources=` is present, it's intersected with `tierIds` (out-of-tier IDs silently dropped; no upstream names leaked in errors).
3. Keyed CC0 sources (EUROPEANA, DPLA, SMITHSONIAN) auto-drop from eligibility when their env var is absent — prevents false coverage-band penalization.
4. `serverInjectedKeys()` injects env keys into `settings` so the adapter's server branch can use them.

## Seven-phase execution pipeline

### Phase 1 — Identity (fail-closed)
See auth resolution above.

### Phase 2 — Parameter parsing / validation
`format` is validated against `FORMATS` before any fan-out or billing — a bad format gets a 400 and costs nothing (`api/search.js:163–168`).

### Phase 3 — Rate limit (`api/search.js:216`)
`checkRateLimit(identity.keyId ?? clientIp(req), identity.plan)` → 429 with `Retry-After` on breach. Admin plan has `max:0` → always passes. Fail-open if KV is down.

### Phase 4 — Cache read (`api/search.js:226–243`)
Cache key = SHA-256 of `{q, sources(sorted), limit, authors, format}`. On hit: `chargeForBand(identity, cached.coverage)` bills the stored coverage band (same proration as original), then returns the payload. Debug and simple modes bypass the cache entirely. Non-json responses are never cached.

### Phase 5 — Pre-authorize (`api/search.js:247`)
`preAuthorize(identity.userId, identity.plan.creditCost)` — atomically decrements credits if balance ≥ cost, else 402. Admin cost is 0 → ledger untouched.

### Phase 6 — Fan-out, score, dedup, gate, fuse (`api/search.js:253–383`)
All wrapped in try/catch; any throw triggers `refund(userId, creditCost)` and returns 500 (never bills a failed search).

- Fan-out: `Promise.all` over eligible adapters, each with a 12s `withTimeout`. Multi-keyword (`q` contains `;`) runs each term independently, then dedup-first-wins.
- Score: `scoreResults(allRaw, terms, capBySource)` — BM25F over the full candidate pool (consistent IDF).
- Dedup: `dedupHighestScore` by DOI key, then by title fingerprint.
- Confidence gate: `applyConfidenceGate(deduped, meaningfulTerms(terms))` — drops zero-score loose matches when genuine matches exist.
- Coverage: `computeCoverage(adapters, failedAdapters)` → `coverageBand` (only the band is ever emitted, never raw % or adapter names).
- RRF fusion (`api/search.js:349–362`): fuses native upstream relevance (`nativeRanks`) with local BM25F (`lexRanks`) via `rrfScores`. Native weight rises as pool shrinks (`nativeWeight`). Results sorted by `_fused`; ties broken by `_score`.
- Display normalization: `_scoreNorm` = 0–100 relative to top hit in this result set (D4-UX).

**Simple mode** (`?simple=1`, admin-only): returns the raw merged pool in fan-out order without any of the above pipeline steps. Never cached, cost 0, bypasses settle/refund.

### Phase 7 — Settle + render
`settle(userId, creditCost, coverageBand, { freeBelowBand })` — refunds the difference between the pre-auth and the prorated final charge. `freeBelowBand: "limited"` waives the charge entirely when coverage is sub-50%.

Render: `toDebugResult` (admin) or `toPublicResult` (everyone) per result. The public card is what gets cached.

## `publicResult.js` / `debugResult.js`

`toPublicResult` (`api/_shared/publicResult.js`) is the origin-blind card SSOT. It drops `source` and replaces the upstream id with `anonymizeId(r)` (SHA-1 of DOI/URL/title+year, prefixed `oc_`). Score is `_scoreNorm` when available.

`toDebugResult` (`api/_shared/debugResult.js`) composes `toPublicResult` and appends: `source`, `_score`, `_fused`, `_native`, `_scoreBreakdown`. This is the **only** place `source` re-enters the response. It must only be called when `identity.admin === true` (`api/search.js:411`).

## Response envelope (format=json)

```json
{
  "query": "...",
  "terms": [...],
  "coverage": "full|near-full|high|partial|limited",
  "lowConfidence": false,
  "count": 12,
  "totalCandidates": 47,
  "tookMs": 834,
  "results": [...],
  "meta": { "creditsCharged": 0.95, "balance": 18.05 }
}
```

`meta` is per-caller and excluded from the cache payload. The cached body is the rest.

## CORS

`api/search.js:111–112` sets `Access-Control-Allow-Origin: *` unconditionally. This is intentional for the public API (machine callers). Cookie-bearing routes use `auth.js:setCorsHeaders` with origin-specific CORS instead.

## 🩺 Health audit

- **Verdict:** healthy — pipeline fully wired as of v0.32/v0.35; no stubs in the hot path.
- **Findings:**
  - [F-400] `parseBody` has no size limit — unbounded body accumulation on POST routes.
  - [F-401] `getSession` in `auth.js` fetches `/api/auth/session` via loopback — SSRF-adjacent; host header injection could redirect this self-call.
  - [F-402] `OPENCITE_API_KEY` compared with `===` (not timing-safe) — susceptible to timing oracle on the master key.
  - [F-403] Rate limit is fail-open — KV outage disables burst protection for all non-admin keys.
- **Reuse:** `scoreResults`, `dedup*`, `exportAs`, `citations` all run identically server-side and in the browser — already shared via the `src/` tree. See [Duplication-and-Reuse](../09-Audit/Duplication-and-Reuse.md#r-400).
- **Smells:** `ADAPTER_TIMEOUT_MS` is a module-level constant with no env override — tuning requires a redeploy (`api/search.js:64`).

## See also

[Billing-Credits](../05-Billing/Billing-Credits.md) · [Shared-Modules](Shared-Modules.md) · [Per-Source-Routes](Per-Source-Routes.md) · [Security](../09-Audit/Security.md) · [Ranking-Scoring](../03-Search-Pipeline/Ranking-Scoring.md)
