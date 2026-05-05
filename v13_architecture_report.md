# OpenCITE — Sprint v.13 Architecture Report
> Written for the next Claude instance picking up this project.
> Read this before touching any code.

---

## What this project is

OpenCITE is a free meta-search engine for open-access scholarly databases. It searches multiple academic APIs in parallel and returns results with MLA 9 and APA 7 citations ready to paste. No backend, no auth (yet), no tracking. Deployed on Vercel. Built by Shahbaz Yusuf (baazijan).

The long-term direction is `citation.today` — a monetised, tiered platform with human (Stripe) and autonomous agent (Base L2) billing. That's Phase 1–6 work. You are currently at Phase 0 complete.

---

## What shipped in v.12 / v.13

### v.12 — Bug fixes + proxy architecture (adapter layer)
Three broken adapters, all fixed:

| Adapter | Bug | Fix |
|---|---|---|
| OpenContext | Wrong endpoint (`/query/.json` returns HTML) | Corrected to `/sets/.json` + proxied for UA injection |
| Princeton DPUL | CORS — `Failed to fetch`, no status code | Routed through Vercel proxy |
| PANGAEA | `Untitled` on all results — wrong field names | Mapped to real panFMP schema: `sf-authortitle`, `agg-author`, `agg-pubYear`, `URI` |

**New file: `api/proxy.js`** — Vercel serverless CORS proxy. 7-domain allowlist. Injects polite `User-Agent` (required by OpenContext). Forwards GET and POST. Three adapter patterns:
- Pattern 2 (proxy always): DPUL, OpenContext, PANGAEA
- Pattern 3 (try direct → fallback): Northwestern, OpenNeuro

**`proxiedFetch()`** — SSOT helper in `src/adapters/_shared/proxy.js`. Adapters call this instead of `fetch()` for proxied endpoints.

PANGAEA title strategy: show `sf-authortitle` as-is (the full citation string). Never wrong, always useful for copy-paste.

### v.13 — Full modular refactor (architecture layer)
`App.jsx` went from **2933 lines → 208 lines**. Everything extracted into 35 files across 8 layers.

---

## Current file structure

```
src/
├── App.jsx                          ← thin orchestrator: providers + layout + wiring
├── adapters/
│   ├── _shared/
│   │   ├── base.js                  ← AbstractAdapter + sanitize() DataMappingGuard
│   │   ├── parseOpenAlex.js         ← shared OpenAlex result parser
│   │   └── proxy.js                 ← proxiedFetch() SSOT
│   ├── core/
│   │   ├── doaj.js
│   │   ├── openalex.js
│   │   ├── crossref.js
│   │   └── curatedJournals.js
│   ├── extensions/
│   │   ├── semanticScholar.js       ← own file (was first extension written)
│   │   └── index.js                 ← all 16 remaining extensions in one barrel
│   └── index.js                     ← ADAPTERS registry + runSearch() wrapper
├── components/
│   ├── launchers/
│   │   └── LauncherBlock.jsx
│   ├── layout/
│   │   └── Layout.jsx               ← Header, ThemeStrip, Footer, ConnectCard
│   ├── panels/
│   │   └── Panels.jsx               ← AddJournalForm, SourcesPanel, SettingsPanel,
│   │                                    HistoryPanel, LibraryPanel
│   └── search/
│       ├── ResultCard.jsx
│       ├── SearchInput.jsx
│       └── SourceSection.jsx
├── constants/
│   ├── defaults.js                  ← STORAGE_NS, HISTORY_MAX, DEFAULT_CURATED_JOURNALS, DEFAULT_SETTINGS
│   ├── themes.js                    ← THEMES, DEFAULT_THEME
│   └── vocabulary.js                ← TAG_VOCAB, ADAPTER_CATEGORY
├── contexts/
│   ├── AuthContext.jsx              ← STUB — Phase 1 hook point (OIDC + SIWE)
│   ├── BillingContext.jsx           ← STUB — Phase 3/4 hook point (Stripe + Base L2)
│   └── SettingsContext.jsx          ← live, wraps useSettings
├── hooks/
│   ├── useHistory.js
│   ├── useLibrary.js
│   ├── useSearch.js                 ← search orchestration, parallel fetches, pagination
│   ├── useSettings.js               ← settings state, localStorage persistence, isEnabled, toggleAdapter
│   └── useTheme.js
├── launchers/
│   ├── _factory.js                  ← createLauncher()
│   └── index.js                     ← all 23 launchers
└── lib/
    ├── citations.js                 ← buildMLA, buildAPA, segmentsToPlain
    ├── helpers.js                   ← reconstructAbstract, truncate, stripHtml
    ├── history.js                   ← history{} manager
    ├── library.js                   ← library{} manager + libraryKey()
    └── storage.js                   ← localStorage SSOT
```

Also at repo root: `api/proxy.js` — Vercel serverless CORS proxy.

---

