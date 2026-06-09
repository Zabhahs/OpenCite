# OpenCITE — Sprint Log v0.39

> **PM + architecture document for the next Claude instance(s).** Self-contained execution
> plan for **security hardening** — patching every finding from the v0.38/v0.39 security
> audit (F-400–F-417, F-509). No new features; no user-visible changes (except one narrowed
> CORS pattern). All changes are backend-only or infrastructure config.
>
> Read `docs/wiki/09-Audit/Security.md` (threat model + ranked findings) first.
> Cross-reference `docs/wiki/_machine/findings.json` for full `detail`/`path`/`fix_hint`.
>
> **Created:** 2026-06-08 · **Status:** PLANNED — not executed.
> **Mode:** C (plan → approval → execute → checklist). Dense; no padding.

---

## 0. TL;DR

The security audit confirmed **billing has no bypass** (the vault is locked). What it found
is a ring of hardening gaps: absent HTTP headers that turn any XSS into a session take-over;
an unauthenticated quota-drain surface on three paid API routes; a proxy that can be tricked
into following redirects to internal metadata endpoints (SSRF); startup misconfiguration that
goes undetected until runtime; and a handful of low-severity input/billing hardening items.

This sprint closes all 17 open findings in one pass, grouped into five logical workstreams.
No finding requires a DB migration. No finding touches the search pipeline. No permanent
deletion occurs — quarantine policy applies to any code removal.

**Total estimated effort: ~14 hours.** All changes are isolated to `vercel.json`, `api/`,
and one `api/_shared/` module. Zero frontend changes required.

---

## 1. Scope

| Finding | Severity | Workstream |
|---|---|---|
| F-406 | med | WS1 — Security headers |
| F-407 | med | WS2 — Per-source route auth |
| F-410 | med | WS3 — Proxy / SSRF |
| F-411 | med | WS3 — Proxy / SSRF |
| F-412 | low | WS3 — Proxy / SSRF |
| F-414 | med | WS4 — Auth / keys |
| F-401 | low | WS4 — Auth / keys |
| F-402 | low | WS4 — Auth / keys |
| F-404 | low | WS4 — Auth / keys |
| F-509 | med | WS4 — Auth / keys |
| F-413 | low | WS4 — Auth / keys |
| F-400 | med | WS5 — Input |
| F-408 | low | WS5 — Input |
| F-409 | low | WS5 — Input |
| F-403 | low | WS6 — Rate-limiter decision |
| F-415 | low | WS7 — Billing / webhook |
| F-416 | low | WS7 — Billing / webhook |
| F-417 | low | WS7 — Billing / webhook |

---

## 2. Design / approach

### WS1 — Security headers [[09-Audit/Security#f-406]]

**Threat today:** no CSP, no HSTS, no X-Frame-Options in `vercel.json`. Any reflected or
stored XSS in the SPA has unrestricted document + cookie access. Clickjacking trivially
frames the sign-in button.

**After:** CSP blocks inline-eval and cross-origin script loads; HSTS prevents downgrade;
X-Frame-Options prevents click-jacking; Referrer-Policy limits referrer leakage.

CSP design for this SPA:
- `default-src 'self'` — fallback
- `script-src 'self'` — no `unsafe-inline`; Vite build must not use inline scripts
- `style-src 'self' 'unsafe-inline'` — Tailwind inlines style tags at runtime; this is
  the one necessary `unsafe-inline`
- `connect-src 'self' https://api.stripe.com https://*.supabase.co` — fetch targets
- `img-src 'self' data: https:` — result thumbnails come from arbitrary upstream
- `frame-ancestors 'none'` — equivalent to X-Frame-Options:DENY for modern browsers
- `upgrade-insecure-requests` — belt + suspenders with HSTS

Vercel `headers` block applies to **all routes** via `"source": "/(.*)"`.
The proxy edge function's per-response `Access-Control-Allow-Origin: *` is intentional
and unaffected (it is not a security-sensitive cross-origin surface for credentials).

### WS2 — Per-source route auth [[09-Audit/Security#f-407]]

**Threat today:** `api/search/europeana.js`, `api/search/dpla.js`, `api/search/smithsonian.js`
have no auth. The URLs are directly derivable from `src/adapters/extensions/europeana.js`
(the adapter calls `${window.location.origin}/api/search/europeana`). Any attacker who
reads the client bundle can fire unlimited requests, burning the project's Europeana/DPLA/
Smithsonian API quota at zero cost.

**Fix design:** add a lightweight shared `requireInternalOrigin(req, res)` guard that
checks `req.headers.origin` against `TRUSTED_ORIGINS` (already the SSOT in
`api/_shared/auth.js`). These routes are browser-shim endpoints — they are ONLY ever
called from the browser's same-origin adapter via `fetch('/api/search/europeana', ...)`.
The browser always sends `Origin: https://citation.today` (or the Vercel preview domain).
A direct curl/scripted call from outside will either have no Origin (in which case we block)
or an untrusted Origin.

