---
machine_ids: [api.auth.handler, api.shared.auth, api.shared.apiAuth, api.keys]
findings: [F-401, F-402, F-413, F-414]
runtime: server
status: healthy
tags: [api, auth, oauth, session, api-key, admin]
---
<!-- AUTO-GENERATED from docs/wiki/04-Backend-API/Auth-Sessions.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Auth & Sessions

> Auth.js v5 Google OAuth for human sessions; SHA-256-hashed API keys for machine callers; admin identity derived server-side from an email allowlist.

## What it is

OpenCITE has two authentication surfaces:

1. **Human (browser):** Google OAuth via Auth.js v5. Sessions are stored in Postgres (PrismaAdapter). The session cookie is HTTPOnly, set by Auth.js. The browser accesses protected routes (library, history, settings, checkout, keys) via `credentials: "include"` fetches.

2. **Machine (API key):** SHA-256-hashed keys stored in the `api_keys` table. Machines authenticate to `/api/search` with `x-api-key` header or `?key=` param.

A third identity path — session-admin break-glass — allows the signed-in admin user's browser to call `/api/search` without an API key (used by the v0.33 admin console tools F1/F2).

## Auth.js OAuth handler (`api/auth/handler.js`)

Mounted at `/api/auth/*` via vercel.json rewrite: `{ "source": "/api/auth/:path*", "destination": "/api/auth/handler" }`.

**Runtime:** Node.js (Prisma requires Node; no Edge config exported from this file).

**Provider:** Google OIDC only (`prompt: "select_account"`). Apple and Microsoft Entra ID are stubbed out (commented, `handler.js:37–46`).

**Session shape:** Auth.js default session + `session.user.id = user.id` (the internal Postgres UUID, not the Google sub). This is set in the `session` callback (`handler.js:54–57`) and propagated to all `getSession` callers.

**Redirect guard:** The `redirect` callback (`handler.js:63–66`) allows only relative paths or URLs starting with a `TRUSTED_ORIGINS` entry. This prevents open redirect abuse via the OAuth callback.

**Trusted origins:** `["https://citation.today", "https://opencite.space"]` + `*.vercel.app` subdomains (for preview deployments). Defined in `api/_shared/auth.js:9–12`.

**Node↔Web API bridge:** `api/auth/handler.js:79–122` converts Vercel's `IncomingMessage`/`ServerResponse` into Web `Request`/`Response` for `@auth/core`. Pure Node primitives — no new dependencies.

**Error handling:** Auth handler errors return `500 "Internal auth error"` (plain text, no stack trace, `handler.js:134`).

## `getSession` (`api/_shared/auth.js:36–48`)

Used by all protected routes to resolve the caller's Auth.js session. Makes an internal loopback fetch to `/api/auth/session` with the caller's cookies forwarded.

**Security note (F-401):** The loopback URL is constructed from `x-forwarded-host` / `host` headers:
```js
const host = (req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim();
```
A crafted `host` header could redirect this internal fetch to an arbitrary external host, which would then receive the caller's session cookies. On Vercel, `x-forwarded-host` is set by the platform infrastructure and is not caller-controlled. On self-hosted deployments this is a real risk. Low severity in practice (Vercel managed), but structurally unsafe.

## CORS (`api/_shared/auth.js:18–29`)

`setCorsHeaders(req, res, methods)` sets `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials: true` for requests from `TRUSTED_ORIGINS` or `*.vercel.app`. Wildcard CORS is intentionally avoided for credential-bearing routes (browsers reject `credentials: include` with `*` origin).

