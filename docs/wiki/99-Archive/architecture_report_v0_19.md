# OpenCITE — Architecture Report
> **Canonical reference for the next Claude instance picking up this project.**
> Read this before touching any code. Contains full sprint history, schema, file map, roadmap, and execution checklists.
> Last updated: v0.19 — Diagnostics sprint: SSOT logger + admin debug UI

---

## Project overview

OpenCITE is a free meta-search engine for open-access scholarly databases. Searches multiple academic APIs in parallel, returns results with MLA 9 and APA 7 citations ready to paste. Deployed on Vercel at `citation.today` / `opencite.space`.

**Author:** Shahbaz Yusuf (baazijan). Moves fast, expects precise execution. Mode C (plan + halt) before large tasks. Mode B (fast path) for small changes. Never pad responses.

**Stack:** React/Vite frontend, Vercel Edge + Node.js serverless functions, Prisma + Supabase (Postgres), Auth.js v5 Google OAuth.

**Repo:** `Zabhahs/opencite_deploy` on GitHub, deployed via Vercel.

---

## ⚡ NEXT SPRINT: v.20 — Fix Broken Adapters

**Read this section first. This is what to work on.**

### Diagnostic results (from v.19 debug log, 2026-05-27)

Three searches were run: "Tepehuan", "climate change", "10.1038/nature12373".
Full failure breakdown:

| Adapter | Failure | Root cause |
|---|---|---|
| ONB | `proxy-fail 404` every search | `vercel.json` rewrite intercepts proxy requests with query strings |
| NLS | `proxy-fail 404` every search | Same `vercel.json` rewrite bug |
| DELPHER | `proxy-fail 404` every search | Same `vercel.json` rewrite bug |
| BDH | `proxy-fail 502` every search | `datos.bne.es` geo-blocks or rejects Vercel IPs — client proxy insufficient |
| MEXICANA | `adapter-error 502` every search | `/api/search/mexicana` edge route itself returns 502 — OAI-PMH endpoint down or blocking Vercel |
| BL | `adapter-error 502`, 18s timeout | `bnb.data.bl.uk/sparql` has no timeout in edge route — hangs for 18s then 502 |
| CHRONICLING_AMERICA | `TypeError: Failed to fetch` | Direct browser fetch is CORS-blocked, no proxy routing |
| PANGAEA | `proxy-fail 400` on DOI queries | Slash in `10.1038/nature12373` breaks Elasticsearch query syntax |
| NORTHWESTERN | `adapter-error 400` on DOI queries | Same slash/special-char query issue |
| DPLA | `proxy-fail 400` on DOI queries | Same slash/special-char query issue |

**Working correctly:** DOAJ, OpenAlex, Crossref, Curated Journals, Europeana, MET, Smithsonian, Internet Archive, NCBI, LC_Datasets, Princeton DPUL, Thaqalayn, OpenNeuro, ENA, BnF API, OpenContext, BDPI, Gallica.

---

### v.20 Fix Checklist (Mode C — plan then execute)

**Fix 1 — `vercel.json` rewrite bug (fixes ONB, NLS, DELPHER)**

The `/((?!api/).*)` negative lookahead rewrite catches requests like `/api/proxy?url=https://...` because the lookahead only checks the path, not query strings. When the proxy URL contains `//` or other characters the rewrite misfires and serves `index.html` (HTTP 200 with HTML body) which the proxy code can't parse — Vercel then returns 404.

Fix: tighten the rewrite rule so it explicitly excludes the `/api/` prefix at the path level. The correct pattern is a source of `/((?!api).)` or restructuring to a dedicated catch-all. Check `vercel.json` — the current rewrite looks like:

```json
{ "source": "/((?!api/).+)", "destination": "/index.html" }
```

The fix is to ensure the API routes are matched before the catch-all, or use:
```json
{ "source": "/((?!api).*)", "destination": "/index.html" }
```