Edge case: when an admin uses the Vercel preview URL, the origin is `*.vercel.app`. The
existing CORS check in `auth.js:setCorsHeaders` already allows `*.vercel.app`. We apply
the same pattern here — but use the narrowed check (see F-415 fix: only
`opencite*.vercel.app`, not any `*.vercel.app`).

Implementation: add `api/_shared/requireInternalOrigin.js` (new file, ~15 lines).

### WS3 — Proxy / SSRF [[09-Audit/Security#f-410]] [[09-Audit/Security#f-411]] [[09-Audit/Security#f-412]]

**Threat today (F-410):** proxy checks hostname but not scheme. `http://gallica.bnf.fr/...`
passes the allowlist and is forwarded in cleartext. Unlikely in practice (host will redirect
to HTTPS) but the proxy gives no guarantee.

**Threat today (F-411):** proxy uses `redirect: 'follow'` with no re-validation. An
allowlisted host that 301-redirects to `http://169.254.169.254/latest/meta-data/` (AWS/GCP
metadata) or any internal service would be followed silently. This is SSRF-via-redirect —
a classic attack vector against cloud-hosted proxies. Vercel's infrastructure may block
the metadata endpoint, but the proxy should not rely on that.

**Threat today (F-412):** on fetch failure `error.message` is returned verbatim in the 502
body. It can include the target URL and internal host resolution details.

**Fix design (F-410 + F-411 combined):** set `redirect: 'manual'`, then on a 3xx response
extract the `Location` header, parse it as a `URL`, and re-validate the hostname against
`ALLOWED_DOMAINS` AND the scheme against `https:`. If either check fails, return 400 to
the caller rather than following. Maximum 2 hops to prevent redirect chains. This is in
`api/proxy.js` (Edge runtime).

**Fix design (F-412):** log `error.message` via `log.err(...)` (already called on line 98)
and return only `{ error: 'Upstream unreachable' }` in the 502 body.

### WS4 — Auth / keys [[09-Audit/Security#f-414]] [[09-Audit/Security#f-401]] [[09-Audit/Security#f-402]] [[09-Audit/Security#f-404]] [[09-Audit/Security#f-509]] [[09-Audit/Security#f-413]]

**Threat today (F-414):** `api/auth/handler.js:21` passes `process.env.AUTH_SECRET`
directly to Auth.js with no startup assertion. An absent or weak secret fails at the first
token-signing operation (runtime), not at deploy time. A known/weak secret allows session
token forgery.

**Threat today (F-401):** `api/_shared/auth.js:38` constructs the loopback URL using
`req.headers['x-forwarded-host']` without validation. On Vercel, this header is
platform-controlled (low severity). Outside Vercel it could be attacker-controlled,
redirecting the session-cookie-bearing loopback fetch to an arbitrary host.

**Threat today (F-402):** `api/_shared/apiAuth.js:47` compares the master API key with
`===`. String equality is not constant-time. A remote timing oracle could enumerate the
key character-by-character over many requests. Low severity in practice (requires many
precisely-timed requests to a cold-start function) but the master key is the
highest-privilege credential.

**Threat today (F-404/F-509 — same root, two findings):** `api/_shared/crypto.js:69`
uses `process.env.API_KEY_PEPPER || ""`. If `API_KEY_PEPPER` is unset, all key hashes are
bare SHA-256. A DB leak exposes hashes that can be tested against known key format
(`oc_live_<32 base64url chars>`) offline, without hitting the API. With 192-bit random
suffix this is computationally infeasible for brute-force but a rainbow table of low-entropy
or repeated keys is possible. F-509 adds: no startup guard, so production can run in this
degraded state indefinitely.

**Threat today (F-413):** `api/keys.js:50-59` — no limit on key minting per user. Credits
are self-draining so financial impact is zero. The risk is table pollution and making
key-rotation audits noisy.

**Fix design:**
- F-414: `api/auth/handler.js` — add a module-level guard before `authConfig` construction:
  `if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error(...)`.
- F-401: `api/_shared/auth.js:38` — validate `host` against `TRUSTED_ORIGINS` (hostname
  only) before use; fall back to `process.env.NEXT_PUBLIC_URL || TRUSTED_ORIGINS[0]`.
- F-402: `api/_shared/apiAuth.js:47` — replace `key === master` with
  `timingSafeEqual(key, master)` using a helper that pads/hashes both to equal length.
- F-404/F-509: `api/_shared/crypto.js:69` — add production startup guard;
  document `API_KEY_PEPPER` as required in `.env.example`.
