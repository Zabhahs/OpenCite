# OpenCITE — Architecture Report
> **Canonical reference for the next Claude instance picking up this project.**
> Read this before touching any code. Contains full sprint history, schema, file map, roadmap, and execution checklists.
> Last updated: v0.30 — Origin-blind public API + 22 server-safe adapters + runtime-aware proxy (monetization sprint WS0-2; WS3-5 pending)
---
## Project overview
OpenCITE is a free meta-search engine for open-access scholarly databases. Searches multiple academic APIs in parallel, returns results with MLA 9 and APA 7 citations ready to paste. Deployed on Vercel at `citation.today` / `opencite.space`.

As of v0.30 the project also exposes a **sellable, AI-open, origin-blind** REST endpoint (`/api/search`) intended as a grounding product for AI agents: one verifiable, deduped, ranked, citation-ready call across many sources, with the serving upstream hidden.

**Author:** Shahbaz Yusuf (baazijan). Moves fast, expects precise execution. Mode C (plan + halt) before large tasks. Mode B (fast path) for small changes. Never pad responses.

**Stack:** React/Vite frontend, Vercel Edge + Node.js serverless functions, Prisma + Supabase (Postgres), Auth.js v5 Google OAuth.

**Repo:** `Zabhahs/OpenCite` on GitHub, deployed via Vercel.

---
## What changed in v0.30

v0.30 is the monetization sprint (planned in `sprint_log_v0_30.md`). **Workstreams WS0, WS1, WS2 shipped** on 2026-05-30 (commit `340525a`) and **WS4 (MCP server) built** the same day; WS3 (credit billing) and WS5 (result cache) are **pending external infra** (Stripe + KV keys). The thesis: don't sell the open-access data — sell the verifiable, deduped, ranked, origin-hidden call across many sources.

### WS0 — Origin-blind `/api/search` contract

The public Node endpoint became a thin orchestrator; every cross-cutting concern is now a single-responsibility SSOT module in `api/_shared/`.

- **R10 live 500 fixed.** The default `format=json` response threw `ReferenceError` (undefined `meaningful`/`anyGenuine`). Now uses the `lowConfidence` returned by `applyConfidenceGate`. Default JSON returns 200 in prod.
- **`api/_shared/publicResult.js` (new SSOT).** `toPublicResult` (moved out of search.js) is the LAST pipeline transform: it **drops `source`** and replaces the upstream id with `anonymizeId(r)` — `sha1(doi || url || \`${title}|${year}\`)` → base64url, 16 chars, `oc_` prefix; deterministic across calls. Scoring/dedup still run on the internal record (which keeps `source`/`id`); only this final map strips them.
- **`api/_shared/coverage.js` (new SSOT).** `computeCoverage(eligibleAdapters, failedAdapters)` returns `{attrition, coverage, band}`, corpus-weighted by `capability.corpusSize`. Denominator = the eligible set **for this request** (honest relative to what was searched). Bands (anti-fingerprint, coarse): `full` (zero eligible failures) · `near-full` (≥0.99) · `high` (≥0.95) · `partial` (≥0.50) · `limited` (<0.50), floored in the customer's favor. **Only the band leaves the server** — never the raw %, the failed count, or an upstream name. `coverageMultiplier(band)` (`1/0.99/0.95/0.5/0`) is built and **dormant**, ready for WS3 proration.
- **`api/_shared/apiContract.js` (new SSOT).** One descriptor of the request params + response shape. `buildUsage()` generates the self-documenting no-`q` payload today; the MCP tool schema + OpenAPI generate from the same source next (DRY-4). Exports the shared `DEFAULT_LIMIT`, `MAX_LIMIT`, `FORMATS`, `CITE_FORMATS`, `COVERAGE_BANDS`.
- **Response envelope** dropped the per-source `sources` meta block; added the `coverage` band and a valid `lowConfidence`. No upstream names or error strings are echoed.
- **Decision:** the `sources` request param is retained, but the internal source catalog is **not enumerated** in the usage payload or the 400 error (origin-blind). Revisit only if power users need discoverability.

### WS1 — 4 → 22 server-safe adapters