Verify by curling the proxy directly after deploy:
```bash
curl -i "https://citation.today/api/proxy?url=https://search.onb.ac.at/SRU?operation=searchRetrieve..."
```
Expected: JSON response, not HTML.

**Fix 2 — BDH: move to server-side edge route (fixes BDH)**

`datos.bne.es` consistently returns 502 through the client-side proxy. Pattern is identical to BDPI which was already moved to `api/search/bdpi.js`. Create `api/search/bdh.js` as an Edge route that fetches `datos.bne.es` directly server-side (Vercel's server IPs are different from browser IPs — this often bypasses geo-blocks). Update `src/adapters/extensions/bdh.js` to call `/api/search/bdh` instead of proxying directly.

**Fix 3 — BL: add AbortController timeout (fixes BL)**

`api/search/bl.js` has no timeout. The SPARQL endpoint hangs for 18 seconds then 502s. Add an 8s `AbortController` timeout identical to the pattern already used in `api/search/bdpi.js` and `api/search/gallica.js`.

**Fix 4 — MEXICANA: add timeout + graceful fallback (fixes MEXICANA)**

`api/search/mexicana.js` returns 502 — the OAI-PMH endpoint is either down or blocking Vercel. Add an 8s AbortController timeout. On timeout or non-ok response, return `{ results: [], total: 0, error: "..." }` with status 200 (graceful empty) rather than propagating 502. This prevents the UI from showing an error for a source that's just slow/down.

**Fix 5 — CHRONICLING_AMERICA: route through proxy (fixes CA)**

`src/adapters/extensions/chroniclingAmerica.js` makes a direct browser fetch to `chroniclingamerica.loc.gov`. This is CORS-blocked (`TypeError: Failed to fetch`). Two options:
- Option A: Add `chroniclingamerica.loc.gov` to `api/proxy.js` ALLOWED_DOMAINS and use `proxiedFetch()` in the adapter.
- Option B: Create `api/search/chroniclingamerica.js` as an edge route.

Option A is simpler — the CA API returns JSON directly and doesn't need XML parsing. Prefer Option A unless CA also geo-blocks (test after deploy).

**Fix 6 — Sanitize query strings for PANGAEA, NORTHWESTERN, DPLA (fixes fragile adapters)**

DOI queries containing `/` break Elasticsearch and some REST APIs. Add a query sanitizer in each adapter that strips or escapes characters problematic for each API:
- PANGAEA: escape `/` in the Elasticsearch `query_string` — use `query.replace(/\//g, '\\/')` or wrap in quotes
- NORTHWESTERN: same Elasticsearch fix
- DPLA: the proxy returns 400 on DOI queries — likely the `/` in the URL. Encode properly or strip non-search characters before passing to the API.

---

### v.20 Execution order

1. Fix `vercel.json` (unblocks ONB, NLS, DELPHER immediately — no code changes to adapters)
2. Add BL timeout (2-line fix)
3. Add MEXICANA timeout + graceful fallback (3-line fix)
4. Add CA to proxy allowlist + update adapter (small)
5. Create `api/search/bdh.js` + update adapter (medium)
6. Fix query sanitization in PANGAEA, NORTHWESTERN, DPLA (small per adapter)

Deploy after all 6 fixes. Re-run the same 3 test searches and download a new debug log to verify.

---

## What changed in v.19

### Sprint overview

Diagnostics-only sprint. Zero logic changes. Zero bug fixes. Added structured logging throughout the adapter layer and server routes to surface the failures documented above.

### New files (v.19)

| Path | Description |
|---|---|
| `src/lib/log.js` | Client logger SSOT — ring buffer (500 lines) + console output. Format: `[opencite:ADAPTER:event] key=value` |
| `src/lib/admin.js` | `isAdmin(user)` gate — reads `VITE_ADMIN_EMAILS` env var (comma-separated, baked at build time) |
| `api/_shared/log.js` | Server logger SSOT — same format, console only (no buffer, Edge-safe) |

### Modified files (v.19)

| Path | Change |
|---|---|
| `src/adapters/index.js` | `runSearch()` wrapped: logs `start`, `adapter-error`, `empty`, `parse-ok` |
| `src/adapters/_shared/proxy.js` | `proxiedFetch()` accepts `ctx = { adapterId }` third arg; logs `proxy-attempt`, `proxy-ok`, `proxy-fail`, `proxy-throw` |
| `src/adapters/extensions/bdh.js` | Passes `ctx={adapterId:"BDH"}` to proxiedFetch |
| `src/adapters/extensions/delpher.js` | Passes `ctx={adapterId:"DELPHER"}` |
| `src/adapters/extensions/dpla.js` | Passes `ctx={adapterId:"DPLA"}` |
| `src/adapters/extensions/nls.js` | Passes `ctx={adapterId:"NLS"}` |
| `src/adapters/extensions/onb.js` | Passes `ctx={adapterId:"ONB"}` |
| `src/adapters/extensions/bnfApi.js` | Passes `ctx={adapterId:"BNF_API"}` |
| `src/adapters/extensions/northwestern.js` | Passes `ctx={adapterId:"NORTHWESTERN"}` |
| `src/adapters/extensions/openNeuro.js` | Passes `ctx={adapterId:"OPENNEURO"}` |
| `src/adapters/extensions/pangaea.js` | Passes `ctx={adapterId:"PANGAEA"}` |
| `src/adapters/extensions/princetonDpul.js` | Passes `ctx={adapterId:"PRINCETON_DPUL"}` |
| `api/proxy.js` | Logs `reject`, `request`, `upstream-ok`, `upstream-error` |
| `api/search/bdpi.js` | Logs `start`, `upstream-ok`, `parse-fail` (with sample), `parse-ok` |
| `api/search/gallica.js` | Logs `start`, `upstream-ok`, `domparser-unavailable`, `xml-parse-fail`, `parse-ok` |
| `api/search/opencontext.js` | Logs `start`, `upstream-fail`, `got-html`, `json-parse-fail`, `parse-ok` |
| `api/search/mexicana.js` | Logs `start`, `upstream-ok`, `upstream-fail`, `oai-error`, `parse-ok` |
| `api/search/bl.js` | Logs `start`, `upstream-ok`, `upstream-fail`, `parse-ok` |
| `src/App.jsx` | Imports `isAdmin` + `installDebugLog`; calls `installDebugLog()` on admin sign-in; triple-click logo copies buffer to clipboard |
| `src/components/Panels.jsx` | `SettingsPanel` accepts `admin` prop; renders ⚡ Admin debug section (Copy log / Download log / Clear buffer) when `admin=true` |

### Admin debug UI

- Set `VITE_ADMIN_EMAILS=shahbaz.citationtoday@gmail.com` in Vercel dashboard (Production + Preview + Development)
- Sign in with that email → Settings panel shows **⚡ Admin · Debug log** section at bottom
- Triple-click the OpenCITE logo → copies log buffer to clipboard
- Buffer holds last 500 log lines; auto-captures `window.error` and `unhandledrejection` events

---

## File structure (v0.19)

```
opencite/
├── api/
│   ├── _shared/
│   │   ├── prisma.js
│   │   ├── auth.js
│   │   └── log.js                            ← [NEW v0.19] server logger SSOT
│   ├── proxy.js                              ← [MODIFIED v0.19] +logging
│   ├── history.js
│   ├── library.js
│   ├── settings.js
│   ├── search/
│   │   ├── bdpi.js                           ← [MODIFIED v0.19] +logging
│   │   ├── gallica.js                        ← [MODIFIED v0.19] +logging +DOMParser guard
│   │   ├── opencontext.js                    ← [MODIFIED v0.19] +logging
│   │   ├── mexicana.js                       ← [MODIFIED v0.19] +logging
│   │   └── bl.js                             ← [MODIFIED v0.19] +logging (still needs timeout fix in v.20)
│   └── auth/
│       └── handler.js
│
├── vercel.json                               ← ⚠️ NEEDS FIX in v.20 (rewrite bug)
│
├── src/
│   ├── App.jsx                               ← [MODIFIED v0.19] admin gate + triple-click
│   ├── adapters/
│   │   ├── _shared/
│   │   │   ├── base.js
│   │   │   ├── normalize.js
│   │   │   ├── parseOpenAlex.js
│   │   │   ├── proxy.js                      ← [MODIFIED v0.19] ctx param + logging
│   │   │   └── xmlUtils.js
│   │   ├── core/
│   │   │   ├── doaj.js
│   │   │   ├── openalex.js
│   │   │   ├── crossref.js
│   │   │   └── curatedJournals.js
│   │   ├── extensions/
│   │   │   ├── index.js
│   │   │   ├── semanticScholar.js
│   │   │   ├── europeana.js
│   │   │   ├── met.js
│   │   │   ├── smithsonian.js
│   │   │   ├── dpla.js                       ← [MODIFIED v0.19] ctx; ⚠️ query sanitize in v.20
│   │   │   ├── rijksmuseum.js
│   │   │   ├── internetArchive.js
│   │   │   ├── bdpi.js
│   │   │   ├── gallica.js
│   │   │   ├── thaqalayn.js
│   │   │   ├── ncbi.js
│   │   │   ├── openContext.js
│   │   │   ├── northwestern.js               ← [MODIFIED v0.19] ctx; ⚠️ query sanitize in v.20
│   │   │   ├── princetonDpul.js              ← [MODIFIED v0.19] ctx
│   │   │   ├── pangaea.js                    ← [MODIFIED v0.19] ctx; ⚠️ query sanitize in v.20
│   │   │   ├── openNeuro.js                  ← [MODIFIED v0.19] ctx
│   │   │   ├── ena.js
│   │   │   ├── chroniclingAmerica.js         ← ⚠️ NEEDS proxy routing in v.20
│   │   │   ├── onb.js                        ← [MODIFIED v0.19] ctx; ⚠️ blocked by vercel.json bug
│   │   │   ├── bdh.js                        ← [MODIFIED v0.19] ctx; ⚠️ needs edge route in v.20
│   │   │   ├── bnfApi.js                     ← [MODIFIED v0.19] ctx
│   │   │   ├── britishLibrary.js
│   │   │   ├── delpher.js                    ← [MODIFIED v0.19] ctx; ⚠️ blocked by vercel.json bug
│   │   │   ├── lcDatasets.js
│   │   │   ├── mexicana.js
│   │   │   └── nls.js                        ← [MODIFIED v0.19] ctx; ⚠️ blocked by vercel.json bug
│   │   └── index.js                          ← [MODIFIED v0.19] runSearch() logging
│   ├── components/
│   │   ├── EagleTooltip.jsx
│   │   ├── Layout.jsx
│   │   ├── LauncherBlock.jsx
│   │   ├── Panels.jsx                        ← [MODIFIED v0.19] admin debug section
│   │   ├── ResultCard.jsx
│   │   ├── SearchInput.jsx
│   │   └── SourceSection.jsx
│   ├── constants/
│   │   ├── app.js                            ← APP_VERSION = "v.19"
│   │   ├── defaults.js
│   │   ├── themes.js
│   │   └── vocabulary.js
│   ├── contexts/
│   │   ├── AuthContext.jsx
│   │   ├── BillingContext.jsx
│   │   └── SettingsContext.jsx
│   ├── hooks/
│   │   ├── useEagleTooltip.js
│   │   ├── useHistory.js
│   │   ├── useLibrary.js
│   │   ├── useSearch.js
│   │   ├── useSettings.js
│   │   └── useTheme.js
│   ├── launchers/
│   │   ├── _factory.js
│   │   └── index.js
│   ├── lib/
│   │   ├── admin.js                          ← [NEW v0.19] isAdmin() gate
│   │   ├── auth-client.js
│   │   ├── citations.js
│   │   ├── helpers.js
│   │   ├── history.js
│   │   ├── library.js
│   │   ├── log.js                            ← [NEW v0.19] client logger SSOT
│   │   └── storage.js
│   ├── input.css
│   └── main.jsx
```

---

## UnifiedResult schema (v0.19 — unchanged from v0.17)

```js
// Required
title:      string
id:         string
source:     string

// Standard metadata
authors:    string[]
year:       string
journal:    string
publisher:  string
volume:     string
issue:      string
pages:      string
doi:        string
url:        string
abstract:   string
isOA:       boolean
type:       string

// Optional enrichment (v0.17+)
editors:    string[]
keywords:   string[]
subjects:   string[]
language:   string
citedBy:    number|null
previewImage: string
```

---

## Sprint history summary

| Version | Summary |
|---|---|
| v0.17 | Adapter enrichment: type passthrough, keywords, subjects, citedBy, language. Book-chapter grouping in UI. |
| v0.18 | SOW heritage adapters (9 new). Per-adapter file split. `xmlUtils.js` SSOT. TYPE_MAP expanded. |
| v0.19 | Diagnostics sprint. SSOT loggers (client + server). `runSearch()` chokepoint logging. Admin debug UI. No logic changes. |
| v0.20 | **TODO — fix broken adapters** (see top of this doc) |

---

## Roadmap (unchanged)

### Phase 2 — Search quality + UX (sprint queue)

- **C1** — Cross-adapter DOI dedup (`src/hooks/useSearch.js`)
- **C2** — Client-side filters (type, language, date range, sort-by-citations)
- **C3** — Multi-keyword parsing (`query.split(";")`)
- **C4** — Relevance scoring (citedBy + keyword overlap)
- **D1** — Article title opens DOI link (`src/components/ResultCard.jsx`)
- **D2** — Suggested search on low-relevance results
- **D3** — External launcher prompt on empty/weak results

### Sprint E — Adapter enrichment backlog

| Item | Adapter | What's needed |
|---|---|---|
| E1 — NCBI MeSH | `ncbi.js` | Separate `efetch` call for MeSH headings |
| E2 — PANGAEA keywords | `pangaea.js` | Add `keyword`, `parameter` to `_source` array |
| E3 — ENA study type + taxonomy | `ena.js` | Add `tax_id`, `scientific_name`, `study_type` |
| E4 — OpenNeuro species | `openNeuro.js` | Add `species` to GraphQL query |
| E5 — Gallica server-side enrichment | `api/search/gallica.js` | `dc:type`, `dc:subject`, `dc:language` |

### Phase 3 — Monetisation (`citation.today`)

- Phase 3A: Stripe billing (Starter $2.99/mo, Pro $9.99/mo)
- Phase 3B: Agent billing (Base L2, SIWE)
- Phase 3C: RESTful API endpoint (`/api/search`)

---

## Key architectural constraints

- **No stubs.** If a real API can't be fully implemented, document in this file instead.
- **SSOT discipline.** Factory pattern and tag vocabulary are single sources of truth.
- **Edge runtime limitations.** `DOMParser` is available in Vercel Edge (confirmed — Gallica parses fine). Node.js APIs (`crypto`, Prisma) require Node runtime — set via `export const config = { runtime: 'nodejs' }`.
- **CORS strategy.** Client-side fetches to third-party APIs use `api/proxy.js`. Server-side edge routes (`api/search/*.js`) fetch directly without CORS issues.
- **`vercel.json` rewrite.** The SPA catch-all rewrite currently has a bug that intercepts proxy requests. Fix in v.20 before any other proxy-dependent work.
- **Antigravity Protocol (Mode C).** Large tasks follow: plan → approval → execute → checklist. No code without explicit approval.