## Known deviations from the refactor plan

Two places where the plan called for individual files but barrel files were delivered instead:

1. **`adapters/extensions/index.js`** — plan called for 16 individual adapter files (`europeana.js`, `met.js`, etc.). All 16 live in one barrel. `semanticScholar.js` is the only extension with its own file. This is a known shortcut — functional, but makes individual adapter navigation harder. Split if the extension count grows significantly.

2. **`components/panels/Panels.jsx`** and **`components/layout/Layout.jsx`** — plan called for one file per component. Both are barrels. Baazijan has explicitly accepted this structure. Do not split unless asked.

---

## Key architectural concepts to know

### AbstractAdapter.sanitize()
Every search result passes through `AbstractAdapter.sanitize()` in `adapters/index.js` before reaching the UI. This is the DataMappingGuard from the XML blueprint. It prevents `.trim()` runtime errors on null/undefined upstream fields and enforces the UnifiedResult contract. It runs in `runSearch()` — the registry wrapper — not in individual adapter files.

### runSearch()
`adapters/index.js` exports `runSearch(adapter, query, settings, opts)`. This is the single chokepoint for all upstream data. **Phase 2 (rate limiting) credit deduction goes here.** Adapter files never call each other and never know about billing.

### Context stubs
`AuthContext.jsx` and `BillingContext.jsx` are empty shells with sensible defaults (`user: null`, `credits: Infinity`, `tier: 'free'`). They are already wired into the provider tree in `App.jsx`:

```jsx
<AuthProvider>
  <BillingProvider>
    <OpenCITE />
  </BillingProvider>
</AuthProvider>
```

When Phase 1 (identity) ships, replace the stub value in `AuthProvider` with a real NextAuth session. Nothing else in the tree changes.

### Dependency rule
Each layer imports only from layers above it. Never import from components into hooks, never import from hooks into lib, etc. The chain: `constants → lib → adapters/_shared → adapters/* → launchers → contexts → hooks → components → App.jsx`.

---

## What the adapters look like

All adapters export a plain object with this shape:

```javascript
export const MY_ADAPTER = {
  id: "MY_ID",            // unique, used as React key and badge lookup
  name: "Display Name",
  tagline: "Short description",
  category: ADAPTER_CATEGORY.CORE | ADAPTER_CATEGORY.EXTENSION,
  region: ["global"],     // from TAG_VOCAB.region
  archiveType: [...],     // from TAG_VOCAB.archiveType
  contentType: [...],     // from TAG_VOCAB.contentType
  color: { bg: "bg-...", text: "text-..." },  // Tailwind badge classes
  needsKey: false,        // true = show key field in settings
  keyName: "myKey",       // settings field name (if needsKey)
  keyLabel: "...",        // label shown in settings UI
  keyHelp: "...",         // help text shown in settings UI
  search: async (query, settings, opts = {}) => {
    // opts.offset for pagination
    // return { results: UnifiedResult[], hasMore: boolean }
  }
};
```

To add a new adapter: write the file in `adapters/extensions/`, export it from `adapters/extensions/index.js`, add it to the `ADAPTERS` array in `adapters/index.js`. The UI auto-renders it.

---

## Proxy — how it works

`api/proxy.js` at repo root is a Vercel serverless function. Call it via:

```
GET  /api/proxy?url=<encoded-upstream-url>
POST /api/proxy?url=<encoded-upstream-url>&method=POST  (body forwarded)
```

Domain allowlist (edit `ALLOWED_DOMAINS` in `api/proxy.js` to add new domains):
- `dpul.princeton.edu`
- `ws.pangaea.de`
- `opencontext.org`
- `api.dc.library.northwestern.edu`
- `openneuro.org`
- `www.ebi.ac.uk`
- `eutils.ncbi.nlm.nih.gov`

Injects `User-Agent: OpenCITE/1.0 (https://opencite.app; scholarly meta-search)` on all proxied requests.

---

## Roadmap — what remains

### Phase 1 — Identity (next up)
- Provision Postgres (Vercel Postgres or Neon) with Prisma
- Schema: `internal_id` (UUID PK), `stripe_customer_id` (nullable), `agent_wallet_address` (nullable), `total_credits` (Decimal), `demographics` (JSONB)
- NextAuth.js — Google, Apple, Microsoft providers (OIDC for humans)
- SIWE (Sign-In with Ethereum) on Base L2 (for autonomous agent actors)
- Both auth paths map to the same `internal_id` — humans stay wallet-free
- Seed 10 free-tier credits on signup
- Hook point: `src/contexts/AuthContext.jsx` — replace stub with real session

### Phase 2 — Rate Limiting & Credits
- Provision Vercel KV (Redis)
- Leaky-bucket rate limiter in `middleware.ts` (Vercel Edge Runtime)
- Credit deduction per search → hook point: `runSearch()` in `adapters/index.js`
- Inject `X-Attribution-Required` header for agent requests
- Return structured 429 with `credits_remaining` in body
- Hook point: `src/contexts/BillingContext.jsx` — replace stub with real KV balance

