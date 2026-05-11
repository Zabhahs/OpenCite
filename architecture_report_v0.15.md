# OpenCITE — Architecture Report

> Written for the next Claude instance picking up this project.
> Read this before touching any code.
> Last updated: v0.15b — UI hardening + Phase 1 bug fixes + pre-Phase 2 sprint backlog

---

## What this project is

OpenCITE is a free meta-search engine for open-access scholarly databases. Searches multiple academic APIs in parallel, returns results with MLA 9 and APA 7 citations ready to paste. Deployed on Vercel. Built by Shahbaz Yusuf (baazijan).

Long-term direction: `citation.today` — monetised tiered platform with human (Stripe) and agent (Base L2) billing. Phase 1 complete. Phase 2 is next.

---

## Sprint history

### v.12 — Bug fixes + proxy architecture

| Adapter | Bug | Fix |
|-|-|-|
| OpenContext | Wrong endpoint | Corrected to `/sets/.json` + proxied |
| Princeton DPUL | CORS block | Routed through Vercel proxy |
| PANGAEA | `Untitled` on all results | Mapped to real panFMP schema fields |

`api/proxy.js` — Vercel Edge Runtime CORS proxy. Domain allowlist. Browser UA spoofing. `proxiedFetch()` SSOT in `src/adapters/_shared/proxy.js`.

### v.13 — Full modular refactor

`App.jsx` 2933 lines → 208 lines. Extracted into 35 files across 8 layers. Full SSOT enforcement.

### v.14 — Phase 1: Identity & Sync

Auth.js v5 + Supabase + Prisma. Google OAuth (only active provider). Cross-device sync for signed-in users. Anonymous users unaffected.

Google-only at launch. Apple and Microsoft commented out pending credential setup. Callback URIs:
```
https://citation.today/api/auth/callback/google
https://opencite.space/api/auth/callback/google
```

### v.15 — UI hardening + Phase 1 bug fixes (current)

**Phase 1 critical fixes:**
- `prisma/schema.prisma` — `search_history` and `library_items` were created in Supabase via raw SQL but were never in the schema file. Prisma Client generated from schema only — both API routes crashed silently at runtime. Models added; `postinstall: npx prisma generate` regenerates client on deploy.
- `api/history.js` — removed dead `import { Auth } from "@auth/core"`.

**UI changes:**
- App identity SSOT (`src/constants/app.js`)
- Logo click resets to homepage
- Sticky frosted search bar
- Faravahar eagle branding (blend/shadow via CSS vars)
- Adapter badge ticker (CSS marquee)
- Cycling search placeholder
- Citation cards collapsed by default
- Full text-overflow protection on result cards
- Three-theme system (cream / blue-grey / OLED); removed red/porphyry
- OS `prefers-color-scheme` auto-detection with manual override
- Sticky search bar fully opaque (no visual confusion)

---

## Current file structure