- `capability.serverSafe: true` and `capability.corpusSize: <int>` added to all 22 keyless server-safe adapters. `corpusSize` is an order-of-magnitude record count (cited in a comment, conservative when unknown) — the corpus weight `coverage.js` consumes.
- `SERVER_SAFE_IDS` in `api/search.js` is now **derived** from the registry (`ADAPTERS.filter(a => a.capability?.serverSafe)`), not a hardcoded Set (DRY-2). Server-safety lives next to the transport code.
- Typedef for `serverSafe` + `corpusSize` added to `AdapterCapability` in `src/adapters/_shared/base.js`.

### WS2 — Runtime-aware `proxiedFetch`

- `src/adapters/_shared/proxy.js` detects server via `typeof window === "undefined"` (true in Node *and* Edge). **No `opts` threading → zero adapter edits.**
- **Server branch:** direct `fetch(url)` with spoof headers (User-Agent / Accept / Accept-Language / Referer), caller headers winning over defaults, `method`/`body` preserved, `redirect:"follow"`. This is what lets proxy-only adapters (OAPEN, OPEN_LIBRARY, SciELO, Chronicling America, Princeton DPUL, PANGAEA, LA Referencia) run inside the Node API.
- **Browser branch:** byte-for-byte unchanged (`/api/proxy?url=...` rewrite) — the live app is unaffected.
- **DRY-3:** the spoof-header set is intentionally duplicated from `api/proxy.js` (an Edge function and `src/` cannot import each other) with a cross-reference comment in both files.

---
## The server-safe set (v0.30) — 22 adapters, all keyless

`OPENALEX, CROSSREF, DOAJ, CURATED` (core) + `MET, IA, NCBI, SCIELO, LA_REFERENCIA, OAPEN, OPEN_LIBRARY, THAQALAYN, NORTHWESTERN, PRINCETON_DPUL, PANGAEA, OPENNEURO, ENA, CHRONICLING_AMERICA, ONB, BNF_API, LC_DATASETS, WIKIDATA`.

Transport tiers (see sprint log §5): tier-1 direct fetch, tier-1.5 dual-mode (direct → proxy fallback), tier-2 proxy-only (now served via the WS2 server branch). **Out of scope:** Wave 3 (+7 key-gated: SMITHSONIAN, EUROPEANA, RIJKSMUSEUM, DPLA, CORE, NDLI, BASE) and Wave 4 (+4 Edge-route: GALLICA, BRITISH_LIBRARY, OPENCONTEXT, OPENEDITION). Deferred/fragile: BDH, MEXICANA.

---
## `/api/search` pipeline (v0.30)

```
GET /api/search
  → CORS / method gate
  → optional OPENCITE_API_KEY gate (admin/internal master key only; per-customer keys = WS3)
  → no q? → buildUsage() (apiContract.js)
  → parse limit / cite / format / sources / authors / mailto
  → eligible adapters = derived SERVER_SAFE_IDS ∩ requested sources
  → fan-out runSearch() per adapter (12s timeout each); track failedAdapters[]
  → scoreResults(pooled, terms, capBySource)            ← lib/scoring.js (BM25F)
  → dedupHighestScore(DOI) → dedupHighestScore(title fp) ← lib/dedup.js
  → applyConfidenceGate → { finalResults, lowConfidence } ← lib/scoring.js
  → computeCoverage(eligible, failed) → band             ← _shared/coverage.js
  → sort, slice(limit)
  → toPublicResult (drop source, anonymize id)           ← _shared/publicResult.js
  → respond { query, terms, coverage, lowConfidence, count, totalCandidates, tookMs, results }
```

**Origin-blind invariants:** cards carry no `source`; ids are opaque `oc_*`; no `sources` meta; coverage is a bucketed band only; errors never name an upstream.

---
## SSOT boundaries (current)