- F-413: `api/keys.js` — before `prisma.apiKey.create`, count non-revoked keys for the
  user; reject with 422 if count ≥ 10.

### WS5 — Input [[09-Audit/Security#f-400]] [[09-Audit/Security#f-408]] [[09-Audit/Security#f-409]]

**Threat today (F-400):** `api/_shared/parseBody.js` accumulates the entire request body
as a string with no byte limit. Vercel's platform limit is 4.5 MB. A caller can send 4 MB
of garbage to any `parseBody`-using route (checkout, history, library) and waste function
memory/invocation time.

**Threat today (F-408):** `api/search/bl.js:15` strips only `"` before interpolating
the query into a SPARQL FILTER. `#` comment injection, backslash sequences, or FILTER
bypass patterns are not blocked. Practical impact: data manipulation in BL search results
returned to the browser only — the SPARQL endpoint has no write surface.

**Threat today (F-409):** `api/search/mexicana.js:51` passes `encodeURIComponent(token)`
into the OAI-PMH URL. `encodeURIComponent` is not a validator — a token with embedded `?`
or `&` before encoding would append extra query parameters to the OAI URL. The OAI upstream
would likely reject a malformed token; impact is limited to a broken pagination hop.

**Fix design:**
- F-400: `api/_shared/parseBody.js` — accumulate bytes in a counter; reject with 413
  when `data.length > MAX_BYTES` (64 KB). One file change, affects all consumers.