```
opencite/
├── api/
│   ├── proxy.js                          ← Edge Runtime CORS proxy (13-domain allowlist)
│   ├── history.js                        ← Node.js — search history CRUD
│   ├── library.js                        ← Node.js — library items CRUD
│   └── auth/
│       └── [...auth].js                  ← Node.js — Auth.js v5 OIDC handler
│
├── prisma/
│   └── schema.prisma                     ← Supabase PostgreSQL schema (includes
│                                            search_history + library_items — added v.15)
│
├── src/
│   ├── App.jsx                           ← thin orchestrator; owns all global CSS animations
│   ├── adapters/
│   │   ├── _shared/
│   │   │   ├── base.js                   ← AbstractAdapter + sanitize()
│   │   │   ├── normalize.js              ← normalizeRecord(), createDedupMap(), parseAuthors()
│   │   │   ├── parseOpenAlex.js          ← shared OpenAlex parser
│   │   │   └── proxy.js                  ← proxiedFetch() SSOT
│   │   ├── core/
│   │   │   ├── doaj.js
│   │   │   ├── openalex.js
│   │   │   ├── crossref.js
│   │   │   └── curatedJournals.js
│   │   ├── extensions/
│   │   │   ├── semanticScholar.js
│   │   │   └── index.js                  ← 16 extensions (barrel)
│   │   └── index.js                      ← ADAPTERS registry + runSearch()
│   ├── components/
│   │   ├── Layout.jsx                    ← Header (eagle + ticker + AuthButton),
│   │   │                                    ThemeStrip, Footer, ConnectCard, KofiOverlay
│   │   ├── LauncherBlock.jsx
│   │   ├── Panels.jsx
│   │   ├── ResultCard.jsx                ← citations collapsed by default; break-words
│   │   ├── SearchInput.jsx               ← sticky; cycling placeholder; opaque bg
│   │   └── SourceSection.jsx
│   ├── constants/
│   │   ├── app.js                        ← [NEW v.15] SSOT: APP_VERSION, APP_NAME,
│   │   │                                    SEARCH_PLACEHOLDER_ITEMS
│   │   ├── defaults.js
│   │   ├── themes.js                     ← 3 themes: tan, blueGrey, oled
│   │   └── vocabulary.js
│   ├── contexts/
│   │   ├── AuthContext.jsx               ← live — useAuth(), AuthProvider
│   │   ├── BillingContext.jsx            ← STUB — Phase 3/4
│   │   └── SettingsContext.jsx
│   ├── hooks/
│   │   ├── useHistory.js
│   │   ├── useLibrary.js
│   │   ├── useSearch.js                  ← + reset() export (v.15)
│   │   ├── useSettings.js
│   │   └── useTheme.js                   ← prefers-color-scheme auto-detect (v.15)
│   ├── launchers/
│   │   ├── _factory.js
│   │   └── index.js                      ← 23 launchers
│   └── lib/
│       ├── auth-client.js
│       ├── citations.js                  ← buildMLA, buildAPA, buildCSL, buildBibTeX,
│       │                                    buildRIS, exportAs, segmentsToPlain
│       ├── helpers.js
│       ├── history.js
│       ├── library.js
│       └── storage.js
│
├── public/
│   └── android-chrome-512x512.png        ← Faravahar eagle (used in Header + result cards)
│
├── .env.example
└── package.json
```

---

## Key architectural concepts

### AbstractAdapter.sanitize() + normalizeRecord()

Every result passes through `AbstractAdapter.sanitize()` (null safety) then `normalizeRecord()` (type canonicalisation, author parsing, dedup) in `runSearch()`. Neither runs in individual adapter files. `normalizeRecord()` is idempotent — re-running on an already-normalised record returns it unchanged (`_normalized` sentinel).

**Important:** library items loaded from the DB are stripped of NCR fields (`_type`, `_authorsParsed`). Any code that calls `buildBibTeX/buildRIS/buildCSL` on a library item must re-normalise first:
```js
import { AbstractAdapter } from "../adapters/_shared/base.js";
import { normalizeRecord, createDedupMap } from "../adapters/_shared/normalize.js";
const toNCR = (item) => item._normalized ? item :
  normalizeRecord(AbstractAdapter.sanitize(item), item.source || 'unknown', createDedupMap());
```

### runSearch()

`adapters/index.js` exports `runSearch(adapter, query, settings, opts)`. Single chokepoint. Phase 2 credit deduction and KV cache go here.

### reset()

`useSearch.js` exports `reset()` — the only correct way to return to the pre-search landing state. Sets `hasSearched: false`, clears `sectionStates`. Called by `handleLogoClick` in `App.jsx`. Do not set `hasSearched` directly from components.

### Auth layer

`AuthProvider` must wrap the `App` root. Without it `status` stays `"loading"` and `AuthButton` returns `null` silently. Current provider tree (note: `BillingProvider` not yet mounted — add at Phase 2):
```jsx
<AuthProvider>
  <KofiOverlay />
  <OpenCITE />
  <Analytics />
  <SpeedInsights />
</AuthProvider>
```

### App identity SSOT

