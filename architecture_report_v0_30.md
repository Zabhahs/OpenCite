# OpenCITE — Architecture Report
> **Canonical reference for the next Claude instance picking up this project.**
> Read this before touching any code. Contains full sprint history, schema, file map, roadmap, and execution checklists.
> Last updated: v0.30 — Origin-blind public API + 22 server-safe adapters + runtime-aware proxy + **WS3 billing shipped** (Stripe Checkout, Plans UI, Prisma Migrate workflow). WS5 cache still pending KV.
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

### WS3 — Credit billing + Stripe Checkout ✅ (shipped 2026-05-30)

The purchase loop is live end-to-end: **Plans UI → `/api/checkout` → Stripe → webhook grants credits.** Search-time credit *spending* (the middleware chain in `search.js`) is the one remaining wire-up — see roadmap.

- **`api/checkout.js` (new).** Session-authed (`getSession`), mirrors `keys.js`. Validates the requested `plan` (must be a subscription; the **student** tier is gated — returns `403 {code:"needs_student_verification"}` unless `User.is_student_verified`) or `pack` against `PLANS` / `CREDIT_PACKS`. Resolves the Stripe **Price id** from env (`503` if unset), dynamic-imports `stripe`, reuses/creates the Stripe customer (persists `stripe_customer_id`), and creates a Checkout session with `client_reference_id = User.id` + metadata (also on `subscription_data` for subs) so the webhook can resolve identity. `success_url`/`cancel_url` derive from a trusted Origin.
- **`api/stripe/webhook.js` (extended to the full event set).** Verifies the signature on the **raw body**, claims the event in Postgres `processed_events` (durable idempotency — a unique insert can't double-grant even if KV is down), then in one `$transaction` handles: `checkout.session.completed` (set plan + first grant), `invoice.paid` / `invoice.payment_succeeded` (renewal grant — plan derived from the invoice's **Price id** via `planIdForPriceId`, with stored-plan fallback, to dodge the first-invoice race), `customer.subscription.updated` (re-sync plan, or drop to free when canceled), `customer.subscription.deleted`, `invoice.payment_failed` (no-op record). The per-month `credits_period` guard makes the duplicate `invoice.paid`+`invoice.payment_succeeded` pair a single grant.
- **`applyMonthlyGrant({client})`** now accepts a caller's transaction so the grant + event-claim are atomic (no nested `$transaction`).
- **Plans UI (`src/components/Panels.jsx` `PricingPanel`).** Lists subscriptions + API credit packs, matched to the existing panel aesthetic. **Platform-aware payment routing** (`src/lib/platform.js`): native iOS/Android subscriptions must go through **Apple/Google IAP** (store policy) — those rails show a store notice; web/desktop subscriptions and **all** API/machine packs go to Stripe (`src/lib/checkout.js` → `/api/checkout`). Display-only pricing SSOT in `src/constants/pricing.js` (mirrors `plans.js`, never gates access).
- **Allowances (1 search = 1 credit), recurring monthly:** Free **20/mo** (core sources; verification unlocks the paid Student plan but gives no free bump — `FREE_STUDENT_MONTHLY_GRANT === FREE_MONTHLY_GRANT`), Student **500/mo** ($5, all sources, verification-gated), Pro **1,000/mo** ($10, all sources). PAYG packs (agents/devs) are separate: 10k/$10, 60k/$50, 300k/$200. Topped up via `applyMonthlyGrant` keyed on `credits_period` (YYYY-MM); the `@default(10)` seed is cold-start only. **Note:** the human subs are intentionally small relative to the dev packs (human-vs-machine split), so a power user could arbitrage by buying a pack — revisit if that becomes real.

### WS3 infra — Prisma Migrate workflow + the deploy incident (read before touching the build)

The project historically synced schema with **`prisma db push`** and had **no migration history** (see v0.17). WS3 introduced a real migrations folder, auto-applied on deploy. Getting there broke production once — the lessons are now hard constraints:

