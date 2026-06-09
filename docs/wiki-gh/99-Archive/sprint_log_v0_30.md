<!-- AUTO-GENERATED from docs/wiki/99-Archive/sprint_log_v0_30.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->
# OpenCITE — Sprint Log v0.30

> **PM + architecture document for the next Claude instance(s).** Self-contained execution plan for the
> **origin-blind AI API + adapter unlock (Waves 1–2) + Stripe credit billing + MCP distribution** sprint.
> Read `architecture_report_v0_29.md` first for project context, then this.
>
> **Created:** 2026-05-29 · **Target start:** 2026-05-30 · **Status:** WS0+WS1+WS2 SHIPPED to prod 2026-05-30 (commit `340525a`); WS4 (MCP) built 2026-05-30 — see §13. WS3/WS5 deferred (need Stripe + KV keys).
> **Mode:** C (plan → approval → execute → checklist). No padding; precise execution.

---

## 0. TL;DR

**Goal:** make `/api/search` a **sellable, AI-open, origin-blind** scholarly endpoint + the billing & distribution to monetize it.

**Thesis:** we don't sell the data (open-access, free). We sell **one verifiable call across many sources — deduped, ranked, citation-ready, origin hidden**. A grounding product for AI agents. High margin (COGS = compute + bandwidth). Priced **per query via prepaid credits**, **coverage-prorated (never billed for the unavailable portion of the library)**, free tier on top, distributed via **MCP**.

| WS | Name | Outcome | Blocks |
|---|---|---|---|
| **WS0** | Origin-blind contract | cards only, no origin; shape locked | — (first) |
| **WS1** | Wave 1 adapters | +11 keyless server-safe (via `serverSafe` flag) | WS0 (shares search.js) |
| **WS2** | Wave 2 adapters | +7 keyless via runtime-aware `proxiedFetch` | WS0 |
| **WS3** | Credit billing | per-customer keys → credit ledger → quotas/limits → Stripe top-up | WS0 locked |
| **WS4** | MCP server | OpenCITE as an MCP tool | WS0 locked (calls REST) |
| **WS5** | Result cache | margin lever | none (last) |

**Coverage:** 4 → **22 server-safe adapters**, all keyless. Wave 3 (+7 key-gated) & Wave 4 (+4 Edge-port) are **out of scope** (§9).

---

## 0.1 Standing rule + live verification log

**Standing rule: verify against live BEFORE treating any defect or behaviour as fact.** Deploy target: `citation.today` / `opencite.space`.

**Verified 2026-05-29 (curl against citation.today):**
| Call | Returns at | Status | Meaning |
|---|---|---|---|
| `/api/search` (no q) | L141 usage | 200 | endpoint + routing healthy |
| `/api/search?q=tepehuan&format=mla` | L252 | 200 + content | **whole pipeline works** (core adapters, scoring, dedup, citations) |
| `/api/search?q=tepehuan` (json, default) | L263 | **500** | **R10 confirmed — default response is broken in prod** |

→ The default `format=json` path is dead in production (ReferenceError, R10). One-line fix in WS0. Everything else is sound.

---

## 1. Architecture truth (why this is cheap)

- **CORS is browser-only.** `api/proxy.js` is browser scaffolding; a Node/Edge function fetches upstreams directly with no CORS.
- **`proxiedFetch` hardcodes relative `/api/proxy?url=`** ([src/adapters/_shared/proxy.js:5](src/adapters/_shared/proxy.js)) — that relative URL, not any API rule, is the only server blocker for proxy-reliant adapters.
- **DOMParser is NOT a blocker.** SRU/OAI adapters parse via regex in [src/adapters/_shared/xmlUtils.js](src/adapters/_shared/xmlUtils.js). Only surviving `new DOMParser()` is the Edge route `api/search/gallica.js` (Wave 4, out of scope).
- **Test on Vercel, not locally.** One throwaway Node smoke test of the pure-fetch path is the sanctioned exception.

---

## 2. Reuse inventory — existing assets we build ON (DRY mandate)

> **Do not reinvent these.** They are the SSOTs the new systems must consume.

| Asset | Location | Reuse for |
|---|---|---|
| `User.total_credits` `Decimal(12,4)` default 10 | [schema.prisma:32](prisma/schema.prisma) | **Entitlement ledger SSOT** — credit-based metering. Each billable query decrements it. |
| `User.stripe_customer_id` `String? @unique` | [schema.prisma:26](prisma/schema.prisma) | Stripe customer link — already scaffolded for Phase 3. |
| AES-256-GCM `encrypt`/`decrypt` | inline in [api/settings.js:26-43](api/settings.js) | **Extract to `_shared/crypto.js`** (see §4 DRY-1); reuse for nothing reversible in WS3 but co-locate key crypto. |
| Logger SSOT `log/.warn/.err`, fmt `[opencite:ID:event] k=v` | [api/_shared/log.js](api/_shared/log.js) | All new billing/cache/mcp logging. No `console.log` elsewhere. |
| Prisma singleton | [api/_shared/prisma.js](api/_shared/prisma.js) | All DB access. Mirror this pattern for the KV singleton. |
| `getSession`, `TRUSTED_ORIGINS`, `setCorsHeaders` | [api/_shared/auth.js](api/_shared/auth.js) | **Cookie auth** for the user-facing key-management route only. The public API uses a *separate* key-auth path (§4). |
| `capability` block on every adapter | each adapter + [_shared/base.js](src/adapters/_shared/base.js) | Carry the new `serverSafe` flag **and `corpusSize`** (§5) — both are adapter properties. `corpusSize` is the SSOT corpus weight consumed by `coverage.js`. |
| `runSearch(adapter, query, settings, opts)` | [src/adapters/index.js:106](src/adapters/index.js) | Unchanged signature. Runtime detection happens in `proxiedFetch`, not via threading `opts` (avoids touching 18 adapters — see §6 WS2). |