`src/constants/app.js` owns `APP_VERSION`, `APP_NAME`, `SEARCH_PLACEHOLDER_ITEMS`. To bump the version edit only this file. Consumed by `Layout.jsx` and `SearchInput.jsx`. **Import path is `../constants/app.js` from inside `src/components/` — not `../app.js`.** (Build failed once with wrong path.)

### Theme system

Three themes only: `tan` (cream, default), `blueGrey`, `oled`. Each carries extra properties vs v.14:

| Property | Purpose |
|---|---|
| `eagleBlend` | `mix-blend-mode` for the eagle image — `multiply` on light, `screen` on OLED |
| `eagleShadow` | `drop-shadow()` value — strong on cream (bird gets lost), none on OLED |
| `stickyBg` | Fully opaque sticky search bar background |

These are exposed as CSS vars `--ui-eagle-blend`, `--ui-eagle-shadow`, `--ui-sticky-bg` on the root div in `App.jsx`. The eagle image uses class `eagle-header` (defined in `App.jsx` `<style>` block) which reads these vars. Do not set `mix-blend-mode` or `filter` inline on the eagle element.

### useTheme — OS auto-detection

`useTheme()` takes **no arguments** (removed `savedKey` param — breaking change vs v.14). Reads `localStorage.getItem("themeKey")` internally. Falls back to `prefers-color-scheme`: dark → `oled`, light → `tan`. Live `MediaQueryList` listener updates theme if OS changes and no manual preference is stored. Manual ThemeStrip pick writes to localStorage and locks preference permanently until user picks again.

### Global CSS animations

All keyframes live in the `<style>` block inside `App.jsx`. Do not add `<style>` tags in component files. Current animations: `fade`, `pulse`, `ticker`, `eagle-shake`, `eagle-appear`, `eagle-float`.

### Sticky search z-index stack

| Layer | z-index |
|---|---|
| Grain overlay | 1 |
| Page content | 2 |
| Sticky search bar | 20 |
| Auth dropdowns | 50 |

Do not assign values between 20 and 50 to new elements without checking this stack.

### Sync architecture

Fire-and-forget DB writes. localStorage always written in parallel (offline resilience). DB read once on `load()`, cached in hook state. No polling.

### Proxy runtimes

| File | Runtime | Why |
|---|---|---|
| `api/proxy.js` | Edge | Low-latency, UA spoofing |
| `api/auth/[...auth].js` | Node.js | Prisma |
| `api/history.js` | Node.js | Prisma |
| `api/library.js` | Node.js | Prisma |

### Dependency rule

`constants → lib → adapters/_shared → adapters/* → launchers → contexts → hooks → components → App.jsx`

Never import upward. Components may import from adapters/_shared (e.g. `toNCR` pattern).

### Components directory

Flat — all files directly in `src/components/`. Same for `src/hooks/`. Do not reorganise into subdirectories.

---

## Prisma schema — v.15 additions

`search_history` and `library_items` were missing from the schema in v.14 (tables existed in Supabase via raw SQL but Prisma Client had no knowledge of them — both API routes crashed). Added in v.15:

```prisma
model search_history {
  id      String @id @default(uuid())
  user_id String
  query   String
  ts      BigInt                          // Date.now() — exceeds Int range
  user    User   @relation(fields: [user_id], references: [internal_id], onDelete: Cascade)
  @@unique([user_id, query], name: "user_id_query")
  @@map("search_history")
}

model library_items {
  id          String @id @default(uuid())
  user_id     String
  library_key String
  result      Json
  saved_at    BigInt
  user        User   @relation(fields: [user_id], references: [internal_id], onDelete: Cascade)
  @@unique([user_id, library_key], name: "user_id_library_key")
  @@map("library_items")
}
```

Also added `search_history[]` and `library_items[]` reverse relations to `User`. Unique constraint names must match the `upsert` `where` keys in `api/history.js` and `api/library.js` exactly.

---

## Proxy — ALLOWED_DOMAINS (13 domains)