Note: `/api/search` sets `Access-Control-Allow-Origin: *` unconditionally (it's a public API — no cookie/credential flow). The search endpoint's CORS is separate from `setCorsHeaders`.

## API key issuance (`api/keys.js`)

**Route:** `GET/POST/DELETE /api/keys` — requires a human session.

- `GET`: returns all keys for the caller (prefix + metadata only, never the hash or plaintext).
- `POST`: calls `generateApiKey()` → returns `{ key, ...publicView }`. The plaintext is returned **exactly once** and never stored. The hash (`hashApiKey(key)`) is persisted as `key_hash`.
- `DELETE ?id=<id>`: `updateMany` with `user_id` scope — a user can only revoke their own keys.

New keys are always created with `plan: free`. Plan elevation happens out-of-band (Stripe webhook → `User.plan` update).

**No rate limit on key creation:** A signed-in user could create many keys in quick succession. There is no limit on the number of active keys per user (`keys.js:50–59`). See F-413.

## API key resolution (`api/_shared/apiAuth.js`)

**Master key path:** `OPENCITE_API_KEY` is compared with `===` at `apiAuth.js:47`. This is a direct string equality check, not `crypto.timingSafeEqual`. A timing oracle exists on the master key — an attacker sending many requests with varying key lengths/prefixes could theoretically measure response time differences. See F-402.

**Customer key path:**
1. `presentedKey(req)` extracts from `x-api-key` header (preferred) or `?key=` param.
2. `hashApiKey(key)` applies SHA-256(pepper + key).
3. `prisma.apiKey.findUnique({ where: { key_hash: hash }, select: {...} })` — constant-time DB lookup (hash is the discriminator; timing at the DB level is irrelevant since the hash is already computed before the query).
4. Checks `row.revoked` — revoked keys return `null` (same as non-existent).
5. `plan` comes from `row.user.plan` (the user's subscription), not the key's own plan field — a tier change applies immediately to all keys.

**Admin flag:** Set when `row.user?.plan === "admin"` OR when the master key is used. Never derived from the request.

## Session-admin break-glass (`api/_shared/apiAuth.js:86–92`)

```js
export async function resolveSessionAdmin(req) {
  if (!ADMIN_EMAILS.length) return null;
  const user = await getSession(req);
  const email = user?.email?.toLowerCase();
  if (!email || !ADMIN_EMAILS.includes(email)) return null;
  return { userId: user.id ?? null, keyId: "session-admin", plan: getPlan("admin"), admin: true };
}
```

This grants admin identity (cost 0, no rate cap, all-tier, `admin:true`) to browser requests carrying a valid Auth.js session from an email in `VITE_ADMIN_EMAILS`. It is called as a fallback in `api/search.js:127` only when `resolveApiKey` returns null. A non-admin or unauthenticated session returns null → the search endpoint remains 401.

The admin email list is read from `VITE_ADMIN_EMAILS || ADMIN_EMAILS` environment variables. If neither is set, `ADMIN_EMAILS` is `[]` and `resolveSessionAdmin` immediately returns null — no accidental open admin path.

## Key/session binding summary

| Caller type | Auth mechanism | Plan source | `admin` flag | Rate limit key |
|---|---|---|---|---|
| Machine API key | `x-api-key` or `?key=` | `User.plan` via DB | `User.plan === "admin"` | `row.id` (key UUID) |
| Master key | `OPENCITE_API_KEY` env | `getPlan("admin")` | always true | `"master"` |
| Admin browser | session cookie | `getPlan("admin")` | always true | `"session-admin"` |
| Anonymous | (none) | n/a | n/a | 401 |

## 🩺 Health audit

- **Verdict:** healthy — the design is correct; two targeted hardening opportunities.
- **Findings:**
  - [F-401] `getSession` loopback URL from unvalidated `x-forwarded-host` (`auth.js:38`).
  - [F-402] Master key compared with `===` not `timingSafeEqual` (`apiAuth.js:47`).
  - [F-413] No limit on API key creation per user (`keys.js:50–59`) — a user could mint many keys (low impact: each key still uses the user's plan quota).
  - [F-414] Auth.js `AUTH_SECRET` env var — if unset or weak, session tokens are trivially forgeable. No validation of its presence/length at startup is visible in handler.js.
- **Reuse:** `getSession` is duplicated in `src/lib/auth-client.js` (client side calls `/api/auth/session` directly) — server and client use structurally identical patterns but are correctly separated by runtime.

## See also

[Shared-Modules](Shared-Modules.md) · [Billing-Credits](../05-Billing/Billing-Credits.md) · [Security](../09-Audit/Security.md) · [Data-Layer](../07-Data-Layer/Data-Layer.md)