---

## 3. Module architecture & SSOT map

**Principle:** `api/search.js` becomes a thin **orchestrator**. Every cross-cutting concern is a single-responsibility module in `api/_shared/`, each the SSOT for its concern, each independently testable and reusable by future routes (MCP, batch export, agent billing).

### New modules (each = one SSOT)

| Module | Single responsibility | Consumed by | Backed by |
|---|---|---|---|
| `api/_shared/kv.js` | KV/Redis client singleton (mirrors `prisma.js`) | `ratelimit.js`, `cache.js` | Upstash Redis / Vercel KV |
| `api/_shared/crypto.js` | crypto primitives: `encrypt`/`decrypt` (moved from settings.js) + `generateApiKey()` + `hashApiKey()` | `settings.js`, `apiAuth.js`, `keys.js` | `node:crypto` |
| `api/_shared/plans.js` | **tier config SSOT** — `{ free, payg, pro, enterprise }` → `{ sources, monthlyQuota, rpm, creditCost }` | `apiAuth`, `billing`, `ratelimit`, `search.js` source-gate | static |
| `api/_shared/apiAuth.js` | API-key resolution: `resolveApiKey(req) → {user, key, plan} \| null` (header/query → hash → ApiKey join User) | `search.js` | prisma, crypto |
| `api/_shared/billing.js` | credit ledger ops: `preAuthorize(userId, amount)`, `settleCharge(userId, authAmount, finalAmount, ctx)` (atomic decrement + refund of unused pre-auth), `creditBalance(userId)`, `grantCredits()`. Final amount = `creditCost × coverageMultiplier` (consumes `coverage.js`) | `search.js`, `stripe/webhook.js` | prisma (`User.total_credits`), coverage |
| `api/_shared/ratelimit.js` | burst limiting: `checkRateLimit(keyId, plan) → {ok, retryAfter}` (token bucket) | `search.js` | kv |
| `api/_shared/cache.js` | result cache: `cacheKey(params)`, `cacheGet(k)`, `cacheSet(k,v,ttl)` | `search.js` | kv |
| `api/_shared/publicResult.js` | **origin-blind card SSOT** — `toPublicResult` (moved from search.js) + `anonymizeId` | `search.js` (+ any future export route) | `node:crypto`, citations.js |
| `api/_shared/coverage.js` | **attrition/coverage SSOT** — `computeCoverage(eligibleAdapters, failedAdapters) → {attrition, coverage, band}` (corpus-weighted, bucketed) + `coverageMultiplier(band)` for proration | `search.js` (response + charge), `billing.js` (proration) | `capability.corpusSize`, static bands |
| `api/_shared/apiContract.js` | **API contract SSOT** — param/response descriptor → drives `USAGE` self-doc, OpenAPI, MCP tool schema | `search.js`, `mcp/`, OpenAPI gen | static |
| `api/stripe/webhook.js` | Stripe event handling (credit top-up on `checkout.session.completed`) | Stripe | billing, raw-body verify |
| `api/keys.js` | user-facing key issue/list/revoke (**cookie auth** via `getSession`) | app dashboard | prisma, crypto, getSession |
| `mcp/` (new package) | MCP server exposing `search_scholarly_sources`; calls REST over HTTP | agents | — |

### DRY refactors of TOUCHED systems

- **DRY-1** — extract `encrypt`/`decrypt` out of [api/settings.js](api/settings.js) into `_shared/crypto.js`; settings.js imports them. Keep blob layout identical (`[12 IV][16 tag][ct]` base64) so existing encrypted rows still decrypt.
- **DRY-2** — `SERVER_SAFE_IDS` stops being a hardcoded Set in search.js. Add `serverSafe: true` to the `capability` block of each safe adapter; search.js **derives** `ADAPTERS.filter(a => a.capability?.serverSafe).map(a => a.id)`. Server-safety now lives next to the transport code that determines it (consistent with `docs/adapter-authoring-standard.md`).
- **DRY-3** — spoof request headers exist in [api/proxy.js:69-73](api/proxy.js). The WS2 server branch in `src/adapters/_shared/proxy.js` needs the same set. **They cannot share** (Edge `api/proxy.js` can't import `src/`; that's a standing constraint). → **Documented duplication** with a cross-reference comment in both files. Accepted exception.
- **DRY-4** — the API request contract is described three times (USAGE block, OpenAPI, MCP tool schema). Define once in `apiContract.js`; generate all three.

### Dependency graph (new + touched)

```
search.js (orchestrator)
 ├─ apiAuth ── crypto ── (node:crypto)
 │   └─ prisma · plans
 ├─ plans
 ├─ ratelimit ── kv
 ├─ billing ── prisma (User.total_credits) · coverage (proration)
 ├─ coverage ── capability.corpusSize
 ├─ cache ── kv
 ├─ publicResult ── crypto · citations.js
 ├─ apiContract
 └─ ADAPTERS/runSearch ── proxiedFetch (runtime-aware)   ← WS2

stripe/webhook.js ── billing · prisma
keys.js ── crypto · prisma · getSession (cookie)
settings.js ── crypto (DRY-1)
mcp/ ── (HTTP) → /api/search ── apiContract (schema)
```