- **`prisma/migrations/20260530120000_billing/migration.sql`** — additive, **fully idempotent** (`IF NOT EXISTS` on every column/index/table). Adds the `users` billing columns (`plan`, `is_student_verified`, `student_verified_at`, `credits_period`, `stripe_subscription_id`; `stripe_customer_id` pre-existed) and the `api_keys` / `api_usage` / `processed_events` tables.
- **Build runs `node scripts/migrate.mjs`** (not a bare `prisma migrate deploy`). The script: tries `migrate deploy`; on **P3005** (non-empty DB, no history — exactly our db-push'd state) it applies the idempotent SQL directly via `prisma db execute` **then** baselines with `migrate resolve --applied` — but **only baselines if the SQL actually applied**, and it **never exits non-zero**. After the first success, `migrate deploy` is a clean no-op forever.
- **Incident (2026-05-30):** the first cut gated the build on `prisma migrate deploy && …`. It hit P3005, **failed the whole Vercel build**, froze deploys on a stale build, and — once a build finally shipped the new Prisma Client — Google OAuth returned *"There is a problem with the server configuration."* **Root cause:** the new Client queried `users` columns the live DB didn't have yet, so `@auth/prisma-adapter`'s user query threw on every sign-in. A second bug: `api_keys.user_id` was declared `TEXT`, but the live `users.internal_id` is native **`uuid`** (db-push artifact), so the FK failed with `42804 incompatible types`. Both fixed; the manual recovery was running the idempotent SQL in the Supabase SQL editor.
- **Hard constraints now:** (1) a migration **must never fail the build** — auth shares the Prisma Client, so a frozen/failed deploy takes login down; (2) migration SQL **must be idempotent**; (3) FK columns referencing `users.internal_id` **must be `UUID`**, not `TEXT`; (4) `schema.prisma` declares `id`/`user_id` as plain `String` but the live DB columns are native `uuid` — Prisma coerces fine at runtime, but `prisma migrate dev` locally will see this as drift, so do **not** let it "fix" the type.

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
| `api/checkout.js` | **NEW (WS3)** — session-authed Stripe Checkout session creator (subs + packs; student-gated) |
| `api/stripe/webhook.js` | **WS3** — full Stripe event set; raw-body signature verify; durable `processed_events` idempotency; atomic grants |
| `api/_shared/{plans,billing,apiAuth,ratelimit}.js` | **WS3** — pricing SSOT + `planIdForPriceId`; `applyMonthlyGrant({client})`; key auth; rate limit |
| `src/components/Panels.jsx` (`PricingPanel`) | **NEW (WS3)** — Plans UI: subscription cards + API packs, platform-aware payment routing |
| `src/constants/pricing.js` · `src/lib/{platform,checkout}.js` | **NEW (WS3)** — display pricing SSOT; native-IAP-vs-Stripe rail; checkout client |
| `prisma/migrations/20260530120000_billing/migration.sql` · `scripts/migrate.mjs` | **NEW (WS3)** — idempotent billing migration + resilient build-time runner (P3005-safe, never fails the build) |
| `package.json` | build runs `node scripts/migrate.mjs` before tailwind + vite |
| `src/constants/app.js` | `APP_VERSION` → `v.30` |

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
## Prisma schema (v0.30 — WS3 billing now applied)
`User` carries the billing state as **first-class columns** (queryable, not in the encrypted blob): `stripe_customer_id @unique`, `stripe_subscription_id @unique`, `plan @default("free")`, `is_student_verified`, `student_verified_at`, `credits_period`, `total_credits Decimal(12,4) @default(10)` (cold-start seed only), `agent_wallet_address @unique` (Phase 4 SIWE). New tables: **`api_keys`** (`ApiKey[]` relation, FK `user_id` → `users.internal_id` cascade — **UUID**), **`api_usage`** (`ApiUsage`, per-day rollup, no FK), **`processed_events`** (`ProcessedEvent`, durable Stripe idempotency). All added via the idempotent billing migration; the live DB stores `internal_id`/`user_id` as native `uuid` though the schema types them `String`.

---
## Sprint history summary

| Version | Summary |
|---|---|
| v0.27 | Phrase/proximity scoring fix; MeSH enrichment; global low-confidence gate; Semantic Scholar deregistered. |
| v0.28 | Public REST search endpoint (`api/search.js`) — core scholarly adapters only; JSON + bibliography formats; optional API-key gate. |
| v0.29 | Capability-aware ranking; 7 humanities adapters; secondary dedup → `lib/dedup.js`; book-chapter clustering; unified-view load-more fixes; `docs/adapter-authoring-standard.md`. |
| v0.30 | **Monetization sprint.** WS0-2: origin-blind `/api/search` contract (no `source`, opaque `oc_` ids, corpus-weighted `coverage` bands; R10 500 fixed); 4→22 keyless server-safe adapters; runtime-aware `proxiedFetch`. WS4: MCP server. **WS3 billing shipped:** Stripe Checkout (`checkout.js`), full-event webhook w/ durable idempotency, Plans UI (platform-aware IAP-vs-Stripe), idempotent Prisma Migrate workflow (`scripts/migrate.mjs`, P3005-safe). Survived a production OAuth incident (Prisma-Client/DB column mismatch + TEXT-vs-UUID FK). **Left:** wire credit spend into `search.js`; student verification. **WS5 cache** pending KV. |

---
## Roadmap — remaining v0.30 workstreams

### WS4 — MCP server ✅ (built 2026-05-30, no infra needed)
New standalone `mcp/` package (`@modelcontextprotocol/sdk`). Tool `search_scholarly_sources({query, limit?, format?})` calls `/api/search` over HTTPS — does **not** import the pipeline (clean HTTP boundary; auto-inherits origin-blind + future billing). Layout:
- **`src/contract.js`** — bridges to the `apiContract.js` SSOT; defines the agent-facing param set, renames `q` → `query`, maps tool args back to REST query params.
- **`src/schema.js`** — generates the MCP tool input schema, OpenAI + Anthropic function definitions, and an OpenAPI 3.1 spec, all from the one contract (DRY-4). `npm run print-schemas` prints all three.
- **`src/client.js`** — HTTPS fetch of `/api/search`; **TLS enforced** (non-https base rejected except localhost), `OPENCITE_API_KEY` forwarded as `x-api-key` and **never logged** (errors built without headers).
- **`src/server.js` + `bin/opencite-mcp.js`** — stdio MCP server; diagnostics to stderr only (stdout is the protocol channel).

Verified: 18/18 smoke assertions (schema gen + live `citation.today` call returning origin-blind cards). Full "usage attributed to key" acceptance lands with WS3 billing; today the open free tier forwards but ignores the key.

### WS3 — Credit billing ✅ mostly shipped; one wire-up left
Shipped: API-key issuance (`keys.js`), Stripe Checkout (`checkout.js`), full-event webhook with durable idempotency (`stripe/webhook.js`), `plans.js`/`billing.js`/`apiAuth.js`/`ratelimit.js`, the Plans UI, and the migration workflow (above). **Remaining:** wire the `search.js` middleware chain (auth → source-gate → rate-limit → cache → **pre-authorize → settle**) — the **two-phase coverage-prorated charge**: pre-authorize `plan.creditCost` (402 if insufficient) → settle to `creditCost × coverageMultiplier(band)` after fan-out, refunding the difference. `coverageMultiplier` lives in `coverage.js`. Do this **after** confirming a successful test purchase. Also pending: a real **student-verification** flow (checkout currently 403s `needs_student_verification`; SheerID/VerifyPass recommended over self-storing IDs).

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
- **A migration must never fail the build.** Auth shares the Prisma Client; a frozen/failed deploy takes Google login down (the v0.30 OAuth incident). Migration SQL must be idempotent (`IF NOT EXISTS`); the build runs `scripts/migrate.mjs`, which is P3005-safe and always exits 0. FK columns referencing `users.internal_id` must be `UUID`. Don't let local `prisma migrate dev` "fix" the `String`-vs-native-`uuid` drift.
- **Antigravity Protocol (Mode C).** Large tasks: plan → approval → execute → checklist.
