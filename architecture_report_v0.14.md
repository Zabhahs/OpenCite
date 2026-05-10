# OpenCITE — Architecture Report

> Written for the next Claude instance picking up this project.
> Read this before touching any code.
> Last updated: v0.14b — Phase 1 Identity & Sync (pre-push final)

---

## What this project is

OpenCITE is a free meta-search engine for open-access scholarly databases. It searches multiple academic APIs in parallel and returns results with MLA 9 and APA 7 citations ready to paste. Deployed on Vercel. Built by Shahbaz Yusuf (baazijan).

The long-term direction is `citation.today` — a monetised, tiered platform with human (Stripe) and autonomous agent (Base L2) billing. That's Phase 2–6 work. **Phase 1 is now complete.**

---

## Sprint history

### v.12 — Bug fixes + proxy architecture

Three broken adapters fixed:

| Adapter | Bug | Fix |
|-|-|-|
| OpenContext | Wrong endpoint (`/query/.json` returns HTML) | Corrected to `/sets/.json` + proxied for UA injection |
| Princeton DPUL | CORS — `Failed to fetch`, no status code | Routed through Vercel proxy |
| PANGAEA | `Untitled` on all results — wrong field names | Mapped to real panFMP schema: `sf-authortitle`, `agg-author`, `agg-pubYear`, `URI` |

**`api/proxy.js`** — Vercel Edge Runtime CORS proxy. Domain allowlist. Browser UA spoofing for legacy scholarly APIs. Forwards GET and POST.

**`proxiedFetch()`** — SSOT helper in `src/adapters/_shared/proxy.js`.

### v.13 — Full modular refactor

`App.jsx` went from **2933 lines → 208 lines**. Everything extracted into 35 files across 8 layers. Full SSOT enforcement pass completed post-refactor.

### v.0.14 — Phase 1: Identity & Sync (current)

Auth.js v5 + Supabase + Prisma. Cross-device sync for signed-in users. Anonymous users unaffected. See `v0.14_phase1_alpha_technical_doc.md` for full detail.

**Post-doc amendments (pre-push final):**

- `[...auth].js` — Google-only active provider for alpha launch. Apple and Microsoft commented out pending credential setup. `prompt: "select_account"` added to force Google account picker. Redirect guard added — callbacks restricted to `citation.today` and `opencite.space` only. Apple and Microsoft callback URLs documented inline for when they are re-enabled.
- `Layout.jsx` — Inactive providers (Apple, Microsoft) render as non-interactive `div` elements with `— soon` label. Stone-400 muted style, `cursor-default`, `select-none`. Google renders as normal interactive button. `PROVIDERS` array now carries `active: boolean` field.
- **Production domains confirmed:** `citation.today` and `opencite.space`. All OAuth callbacks, redirect guards, and Auth.js config reference these two domains only. No other domains are trusted.
- **Google OAuth setup required before first sign-in** — Google Cloud Console steps: create project → OAuth consent screen (External/Audience) → create Web Application credentials → register both callback URIs → paste `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` into Vercel dashboard.

**Google Console callback URIs to register:**
```
https://citation.today/api/auth/callback/google
https://opencite.space/api/auth/callback/google
```

**Apple callback URIs (register when re-enabling):**
```
https://citation.today/api/auth/callback/apple
https://opencite.space/api/auth/callback/apple
```

**Microsoft callback URIs (register when re-enabling):**
```
https://citation.today/api/auth/callback/microsoft-entra-id
https://opencite.space/api/auth/callback/microsoft-entra-id
```

---

## Current file structure