- `dpul.princeton.edu`, `ws.pangaea.de`, `opencontext.org`, `api.dc.library.northwestern.edu`
- `openneuro.org`, `www.ebi.ac.uk`, `eutils.ncbi.nlm.nih.gov`, `api.dp.la`
- `gallica.bnf.fr`, `www.iberoamericadigital.net`
- `accounts.google.com`, `appleid.apple.com`, `login.microsoftonline.com` ← Phase 1

---

## Known deviations

1. `adapters/extensions/index.js` — 16 extensions in one barrel. Split if count grows.
2. `components/Panels.jsx` and `components/Layout.jsx` — barrel files. Accepted.
3. No `prisma migrate` history — schema applied directly via Supabase SQL Editor. Use `prisma migrate dev` from Phase 2 onwards.
4. `BillingProvider` not mounted in `App.jsx` (stub — add at Phase 2).
5. `AuthProvider` must be outermost wrapper — `useAuth()` returns `status: "loading"` permanently without it.
6. Google-only OAuth at launch. Apple + Microsoft commented out.
7. OAuth is free at any scale.

---

## Pre-Phase 2 sprint backlog

Unresolved user feedback from v0.15 session. Complete these before Phase 2 (rate limiting). Grouped by theme. Mode C (plan first) for anything touching search logic or account sync.

---

### Sprint A — Auth & account hardening