| Concern | SSOT file |
|---|---|
| BM25F lexical scoring + thin-source prior + citedBy gating | `src/lib/scoring.js` |
| Low-confidence gate | `src/lib/scoring.js` — `applyConfidenceGate` (both paths) |
| Cross-adapter dedup (DOI + title+year+author) | `src/lib/dedup.js` |
| Citation formatting / export | `src/lib/citations.js` |
| Book-chapter clustering | `src/lib/groupResults.js` |
| Browser search orchestration | `src/hooks/useSearch.js` + `src/hooks/useFilters.js` |
| Server search orchestration | `api/search.js` (thin orchestrator) |
| **Origin-blind public card** | **`api/_shared/publicResult.js`** — `toPublicResult` + `anonymizeId` |
| **Coverage / attrition band + charge multiplier** | **`api/_shared/coverage.js`** — `computeCoverage` + `coverageMultiplier` |
| **Public API contract (params/response/usage)** | **`api/_shared/apiContract.js`** — drives usage, MCP, OpenAPI |
| Adapter capability descriptor (incl. `serverSafe`, `corpusSize`) | `capability` block on each adapter; typedef in `_shared/base.js` |
| Server vs browser transport selection | `src/adapters/_shared/proxy.js` (`typeof window`) |
| Settings encryption (AES-256-GCM) | inline in `api/settings.js` (→ to be extracted to `_shared/crypto.js` in WS3, DRY-1) |
| Adapter authoring procedure | `docs/adapter-authoring-standard.md` |

---
## New / changed files in v0.30 (WS0-2)

| Path | Change |
|---|---|
| `api/_shared/publicResult.js` | **NEW** — origin-blind card SSOT (`toPublicResult`, `anonymizeId`) |
| `api/_shared/coverage.js` | **NEW** — corpus-weighted coverage band + `coverageMultiplier` (dormant for WS3) |
| `api/_shared/apiContract.js` | **NEW** — contract SSOT + `buildUsage()` |
| `api/search.js` | R10 fix; derive `SERVER_SAFE_IDS`; track failed adapters; emit `coverage`; drop `sources` meta; import the 3 new SSOTs |
| `src/adapters/_shared/proxy.js` | runtime-aware `proxiedFetch` (server branch direct-fetch) |
| `src/adapters/_shared/base.js` | `serverSafe` + `corpusSize` added to `AdapterCapability` typedef |
| 22 adapter files (core + extensions) | `capability.serverSafe:true` + `capability.corpusSize:<int>` |

---
## UnifiedResult schema (unchanged from v0.17)
```js
// Required: title, id, source
// Standard: authors[], year, journal, publisher, volume, issue, pages, doi, url, abstract, isOA, type
// Enrichment (v0.17+): editors[], keywords[], subjects[], language, citedBy, previewImage
// Pipeline-internal (_): _normalized, _type, _authorsParsed, _editorsParsed, _score, _lowConfidence
```
> Note: the *public API card* (`toPublicResult`) is a trimmed, origin-blind projection of this — `source` removed, `id` → opaque `oc_*`, `_score` surfaced as `score`.

---
## Prisma schema (unchanged in v0.30; WS3 will add `ApiKey` / `ApiUsage`)
`User` already carries the billing hooks: `stripe_customer_id @unique`, `total_credits Decimal(12,4) @default(10)` (seeded on first Google sign-in), `agent_wallet_address @unique` (Phase 4 SIWE). WS3 adds a `ApiKey[]` relation (FK `user_id`, cascade) + optional `ApiUsage`. Migration is additive-only.

---
## Sprint history summary

| Version | Summary |
|---|---|
| v0.27 | Phrase/proximity scoring fix; MeSH enrichment; global low-confidence gate; Semantic Scholar deregistered. |
| v0.28 | Public REST search endpoint (`api/search.js`) — core scholarly adapters only; JSON + bibliography formats; optional API-key gate. |
| v0.29 | Capability-aware ranking; 7 humanities adapters; secondary dedup → `lib/dedup.js`; book-chapter clustering; unified-view load-more fixes; `docs/adapter-authoring-standard.md`. |
| v0.30 | **Monetization sprint. WS0-2 shipped:** origin-blind `/api/search` contract (no `source`, opaque `oc_` ids, corpus-weighted `coverage` bands; R10 500 fixed); 4→22 keyless server-safe adapters (`serverSafe`/`corpusSize`, derived set); runtime-aware `proxiedFetch`. New SSOTs `api/_shared/{publicResult,coverage,apiContract}.js`. **WS3-5 pending** (billing, MCP, cache). |

