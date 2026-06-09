---
machine_ids: [config.package, config.vite, config.tailwind, config.vercel, scripts.migrate, scripts.admin.probe, scripts.admin.probe-blind-check, scripts.stress.probe, scripts.stress.simple-smoke]
findings: [F-506, F-507, F-508, F-509]
runtime: build
status: healthy
tags: [build, deploy, vercel, vite, tailwind, prisma, scripts, env]
---

# Build & Deploy

> Three-stage build (migrate → Tailwind → Vite), auto-deployed on Vercel; two domains (`citation.today`, `opencite.space`); env vars injected at build time (VITE_*) or runtime (server-only).

## What it is

OpenCITE's build and deploy pipeline is intentionally minimal. Vercel runs `npm run build` on every push to `main` (and preview deploys for PRs). The build script is the single sequence defined in `package.json`.

## package.json scripts

```json
"build": "node scripts/migrate.mjs; npx tailwindcss -i ./src/input.css -o ./public/output.css --minify && vite build"
"dev":   "vite"
"preview": "vite preview"
"postinstall": "npx prisma generate"
```

### Build sequence

1. **`node scripts/migrate.mjs`** — P3005-safe migration runner (always exits 0). See [[07-Data-Layer/Data-Layer#migratejs----p3005-safe-runner]]. Uses `POSTGRES_URL_NON_POOLING` for DDL-safe direct connection.
2. **`npx tailwindcss -i ./src/input.css -o ./public/output.css --minify`** — generates the production CSS bundle into `public/output.css`. The `--minify` flag is applied every build.
3. **`vite build`** — bundles React (`src/main.jsx`) into `dist/` for Vercel's static hosting. Entry is `index.html` which loads `src/main.jsx` and links `/output.css`.

`postinstall` runs `prisma generate` after every `npm install` to regenerate the Prisma client from `prisma/schema.prisma`. This is critical on Vercel: the client must be regenerated for the correct Vercel Postgres binaries.

**Note:** `public/output.css` is committed to the repo (confirmed present via `public/output.css` glob). This is intentional — Vite's static asset serving during `vite dev` requires it, and it allows the HTML to reference `/output.css` directly without a Vite import. The committed file may be stale relative to `src/input.css` for local dev; `npm run build` always regenerates it (F-506). **Fixed v0.40:** a zero-dep `dev:css` npm script (`tailwindcss --watch`) was added — run alongside `npm run dev` to keep `output.css` live during local development.

## Vite config (`vite.config.js`)

Minimal:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()] })
```

No aliases, no manual chunks, no SSR, no proxy. All routing is handled by Vercel rewrites (SPA fallback). Build output goes to `dist/` (Vite default).

## Tailwind config (`tailwind.config.js`)

```js
content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]
theme: { extend: {} }
plugins: []
```

Standard content scan — no custom plugins, no theme extensions. OLED theme is implemented via `data-theme="oled"` CSS attribute overrides in `src/input.css` rather than Tailwind plugin/variant.

## Vercel deploy model (`vercel.json`)

```json
{
  "rewrites": [
    { "source": "/api/auth/:path*",  "destination": "/api/auth/handler" },
    { "source": "/((?!api).*)",       "destination": "/index.html" }
  ]
}
```

Two rewrite rules:
1. `/api/auth/*` → `/api/auth/handler` — collapses all Auth.js callback/session/csrf paths to the single `api/auth/handler.js` serverless function.
2. All non-API paths → `index.html` — SPA fallback for React Router hash-routing.

Vercel infers all `api/*.js` files as serverless functions automatically (no explicit function config required). Auto-deploy on push to `main`. Preview deploys on PRs. Domains: `citation.today` and `opencite.space` (aliases; canonical is `citation.today`).

**Build vs. runtime distinction:** `VITE_*` vars are inlined into the JS bundle at Vite build time. Changing a `VITE_*` var in the Vercel dashboard requires a redeploy to take effect — the old value is baked into the existing bundle. All other server-only vars are read at runtime from the Vercel environment.

## Dependency inventory (package.json)

### Runtime dependencies

| Package | Version | Notes |
|---|---|---|
| `@auth/core` | ^0.37.4 | Auth.js v5 core |
| `@auth/prisma-adapter` | ^2.7.4 | Prisma adapter for Auth.js |
| `@prisma/client` | ^6.6.0 | Prisma client (generated on postinstall) |
| `@vercel/analytics` | ^2.0.1 | Vercel Web Analytics |
| `@vercel/speed-insights` | ^2.0.0 | Core Web Vitals tracking |
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | DOM renderer |
| `stripe` | ^17.0.0 | Stripe SDK (billing, webhooks) |

### Dev dependencies

| Package | Version | Notes |
|---|---|---|
| `@vitejs/plugin-react` | ^4.3.1 | Babel-based React transform |
| `prisma` | ^6.6.0 | CLI for generate/migrate |
| `tailwindcss` | ^3.4.1 | CSS framework (CLI build) |
| `vite` | ^5.4.0 | Bundler |

**Observation:** no test framework, no linter, no TypeScript. No `@types/*` in dev deps. The project runs pure JS. No dead deps detected — all listed packages are actively used (`stripe` in `api/checkout.js` and `api/stripe/webhook.js`; `@vercel/analytics` and `@vercel/speed-insights` in `src/main.jsx` or layout).

**Version drift risk:** ~~`@auth/core ^0.37.4` and `@auth/prisma-adapter ^2.7.4` are pegged to minor ranges; Auth.js v5 has had breaking changes between minors. The `^` range allows auto-upgrades on `npm install`~~ (F-507). **Fixed v0.40:** both pinned to exact lock-resolved versions (`@auth/core 0.37.4`, `@auth/prisma-adapter 2.11.2`); `package-lock.json` committed; `.github/dependabot.yml` watches `@auth/*` and `@modelcontextprotocol/*`.

## Env var inventory

All vars referenced across config and the codebase. Grouped by consumer.

### Prisma / database

| Var | Required | Consumer | Notes |
|---|---|---|---|
| `POSTGRES_PRISMA_URL` | **yes** | `prisma/schema.prisma` | pgBouncer pooler (port 6543); runtime queries. Append `?pgbouncer=true` |
| `POSTGRES_URL_NON_POOLING` | **yes** | `prisma/schema.prisma`, `scripts/migrate.mjs` | Direct connection (port 5432); migrations only |

~~**Gap:** `.env.example` documents `DATABASE_URL` and `DIRECT_URL` (old Supabase naming), but `prisma/schema.prisma` references `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING` (Vercel Postgres naming). These are the same connection strings — but the `.env.example` naming does not match the actual schema env keys. Developers following `.env.example` verbatim will get a Prisma error~~ (F-508). **Fixed v0.40:** `.env.example` now uses `POSTGRES_PRISMA_URL`/`POSTGRES_URL_NON_POOLING` with comments naming the readers; all `api/` `process.env` vars verified documented.

### Auth.js / OAuth

| Var | Required | Consumer | Notes |
|---|---|---|---|
| `AUTH_SECRET` | **yes** | `api/auth/handler.js:21` | Session signing secret |
| `AUTH_GOOGLE_ID` | **yes** | `api/auth/handler.js:28` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | **yes** | `api/auth/handler.js:29` | Google OAuth client secret |
| `AUTH_APPLE_ID` | no | `handler.js:37` (commented out) | Apple OAuth — disabled |
| `AUTH_APPLE_SECRET` | no | `handler.js:37` (commented out) | Apple OAuth — disabled |
| `AUTH_MICROSOFT_ENTRA_ID` | no | `handler.js:42` (commented out) | Microsoft — disabled |
| `AUTH_MICROSOFT_ENTRA_SECRET` | no | `handler.js:43` (commented out) | Microsoft — disabled |
| `AUTH_MICROSOFT_ENTRA_TENANT_ID` | no | `handler.js:44` (commented out) | Microsoft — disabled |

### Billing (Stripe)

| Var | Required | Consumer | Notes |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | yes (billing) | `api/checkout.js:79`, `api/stripe/webhook.js:78` | 503 if absent (checkout disabled) |
| `STRIPE_WEBHOOK_SECRET` | yes (billing) | `api/stripe/webhook.js:79` | Webhook signature verification |

### API / admin

| Var | Required | Consumer | Notes |
|---|---|---|---|
| `OPENCITE_API_KEY` | yes (production) | `api/_shared/apiAuth.js:46` | Master API key — grants admin identity. Also used by `scripts/stress/simple_smoke.mjs` as a local override. |
| `VITE_ADMIN_EMAILS` | **yes** | `src/lib/admin.js:3` (client), `api/_shared/apiAuth.js:29` (server) | Comma-separated admin email allowlist. **Build-time baked** for client; runtime for server. Requires redeploy to change client-side gate. |
| `ADMIN_EMAILS` | no | `api/_shared/apiAuth.js:29` | Server-only fallback for `VITE_ADMIN_EMAILS` (allows server gate without Vite prefix). |
| `OPENCITE_MAILTO` | no | `api/search.js:207` | Default mailto for Crossref polite pool when not supplied by caller |

### Encryption

| Var | Required | Consumer | Notes |
|---|---|---|---|
| `SETTINGS_ENCRYPTION_KEY` | yes (settings write) | `api/_shared/crypto.js:22` | 64-char hex → 32-byte AES-256-GCM key for `users.settings` blob |
| `API_KEY_PEPPER` | yes (key hashing) | `api/_shared/crypto.js:69` | Pepper prepended before SHA-256 hashing of API keys. If unset, defaults to `""` — weak hash |

### Third-party source keys (backend-only, v0.34)

| Var | Required | Consumer | Notes |
|---|---|---|---|
| `EUROPEANA_API_KEY` | no | `api/_shared/serverKeys.js:10` | Auto-drops Europeana from eligibility if absent |
| `DPLA_API_KEY` | no | `api/_shared/serverKeys.js:11` | Auto-drops DPLA if absent |
| `SMITHSONIAN_API_KEY` | no | `api/_shared/serverKeys.js:12` | Auto-drops Smithsonian if absent |

### KV / rate-limit (Upstash)

| Var | Required | Consumer | Notes |
|---|---|---|---|
| `KV_REST_API_URL` | no | `api/_shared/kv.js:18` | Upstash Redis URL; rate-limit fail-open if absent |
| `KV_REST_API_TOKEN` | no | `api/_shared/kv.js:19` | Upstash token |
| `UPSTASH_REDIS_REST_URL` | no | `api/_shared/kv.js:18` | Alternate naming (fallback) |
| `UPSTASH_REDIS_REST_TOKEN` | no | `api/_shared/kv.js:19` | Alternate naming (fallback) |

### MCP server (standalone package, set in MCP client config)

| Var | Default | Notes |
|---|---|---|
| `OPENCITE_API_KEY` | unset | Forwarded as `x-api-key`; optional until billing gates anon callers |
| `OPENCITE_API_BASE_URL` | `https://citation.today` | Endpoint override; TLS enforced |

### Scripts (not in .env.example — set manually in shell)

| Var | Script | Purpose |
|---|---|---|
| `BASE` | `scripts/admin/probe.mjs`, `scripts/admin/probe-blind-check.mjs`, `scripts/stress/probe.mjs` | Override API endpoint |
| `OPENCITE_ADMIN_KEY` | `scripts/admin/probe.mjs` | Plaintext admin key (REQUIRED) |
| `OPENCITE_TEST_KEY` | `scripts/admin/probe-blind-check.mjs` | Plaintext non-admin key (REQUIRED) |
| `API_KEY_PEPPER` | key generation commands in `scripts/admin/README.md` | Must match Vercel env |

**Undocumented-in-.env.example vars (required in production):** `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `OPENCITE_API_KEY`, `VITE_ADMIN_EMAILS`, `SETTINGS_ENCRYPTION_KEY`, `API_KEY_PEPPER`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

## Admin probe scripts

### `scripts/admin/probe.mjs`

Drives `/api/search` with an admin key and `?debug=1`. Prints a formatted table of the origin-revealing envelope: per-adapter breakdown (id, ms, candidates, errored), dedup trace (raw → afterDoi → afterTitle), coverage internals, and ranked results with `source` visible.

`--assert-admin` flag: exits 1 if the admin debug envelope did not materialize. Useful as a CI smoke check for the admin path. Requires `OPENCITE_ADMIN_KEY` env var.

### `scripts/admin/probe-blind-check.mjs`

**Critical regression guardrail.** Sends `?debug=1` with a **non-admin** key. Asserts two invariants:
- `(a)` `meta.debug` is absent in the response.
- `(b)` No result card carries a `source` field.

Exits 0 (PASS) or 1 (FAIL) with precise leak description. Must pass before any v0.32+ deployment. Requires `OPENCITE_TEST_KEY`.

### `scripts/stress/probe.mjs`

Public endpoint stress/quality probe. No auth required. Infers adapter origin from public fields (origin-blind API — heuristic only). Outputs a compact JSON line per query: `{q, http, coverage, count, cand, tookMs, wallMs, lowConf, results[]}`. Used by search-quality runs (see `search_quality_stress_plan.md`).

### `scripts/stress/simple_smoke.mjs`

Local smoke test for the `?simple=1` diagnostic mode (v0.36). Imports `api/search.js` in-process with a mock req/res. Sets `OPENCITE_API_KEY` locally to get admin identity. Exercises both simple and prod modes, asserts T1.3 invariants. **Requires no Vercel or Supabase** — runs against the local adapter set. Bit-rot risk: if `api/search.js` handler signature changes, the mock req shape may break.

**Script validity:** all four scripts are current as of v0.36. `probe.mjs` and `probe-blind-check.mjs` are live-endpoint tests (need real keys). `simple_smoke.mjs` runs locally but imports the full server handler with adapters — Node.js v18+ required.

## CSS pipeline

`src/input.css` → Tailwind CLI → `public/output.css` (minified, committed). `index.html` links `/output.css` as a static asset. Vite does not process `output.css` through its pipeline — it is served as-is from `public/`. This means:

- `output.css` is committed and can become stale between commits.
- Local dev (`vite dev`) serves the committed file; it does not hot-reload on `input.css` changes unless `tailwindcss --watch` is also run.
- Build always regenerates it correctly.

## 🩺 Health audit

- **Verdict:** healthy overall; two env-doc gaps and one version-drift risk.
- **Findings:**
  - [F-506] `public/output.css` is committed — stale during local dev unless `tailwindcss --watch` is run alongside `vite`. **Fixed v0.40:** `dev:css` npm script added (`tailwindcss --watch`); run alongside `npm run dev`.
  - [F-507] `@auth/core ^0.37.4` and `@auth/prisma-adapter ^2.7.4` use `^` semver; Auth.js v5 minor releases have historically broken the adapter interface. **Fixed v0.40:** pinned to exact versions (`0.37.4` / `2.11.2`); `package-lock.json` committed; Dependabot watches `@auth/*` + `@modelcontextprotocol/*`.
  - [F-508] `.env.example` documents `DATABASE_URL`/`DIRECT_URL` but `prisma/schema.prisma` reads `POSTGRES_PRISMA_URL`/`POSTGRES_URL_NON_POOLING`. Docs and code are mismatched — a developer following `.env.example` will get a Prisma env error. **Fixed v0.40:** `.env.example` updated to use correct Vercel Postgres key names with reader comments; all `api/` env vars verified documented.
  - [F-509] `API_KEY_PEPPER` defaults to `""` if unset (`api/_shared/crypto.js:69`). An unset pepper makes the SHA-256 hash effectively a single-factor hash with no pepper protection. The prod Vercel env must set this; there is no guard that fails startup if it's missing.
- **Smells:** no test runner in `package.json` scripts. The only automated assertions are the probe scripts (live-endpoint or in-process). `OPENCITE_MAILTO` is undocumented in `.env.example`.

## See also

[[07-Data-Layer/Data-Layer]] · [[06-MCP-Server/MCP-Server]] · [[04-Backend-API/Search-Endpoint]] · [[home]]