**A1 — Obtrusive Google login prompt**
Current state: login button exists but is subtle. Auth credentials (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`) still unset in Vercel — OAuth will 500 until this is done.
- Set `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` in Vercel dashboard (Google Cloud Console steps documented in sprint history above)
- Add a dismissable full-screen or modal Google sign-in prompt on first visit (or after N searches) to begin pipeline toward paid users
- Prompt must be skippable — anonymous use stays supported

**A2 — Save API keys & custom journals per account**
Currently `europeanaKey`, `smithsonianKey`, `dplaKey`, `rijksKey`, `s2Key`, `crossrefEmail`, `curatedJournals` live in localStorage only. Signed-in users lose them on new devices.
- Add `settings JSONB` column to `users` table in Supabase (one migration)
- Add `GET /api/settings` + `POST /api/settings` routes (Node.js, Prisma, same auth pattern as `api/history.js`)
- `useSettings.js` — mirror the auth-aware sync pattern from `useHistory.js`: load from DB on sign-in, fire-and-forget writes on save, localStorage as offline fallback
- Ask baazijan: should API keys be stored encrypted at rest or plain JSONB? (security question before implementing)

---

### Sprint B — UI / UX polish

**B1 — Settings close button**
`SettingsPanel` has no close button. User must click ⚙ again to dismiss.
- Add an `×` or `↑ close` button to the top-right of `SettingsPanel` in `Panels.jsx`
- Wire to `onClose` prop passed from `App.jsx` → `setActivePanel(null)`
- Same pattern can be applied to HistoryPanel and LibraryPanel for consistency

**B2 — Eagle mascot at bottom of page + "about" section**
Eagle appears at top only. Feedback requested top AND bottom. "About page with story" also unresolved.
- Options: (1) add eagle + short bio blurb to `ConnectCard` section in `Layout.jsx`, or (2) new `AboutPanel` toggled from footer
- Ask baazijan: standalone `/about` route (requires router) or inline panel?
- Eagle speech bubble explaining it as the mascot — tie into the tooltip system (Sprint B3)

**B3 — "How to use" tooltip system + eagle mascot speech bubble**
No tooltips exist anywhere. Feedback: `?` tooltips on UI elements, `tap anywhere to close`, eagle intro bubble.
- Create a reusable `Tooltip` component: renders absolutely positioned bubble, closes on any click/tap outside
- Add `?` icon buttons to: search bar, history button, library button, settings button, source section headers, launcher block
- Eagle mascot bubble: on first visit (localStorage flag), show eagle + speech bubble introducing itself as mascot and explaining the tool. Dismiss on tap anywhere.
- This overlaps with the eagle tooltip already planned for format copy buttons (eagle appears by result card) — build the shared `Tooltip` component first, then use it for both

**B4 — Ticker source links**
Adapter name badges in the header ticker are non-interactive. Feedback: link to that source.
- Each adapter needs a `homepage` URL field (e.g. `"https://doaj.org"`)
- Add `homepage: string` to adapter shape in each adapter file (or a lookup map in `src/constants/`)
- Ticker renders `<a href={a.homepage}>` instead of `<span>` — add `target="_blank" rel="noopener noreferrer"`
- Pause on hover already works; clicking should navigate

**B5 — Custom mouse pointer on desktop**
- Add CSS `cursor: url('/cursor.png') 4 4, auto` to the root div in `App.jsx`
- Requires a cursor asset in `/public`. Ask baazijan to supply the image, or design one from the eagle

---

### Sprint C — Search quality & result filtering

**C1 — Cross-adapter DOI deduplication**
Current state: `normalizeRecord()` deduplicates within a single adapter call (`dedupMap` is created per `runSearch()` call, one per adapter). If OpenAlex and Crossref both return the same paper, both appear in results.
- Move `dedupMap` creation to `useSearch.js` `search()` function — create once per query, pass through all `runSearch()` calls
- Requires `runSearch(adapter, query, settings, opts, dedupMap)` signature change — add optional 5th param, fall back to `createDedupMap()` if not provided (backward compatible)
- Mode C — touches the search hot path

**C2 — GUI result filters**
No post-search filtering exists.
- Date range filter: `from` / `to` year inputs — filter `sectionStates` results client-side by `result.year`
- Author filter: text input — filter by `result.authors` contains string (case-insensitive)
- "Author name only" checkbox — show results where query matches author field specifically, not title/abstract
- Filters live in `useSearch.js` or a new `useFilters.js` hook; `SourceSection.jsx` receives filtered results
- UI: collapsible filter bar below sticky search, above results

**C3 — Multi-keyword parsing with semicolons**
User can currently only enter one query string. Semicolons should split into multiple parallel queries.
- Parse `query.split(";").map(q => q.trim()).filter(Boolean)` in `handleSearch` in `App.jsx`
- Run `search()` for each keyword; merge results per adapter (union, dedup by DOI)
- Add "use instructions" tooltip (Sprint B3) explaining the semicolon syntax

**C4 — Semantic relevance pre-filtering**
Results are returned in upstream API order with no relevance re-ranking.
- Option A (client-side, no infra): score results by string overlap between query tokens and `result.title + result.abstract`; sort each adapter's results by score before rendering
- Option B (server-side): call an embedding API (e.g. Cohere embed-v3, free tier) per query; cosine similarity filter
- Ask baazijan which approach before implementing — Option A is free and fast, Option B is accurate but adds latency and a new API dependency

---

### Sprint D — Launcher accessibility

**D1 — Restore culled launchers + improve discoverability**
23 launchers exist in `src/launchers/index.js` and render in `LauncherBlock` at the bottom of search results. User feedback: "got culled" and "not accessible."
- Launchers were not culled from the code — they may have been invisible because `LauncherBlock` only renders `hasSearched === true`. Confirm with baazijan whether specific launchers are missing from `LAUNCHERS` array.
- Accessibility improvement: add a launcher count badge to a persistent "External sources" button in the Header nav row, alongside library/history/settings
- Clicking opens a `LaunchersPanel` (same pattern as HistoryPanel) showing the full launcher list without needing to scroll to the bottom of results
- The existing bottom `LauncherBlock` can remain as a secondary access point

---

### Partially resolved — needs follow-up

**Login button** — `AuthProvider` fix applied (button now renders). Still blocked on `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` in Vercel. No code change needed — baazijan must set env vars. See Sprint A1.

**Ticker links** — Scrolling ticker built. Links to sources not yet added. See Sprint B4.

**Cross-adapter dedup** — Per-adapter dedup built. Cross-adapter not yet done. See Sprint C1.

**Eagle at bottom** — Eagle at top done. Bottom placement + mascot intro bubble not done. See Sprint B2 + B3.

---

## Roadmap

### Phase 2 — Rate Limiting & Credits
- Vercel KV (Redis) — leaky-bucket rate limiter in `middleware.ts`
- Credit deduction per search → `runSearch()` in `adapters/index.js`
- KV cache for search results (5min TTL) → same hook point
- `X-Attribution-Required` header for agent requests
- Replace `BillingContext` stub with real KV balance
- Mount `<BillingProvider>` in `App.jsx`

### Phase 3 — Monetisation (Human / Stripe)
- Stripe: Starter $2.99/mo 150 searches, Pro $9.99/mo 1000 searches
- Webhook → `users.total_credits` on `invoice.paid`
- Hook column: `users.stripe_customer_id` already in schema

### Phase 4 — Monetisation (Agent / Base L2)
- SIWE — hook points in `[...auth].js` and `AuthContext.jsx`
- Chainlink price feeds, Base L2 listener
- Hook column: `users.agent_wallet_address` already in schema

### Phase 5 — Telemetry
- KV buffer, batch-write to Supabase JSONB every 60 min
- Hook columns: `meta JSONB` on `search_history` + `library_items` already in schema

### Phase 6 — Native API + Mobile
- `/api/search` — authenticated, rate-limited, normalised JSON + OpenAPI spec
- iOS + Android

---

## Known backlog

- `adapters/extensions/index.js` — split into individual files if codebase grows
- OpenContext UA-block — confirm whether browser direct fetch works; remove from proxy if so
- PANGAEA OAI-PMH — future "get full citation by DOI"
- Cloudflare Workers migration if Vercel invocation limits hit (free tier: 100k/month)
- Next.js migration (full-stack target)
- Re-enable Apple sign-in: .p8 key, Services ID, Team ID from Apple Developer
- Re-enable Microsoft sign-in: App registration in Azure Portal
- "Reset to auto theme" button: `localStorage.removeItem("themeKey")` — trivial to add

---

## Vercel infrastructure

**Edge proxy** — CORS resolution, UA spoofing, domain allowlist.
**Static assets** — `/public`: PWA assets, `robots.txt`, eagle image. Served at domain root.
**Tailwind build** — `npx tailwindcss` in `package.json` build script → `/public/output.css`. Not Play CDN.
**Supabase** — marketplace connector, `DATABASE_URL` + `DIRECT_URL` auto-injected.
**Prisma** — `postinstall: npx prisma generate` regenerates client on every deploy.

---

## Dependency baseline (post Phase 1, unchanged in v.15)

```json
"dependencies": {
  "@auth/core": "^0.37.4",
  "@auth/prisma-adapter": "^2.7.4",
  "@prisma/client": "^6.6.0",
  "@vercel/analytics": "^2.0.1",
  "@vercel/speed-insights": "^2.0.0",
  "react": "^18.3.1",
  "react-dom": "^18.3.1"
},
"devDependencies": {
  "@vitejs/plugin-react": "^4.3.1",
  "prisma": "^6.6.0",
  "tailwindcss": "^3.4.1",
  "vite": "^5.4.0"
}
```

Always read `package.json` from the repo before modifying it. Never reconstruct from memory.

---

## Env vars (Vercel)

```
DATABASE_URL          ← auto-injected by Supabase marketplace connector
DIRECT_URL            ← auto-injected by Supabase marketplace connector
AUTH_SECRET           ← hKOMjdd1FB89ZWYDhjImsrC3rUTCgR5bwlmw7IcBJL4=
AUTH_GOOGLE_ID        ← from Google Cloud Console (MUST BE SET before OAuth works)
AUTH_GOOGLE_SECRET    ← from Google Cloud Console (MUST BE SET before OAuth works)
```

---

## Tone note

Baazijan refers to himself as "baazijan". Moves fast, expects precise execution. Mode C (plan + halt) before large tasks. Mode B (fast path) for small changes. Never pad responses. Ask one specific question rather than guessing.