```
opencite/
├── api/
│   ├── proxy.js                          ← Edge Runtime CORS proxy (10-domain allowlist)
│   ├── history.js                        ← Node.js — search history CRUD (Phase 1)
│   ├── library.js                        ← Node.js — library items CRUD (Phase 1)
│   └── auth/
│       └── [...auth].js                  ← Node.js — Auth.js v5 OIDC handler (Phase 1)
│
├── prisma/
│   └── schema.prisma                     ← Supabase PostgreSQL schema (Phase 1)
│
├── src/
│   ├── App.jsx                           ← thin orchestrator: providers + layout + wiring
│   ├── adapters/
│   │   ├── _shared/
│   │   │   ├── base.js                   ← AbstractAdapter + sanitize() DataMappingGuard
│   │   │   ├── parseOpenAlex.js          ← shared OpenAlex result parser
│   │   │   └── proxy.js                  ← proxiedFetch() SSOT
│   │   ├── core/
│   │   │   ├── doaj.js
│   │   │   ├── openalex.js
│   │   │   ├── crossref.js
│   │   │   └── curatedJournals.js
│   │   ├── extensions/
│   │   │   ├── semanticScholar.js
│   │   │   └── index.js                  ← 16 remaining extensions (barrel)
│   │   └── index.js                      ← ADAPTERS registry + runSearch() wrapper
│   ├── components/
│   │   ├── launchers/
│   │   │   └── LauncherBlock.jsx
│   │   ├── layout/
│   │   │   └── Layout.jsx                ← Header, ThemeStrip, Footer, ConnectCard
│   │   │                                    + AuthButton + sync tooltip + Ko-fi (Phase 1)
│   │   ├── panels/
│   │   │   └── Panels.jsx
│   │   └── search/
│   │       ├── ResultCard.jsx
│   │       ├── SearchInput.jsx
│   │       └── SourceSection.jsx
│   ├── constants/
│   │   ├── defaults.js                   ← STORAGE_NS, HISTORY_MAX, INITIAL_PAGE_SIZE,
│   │   │                                    LOAD_MORE_PAGE_SIZE, REGION_ORDER,
│   │   │                                    DEFAULT_CURATED_JOURNALS, DEFAULT_SETTINGS
│   │   ├── themes.js                     ← THEMES, DEFAULT_THEME
│   │   └── vocabulary.js                 ← TAG_VOCAB, ADAPTER_CATEGORY
│   ├── contexts/
│   │   ├── AuthContext.jsx               ← LIVE (Phase 1) — useAuth(), AuthProvider
│   │   ├── BillingContext.jsx            ← STUB — Phase 3/4 hook point
│   │   └── SettingsContext.jsx           ← live, wraps useSettings
│   ├── hooks/
│   │   ├── useHistory.js                 ← auth-aware: DB (signed-in) / localStorage (anon)
│   │   ├── useLibrary.js                 ← auth-aware: DB (signed-in) / localStorage (anon)
│   │   ├── useSearch.js                  ← search orchestration, parallel fetches, pagination
│   │   ├── useSettings.js                ← settings state, localStorage persistence
│   │   └── useTheme.js
│   ├── launchers/
│   │   ├── _factory.js                   ← createLauncher()
│   │   └── index.js                      ← all 23 launchers
│   └── lib/
│       ├── auth-client.js                ← getSession / signIn / signOut (Phase 1)
│       ├── citations.js                  ← buildMLA, buildAPA, segmentsToPlain
│       ├── helpers.js                    ← reconstructAbstract, truncate, stripHtml
│       ├── history.js                    ← history{} localStorage manager
│       ├── library.js                    ← library{} localStorage manager + libraryKey()
│       └── storage.js                    ← localStorage SSOT
│
├── .env.example                          ← all Phase 1 vars documented
└── package.json                          ← includes @auth/core, @auth/prisma-adapter,
                                             @prisma/client, prisma
```

---

## Key architectural concepts

### AbstractAdapter.sanitize()

Every search result passes through `AbstractAdapter.sanitize()` in `adapters/index.js` before reaching the UI. Prevents `.trim()` runtime errors on null/undefined upstream fields. Runs in `runSearch()` — not in individual adapter files.

### runSearch()

`adapters/index.js` exports `runSearch(adapter, query, settings, opts)`. Single chokepoint for all upstream data. **Phase 2 credit deduction goes here.** Adapter files never know about billing.

### Auth layer (Phase 1)

`AuthContext.jsx` is now live. Provider tree in `App.jsx`:

```jsx
<AuthProvider>
  <BillingProvider>
    <OpenCITE />
  </BillingProvider>
</AuthProvider>
```

`useAuth()` returns `{ user, status, signIn, signOut }`. `user.id` is the Supabase `internal_id` UUID. `BillingContext` reads `user.id` when Phase 3 ships.

### Sync architecture

Writes to DB are fire-and-forget — UI never waits on a network call. localStorage is always written in parallel for offline resilience. DB reads happen once on `load()`, result cached in hook state. No polling.

### Proxy runtimes

Two runtimes coexist in `api/` — Vercel resolves runtime per file:

| File | Runtime | Why |
|---|---|---|
| `api/proxy.js` | Edge | Low-latency, UA spoofing |
| `api/auth/[...auth].js` | Node.js | Prisma requires Node.js |
| `api/history.js` | Node.js | Prisma |
| `api/library.js` | Node.js | Prisma |

### Dependency rule

`constants → lib → adapters/_shared → adapters/* → launchers → contexts → hooks → components → App.jsx`

Never import upward in this chain.

### Components directory

**Flat** — baazijan's preference. All component files live directly in `src/components/`, not in subdirectories. Do not reorganise unless asked.

---

## Proxy — how it works

`api/proxy.js` — Vercel Edge Runtime. Call via:

```
GET  /api/proxy?url=<encoded-upstream-url>
POST /api/proxy?url=<encoded-upstream-url>&method=POST
```

Current `ALLOWED_DOMAINS` (10 domains):
- `dpul.princeton.edu`
- `ws.pangaea.de`
- `opencontext.org`
- `api.dc.library.northwestern.edu`
- `openneuro.org`
- `www.ebi.ac.uk`
- `eutils.ncbi.nlm.nih.gov`
- `api.dp.la`
- `gallica.bnf.fr`
- `www.iberoamericadigital.net`
- `accounts.google.com` ← Phase 1
- `appleid.apple.com` ← Phase 1
- `login.microsoftonline.com` ← Phase 1