### Phase 3 — Monetisation (Human / Stripe)
- Stripe products: Starter ($2.99/mo, 150 searches), Pro ($9.99/mo, 1000 searches)
- Minimum $5.00 deposit to offset flat fees
- Stripe webhook → update `total_credits` in Postgres on `invoice.paid`
- Upgrade/downgrade UI + Stripe customer portal

### Phase 4 — Monetisation (Agent / Base L2)
- Chainlink Price Feeds → per-search USD cost in ETH
- Base L2 listener → credit top-up on payment detected
- Per-search micropayment deduction via same `runSearch()` wrapper

### Phase 5 — Telemetry
- Buffer logs (IP, UA, click-history) in Vercel KV
- Batch-write to Postgres JSONB every 60 minutes
- String-guards already in place via `AbstractAdapter.sanitize()` — extend as needed
- Privacy notice update (proxy logs search terms)

### Phase 6 — Native API + Mobile
- `/api/search` route — authenticated, rate-limited, returns normalised JSON
- API key issuance for non-browser clients
- OpenAPI spec
- iOS + Android: evaluate React Native vs native wrappers
- Adapters are pure JS modules — they can be imported directly into Next.js API routes without any changes

### Known backlog items
- `adapters/extensions/index.js` — split into 16 individual files if codebase grows
- OpenContext UA-block: confirm whether browser direct fetch works; if so, remove from proxy
- PANGAEA OAI-PMH: future "get full citation by DOI" feature
- Cloudflare Workers migration if Vercel invocation limits are hit (free tier: 100k/month)
- Next.js migration (full stack target per XML blueprint)

---

---

## Post-v.13 SSOT enforcement pass

After the refactor shipped, a full SSOT audit was run. The following were found and fixed.

### What was already SSOT ✅
- `storage.js` — all localStorage access namespaced through one module
- `proxiedFetch()` — single function in `adapters/_shared/proxy.js`, all proxied adapters call it
- `AbstractAdapter.sanitize()` — all results pass through one chokepoint in `runSearch()`
- `ADAPTERS` array — single registry in `adapters/index.js`, render and search order both derived from it
- `TAG_VOCAB` — all region/archiveType/contentType labels in `vocabulary.js`
- `THEMES` — defined once in `themes.js`
- `createLauncher()` — factory enforces launcher object shape
- `libraryKey()` — deduplication logic defined once, used by both `lib/library.js` and `hooks/useLibrary.js`
- `buildMLA` / `buildAPA` — citation logic in one place in `lib/citations.js`

### What was fixed ✅

**1. `REGION_ORDER`**
Was hardcoded independently in `LauncherBlock.jsx`, `Panels.jsx` (SourcesPanel), and previously in `App.jsx`. Now lives in `constants/defaults.js` and is imported everywhere.

**2. `ADAPTER_CATEGORY` string comparisons**
`useSettings.js` and `Panels.jsx` were comparing `adapter.category === "core"` and `adapter.category === "extension"` as raw strings. Now both import `ADAPTER_CATEGORY` from `constants/vocabulary.js` and compare against `ADAPTER_CATEGORY.CORE` and `ADAPTER_CATEGORY.EXTENSION`.

**3. Page sizes**
`offset === 0 ? 3 : 5` was hardcoded in all 20 adapter search functions independently. Now `constants/defaults.js` exports:
```js
export const INITIAL_PAGE_SIZE = 3;
export const LOAD_MORE_PAGE_SIZE = 5;
```
Every adapter imports and uses these. To change pagination behaviour globally: one line in `defaults.js`.

### Files changed in this pass
- `src/constants/defaults.js` — added `INITIAL_PAGE_SIZE`, `LOAD_MORE_PAGE_SIZE`, `REGION_ORDER`
- `src/hooks/useSettings.js` — imported `ADAPTER_CATEGORY`, replaced string comparisons
- `src/components/Panels.jsx` — removed local `REGION_ORDER`, imported constants, replaced string comparisons
- `src/components/LauncherBlock.jsx` — removed local `REGION_ORDER`, imported from defaults
- `src/adapters/core/*.js` (4 files) — page size constants replacing hardcoded values
- `src/adapters/extensions/index.js` — page size constants replacing hardcoded values
- `src/adapters/extensions/semanticScholar.js` — page size constants replacing hardcoded values

### Deployment notes
The components directory is **flat** — baazijan's preference. All component files live directly in `src/components/`, not in subdirectories. All component imports use `../` to reach `src/` level. Do not reorganise this into subdirectories.

---

## Tone note

Baazijan refers to himself as "baazijan" in conversation. He moves fast and expects precise execution. Mode C (planning) before large tasks, Mode B (fast path) for small ones. Never pad responses. When in doubt, ask one specific question rather than guessing.
