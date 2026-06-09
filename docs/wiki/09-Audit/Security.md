---
machine_ids: []
findings: [F-400, F-401, F-402, F-403, F-404, F-406, F-407, F-408, F-409, F-410, F-411, F-412, F-413, F-414, F-415, F-417, F-509]
runtime: infra
status: mixed
tags: [audit, security]
---

# Security

> **One-line role.** Every security finding, ranked by exploitability × blast-radius. Good news first:
> **billing has no bypass** (see [[09-Audit/What-We-Did-Well]]); these are hardening gaps, not an open vault.

## 🟠 Fix-first (med, high blast radius)

### f-406 — No CSP / HSTS / X-Frame-Options [med]
`vercel.json` has no `headers` block at all. No HTTP-layer XSS or clickjacking mitigation; one stored/reflected XSS anywhere = full session access. Highest blast-radius-per-line-of-fix in the repo. **Fix:** add CSP, HSTS, `X-Frame-Options:DENY`, `X-Content-Type-Options:nosniff`, `Referrer-Policy`. See [[04-Backend-API/Shared-Modules#health-audit]].

### f-407 — Keyed per-source routes are unauthenticated [med]
`api/search/{europeana,dpla,smithsonian}.js` — no auth, no rate limit, no credit charge, URLs discoverable in client code. Anyone can burn your paid upstream quotas. **Fix:** require a session/Origin check or lightweight token. See [[04-Backend-API/Per-Source-Routes#security-note-f-407]].

### f-410 — Proxy does not enforce `https:` scheme [med]
`proxy.js:61` checks hostname but not scheme → `http://` downgrade path. **Fix:** reject non-`https` targets. See [[04-Backend-API/Proxy#ssrf-posture]].

### f-411 — Proxy follows redirects without re-validating destination [med]
`proxy.js:78` `redirect:'follow'` → an allowlisted host that 30x-redirects sends the proxy anywhere (SSRF-via-redirect; Vercel metadata `169.254.169.254`). The structural hole. **Fix:** `redirect:'manual'`, re-check each hop against the allowlist. See [[04-Backend-API/Proxy#ssrf-posture]].

### f-414 — `AUTH_SECRET` not validated at startup [med]
`auth/handler.js:21` — empty/weak secret fails at first token op, not at deploy; session-forgery surface. **Fix:** assert presence + length ≥32 at module load. See [[04-Backend-API/Auth-Sessions]].

### f-400 — `parseBody` has no size limit [med]
`parseBody.js:3` accumulates the whole body unbounded → memory exhaustion. **Fix:** cap bytes, 413 on overflow. See [[04-Backend-API/Shared-Modules#parsebodyjs]].

### f-509 — `API_KEY_PEPPER` defaults to `""` with no guard [med]
`crypto.js:69` — silent bare-SHA-256 hashing if unset; DB leak → rainbow-tableable keys. Overlaps [[#f-404]]. **Fix:** fail-fast in production if pepper missing. See [[08-Build-Deploy/Build-Deploy#health-audit]].

## 🟡 Hardening (low)

### f-402 — Master API key compared with `===` (timing oracle)
`apiAuth.js:47` — highest-privilege credential lacks constant-time compare. **Fix:** `crypto.timingSafeEqual` (equal-length buffers). See [[04-Backend-API/Auth-Sessions#api-key-resolution]].

### f-404 — `API_KEY_PEPPER` optional → unpepped hashes on DB leak
`crypto.js:69`. See [[#f-509]].

### f-401 — `getSession` loopback URL from unvalidated `x-forwarded-host`
`auth.js:38` — SSRF-adjacent (low on Vercel where the header is platform-set; unsafe elsewhere). **Fix:** pin/validate host. See [[04-Backend-API/Auth-Sessions#getsession]].

### f-403 — Rate limiter fail-open on KV outage
`ratelimit.js:26` — burst cap disabled when KV is down (does **not** bypass billing; credits are the durable quota). Accept or add an in-process fallback. See [[04-Backend-API/Shared-Modules#ratelimitjs]].

### f-408 — BL SPARQL injection (double-quote strip only)
`bl.js:15` — only `"` stripped before SPARQL interpolation. **Fix:** strip non-alphanumerics / parameterize. See [[04-Backend-API/Per-Source-Routes#bl---british-library-sparql]].

### f-409 — Mexicana `resumptionToken` into OAI-PMH URL unvalidated
`mexicana.js:51` — `encodeURIComponent` only. **Fix:** validate token shape. See [[04-Backend-API/Per-Source-Routes#mexicanajs---mexicana-oai-pmh]].

### f-412 — Proxy 502 leaks `error.message` (may expose upstream URL)
`proxy.js:103`. **Fix:** generic error body, log server-side. See [[04-Backend-API/Proxy#ssrf-posture]].

### f-413 — No per-user API-key count limit (unbounded minting)
`keys.js:50` — financially self-limiting (own credits) but table noise. **Fix:** cap keys/user. See [[04-Backend-API/Auth-Sessions#api-key-issuance]].

### f-415 — `checkout.baseUrl` accepts any `*.vercel.app` origin
`checkout.js:28` — accepts any Vercel project as a post-checkout redirect target. **Fix:** restrict to OpenCITE's own project pattern. See [[05-Billing/Billing-Credits#stripe-checkout]].

### f-417 — Stripe webhook trusts metadata for pack/plan
`webhook.js:117` — safe while the secret key is uncompromised; defense-in-depth gap. **Fix:** cross-validate pack/plan against `CREDIT_PACKS`/`PLANS`. See [[05-Billing/Billing-Credits#stripe-webhook]].

## ✅ Verified NOT exploitable (the audit specifically tried)
- **No free/unmetered-search path:** credits charge even on cache hit; KV fail-open disables only rate-limiting, not billing; the only zero-cost paths (admin allowlist, master key, sub-50% coverage discount) are by-design.
- **Stripe webhook signature is verified**; checkout/webhook idempotent.
- **MCP package leaks no secret** (env-injected key, never logged).
- See [[09-Audit/What-We-Did-Well]].

## See also
[[09-Audit/Health-Dashboard]] · [[09-Audit/Bugs]] · [[04-Backend-API/Proxy]] · [[04-Backend-API/Auth-Sessions]]