Injects browser UA (Chrome/Windows) for legacy scholarly APIs. Adds `Access-Control-Allow-Origin: *` and `X-Content-Type-Options: nosniff` on all responses.

---

## Known deviations from original plan

1. **`adapters/extensions/index.js`** — 16 extensions in one barrel. `semanticScholar.js` only extension with its own file. Split if count grows.
2. **`components/panels/Panels.jsx`** and **`components/layout/Layout.jsx`** — barrel files. Baazijan has accepted. Do not split unless asked.
3. **No `prisma migrate` history** — Phase 1 schema applied directly via Supabase SQL Editor (fresh instance, no migration files in repo). Begin using `prisma migrate dev` from Phase 2 onwards for incremental schema changes.
4. **No `postinstall` script yet** — if Vercel deploy fails with `PrismaClient not found`, add `"postinstall": "prisma generate"` to `package.json` scripts.
5. **Google-only auth at launch** — Apple and Microsoft providers are implemented but commented out in `[...auth].js`. Re-enable by uncommenting providers, adding env vars to Vercel, and registering callback URIs in respective developer consoles.
6. **OAuth is free** — Google OAuth has no cost for standard sign-in use at any scale.

---

## Roadmap

### Phase 2 — Rate Limiting & Credits (next up)

- Provision Vercel KV (Redis)
- Leaky-bucket rate limiter in `middleware.ts` (Vercel Edge Runtime)
- Credit deduction per search → hook point: `runSearch()` in `adapters/index.js`
- Inject `X-Attribution-Required` header for agent requests
- Return structured 429 with `credits_remaining` in body
- Hook point: `src/contexts/BillingContext.jsx` — replace stub with real KV balance

### Phase 3 — Monetisation (Human / Stripe)

- Stripe products: Starter ($2.99/mo, 150 searches), Pro ($9.99/mo, 1000 searches)
- Stripe webhook → update `users.total_credits` in Supabase on `invoice.paid`
- Upgrade/downgrade UI + Stripe customer portal
- Hook column: `users.stripe_customer_id` already in schema

### Phase 4 — Monetisation (Agent / Base L2)

- SIWE (Sign-In with Ethereum) — hook point in `api/auth/[...auth].js` and `AuthContext.jsx`
- Chainlink Price Feeds → per-search USD cost in ETH
- Base L2 listener → credit top-up on payment detected
- Hook column: `users.agent_wallet_address` already in schema

### Phase 5 — Telemetry

- Buffer logs in Vercel KV, batch-write to Supabase JSONB every 60 minutes
- Hook columns: `meta JSONB` on `search_history` and `library_items` already in schema
- Privacy notice update

### Phase 6 — Native API + Mobile

- `/api/search` — authenticated, rate-limited, normalised JSON
- OpenAPI spec
- iOS + Android (React Native vs native wrappers)
- Adapters are pure JS — importable directly into any Node.js context

---

## Known backlog

- `adapters/extensions/index.js` — split into 16 individual files if codebase grows
- OpenContext UA-block: confirm whether browser direct fetch works; if so, remove from proxy
- PANGAEA OAI-PMH: future "get full citation by DOI" feature
- Cloudflare Workers migration if Vercel invocation limits hit (free tier: 100k/month)
- Next.js migration (full stack target per XML blueprint)
- Add `"postinstall": "prisma generate"` to `package.json` if Vercel deploy fails on Prisma import
- Begin `prisma migrate dev` workflow from Phase 2 onwards
- Re-enable Apple sign-in: requires .p8 private key, Services ID, Team ID from Apple Developer portal
- Re-enable Microsoft sign-in: requires App registration in Azure Portal
- Add `"postinstall": "prisma generate"` to `package.json` if Vercel deploy fails on Prisma import

---

## Vercel infrastructure

### Edge proxy (`api/proxy.js`)
Resolves CORS blocks for scholarly APIs. Edge Runtime for low latency. Browser UA spoofing for legacy servers (BDPI, Gallica). Strict domain allowlist prevents open relay.

### Static assets (`/public`)
All PWA assets (manifest, favicons) and `robots.txt` in `/public`. Served at domain root by Vite/Vercel.

### Tailwind build
Offloaded to Vercel CI — circumvents Windows execution policy restrictions. `package.json` build script runs `npx tailwindcss` to generate minified `output.css` in `/public`. `index.html` links to `/output.css` (not Play CDN).

### Supabase integration
Linked via Vercel marketplace. `DATABASE_URL` and `DIRECT_URL` auto-injected into all Vercel environments.

---

## Tone note

Baazijan refers to himself as "baazijan" in conversation. He moves fast and expects precise execution. Mode C (planning) before large tasks, Mode B (fast path) for small ones. Never pad responses. When in doubt, ask one specific question rather than guessing.