**Runtime boundary reminder:** everything above is **Node** (`api/search.js` has no edge config). Edge adapter routes (`api/search/*.js`) and `api/proxy.js` remain Edge and cannot import `src/` or these `_shared` Node modules.

---

## 4. Authentication — two distinct paths (do not conflate)

| Path | Who | Mechanism | SSOT | Used by |
|---|---|---|---|---|
| **Cookie/session** | humans in the app | Auth.js session cookie | `getSession` (auth.js) | settings, history, library, **`keys.js`** |
| **API key** | AI callers / agents | `x-api-key` header (no cookies) | **`apiAuth.js`** (new) | **`search.js`** |

The public API uses **wildcard CORS** (`*`) — correct, because it's key-authed, not cookie-authed (auth.js deliberately avoids `*` for credentialed cookie routes). Keep `search.js`'s `*` CORS; do **not** route it through `setCorsHeaders`. The single shared `OPENCITE_API_KEY` gate ([api/search.js:131-137](api/search.js)) is **replaced** by `apiAuth.resolveApiKey`; retain `OPENCITE_API_KEY` only as an optional internal/admin master key.

---

## 4.1 Billing ↔ SSO & settings-storage integration (WS3 must satisfy)

**Hard requirement: billing hangs off the *existing* SSO identity and the *existing* settings system — no parallel account, no parallel store.**

### One identity root — `User`
Auth.js v5 Google OAuth (via `@auth/prisma-adapter`) owns the `User` record. Every billing artifact attaches to it:
- `User.stripe_customer_id` (exists, `@unique`) — Stripe link.
- `User.total_credits` (exists, `Decimal(12,4)`, `@default(10)`) — **the prisma adapter already seeds 10 credits on first Google sign-in.** Free-tier cold-start is wired for free.
- **New relation** `api_keys ApiKey[]` on `User` — mirror the `search_history` / `library_items` relation style; FK `user_id → users.id`, cascade.
- Forward-compatible: `User.agent_wallet_address` (`@unique`, Phase 4 SIWE) means future wallet-auth agents own credits/keys through the **same** `User` root. Billing integrates with SSO now and SIWE later via one model.

### Auth boundary (ties to §4)
- **Human → SSO cookie → `keys.js`** (`getSession`) to mint/revoke keys and buy credits. Key issuance *requires* an SSO session.
- **Agent → API key → `apiAuth` → same `User`.** Key *usage* needs no cookie.
- So: a signed-in human provisions; the agent consumes. Single identity, two surfaces.

### State-placement rule (clean separation from the settings blob)
| State | Where | Why |
|---|---|---|
| credits, plan, `stripe_customer_id`, key hashes, usage | **first-class columns / `ApiKey` / `ApiUsage`** | server-authoritative; must be queryable (filter on plan, sum credits, join keys) — an opaque encrypted blob can't be queried |
| user preferences + user-provided 3rd-party adapter keys (`dplaKey`, journals, `viewMode`…) | **encrypted settings blob** (`users.settings`, AES-GCM) — unchanged | secrets + per-user prefs, never used for entitlement |

