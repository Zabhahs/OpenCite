---
machine_ids: [api.shared.apiAuth, api.shared.apiContract, api.shared.auth, api.shared.billing, api.shared.cache, api.shared.coverage, api.shared.crypto, api.shared.debugResult, api.shared.kv, api.shared.log, api.shared.parseBody, api.shared.plans, api.shared.prisma, api.shared.publicResult, api.shared.ratelimit, api.shared.serverKeys]
findings: [F-400, F-401, F-402, F-403, F-404, F-405, F-406]
runtime: server
status: healthy
tags: [api, shared, billing, auth, crypto, kv, cache]
---

# Shared Modules (`api/_shared/`)

> Twelve server-side utility modules that every API route imports from one place — auth, billing, crypto, KV, cache, rate-limit, logging, and the public-result contract.

## What it is

`api/_shared/` is the server-side SSOT library. No route file imports Prisma, crypto, Stripe logic, or session logic directly — it all flows through these modules. The directory is the boundary between route-specific logic (api/*.js) and reusable infrastructure. Each module has a single concern.

## Module-by-module reference

### `apiAuth.js` — Identity resolution

**Purpose:** Maps an incoming HTTP request to a `{ userId, keyId, plan, admin }` identity, or `null`.

**Exports:**
| Symbol | Kind | Purpose |
|---|---|---|
| `presentedKey(req)` | fn | Extract key from `x-api-key` header or `?key=` param |
| `resolveApiKey(req)` | async fn | Master key check → DB hash lookup → billing identity |
| `resolveSessionAdmin(req)` | async fn | Auth.js session → admin allowlist check → admin identity |

**Details:**
- Master key (`OPENCITE_API_KEY`) compared with `===` at `apiAuth.js:47` — **not timing-safe** (see F-402).
- Admin email allowlist read from `VITE_ADMIN_EMAILS || ADMIN_EMAILS` at `apiAuth.js:29`; comma-separated, lowercased. Same list as the client console gate.
- DB lookup uses `hashApiKey(key)` — never the plaintext. `last_used_at` is stamped best-effort (fire-and-forget, non-blocking).
- `admin` is server-derived from plan or master key; it is never read from the request.
- Revoked keys return `null` — same response as a never-existed key (no disclosure).

**Callers:** `api/search.js`

---

### `apiContract.js` — Request/response contract SSOT

**Purpose:** Single definition of `/api/search` parameter shapes, response envelope, and coverage bands. Consumed by search.js for validation and by MCP/OpenAPI generators.

**Exports:** `DEFAULT_LIMIT`, `MAX_LIMIT`, `FORMATS`, `CITE_FORMATS`, `COVERAGE_BANDS`, `PARAMS`, `RESULT_FIELDS`, `RESPONSE_SHAPE`, `API_CONTRACT`, `buildUsage()`

**Details:** Origin-blind by design — `RESULT_FIELDS` intentionally omits `source`. `buildUsage()` generates the self-documenting response returned for a no-`q` request.

**Callers:** `api/search.js`, MCP (WS4 — deferred)

---

### `auth.js` — Server-side CORS + session bridge

**Purpose:** `TRUSTED_ORIGINS` SSOT, origin-aware CORS headers, and `getSession` (reads the Auth.js session via a loopback fetch).

**Exports:**
| Symbol | Kind | Purpose |
|---|---|---|
| `TRUSTED_ORIGINS` | array | `["https://citation.today","https://opencite.space"]` |
| `setCorsHeaders(req, res, methods)` | fn | Sets origin-specific CORS headers (credentials-safe, no wildcard) |
| `getSession(req)` | async fn | Fetches `/api/auth/session` with the caller's cookie; returns `{id,name,email}` or null |

**Security note (F-401):** `getSession` constructs the loopback URL from `x-forwarded-host` / `host` headers (`auth.js:38`). A crafted host header could redirect this internal fetch to an arbitrary host. The `split(",")[0].trim()` mitigates Vercel's comma-format `x-forwarded-host`, but does not validate the domain.

**Callers:** `api/auth/handler.js`, `api/checkout.js`, `api/history.js`, `api/library.js`, `api/settings.js`, `api/_shared/apiAuth.js`

---

### `billing.js` — Credit ledger

**Purpose:** Two-phase credit lifecycle: `preAuthorize` → `settle` (or `refund` on failure). Atomic Prisma `updateMany` with a balance guard prevents overspend.

**Exports:**
| Symbol | Kind | Purpose |
|---|---|---|
| `preAuthorize(userId, amount)` | async fn | Atomic debit if balance ≥ amount; `{ok, charged}` |
| `refund(userId, amount)` | async fn | Atomic credit increment (undo pre-auth or settle difference) |
| `settle(userId, preAuthAmount, band, opts)` | async fn | Prorated final charge; refunds the diff |
| `getBalance(userId)` | async fn | Best-effort balance read for API response meta |
| `grantCredits(userId, credits)` | async fn | Atomic increment (Stripe top-up / pack) |
| `applyMonthlyGrant(userId, grant, period, opts)` | async fn | Idempotent per-calendar-month allowance top-up; transactional with Stripe webhook |

**Atomicity:** `preAuthorize` uses `updateMany` with a `gte` guard (compare-and-decrement). `applyMonthlyGrant` uses `prisma.$transaction` and checks `credits_period` to prevent double-grants. The webhook passes `{ client: tx }` so the grant and the `processedEvent` claim commit together.

**Free plans:** `preAuthorize` short-circuits when `userId` is null or `amount ≤ 0` → `{ok:true}` without touching the DB.

**Callers:** `api/search.js`, `api/stripe/webhook.js`

---

### `cache.js` — Result cache

**Purpose:** Caches the final origin-blind JSON payload of `/api/search` in KV (Upstash/Vercel KV), keyed by a canonical SHA-256 hash of the result-affecting inputs.

**Exports:**
| Symbol | Kind | Purpose |
|---|---|---|
| `cacheKey({query,sources,limit,authors,format})` | fn | 32-char base64url key |
| `readCache(key)` | async fn | Returns parsed payload or null on miss/KV-down |
| `writeCache(key, payload, ttlSeconds)` | async fn | Best-effort write; never throws |
| `isConfigured()` | fn | True when KV env vars are present |
| `DEFAULT_TTL_SECONDS` | constant | 21600 (6h) |

**Key scheme:** `oc:cache:v1:<sha256(canonical)>`. `mailto` is excluded from the canonical (polite-pool only; doesn't affect results). Sources are sorted before hashing.

**Callers:** `api/search.js`

---

### `coverage.js` — Coverage band + billing multiplier SSOT

**Purpose:** Computes a corpus-weighted coverage ratio and buckets it into a coarse band. Both the API response band and the billing multiplier are derived from the same function — they stay consistent.

**Exports:**
| Symbol | Kind | Purpose |
|---|---|---|
| `computeCoverage(eligible, failed)` | fn | `{attrition, coverage, band}` — only `band` is safe to emit |
| `bandFor(coverage, failedCount)` | fn | Bucketing: `failedCount===0 → full`; else by ratio threshold |
| `coverageMultiplier(band)` | fn | `{full:1, near-full:0.99, high:0.95, partial:0.5, limited:0}` |

**Callers:** `api/search.js`, `api/_shared/billing.js`

---

### `crypto.js` — Crypto SSOT (two families)

**Purpose:** AES-256-GCM encrypt/decrypt for the settings blob (family 1); SHA-256 `hashApiKey` + `generateApiKey` for API keys (family 2). Never cross them.

**Exports:**
| Symbol | Kind | Purpose |
|---|---|---|
| `encrypt(obj)` | fn | AES-256-GCM encrypt `obj` → base64 blob `[12B IV][16B tag][ct]` |
| `decrypt(blob)` | fn | Decrypt and JSON.parse the above blob |
| `generateApiKey()` | fn | `{key, hash, prefix}` — plaintext shown once, only hash persisted |
| `hashApiKey(key)` | fn | `sha256(API_KEY_PEPPER + key)` hex |
| `API_KEY_LIVE_PREFIX` | constant | `"oc_live_"` |
| `KEY_DISPLAY_PREFIX_LEN` | constant | 12 |

**Security notes:**
- `getSettingsKey()` throws if `SETTINGS_ENCRYPTION_KEY` is missing or not exactly 64 hex chars — fail-closed for encryption.
- `API_KEY_PEPPER` is optional; if unset, pepper is `""` — the hash is still one-way but provides no extra protection against a DB+key-format leak (`crypto.js:69`). See F-405.
- API key hash is `sha256` (non-timing-safe); the DB lookup is a direct equality match on the hash, so timing-safe compare at the DB level is irrelevant. The master key compare at `apiAuth.js:47` is the real timing-safe gap (F-402).

**Callers:** `api/settings.js`, `api/keys.js`, `api/_shared/apiAuth.js`

---

### `debugResult.js` — Admin-only origin-revealing card

**Purpose:** Composes `toPublicResult` and appends `source`, `_score`, `_fused`, `_native`, `_scoreBreakdown`. MUST only be called when `identity.admin === true`.

**See:** [[04-Backend-API/Search-Endpoint#publicresultjs--debugresultjs]]

**Callers:** `api/search.js` (inside the `if (debug)` branch only)

---

### `kv.js` — KV (Upstash/Vercel Redis) client

**Purpose:** Thin dependency-free REST client for Upstash Redis. Fail-open by contract: every method returns null/false on KV unavailability.

**Exports:**
| Symbol | Kind | Purpose |
|---|---|---|
| `isConfigured()` | fn | True when `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or Upstash equivalents) are set |
| `get(key)` | async fn | GET; null on miss or error |
| `set(key, value, ttlSeconds)` | async fn | SET [EX ttl]; true on OK |
| `incrWithTtl(key, ttlSeconds)` | async fn | INCR; sets TTL on first increment; null if KV unavailable |
| `ttl(key)` | async fn | TTL; null if unavailable |
| `claimOnce(key, ttlSeconds)` | async fn | Idempotency primitive: true=claimed first, false=duplicate, null=KV down |

**Config priority:** `KV_REST_API_URL` + `KV_REST_API_TOKEN` → `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.

**Callers:** `api/_shared/cache.js`, `api/_shared/ratelimit.js`

---

### `log.js` — Server logger

**Purpose:** Structured console logger matching the format of `src/lib/log.js`. Format: `[opencite:<adapter>:<event>] key=value ...`

**Exports:** `log(adapter, event, data)`, `log.warn(...)`, `log.err(...)`

**Duplication note (R-400):** Identical format logic to `src/lib/log.js` — two implementations of the same structured log format. See [[09-Audit/Duplication-and-Reuse#r-400]].

**Callers:** `api/_shared/kv.js`, `api/proxy.js`, `api/checkout.js`, `api/stripe/webhook.js`, per-source routes

---

### `parseBody.js` — JSON body reader

**Purpose:** Reads the raw Node.js `IncomingMessage` body stream and JSON-parses it; returns `{}` on parse error.

**Exports:** `parseBody(req)`

**Security note (F-400):** No maximum body size — an attacker can send an arbitrarily large body and accumulate it in memory (`parseBody.js:3`). Routes that call `parseBody` (`api/history.js`, `api/library.js`, `api/settings.js`) are vulnerable to memory exhaustion. Vercel has a default 4.5MB request body limit for serverless functions, which provides a platform-level bound but no route-specific cap.

**Callers:** `api/history.js`, `api/library.js`, `api/checkout.js`

---

### `plans.js` — Plan + pricing SSOT

**Purpose:** Single definition of every billing plan, credit pack, and plan-derived query. Every auth/billing/rate-limit path reads entitlement from here — never from client input.

**See:** [[05-Billing/Billing-Credits#plans]] for the full plan table and credit pack definitions.

**Callers:** `api/_shared/apiAuth.js`, `api/search.js`, `api/checkout.js`, `api/stripe/webhook.js`, `api/keys.js`

---

### `prisma.js` — Prisma singleton

**Purpose:** Exports a single `PrismaClient` instance, cached on `globalThis` to survive serverless warm starts.

**Exports:** `prisma`

**Note:** `process.env.NODE_ENV !== "production"` attaches to `globalThis` for dev hot-reload safety. In production, each cold start gets a fresh client.

**Callers:** `api/auth/handler.js`, `api/_shared/apiAuth.js`, `api/_shared/billing.js`, `api/checkout.js`, `api/history.js`, `api/keys.js`, `api/library.js`, `api/settings.js`, `api/stripe/webhook.js`

---

### `publicResult.js` — Origin-blind card SSOT

**Purpose:** Maps an internal normalized record to the public card, dropping `source` and replacing the upstream id with a deterministic opaque id (`oc_<sha1base64>`).

**See:** [[04-Backend-API/Search-Endpoint#publicresultjs--debugresultjs]]

**Callers:** `api/search.js`, `api/_shared/debugResult.js`

---

### `ratelimit.js` — Burst rate limiter

**Purpose:** Fixed-window KV counter per (identity, epoch). `max:0` → always passes (admin). Fail-open when KV is down.

**Exports:** `checkRateLimit(identity, plan)`

**Note (F-403):** Fail-open means a KV outage disables burst protection for all non-admin keys. A determined attacker who can force KV downtime (or who knows KV is not configured) faces no burst cap. The credit ledger is the second line of defense.

**Callers:** `api/search.js`

---

### `serverKeys.js` — Backend env key SSOT

**Purpose:** The only place `EUROPEANA_API_KEY`, `DPLA_API_KEY`, `SMITHSONIAN_API_KEY` are read from the environment. Returns only the keys that are set (undefined → key omitted from the returned object).

**Exports:** `serverInjectedKeys()` → `{europeanaKey?, dplaKey?, smithsonianKey?}`

**Secret boundary:** Keys are used in the backend→upstream hop only; never echoed to clients, never logged, never injected into the open proxy.

**Callers:** `api/search.js`, `api/search/europeana.js`, `api/search/dpla.js`, `api/search/smithsonian.js`

---

## 🩺 Health audit

- **Verdict:** healthy overall; three targeted security concerns.
- **Findings:**
  - [F-400] `parseBody` — no body size limit (`parseBody.js:3`).
  - [F-401] `getSession` — loopback URL constructed from `x-forwarded-host` without domain validation (`auth.js:38`).
  - [F-402] Master key compared with `===` not `timingSafeEqual` (`apiAuth.js:47`).
  - [F-403] Rate limiter fail-open — KV outage disables burst cap (`ratelimit.js:26`).
  - [F-404] `API_KEY_PEPPER` is optional; if not set, all key hashes are unpepped — a leaked DB + format knowledge = offline brute-force of short-lived keys (`crypto.js:69`).
  - [F-405] `settings.js:51` reads `req.body` directly (framework-parsed) instead of `parseBody`; this is inconsistent — routes that go through Vercel's body parser get an object but `parseBody` routes get a stream. Low impact; just confusing.
  - [F-406] `vercel.json` has no security headers (CSP, HSTS, X-Frame-Options) — verified empty (only rewrites). The proxy route (`api/proxy.js`) sets `X-Content-Type-Options: nosniff` per response but this is not applied globally.
- **Reuse:** `api/_shared/log.js` duplicates `src/lib/log.js` — see [[09-Audit/Duplication-and-Reuse#r-400]].

## See also

[[04-Backend-API/Search-Endpoint]] · [[05-Billing/Billing-Credits]] · [[04-Backend-API/Auth-Sessions]] · [[07-Data-Layer/Data-Layer]] · [[09-Audit/Security]]