- F-408: `api/search/bl.js:15` — replace the `replace(/"/g,'')` with a stricter allowlist:
  `query.replace(/[^a-zA-Z0-9 \-'.]/g, ' ').trim()`. This preserves human-readable
  search terms while blocking all SPARQL metacharacters (`#`, `\`, `{`, `}`, etc.).
- F-409: `api/search/mexicana.js:51` — add a token shape guard before use:
  `if (!/^[A-Za-z0-9%=+/_\-:.*@]+$/.test(token)) return 400`. Specifically, the
  Mexicana OAI resumptionToken format is opaque but observably alphanumeric + limited
  punctuation in practice.

### WS6 — Rate-limiter fail-open decision [[09-Audit/Security#f-403]]

**Threat today:** `api/_shared/ratelimit.js:26` returns `{ ok: true }` when KV is
unavailable. Intentional — a KV outage must never block a paid search. However, a KV
outage (or an attacker inducing KV unreachability) disables burst protection.

**Decision (not a full fix — see Risk register R3):** accept the fail-open behaviour; the
credit ledger in Postgres is the durable quota and cannot be bypassed via KV. Add an
in-process LRU fallback counter (`Map` + epoch key) that provides best-effort burst
protection during KV outages without risking false-positive 429s on valid paid requests.
The in-process counter resets on cold start and is per-instance — it is NOT a replacement
for KV rate-limiting, just a degraded fallback. If the burst-protection gap is unacceptable,
the right fix is to make the rate-limiter fail-closed and accept rare false-positive 429s.
This sprint implements the in-process fallback and documents the trade-off clearly.

### WS7 — Billing / webhook [[09-Audit/Security#f-415]] [[09-Audit/Security#f-416]] [[09-Audit/Security#f-417]]

**Threat today (F-415):** `api/checkout.js:28` — `origin.endsWith('.vercel.app')` accepts
any Vercel project, including `evil.vercel.app`. A malicious actor can craft a checkout
request from their own Vercel deployment and redirect users there post-checkout.

**Threat today (F-416):** `api/stripe/webhook.js:104` — when `resolveUserId` returns null
(no `client_reference_id` and no matching `stripe_customer_id`), the event is ACKed and
the credits are silently not granted. No log entry. This affects manually-created Stripe
customers or events with lost DB references.

**Threat today (F-417):** `api/stripe/webhook.js:117` — `obj.metadata.plan` and
`obj.metadata.pack` are used directly. An attacker with the Stripe secret key (compromised)
could create a checkout with `metadata.plan = "pro"` and get Pro credits on a free account.
Defense-in-depth: cross-validate against the known PLANS/CREDIT_PACKS registry.

**Fix design:**
- F-415: `api/checkout.js:28` — tighten the vercel.app pattern:
  `origin.match(/^https:\/\/opencite(-[a-z0-9]+)?\.vercel\.app$/)`. This matches
  `opencite.vercel.app` and `opencite-<branch>.vercel.app` only.
- F-416: `api/stripe/webhook.js` — after `resolveUserId` returns null, log a structured
  warning for any event type that would normally produce a credit/plan change:
  `log.warn("stripe", "unresolved-user", { type: event.type, eventId: event.id, customer: obj.customer })`.
  The silent no-op remains correct behaviour (don't crash, don't retry with wrong userId)
  but is now visible in Vercel logs.
- F-417: `api/stripe/webhook.js` — before acting on `metadata.pack` / `metadata.plan`,
  validate: `if (planId && !PLANS[planId]) { log.warn(...); planId = null; }` and
  `if (pack && !CREDIT_PACKS[pack.id]) { ... }`. Both already go through `getPack`/
  `getPlan` which returns the `free` fallback on unknown inputs — but the explicit guard
  makes the defence visible and logs the anomaly.

---

## 3. Execution plan

### T1 — WS1: Security headers in `vercel.json` (~2 h)

**File:** `vercel.json:1`
**Finding:** F-406 · [[09-Audit/Security#f-406]]

- [ ] T1.1 Add a `"headers"` array to `vercel.json` with a single catch-all source `"/(.*)"`.
  Include:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Content-Security-Policy:` (see WS1 design above; exact value TBD after T1.2 audit)
- [ ] T1.2 Audit Vite build output (`npm run build`) for inline scripts that would break
  `script-src 'self'`. If Vite injects any `<script>` without a nonce, either configure
  Vite to use external chunks or loosen to `script-src 'self' 'unsafe-inline'` with a
  comment explaining why.
- [ ] T1.3 Manual smoke test: `curl -I https://<preview>.vercel.app/` — confirm all five
  headers present. Open the app in a browser, check DevTools → Network → response headers
  on the HTML document. Confirm no CSP console errors on a normal search flow.
- [ ] T1.4 Confirm the proxy edge function's `Access-Control-Allow-Origin: *` is not
  clobbered by the global header (Vercel merges — edge function headers take precedence
  over the config-level `headers` block for the same key on the same route).

### T2 — WS2: Per-source route auth (~1.5 h)

**Files:** `api/search/europeana.js:11`, `api/search/dpla.js:11`, `api/search/smithsonian.js:11`
**Finding:** F-407 · [[09-Audit/Security#f-407]]

- [ ] T2.1 Create `api/_shared/requireInternalOrigin.js`:
  ```js
  // Rejects requests from origins not in TRUSTED_ORIGINS or the project's own
  // Vercel preview domains. Returns true if the request should proceed, false if
  // a 403 response has been sent. Node runtime only (uses res.end).
  import { TRUSTED_ORIGINS } from "./auth.js";
  const OWN_VERCEL_RE = /^https:\/\/opencite(-[a-z0-9]+)?\.vercel\.app$/;
  export function requireInternalOrigin(req, res) {
    const origin = req.headers.origin || "";
    if (TRUSTED_ORIGINS.includes(origin) || OWN_VERCEL_RE.test(origin)) return true;
    res.statusCode = 403;
    res.end(JSON.stringify({ error: "Forbidden" }));
    return false;
  }
  ```
- [ ] T2.2 In `api/search/europeana.js`: import `requireInternalOrigin`; add as the first
  call in the handler: `if (!requireInternalOrigin(req, res)) return;`
- [ ] T2.3 Same in `api/search/dpla.js`.
- [ ] T2.4 Same in `api/search/smithsonian.js`.
- [ ] T2.5 Manual test: `curl https://<preview>/api/search/europeana?q=test` (no Origin
  header) → expect 403. Open the app in a browser and run a search → expect Europeana
  results (browser sends `Origin: https://...`).

### T3 — WS3: Proxy SSRF + error leak (~2 h)

**File:** `api/proxy.js`
**Findings:** F-410 · F-411 · F-412 · [[09-Audit/Security#f-410]] [[09-Audit/Security#f-411]] [[09-Audit/Security#f-412]]

- [ ] T3.1 Add scheme enforcement at `api/proxy.js` after line 58 (after `targetUrl` is
  parsed):
  ```js
  if (targetUrl.protocol !== 'https:') {
    return new Response('Only HTTPS targets allowed', { status: 400 });
  }
  ```
  This fixes F-410.
- [ ] T3.2 Replace `redirect: 'follow'` (line 78) with `redirect: 'manual'`. Add a
  helper `async function followSafe(url, options, hops = 0)` that:
  1. Fetches with `redirect: 'manual'`.
  2. If 3xx and `hops < 2`, extracts `Location`, re-validates hostname ∈ ALLOWED_DOMAINS
     AND scheme === `https:`, then recurses.
  3. Returns the final response (or a 400 synthetic Response if validation fails).
  Update `fetchOptions.redirect` to `'manual'` and call `followSafe` instead of `fetch`.
  This fixes F-411.
- [ ] T3.3 In the `catch (error)` block at line 97: remove `details: error.message` from
  the 502 JSON body. The message is already captured in the `log.err` call on line 98.
  Return only `{ error: 'Upstream unreachable' }`. This fixes F-412.
- [ ] T3.4 Manual test: pass `?url=http://gallica.bnf.fr/...` (HTTP) → 400. Pass a URL
  that redirects to an un-allowlisted host → 400. Pass a normal allowed URL → results as
  before. Confirm 502 body no longer contains URL details.

### T4 — WS4a: AUTH_SECRET startup guard (~0.5 h)

**File:** `api/auth/handler.js:21`
**Finding:** F-414 · [[09-Audit/Security#f-414]]

- [ ] T4.1 Before the `authConfig` object at `api/auth/handler.js:17`, add:
  ```js
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    throw new Error(
      "[auth] AUTH_SECRET must be set and at least 32 characters. " +
      "Generate with: openssl rand -hex 32"
    );
  }
  ```
  This throws at module load time, making the misconfiguration fatal at deploy rather than
  at first token operation.
- [ ] T4.2 Verify locally: temporarily unset `AUTH_SECRET` in `.env.local` and confirm the
  serverless function throws on first invocation (Vercel logs show the error).

### T5 — WS4b: `getSession` host validation (~0.5 h)

**File:** `api/_shared/auth.js:38`
**Finding:** F-401 · [[09-Audit/Security#f-401]]

- [ ] T5.1 In `api/_shared/auth.js`, import or derive `SELF_HOST` from the environment:
  ```js
  // Validated host for loopback session fetch. Must be a known trusted host.
  function selfHost() {
    const env = process.env.AUTH_URL || process.env.NEXTAUTH_URL || TRUSTED_ORIGINS[0];
    try { return new URL(env).host; } catch { return new URL(TRUSTED_ORIGINS[0]).host; }
  }
  ```
  In `getSession`, replace the `x-forwarded-host` derivation of `host` with:
  ```js
  const rawHost = (req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const trusted = TRUSTED_ORIGINS.map(o => new URL(o).host);
  const host = trusted.includes(rawHost) ? rawHost : selfHost();
  ```
  This pins the loopback URL to a known trusted host even if the header is spoofed.
- [ ] T5.2 Test: confirm sign-in still works on the Vercel preview URL (the preview origin
  is not in TRUSTED_ORIGINS, so `selfHost()` will be used — ensure it resolves correctly).
  Add the preview origin to the env `AUTH_URL` if needed.

### T6 — WS4c: Timing-safe master key comparison (~0.5 h)

**File:** `api/_shared/apiAuth.js:47`
**Finding:** F-402 · [[09-Audit/Security#f-402]]

- [ ] T6.1 Add a `timingSafeCompare(a, b)` helper at the top of `api/_shared/apiAuth.js`:
  ```js
  import { timingSafeEqual, createHash } from "crypto";
  // Hash both inputs to equalise length before constant-time compare.
  // This prevents length-based information leak in addition to value-timing.
  function timingSafeCompare(a, b) {
    const ha = createHash("sha256").update(a).digest();
    const hb = createHash("sha256").update(b).digest();
    return timingSafeEqual(ha, hb);
  }
  ```
  Replace `key === master` on line 47 with `timingSafeCompare(key, master)`.
- [ ] T6.2 Verify: run `node -e "..."` test against the helper to confirm it returns true
  for equal strings and false for different strings without throwing.

### T7 — WS4d: `API_KEY_PEPPER` guard + env docs (~0.5 h)

**Files:** `api/_shared/crypto.js:69`, `.env.example`
**Findings:** F-404 · F-509 · [[09-Audit/Security#f-404]] [[09-Audit/Security#f-509]]

- [ ] T7.1 In `api/_shared/crypto.js`, before the `hashApiKey` function (but after the
  imports), add a module-level guard:
  ```js
  // Fail fast in production if the pepper is missing — bare SHA-256 hashes are
  // offline rainbow-tableable if the DB is leaked. See findings F-404/F-509.
  if (process.env.NODE_ENV === "production" && !process.env.API_KEY_PEPPER) {
    throw new Error(
      "[crypto] API_KEY_PEPPER must be set in production. " +
      "Generate with: openssl rand -hex 32"
    );
  }
  ```
- [ ] T7.2 Update `.env.example`: add `API_KEY_PEPPER=` with a comment:
  `# Required in production. Generate: openssl rand -hex 32. Must not change after keys are issued.`
  Also add any other undocumented required vars identified in F-508 (POSTGRES_PRISMA_URL,
  POSTGRES_URL_NON_POOLING, KV_REST_API_URL, KV_REST_API_TOKEN, OPENCITE_MAILTO)
  while the file is open. (F-508 is not a security finding but the fix is free here.)
- [ ] T7.3 Confirm the Vercel project has `API_KEY_PEPPER` set in production env vars
  before merging. If not set, set it now (do not rotate existing keys — the pepper change
  would invalidate all current hashes; note this hard constraint in code comment).

### T8 — WS4e: Per-user API key cap (~0.5 h)

**File:** `api/keys.js:50`
**Finding:** F-413 · [[09-Audit/Security#f-413]]

- [ ] T8.1 In `api/keys.js` POST handler, before `generateApiKey()`, add a count check:
  ```js
  const existing = await prisma.apiKey.count({
    where: { user_id: userId, revoked: false },
  });
  if (existing >= 10) {
    return res.status(422).json({ error: "Key limit reached (10 active keys). Revoke an existing key first." });
  }
  ```
- [ ] T8.2 Manual test: create 10 keys → 11th returns 422.

### T9 — WS5: Input hardening (~1.5 h)

**Files:** `api/_shared/parseBody.js:3`, `api/search/bl.js:15`, `api/search/mexicana.js:51`
**Findings:** F-400 · F-408 · F-409 · [[09-Audit/Security#f-400]] [[09-Audit/Security#f-408]] [[09-Audit/Security#f-409]]

- [ ] T9.1 `api/_shared/parseBody.js` — add a `MAX_BYTES = 65_536` constant and a running
  counter. Reject mid-stream when exceeded:
  ```js
  const MAX_BYTES = 65_536; // 64 KB
  export async function parseBody(req) {
    return new Promise((resolve, reject) => {
      let data = "", bytes = 0;
      req.on("data", chunk => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          req.destroy();
          return reject(Object.assign(new Error("Payload too large"), { statusCode: 413 }));
        }
        data += chunk;
      });
      req.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve({}); }
      });
      req.on("error", reject);
    });
  }
  ```
  Callers that catch the rejection should return 413. Update `api/checkout.js`,
  `api/history.js`, `api/library.js` to propagate the 413 status:
  ```js
  const body = await parseBody(req).catch(e =>
    e.statusCode === 413 ? res.status(413).json({ error: "Payload too large" }) : Promise.reject(e)
  );
  if (!body || res.writableEnded) return;
  ```
- [ ] T9.2 `api/search/bl.js:15` — replace the query sanitizer:
  ```js
  // Old: query.replace(/"/g, '')
  // New: allowlist — alphanumeric, spaces, hyphens, apostrophes, periods only.
  const safeQuery = query.replace(/[^a-zA-Z0-9 \-'.]/g, ' ').trim();
  ```
  Use `safeQuery` in the SPARQL template instead of `query`.
- [ ] T9.3 `api/search/mexicana.js:51` — add token shape validation before building the
  OAI URL:
  ```js
  if (token && !/^[\w%=+/\-.@:*]+$/.test(token)) {
    return new Response(
      JSON.stringify({ error: "Invalid resumption token", results: [], total: 0 }),
      { status: 400, headers: corsHeaders }
    );
  }
  ```
  The `\w` class covers `[A-Za-z0-9_]`; the additional chars cover real OAI token
  formats without allowing `&`, `?`, `#`, or whitespace.
- [ ] T9.4 Manual test: send a 100 KB POST to `/api/checkout` → 413. Send a BL query with
  `q=foo{bar}` → SPARQL is generated with safe chars only. Send a Mexicana request with
  `token=foo&bar=baz` → 400.

### T10 — WS6: Rate-limiter in-process fallback (~1.5 h)

**File:** `api/_shared/ratelimit.js:26`
**Finding:** F-403 · [[09-Audit/Security#f-403]]

- [ ] T10.1 Add an in-process LRU `Map` fallback to `api/_shared/ratelimit.js`:
  ```js
  // In-process fallback counter — best-effort burst protection when KV is unavailable.
  // Resets on cold start; per-instance only; not a substitute for KV rate-limiting.
  const _local = new Map(); // key → { count, epoch }
  function localIncr(key, windowSeconds) {
    const epoch = Math.floor(Date.now() / 1000 / windowSeconds);
    const entry = _local.get(key);
    if (!entry || entry.epoch !== epoch) {
      _local.set(key, { count: 1, epoch });
      return 1;
    }
    entry.count++;
    return entry.count;
  }
  ```
  In `checkRateLimit`, when `count === null` (KV unavailable), use `localIncr` instead
  of returning `{ ok: true }` immediately:
  ```js
  const count = await incrWithTtl(key, window) ?? localIncr(key, window);
  ```
  Delete the early-return fail-open path. Add a comment explaining the fallback's limits.
- [ ] T10.2 Add a `// Decision: F-403 — fail-open vs fallback` comment block above the
  function explaining the trade-off: KV down → in-process LRU → cold-start resets → not
  bulletproof but better than nothing. Credits are the real quota.
- [ ] T10.3 Verify `_local` does not grow unboundedly: add a periodic GC
  (`if (_local.size > 10_000) _local.clear()`) or use a time-bounded eviction.

### T11 — WS7: Billing / webhook hardening (~1.5 h)

**Files:** `api/checkout.js:28`, `api/stripe/webhook.js:104`, `api/stripe/webhook.js:117`
**Findings:** F-415 · F-416 · F-417 · [[09-Audit/Security#f-415]] [[09-Audit/Security#f-416]] [[09-Audit/Security#f-417]]

- [ ] T11.1 `api/checkout.js:28` — tighten vercel.app pattern in `baseUrl()`:
  ```js
  // Old: origin.endsWith('.vercel.app')
  // New: only OpenCITE's own preview deployments.
  const OWN_VERCEL_RE = /^https:\/\/opencite(-[a-z0-9]+)?\.vercel\.app$/;
  if (origin && (TRUSTED_ORIGINS.includes(origin) || OWN_VERCEL_RE.test(origin))) return origin;
  ```
  This fixes F-415. Apply the same pattern to `setCorsHeaders` in `api/_shared/auth.js:22`
  (currently `origin.endsWith('.vercel.app')` — tighten consistently).
- [ ] T11.2 `api/stripe/webhook.js` — after `const userId = await resolveUserId(obj)`, add:
  ```js
  if (!userId && !["invoice.payment_failed"].includes(event.type)) {
    log.warn("stripe", "unresolved-user", {
      type: event.type, eventId: event.id,
      customer: typeof obj.customer === "string" ? obj.customer : null,
    });
  }
  ```
  This surfaces the silent no-op for credit/plan events without breaking idempotency.
  This fixes F-416.
- [ ] T11.3 `api/stripe/webhook.js` — add metadata validation before acting on pack/plan.
  After line 117 where `getPack(obj.metadata?.pack)` is called:
  ```js
  const rawPack = obj.metadata?.pack;
  const rawPlan = obj.metadata?.plan;
  if (rawPack && !CREDIT_PACKS[rawPack]) {
    log.warn("stripe", "unknown-pack-metadata", { rawPack, eventId: event.id });
  }
  if (rawPlan && !PLANS[rawPlan]) {
    log.warn("stripe", "unknown-plan-metadata", { rawPlan, eventId: event.id });
  }
  const pack = getPack(rawPack); // getPlan/getPack already return safe fallbacks
  const planId = rawPlan && PLANS[rawPlan] ? rawPlan : null;
  ```
  This makes the defense explicit and logs anomalies. This fixes F-417.
- [ ] T11.4 Manual test (F-415): confirm `curl -H "Origin: https://evil.vercel.app"` does
  not produce the evil domain in the success_url. Confirm `opencite-abc.vercel.app` works.
- [ ] T11.5 For F-416: check Vercel logs after sending a test webhook with a missing
  `client_reference_id` and a customer not in the DB — confirm the warning appears.

### T12 — Final: regression + documentation (~1 h)

- [ ] T12.1 Deploy to a Vercel preview branch. Run through a complete search + sign-in
  + checkout flow and confirm no regressions.
- [ ] T12.2 `curl -I` the preview URL — confirm all 5+ security headers are present.
- [ ] T12.3 Try a direct `curl` to `/api/search/europeana?q=test` with no Origin → 403.
- [ ] T12.4 Update `docs/wiki/09-Audit/Security.md` findings status for all 17 findings:
  change `status: open` → `status: fixed` with sprint reference `v0.39`.
- [ ] T12.5 Update `docs/wiki/_machine/findings.json` for each fixed finding.
- [ ] T12.6 Update memory file `project_v0_39_sprint.md` with SHIPPED status.

---

## 4. Acceptance criteria

- [ ] `vercel.json` has a `headers` block with at minimum: `Strict-Transport-Security`,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`.
  Verified via `curl -I` on the deployed preview.
- [ ] `GET /api/search/europeana?q=test` (no Origin header) returns 403.
- [ ] `GET /api/search/europeana?q=test` from a browser (Origin: trusted domain) returns results.
- [ ] `GET /api/proxy?url=http://gallica.bnf.fr/...` returns 400 ("Only HTTPS targets allowed").
- [ ] A redirect chain from an allowlisted host to an un-allowlisted host returns 400 (not the redirect target).
- [ ] Proxy 502 body does not contain URL or hostname details.
- [ ] Starting the auth handler without `AUTH_SECRET` set throws at load time.
- [ ] Starting the server in `NODE_ENV=production` without `API_KEY_PEPPER` throws at load time.
- [ ] 11th key creation for a user with 10 active keys returns 422.
- [ ] POST body > 64 KB to `/api/checkout` returns 413.
- [ ] BL SPARQL query containing `{`, `}`, or `#` has those chars stripped before interpolation.
- [ ] Mexicana `?token=foo&bar=baz` returns 400.
- [ ] `vercel.app` origin check is narrowed: `evil.vercel.app` rejected; `opencite-xyz.vercel.app` accepted.
- [ ] Webhook with no resolvable userId logs a structured warning in Vercel logs.
- [ ] Unknown `metadata.pack` or `metadata.plan` values log a warning and do not crash.
- [ ] All 17 findings marked `status: fixed` in `findings.json`.
- [ ] Full app smoke test: search, sign-in, key creation, pagination — no regressions.

---

## 5. Risk register

| ID | Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | T1 (CSP) | CSP blocks a legitimate resource load (e.g. Stripe.js, Supabase SDK) | Med | Med | Audit the CSP in report-only mode first (`Content-Security-Policy-Report-Only`); switch to enforcement after confirming zero violations in the browser console. |
| R2 | T2 (origin check) | Admin/MCP caller hits the per-source routes from a non-browser context with no Origin header | Low | Med | MCP callers use `/api/search` (the main route), not the per-source shims. If a future automated test hits these routes, add the test origin to TRUSTED_ORIGINS or use a shared secret header. |
| R3 | T10 (rate-limit fallback) | In-process LRU grows on a high-traffic instance before `_local.size > 10_000` GC fires | Low | Low | GC threshold of 10,000 entries. At 60-byte keys + 16-byte values, that is ~800 KB — well within Vercel function memory. |
| R4 | T5 (getSession host pin) | `AUTH_URL` not set in production → `selfHost()` falls back to `TRUSTED_ORIGINS[0]` | Low | Med | Verify `AUTH_URL` is set in Vercel env before merge. Add to `.env.example`. |
| R5 | T7 (PEPPER guard) | `API_KEY_PEPPER` not yet set in production → deploy throws on first crypto import | Med | High | Check the Vercel dashboard BEFORE merging. Set `API_KEY_PEPPER` in production env first. Do NOT rotate an existing pepper — all issued key hashes would become invalid. |
| R6 | T3 (proxy redirect) | Legitimate upstream source issues a 301 (e.g. canonical HTTPS redirect from HTTP) | Low | Low | After T3.1 (scheme enforcement), any `http://` target is blocked at input before a redirect can occur. HTTPS→HTTPS redirects pass through (still allowlist-checked). |
| R7 | T11.1 (CORS tighten) | A team member's personal Vercel fork (non-`opencite*` URL) breaks during testing | Low | Low | Use a preview branch under the `opencite` Vercel project, which will match the regex. |

---

## 6. Definition of done

- [ ] All 17 findings (F-400–F-417, F-509) have a `status: fixed` record in
  `docs/wiki/_machine/findings.json`.
- [ ] Security headers verified via `curl -I` on the deployed preview URL.
- [ ] No regressions on: search, sign-in, Stripe checkout, proxy usage, key management.
- [ ] No inline secrets committed (`.env.example` documents required vars; `.env.local` is
  gitignored and never committed).
- [ ] All code removals (none expected in this sprint) follow the quarantine policy:
  full source copied to `docs/wiki/99-Archive/_quarantine/` before removal.
- [ ] `docs/wiki/09-Audit/Security.md` updated: all finding statuses reflect `fixed`.
- [ ] Sprint memory file `project_v0_39_sprint.md` created in the memory index.

---

## 7. Dependencies

| Dependency | Direction | Notes |
|---|---|---|
| `api/_shared/auth.js` (TRUSTED_ORIGINS) | Read by T2, T5, T11.1 | Single SSOT — changes here affect all callers. Ensure CORS tighten (T11.1) is applied consistently to both `setCorsHeaders` and `requireInternalOrigin`. |
| `API_KEY_PEPPER` env var | T7 | **Must be set in production before T7 merges.** Rotating after issuance invalidates all existing key hashes — this is a one-way operation. |
| `AUTH_URL` / `NEXTAUTH_URL` env var | T5 | Should already be set (Auth.js uses it). Verify in Vercel dashboard. |
| v0.35 / v0.38 (dead adapter removal) | Upstream | v0.38 removed SCIELO/OPENNEURO/ENA from the active adapter registry (quarantine policy). v0.39 is independent of the ranker work in v0.35; no ordering constraint. |
| Stripe secret key rotation | External | F-417's defense-in-depth is only relevant if `STRIPE_SECRET_KEY` is compromised. No key rotation is planned in this sprint — it is a compensating control. |
| Vercel CSP report-only endpoint | Optional | If T1 is risky, deploy CSP in report-only mode first (`Content-Security-Policy-Report-Only`) and monitor for violations before switching to enforcement. |

---

*End v0.39 sprint plan. T1–T12, 18 tasks across 7 workstreams, ~14 hours estimated.
Outcome: all 17 security audit findings closed; no new infra; no DB migrations.*