---
## Roadmap — remaining v0.30 workstreams

### WS4 — MCP server ✅ (built 2026-05-30, no infra needed)
New standalone `mcp/` package (`@modelcontextprotocol/sdk`). Tool `search_scholarly_sources({query, limit?, format?})` calls `/api/search` over HTTPS — does **not** import the pipeline (clean HTTP boundary; auto-inherits origin-blind + future billing). Layout:
- **`src/contract.js`** — bridges to the `apiContract.js` SSOT; defines the agent-facing param set, renames `q` → `query`, maps tool args back to REST query params.
- **`src/schema.js`** — generates the MCP tool input schema, OpenAI + Anthropic function definitions, and an OpenAPI 3.1 spec, all from the one contract (DRY-4). `npm run print-schemas` prints all three.
- **`src/client.js`** — HTTPS fetch of `/api/search`; **TLS enforced** (non-https base rejected except localhost), `OPENCITE_API_KEY` forwarded as `x-api-key` and **never logged** (errors built without headers).
- **`src/server.js` + `bin/opencite-mcp.js`** — stdio MCP server; diagnostics to stderr only (stdout is the protocol channel).

Verified: 18/18 smoke assertions (schema gen + live `citation.today` call returning origin-blind cards). Full "usage attributed to key" acceptance lands with WS3 billing; today the open free tier forwards but ignores the key.

### WS3 — Credit billing (blocked on Stripe + KV provisioning)
Per-customer API keys → credit ledger (`User.total_credits`) → plan source-gating + rate limit → Stripe top-up via verified webhook. New SSOTs to build: `kv.js`, `crypto.js` (DRY-1 extract from settings.js), `plans.js`, `apiAuth.js`, `billing.js`, `ratelimit.js`, `keys.js`, `stripe/webhook.js`. Schema: `ApiKey` (+ optional `ApiUsage`). **Two-phase coverage-prorated charge:** pre-authorize `plan.creditCost` (402 if insufficient) → settle to `creditCost × coverageMultiplier(band)` after fan-out, refunding the difference. `coverageMultiplier` already lives in `coverage.js`. **Free tier = generous monthly top-up loss-leader** (recurring grant; the `@default(10)` seed is cold-start only).

### WS5 — Result cache (blocked on KV)
`cache.js` + shared `kv.js`. Cache the final origin-blind payload (TTL 1–24h); placement between rate-limit and fan-out; charge-on-hit default yes; **fail-open** if KV is down.

### Out of scope (next sprints)
Wave 3 (+7 key-gated adapters, project-level keys, ToS checks), Wave 4 (+4 Edge-port), Stripe metered overage, key-management dashboard UI, relative score floor (needs A/B), `?synonyms=1`, agent billing (SIWE / `agent_wallet_address`).

---
## Key architectural constraints
- **One core, two front-ends.** Browser (`useSearch`/`useFilters`) and server (`api/search.js`) share `scoring.js`, `dedup.js`, `citations.js`, `normalize.js`, and the adapter registry. Keep ranking/citation logic in `lib/`.
- **Edge routes cannot import from `src/`; Node functions can.** `/api/search` is a Node function for exactly this reason; `api/proxy.js` and `api/search/*.js` are Edge and keep inline helpers. The WS2 spoof-header duplication (DRY-3) follows from this.
- **Origin-blind is a hard product invariant.** No `source` on cards, opaque ids, bucketed coverage bands only, no upstream names in errors. Anything reintroducing per-result origin breaks the thesis.
- **Coverage is corpus-weighted and aggregate, not per-query relevance.** A topically-perfect niche source dropping reports near-`full` (R20, accepted) — document in API/TOS.
- **Semantic search is browser-only.** The API stays BM25F-ranked.
- **No stubs.** Document gaps here instead.
- **We test on Vercel, not locally.** Never run `npm install` / Vite builds locally. (A throwaway Node smoke test of a pure-fetch/import path is the one sanctioned exception.) Verify defects against live before treating them as fact.
- **Antigravity Protocol (Mode C).** Large tasks: plan → approval → execute → checklist.