- **Plan/tier is read from `User`/`ApiKey`, NEVER from the client settings blob.** UI gating mirrors server enforcement; it is not the source of truth (a client can't grant itself a tier by editing settings).
- The API **never reads the caller's encrypted settings keys** — the AI caller isn't that user; consistent with origin-blind + project-level Wave-3 keys.

### Shared crypto SSOT (DRY-1 binds both systems)
`_shared/crypto.js` serves **both** the settings store and billing:
- reversible **AES-256-GCM** `encrypt`/`decrypt` (moved from settings.js; key = `SETTINGS_ENCRYPTION_KEY`) — settings only.
- one-way **sha256** `hashApiKey` + `generateApiKey` (optional `API_KEY_PEPPER` env) — keys only.
One module, two clearly-labelled primitives. Settings blob layout preserved (`[12 IV][16 tag][ct]` base64) so existing rows decrypt (R16).

### Stripe ↔ User mapping (webhook correctness)
- **Checkout:** set `client_reference_id = User.id` and prefill `customer_email = User.email` (from Google SSO). Create + persist `stripe_customer_id` on first purchase.
- **Webhook** (`stripe/webhook.js`): resolve event → `User` via `stripe_customer_id` (`@unique`), fallback `client_reference_id`. `grantCredits` idempotent on Stripe event id (R11).

### Free-tier reconciliation (DECISION needed)
Schema seeds 10 credits **once** at signup. Earlier pricing floated "~100 q/mo free." Decide: **(a)** keep one-time 10-credit seed, or **(b)** monthly top-up to N for signed-in free users (needs a scheduled grant — cron or a $0 Stripe subscription). **Recommend (b)** for a recurring free tier, with the one-time seed as cold-start. Confirm with Shahbaz.

### UI surface (reuse, don't rebuild)
Extend the existing `SettingsPanel` in `src/components/Panels.jsx` with an **"API & Billing"** section behind `getSession`: credit balance (`total_credits`), plan, API-key list (**prefixes only**), create/revoke, and a Stripe checkout button. Reuses the existing `/api/settings` auth + admin-section UI pattern — **no new auth surface, no new settings store.**

---

## 5. Adapter transport inventory & `serverSafe` flag (DRY-2)

| Tier | Adapters | Transport | Wave |
|---|---|---|---|
| 1 — direct fetch (keyless) | MET, THAQALAYN, ENA, LC_DATASETS, NCBI, WIKIDATA, INTERNET_ARCHIVE | bare `fetch()` → JSON | **1** |
| 1.5 — dual-mode (keyless) | ONB, BNF_API, NORTHWESTERN, OPENNEURO | direct `fetch()`, `catch`→`proxiedFetch`; regex XML | **1** |
| 2 — proxy-only JSON (keyless) | LA_REFERENCIA, OAPEN, OPEN_LIBRARY, SCIELO, CHRONICLING_AMERICA, PRINCETON_DPUL, PANGAEA | `proxiedFetch()` → JSON | **2** |
| 2k/1k — key-gated | DPLA, CORE, NDLI, BASE / SMITHSONIAN, EUROPEANA, RIJKSMUSEUM | + project key | 3 (out) |
| 3 — Edge route | GALLICA, BRITISH_LIBRARY, OPENCONTEXT, OPENEDITION | relative `/api/search/*` | 4 (out) |
| 3✗ — fragile | BDH, MEXICANA | Edge + geo-block | deferred |

**Final server-safe set (22) — set `capability.serverSafe = true` on each:**
`OPENALEX, CROSSREF, DOAJ, CURATED` (core) `+` Wave 1 (11) `+` Wave 2 (7).

> ⚠️ Each Wave 1/2 adapter must be `needsKey:false`. Confirmed: ONB. **Re-verify BNF_API, NORTHWESTERN, OPENNEURO + all Wave 2 before flipping the flag.** NCBI keyless = OK (lower eutils rate). Add `serverSafe` to the capability typedef in [_shared/base.js](src/adapters/_shared/base.js).

**`capability.corpusSize` (coverage SSOT, DRY).** Add an integer `corpusSize` (approx. searchable record count) to each server-safe adapter's `capability` block — the corpus weight `coverage.js` uses to compute corpus-weighted attrition. Rules:
> - **Order-of-magnitude is enough** — coverage is bucketed (bands), so exact counts don't matter and over-precision invites churn. Source the number from each upstream's published total once; cite it in a comment.
> - **Conservative when unknown** — if a count is unpublished/unstable, use a deliberate low estimate (under-stating a source's weight can only *lower* its impact on coverage, never overstate coverage to the customer — fail toward honesty).
> - Add `corpusSize` to the capability typedef in [_shared/base.js](src/adapters/_shared/base.js) alongside `serverSafe`. Core-4 (OpenAlex ≫ Crossref ≫ DOAJ ≫ curated) dominate the denominator; that is intended (a niche heritage source dropping is genuinely a small coverage loss).

---

## 6. Workstreams — technical mapping

### WS0 — Origin-blind contract
**Files:** `api/search.js`, new `api/_shared/publicResult.js`.
**Data flow:** `runSearch` → normalized records (carry `r.source`,`r.id`) → `scoreResults` (capBySource **reads `r.source`** at [search.js:225](api/search.js)) → dedup (keys on `doi`/`title`, **not `id`**) → `applyConfidenceGate` → **`toPublicResult` (LAST step) strips `source` + anonymizes `id`**. Stripping only at the last map → scoring/dedup unaffected.

- [ ] **DRY-2 prerequisite not needed here.** Move `toPublicResult` ([search.js:67-100](api/search.js)) → `publicResult.js`; drop `source: r.source`.
- [ ] `anonymizeId(r)`: `sha1(r.doi || r.url || \`${title}|${year}\`)` → `base64url`, 16 chars, prefix `oc_`. Deterministic across calls. `node:crypto`.
- [ ] Remove `sources: sourcesMeta` from response ([search.js:267](api/search.js)). Replace the old `degraded:<bool>` idea with a **corpus-weighted `coverage` band** from `coverage.js` (see below). **Do not echo upstream error strings or upstream names** (origin leak).
- [ ] **Coverage signal (origin-blind health, replaces `degraded` boolean).** `search.js` tracks which eligible adapters succeeded vs. errored during fan-out, then calls `coverage.computeCoverage(eligible, failed)`:
  - `attrition = Σ(corpusSize of failed eligible adapters) / Σ(corpusSize of all eligible adapters)`; `coverage = 1 − attrition`. **Denominator = the plan-eligible set for *this* request** (core-4 for free, 22 for paid — NOT always 22), so coverage is honest relative to what the caller paid for.
  - **Bucket into bands** (anti-fingerprint — never emit a raw %): e.g. `"full"` (no eligible failures) · `"near-full"` (≥0.99) · `"high"` (≥0.95) · `"partial"` (≥0.50) · `"limited"` (<0.50). **Round in the customer's favor** (floor coverage / ceil attrition into the band). Bands are the only coverage value that leaves the server.
  - Response carries `coverage: "<band>"`. `degraded` (if kept at all) becomes a derived convenience = `coverage !== "full"` — no separate signal, no upstream detail.
  - Example shape: `{ "count": 8, "coverage": "near-full", "creditsCharged": 0.995, "results": [...] }`.
- [ ] **Fix live ReferenceError** ([search.js:263](api/search.js)): `meaningful`/`anyGenuine` undefined — destructure `lowConfidence` from `applyConfidenceGate` ([search.js:235](api/search.js)) and use it. This throws on every JSON response today.
- [ ] Keep `doi,url,journal,publisher,authors,citations` (verifiable provenance).
- [ ] Regenerate `USAGE` from `apiContract.js` (no `sources` field).
- **Acceptance:** card has no `source`, opaque `id`, no `sources` block, valid `lowConfidence`, `coverage` band present (raw % never emitted), no 500. Dedup count unchanged. Forcing an eligible adapter to error returns a lower band, never the upstream's name.

### WS1 — Wave 1 adapters (DRY-2)
**Files:** each Wave 1 adapter (add `capability.serverSafe:true`), `api/search.js` (derive set), `_shared/base.js` (typedef).
- [ ] Verify `needsKey:false`; flip flag on 11 adapters.
- [ ] Replace hardcoded `SERVER_SAFE_IDS` with derivation from registry.
- [ ] Deploy preview; `GET /api/search?q=<t>&sources=<ID>` per adapter.
- **Risk:** 1.5 direct fetch may fail server-side on non-CORS (UA reject); fallback `proxiedFetch` (relative) also fails — **WS2 hardens this** (fallback then direct-fetches with spoof headers). Ship WS1+WS2 together.

### WS2 — runtime-aware `proxiedFetch`
**File:** `src/adapters/_shared/proxy.js` (SSOT) + flag 7 adapters.
- [ ] Detect server via `typeof window === "undefined"` (true in Node *and* Edge; false in browser). **No `opts` threading → zero adapter edits** (DRY).
- [ ] Server branch: direct `fetch(url)` with spoof headers (DRY-3 duplication w/ cross-ref comment); preserve `method`/`body`/`Content-Type`/`Accept` from `options`.
- [ ] Browser branch unchanged.
- [ ] **Smoke-test the BROWSER path** (only WS touching shared UI code): run a search, check admin debug log for `proxy-ok`, no new `proxy-fail`.
- **Acceptance:** 22 adapters return cards via API; browser unregressed.

### WS3 — Credit billing (reuses `total_credits`)
**New:** `apiAuth.js`, `plans.js`, `billing.js`, `ratelimit.js`, `crypto.js`, `keys.js`, `stripe/webhook.js`, `kv.js`. **Schema:** `ApiKey` (+ optional `ApiUsage`). **Touched:** `search.js` (middleware), `settings.js` (DRY-1).

**Entitlement = credits, not a usage counter.** Prepaid model: buy credits (Stripe checkout) → `total_credits`; each billable query `chargeCredits(userId, plan.creditCost × coverageMultiplier)`. Metered Stripe overage = later. **Rate limit (burst) is separate** from credits (quota): credits = durable Postgres ledger; rate limit = ephemeral KV token bucket.

**Coverage-prorated charge (fair-business, ties to WS0 coverage).** The amount charged is prorated by the same corpus-weighted coverage computed in WS0 — the customer is **never billed for the unavailable portion of the eligible library**:
- `coverageMultiplier = coverage.coverageMultiplier(band)` — derived from the **band** (not the raw %), so charge and reported band are consistent and equally fingerprint-resistant. Multiplier rounds **in the customer's favor** (use the band's floor coverage).
- `creditsCharged = plan.creditCost × coverageMultiplier`. Surface `creditsCharged` in the response (already in the WS0 example shape).
- **Optional free-below-threshold:** if `band` ≤ `"partial"` (coverage < ~0.50), charge 0 (a half-blind answer isn't a sellable result). Config in `plans.js`.
- **Order matters:** coverage is known only *after* fan-out, but `chargeCredits` runs *before* fan-out to gate on balance. → **Two-phase charge:** pre-authorize `plan.creditCost` against balance (402 if insufficient), then settle to `creditCost × coverageMultiplier` after fan-out (refund the difference to `total_credits` in the same txn). Keep both legs idempotent under the per-request key.

**Prisma (additive, snake_case `@@map`):**
- `ApiKey`: `id`, `key_hash @unique`, `key_prefix`, `user_id`(FK→users, cascade), `plan`, `revoked Boolean @default(false)`, `created_at`, `last_used_at`. `@@map("api_keys")`.
- `ApiUsage` *(optional, analytics)*: `id`, `key_id`(FK), `day`, `count`. `@@map("api_usage")`.

**Key format:** `oc_live_<random>`; store `hashApiKey()` (sha256) only; persist `key_prefix` (first ~8 chars) for display. Never log plaintext.

**`search.js` middleware order:** CORS → method → `resolveApiKey` (401) → `plans` source-gate (free=core4, paid=22; intersect with derived server-safe set) → `checkRateLimit` (429+`Retry-After`) → **cache lookup** (WS5) → **pre-authorize** `plan.creditCost` (402 if insufficient) → `runSearch` fan-out (track failed adapters) → `coverage.computeCoverage` → **settle** charge to `creditCost × coverageMultiplier` (refund diff) → respond with `coverage` + `creditsCharged`. (On **cache hit**, coverage is read from the cached payload and the cached band's multiplier is charged — default charge-on-hit **yes**, §WS5.)

**`chargeCredits` atomicity:** single `prisma.user.update` with conditional decrement *or* a transaction (`SELECT … FOR UPDATE` equivalent) so concurrent requests can't overspend. Idempotency key per request.

**Stripe:** checkout session for credit packs → `stripe/webhook.js` verifies signature (raw body, Node) → `grantCredits`. Create+store `stripe_customer_id` on first purchase. Webhook idempotency on event id.

- **Acceptance:** free key → core-4 + throttled; paid key → 22 + credits decrement atomically; insufficient → 402; over rate → 429; revoked → 401; no plaintext keys stored; existing settings blobs still decrypt after DRY-1. **Coverage proration:** a full-coverage query charges `plan.creditCost`; a query where an eligible adapter is forced to fail charges `creditCost × coverageMultiplier(<band>)` (< full) and the pre-auth difference is refunded in-txn; sub-`partial` coverage charges 0 (if enabled).

### WS4 — MCP server (parallel)
**New `mcp/` package** (separate; `@modelcontextprotocol/sdk`). Calls `/api/search` over HTTP — **does not import the pipeline** (clean boundary; auto-inherits origin-blind contract + billing).
- [ ] Tool `search_scholarly_sources({query, limit?, format?})` → origin-blind cards. Schema **generated from `apiContract.js`** (DRY-4).
- [ ] Auth passthrough: customer's key in MCP client config → forwarded as `x-api-key`. TLS only; never log the key.
- [ ] Ship OpenAPI + OpenAI/Anthropic function schema from the same `apiContract.js`.
- [ ] Publish to MCP registries; can point at free tier pre-billing.
- **Acceptance:** MCP client installs, calls the tool, gets cards, usage attributed to the key.

### WS5 — Result cache (last)
**New `cache.js` + shared `kv.js`.**
- [ ] `cacheKey` = hash of canonicalized `(query, sorted sources, limit, authors, format)`.
- [ ] Cache the **final origin-blind payload**; TTL 1–24h, tune.
- [ ] Placement: between rate-limit and fan-out (§WS3). **Charge-on-hit default yes** (customer got a result; savings = margin).
- [ ] **Fail-open:** KV down → cache miss → normal fetch (never block a paid call on cache).
- **Acceptance:** repeat query within TTL → `cache-hit` log, no fan-out, identical payload.

---

## 7. Parallel-agent collision map

`api/search.js`, `prisma/schema.prisma`, and `kv.js` are shared. **Single owner per shared file.**

| File / area | WS | Policy |
|---|---|---|
| `api/search.js` | WS0,1,2,3,5 | **One owner (Agent A).** Serial: WS0 → WS1+WS2 set → WS3 middleware → WS5. |
| `src/adapters/_shared/proxy.js` | WS2 | independent |
| each Wave 1/2 adapter file | WS1,WS2 | independent per file (flag flip) |
| `prisma/schema.prisma` + migration | WS3 | **Agent B owns DB.** |
| `api/_shared/{crypto,apiAuth,plans,billing,ratelimit,cache,kv,publicResult,apiContract}.js` | WS0,3,5 | new files — parallel; A imports once stable |
| `api/_shared/kv.js` | WS3,WS5 | **provision once (Agent B), both consume** |
| `mcp/` | WS4 | **fully parallel (Agent C)** |
| `api/settings.js` (DRY-1) | WS3 | Agent B; coordinate with A on crypto.js |

**Agent split:** **A** = API core (`search.js` end-to-end + shared modules it imports). **B** = billing infra (schema, migration, Stripe, kv/Redis, crypto.js, settings DRY-1, keys.js, webhook). **C** = MCP + apiContract + OpenAPI docs (parallel; integration-tests against A's preview).

---

## 8. Execution order
1. **WS0** — lock contract + fix live ReferenceError.
2. **WS1 + WS2** together — 22 keyless sources; smoke-test browser + server.
3. **WS4 (MCP)** in parallel from start (free tier).
4. **WS3** — keys → ledger → quotas/limits → Stripe.
5. **WS5** — cache last.

---

## 9. Out of scope (next sprints)
- **Wave 3 (+7 key-gated):** SMITHSONIAN, EUROPEANA, RIJKSMUSEUM, DPLA, CORE, NDLI, BASE. Keys are **project-level** (env `OPENCITE_*_KEY`, filled into the settings build at [search.js:180](api/search.js) — NOT user-provided; the origin-blind caller can't supply keys; the UI keeps user keys as a separate surface). Each key = a **shared rate bucket** across all customers; several have **commercial/redistribution ToS limits**. Per-source go/no-go + ToS/quota checklist required.
- **Wave 4 (+4 Edge-port):** GALLICA (swap lone `DOMParser`→`sruRecords`/`dcAll`), BRITISH_LIBRARY, OPENCONTEXT, OPENEDITION — port inline behind the WS2 server short-circuit.
- **Deferred:** BDH, MEXICANA (geo-block/flaky).
- **Later:** Stripe metered overage, key-management dashboard UI, OpenAPI docs site, relative score floor (needs A/B), `?synonyms=1`, agent billing (SIWE / `agent_wallet_address` already in schema).

---

## 10. Risk register

| ID | Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | Multi-agent | Concurrent edits to `api/search.js` → conflicts/regression | High (if parallel) | High | Single owner (Agent A); serialize per §7 |
| R2 | WS2 | `proxiedFetch` change breaks the **browser** proxy path | Med | High | `typeof window` feature-detect; smoke-test UI every WS2 deploy; check debug log |
| R3 | WS0 | Residual origin leak (id prefix, publisher, error text, debug fields) | Med | High | Anonymize id; field audit; **bucketed `coverage` band only — never raw %, counts, or upstream names/error strings** |
| R4 | WS0 | Stripping `source` too early breaks `capBySource` scoring | Low | High | Strip only in `toPublicResult` (last step); assert `source` present pre-score |
| R5 | WS3 | Credit race / overspend under concurrency | Med | High | Atomic conditional decrement / txn; per-request idempotency key |
| R6 | Economics | Per-query fan-out cost > price → negative margin. **Coverage proration compounds this: fan-out COGS is ~flat regardless of attrition (a failed adapter still cost a request attempt + timeout wait), but prorated revenue *drops* with coverage → margin compresses exactly when sources are flaky.** | Med | High | WS5 cache; tier source-gating; **calibrate `plan.creditCost` against the *expected* (coverage-discounted) charge, not the headline price**; cap timeout cost; monitor realized coverage distribution and re-price if mean coverage < target |
| R19 | Privacy/abuse | **Coverage band fingerprinting** — a caller probing bands across queries could infer which/how-many upstreams are down, partially defeating origin-blindness | Low | Med | Coarse bands only (≤5); round in customer's favor; corpus-weighted (one niche drop won't move the band); never expose count of failed sources or raw % |
| R20 | Product | **Corpus-weight relevance blind spot** — coverage is aggregate corpus-weighted, so a topically *perfect* niche source dropping (tiny `corpusSize`) reports near-`full` coverage even though the answer for *that query* is materially worse | Accepted | Med | Document the caveat in API docs + TOS-items (coverage is aggregate, not per-query relevance); revisit per-query relevance weighting only if customers report it; BM25F still ranks whatever did return |
| R7 | Upstream | Paid volume hammers keyless-but-rate-limited APIs (NCBI, Crossref) | Med | Med | Polite-pool `mailto`/UA; cache; per-key rate limit; monitor 429s |
| R8 | DRY | Edge/`src` boundary forces spoof-header duplication | Low | Low | Documented exception + cross-ref comment (DRY-3) |
| R9 | Security | API key leakage / at-rest exposure | Low | High | Store sha256 hash only; prefix stub for display; revoke flag; never log plaintext |
| R10 | Pre-existing | **VERIFIED live 2026-05-29** — default `format=json` path 500s (`meaningful`/`anyGenuine` undefined at L263). `mla`/`usage` paths 200. Default API response broken in prod. | **Confirmed** | High | **DECISION (Shahbaz): held inside WS0, no standalone hotfix.** Fix = destructure `lowConfidence` from `applyConfidenceGate` (L235) and use at L263; ships as the first WS0 commit; smoke-test JSON format on preview. |
| R11 | WS3 | Stripe webhook spoofing | Low | High | Verify signature on raw body; Node runtime; event-id idempotency |
| R12 | WS3/5 | KV/Redis outage adds failure mode | Med | Med | Cache **fail-open**; rate-limit fail-open + alert (accept brief abuse window over blocking paid users) |
| R13 | WS3 | Prisma migration on prod DB | Low | High | Additive-only (no drops); `POSTGRES_URL_NON_POOLING`; test on preview branch DB first |
| R14 | DRY-2 | Mis-set `serverSafe` flag exposes an unverified adapter | Low | Med | Flag defaults false; explicit per-adapter; review diff |
| R15 | WS4 | MCP passthrough leaks key in logs/transport | Low | Med | TLS only; redact `x-api-key` in logs |
| R16 | DRY-1 | `settings.js` crypto refactor breaks decrypt of existing blobs | Low | Med | Keep blob layout identical; round-trip test an existing row |
| R17 | WS5 | Cache-key normalization mismatch → poisoning/misses | Low | Med | Canonicalize (sort sources, trim, lowercase, include every output-affecting param) |
| R18 | WS3 | Origin-blind removes source-reputation weighting for the AI | Accepted | Low | BM25F + thin-source prior encode fitness; document in API docs |

---

## 11. Definition of done
- [ ] `/api/search` origin-blind (no `source`, opaque `id`, no `sources` meta); ReferenceError fixed.
- [ ] **Coverage model live:** response carries a bucketed corpus-weighted `coverage` band (no raw %/counts/names); `creditsCharged` is prorated by `coverageMultiplier`; pre-auth/settle refunds the unused difference; sub-`partial` coverage charges 0 (if enabled). `capability.corpusSize` set on all server-safe adapters; `coverage.js` is the single SSOT for both the response band and the billing multiplier.
- [ ] `serverSafe` flag drives a derived 22-adapter set; all return cards on preview; browser unregressed.
- [ ] Per-customer keys issue/revoke; plan source-gating + credit decrement + rate limit enforced; Stripe top-up credits via verified webhook.
- [ ] **Billing rides the SSO identity:** keys/credits/Stripe all hang off the existing `User`; key issuance gated by `getSession`; new Google sign-in auto-seeds credits; webhook resolves to `User` via `stripe_customer_id`.
- [ ] **State separation honored:** entitlement (credits/plan/keys) in columns/tables; only prefs/3rd-party keys in the encrypted settings blob; plan never read from client settings; existing settings rows still decrypt after DRY-1.
- [ ] MCP server installable; `search_scholarly_sources` returns origin-blind cards attributed to the caller's key; schema generated from `apiContract.js`.
- [ ] (If WS5) repeat query within TTL serves from cache, no fan-out.
- [ ] `settings.js` decrypts pre-existing blobs after DRY-1.
- [ ] This log updated with actuals + fresh `architecture_report_v0_30.md` (mirror v0.29 style).

---

## 12. Actuals — WS0+WS1+WS2 (landed 2026-05-30, commit `340525a` on `main`, Vercel auto-deploy)

**Shipped together in one commit** (28 files, +395/−69). Verified live against `citation.today` per the §0.1 standing rule.

### WS0 — origin-blind contract ✅
- **R10 fixed:** default `format=json` path returned `200` live (was `500`). Replaced the undefined `meaningful`/`anyGenuine` refs at the old [search.js:263] with the `lowConfidence` destructured from `applyConfidenceGate`.
- **New SSOT `api/_shared/publicResult.js`** — `toPublicResult` (moved out of search.js) drops `source`; `anonymizeId(r)` = `sha1(doi || url || \`${title}|${year}\`)` → base64url, 16 chars, `oc_` prefix. Deterministic, verified.
- **New SSOT `api/_shared/coverage.js`** — `computeCoverage(eligible, failed)` → `{attrition, coverage, band}` corpus-weighted on `capability.corpusSize`; bands `full / near-full(≥0.99) / high(≥0.95) / partial(≥0.50) / limited(<0.50)`; `"full"` only when zero eligible failures. `coverageMultiplier(band)` (`1 / 0.99 / 0.95 / 0.5 / 0`) **built but dormant** — ready for WS3 proration. Only the band leaves the server.
- **New SSOT `api/_shared/apiContract.js`** — contract descriptor + `buildUsage()`; drives the no-`q` usage payload now, MCP/OpenAPI schema next (WS4, DRY-4). `DEFAULT_LIMIT`/`MAX_LIMIT`/`CITE_FORMATS`/`FORMATS`/`COVERAGE_BANDS` exported as the shared constants.
- Response envelope: dropped per-source `sources` meta; added `coverage` band + valid `lowConfidence`. No upstream names/error strings emitted.
- **Decision logged:** `sources` request param kept, but the internal source catalog is **not enumerated** in usage or the `400` (origin-blind). Revisit only if power-users need discoverability.

### WS1 — 4→22 server-safe adapters ✅
- `capability.serverSafe:true` + `capability.corpusSize:<int>` (order-of-magnitude, cited in a comment) added to all 22; typedef extended in `_shared/base.js`.
- `SERVER_SAFE_IDS` in search.js now **derived** `ADAPTERS.filter(a => a.capability?.serverSafe)` (DRY-2). Smoke-confirmed = 22: OPENALEX, CROSSREF, DOAJ, CURATED, MET, IA, NCBI, SCIELO, LA_REFERENCIA, OAPEN, OPEN_LIBRARY, THAQALAYN, NORTHWESTERN, PRINCETON_DPUL, PANGAEA, OPENNEURO, ENA, CHRONICLING_AMERICA, ONB, BNF_API, LC_DATASETS, WIKIDATA. All confirmed `needsKey:false`.

### WS2 — runtime-aware `proxiedFetch` ✅
- `src/adapters/_shared/proxy.js`: server branch (`typeof window === "undefined"`) direct-fetches upstream with spoof headers (caller headers win; `method`/`body` preserved). Documented DRY-3 duplication of `api/proxy.js` headers with cross-ref comment. Browser branch byte-for-byte unchanged.

### Live verification (citation.today)
| Call | Result |
|---|---|
| `?q=tepehuan` (default json) | **200**, `coverage:"high"`, cards have no `source` key, opaque `oc_` ids, citations intact |
| `?q=climate change&sources=NCBI` | 200, `coverage:"full"`, cards (tier-1 direct fetch) |
| `?q=climate change&sources=OPEN_LIBRARY` | 200, cards — **proves WS2 server branch** (proxy-only adapter) |
| `?sources=IA` | 200, cards |
| `/` homepage | 200 (clean Vite build, no frontend regression) |
| `/api/search` (no q) | new origin-blind usage payload from `apiContract.js` |

**Caveat:** browser proxy path (R2) verified by code inspection only — not headless-tested. Browser branch is unchanged code; homepage builds/serves.

### Not done (deferred)
- **WS3 (billing)** + **WS5 (cache)** — blocked on Stripe (keys/price IDs/webhook secret) + Upstash/Vercel KV provisioning. `coverageMultiplier` + contract constants already in place for drop-in.
- Free-tier model decided: **generous monthly top-up loss-leader** (not the one-time 10-credit seed) — implement in WS3.

---

## 13. Actuals — WS4 MCP server (landed 2026-05-30)

**New `mcp/` package** — separate `@modelcontextprotocol/sdk` server; calls `/api/search` over HTTPS and **does not import the pipeline** (clean HTTP boundary → auto-inherits origin-blind contract + future billing).

- ✅ Tool **`search_scholarly_sources({query, limit?, format?})`** → origin-blind cards. Input schema **generated from `apiContract.js`** (DRY-4): `q` is renamed `query` for agent ergonomics, all enums/limits/descriptions pulled from the SSOT, nothing re-described.
- ✅ **Auth passthrough** — `OPENCITE_API_KEY` env (MCP client config) forwarded as `x-api-key`. **TLS only** (non-https base rejected except localhost, R15); key **never logged** (error messages built without headers; ready/diagnostic lines go to stderr, never stdout).
- ✅ **OpenAPI 3.1 + OpenAI/Anthropic function schemas** all generated from the same contract (`mcp/src/schema.js`; `npm run print-schemas` emits `{ mcpTool, functionSchemas:{openai,anthropic}, openApi }`).
- ✅ Points at the **free-tier** live endpoint pre-billing (`https://citation.today` default, `OPENCITE_API_BASE_URL` override).

**Files:** `mcp/package.json`, `mcp/bin/opencite-mcp.js`, `mcp/src/{contract,schema,client,server}.js`, `mcp/README.md`.

**Verification** (sanctioned throwaway Node smoke test of the pure import + live-fetch paths; SDK wiring in `server.js` verified by inspection — SDK not installed locally): 18/18 PASS — schema gen (`query` present, raw `q` absent, `limit` max 100, format enum, openai/anthropic/openapi shapes) + live call to `citation.today` returned 5 origin-blind cards (`coverage:"high"`, no `source` key, `oc_` ids, MLA citations present).

**Boundary note:** the only thing left for full WS4 "acceptance" (usage attributed to the key) depends on WS3 billing — until then the key is forwarded but the open free tier ignores it.

---

*End v0.30 sprint log. Update with actuals as workstreams land — handoff record between Claude instances.*
