# OpenCITE — Architecture Report
> **Canonical reference for the next Claude instance picking up this project.**
> Read this before touching any code. Contains full sprint history, schema, file map, roadmap, and execution checklists.
> Last updated: v0.22 — CA URL fix, SciELO adapter, FilterBar UI, Dialnet launcher
---
## Project overview
OpenCITE is a free meta-search engine for open-access scholarly databases. Searches multiple academic APIs in parallel, returns results with MLA 9 and APA 7 citations ready to paste. Deployed on Vercel at `citation.today` / `opencite.space`.

**Author:** Shahbaz Yusuf (baazijan). Moves fast, expects precise execution. Mode C (plan + halt) before large tasks. Mode B (fast path) for small changes. Never pad responses.

**Stack:** React/Vite frontend, Vercel Edge + Node.js serverless functions, Prisma + Supabase (Postgres), Auth.js v5 Google OAuth.

**Repo:** `Zabhahs/opencite_deploy` on GitHub, deployed via Vercel.

---
## ⚡ NEXT SPRINT: Phase 3A — Stripe Integration

Phase 3A deliverables:
- Stripe Checkout (Starter $2.99/mo, Pro $9.99/mo)
- Webhook handler (`api/stripe/webhook.js`) → writes `plan` field to Prisma user record
- Billing context (`src/contexts/BillingContext.jsx`) already stubbed — wire it up
- Gate search result counts and adapter access by plan tier
- Settings panel billing section (current plan, upgrade CTA, manage subscription link)

---
## What changed in v.22

### v.22A — Chronicling America URL migration
LOC permanently redirected `chroniclingamerica.loc.gov` to `www.loc.gov`. Fixed:
- `src/adapters/extensions/chroniclingAmerica.js` — new URL: `https://www.loc.gov/collections/chronicling-america/?q=QUERY&fo=json&c=N&sp=PAGE`
- `api/proxy.js` — added `www.loc.gov` to ALLOWED_DOMAINS
- Result parser updated for LOC API response shape (`results[]`, `pagination.total`, `partof[].title` for newspaper name, `image_url`, `description` array)

### v.22B — SciELO adapter + Dialnet launcher
- `src/adapters/extensions/scielo.js` (NEW) — SciELO Search API at `search.scielo.org/api/v2/search`; routed via proxy; defensive multi-language abstract/keyword parsing
- `api/proxy.js` — added `search.scielo.org` to ALLOWED_DOMAINS
- `src/adapters/extensions/index.js` — exports SCIELO_ADAPTER
- `src/adapters/index.js` — SCIELO_ADAPTER added to ADAPTERS array (under sciences group)
- `src/launchers/index.js` — Dialnet added as launcher (no public JSON API — web search only)
- **Note:** SciELO endpoint `search.scielo.org/api/v2/search` needs production validation. If it returns non-OK consistently, deregister and document here.

### v.22C — FilterBar UI (C2 companion)
- `src/components/FilterBar.jsx` (NEW) — client-side filter/sort controls
  - Sort pills: Default | Relevance | Citations ↓ | Year ↓
  - Type pills: derived from live results; only shows types present in current results
  - Language pills: derived from live results; shown only when >1 language present
  - Year range: two compact number inputs
  - Collapse/expand toggle; active-filter indicator dot
- `src/App.jsx` — `filterState` now has setter; `FilterBar` renders between SearchInput and results; filters reset on each new search

### New files (v.22)
| Path | Description |
|---|---|
| `src/adapters/extensions/scielo.js` | SciELO search adapter — Latin American scientific literature |
| `src/components/FilterBar.jsx` | Client-side filter/sort bar — SSOT UI for useFilters hook |

### Modified files (v.22)
| Path | Change |
|---|---|
| `api/proxy.js` | Added `www.loc.gov` and `search.scielo.org` to ALLOWED_DOMAINS |
| `src/adapters/extensions/chroniclingAmerica.js` | New LOC API URL + parser |
| `src/adapters/extensions/index.js` | Added SCIELO_ADAPTER export |
| `src/adapters/extensions/scielo.js` | NEW — see above |
| `src/adapters/index.js` | Added SCIELO_ADAPTER to ADAPTERS array |
| `src/launchers/index.js` | Added Dialnet launcher |
| `src/components/FilterBar.jsx` | NEW — see above |
| `src/App.jsx` | filterState setter; FilterBar render; reset on new search |
| `src/constants/app.js` | APP_VERSION = "v.22" |

---
## Active adapter status (v0.22)
| Adapter | Status | Notes |
|---|---|---|
| DOAJ | ✅ working | |
| OpenAlex | ✅ working | |
| Crossref | ✅ working | |
| Curated Journals | ✅ working | |
| Europeana | ✅ working | |
| MET | ✅ working | |
| Smithsonian | ✅ working | |
| DPLA | ✅ working | |
| Internet Archive | ✅ working | |
| NCBI | ✅ working | MeSH keywords from esummary |
| OpenContext | ✅ working | |
| SciELO | ⚠️ needs production test | New in v.22 — endpoint needs validation |
| Gallica | ✅ working | |
| Thaqalayn | ✅ working | |
| Northwestern | ✅ working | |
| Princeton DPUL | ✅ working | |
| PANGAEA | ✅ working | |
| OpenNeuro | ✅ working | |
| ENA | ✅ working | |
| Chronicling America | ⚠️ needs production test | Updated to www.loc.gov in v.22 — validate in logs |
| ONB | ✅ working | |
| BDH | ✅ working | |
| BnF API | ✅ working | |
| British Library | ⚠️ graceful timeout | SPARQL unreliable; 8s timeout |
| LC Datasets | ✅ working | |
| Mexicana | ⚠️ graceful empty | Unreachable from Vercel IPs |
| Rijksmuseum | ✅ working | |
| Semantic Scholar | ✅ working | |
| NLS | ❌ deregistered | No public search API |
| DELPHER | ❌ deregistered | API requires legal credentials |
| BDPI | ❌ deregistered | JSONP API removed |

---
## UnifiedResult schema (v0.22 — unchanged from v0.17)
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

### Pipeline-internal fields (underscore-prefixed, not in adapter contract)
```js
_normalized:    boolean
_type:          string    // canonicalized via TYPE_MAP
_authorsParsed: Author[]
_editorsParsed: Author[]
_score:         number    // relevance score, set in useSearch after runSearch
```

---
## File structure (v0.22)
```
opencite/
├── api/
│   ├── _shared/
│   │   ├── prisma.js
│   │   ├── auth.js
│   │   └── log.js
│   ├── proxy.js                              ← [MODIFIED v0.22] +www.loc.gov +search.scielo.org
│   ├── history.js
│   ├── library.js
│   ├── settings.js
│   ├── search/
│   │   ├── bdh.js
│   │   ├── bdpi.js                           ← dead, deregistered
│   │   ├── bl.js
│   │   ├── gallica.js
│   │   ├── mexicana.js
│   │   └── opencontext.js
│   └── auth/
│       └── handler.js
│
├── vercel.json
│
├── src/
│   ├── App.jsx                               ← [MODIFIED v0.22] filterState setter + FilterBar
│   ├── adapters/
│   │   ├── _shared/
│   │   │   ├── base.js
│   │   │   ├── normalize.js
│   │   │   ├── parseOpenAlex.js
│   │   │   ├── proxy.js
│   │   │   └── xmlUtils.js
│   │   ├── core/
│   │   │   ├── doaj.js
│   │   │   ├── openalex.js
│   │   │   ├── crossref.js
│   │   │   └── curatedJournals.js
│   │   ├── extensions/
│   │   │   ├── index.js                      ← [MODIFIED v0.22] +SCIELO_ADAPTER
│   │   │   ├── semanticScholar.js
│   │   │   ├── europeana.js
│   │   │   ├── met.js
│   │   │   ├── smithsonian.js
│   │   │   ├── dpla.js
│   │   │   ├── rijksmuseum.js
│   │   │   ├── internetArchive.js
│   │   │   ├── bdpi.js                       ← dead, deregistered
│   │   │   ├── gallica.js
│   │   │   ├── thaqalayn.js
│   │   │   ├── ncbi.js
│   │   │   ├── openContext.js
│   │   │   ├── northwestern.js
│   │   │   ├── princetonDpul.js
│   │   │   ├── pangaea.js
│   │   │   ├── openNeuro.js
│   │   │   ├── ena.js
│   │   │   ├── scielo.js                     ← [NEW v0.22] SciELO adapter
│   │   │   ├── chroniclingAmerica.js         ← [MODIFIED v0.22] new LOC API
│   │   │   ├── onb.js
│   │   │   ├── bdh.js
│   │   │   ├── bnfApi.js
│   │   │   ├── britishLibrary.js
│   │   │   ├── delpher.js                    ← dead, deregistered
│   │   │   ├── lcDatasets.js
│   │   │   ├── mexicana.js
│   │   │   └── nls.js                        ← dead, deregistered
│   │   └── index.js                          ← [MODIFIED v0.22] +SCIELO_ADAPTER
│   ├── components/
│   │   ├── EagleTooltip.jsx
│   │   ├── FilterBar.jsx                     ← [NEW v0.22] filter/sort controls UI
│   │   ├── Layout.jsx
│   │   ├── LauncherBlock.jsx
│   │   ├── Panels.jsx
│   │   ├── ResultCard.jsx
│   │   ├── SearchInput.jsx
│   │   └── SourceSection.jsx
│   ├── constants/
│   │   ├── app.js                            ← APP_VERSION = "v.22"
│   │   ├── defaults.js
│   │   ├── themes.js
│   │   └── vocabulary.js
│   ├── contexts/
│   │   ├── AuthContext.jsx
│   │   ├── BillingContext.jsx
│   │   └── SettingsContext.jsx
│   ├── hooks/
│   │   ├── useEagleTooltip.js
│   │   ├── useFilters.js
│   │   ├── useHistory.js
│   │   ├── useLibrary.js
│   │   ├── useSearch.js
│   │   ├── useSettings.js
│   │   └── useTheme.js
│   ├── launchers/
│   │   ├── _factory.js
│   │   └── index.js                          ← [MODIFIED v0.22] +Dialnet launcher
│   ├── lib/
│   │   ├── admin.js
│   │   ├── auth-client.js
│   │   ├── citations.js
│   │   ├── helpers.js
│   │   ├── history.js
│   │   ├── library.js
│   │   ├── log.js
│   │   ├── scoring.js
│   │   └── storage.js
│   ├── input.css
│   └── main.jsx
```

---
## Sprint history summary
| Version | Summary |
|---|---|
| v0.17 | Adapter enrichment: type, keywords, subjects, citedBy, language. Book-chapter grouping. |
| v0.18 | SOW heritage adapters (9 new). xmlUtils.js SSOT. TYPE_MAP expanded. |
| v0.19 | Diagnostics sprint. SSOT loggers. Admin debug UI. |
| v0.20 | Adapter repair: BL/MEXICANA timeout, ONB endpoint, BDH edge route, CA proxy, slash sanitization, vercel.json fix. |
| v0.21 | Search quality + UX (C1–C4, D1–D3). Adapter enrichment (E1–E5). scoring.js + useFilters.js SSOT. |
| v0.22 | CA → www.loc.gov. SciELO adapter. FilterBar UI (C2 complete). Dialnet launcher. |

---
## Roadmap
### ⚡ NOW — Phase 3A: Stripe billing
### Phase 3B — Agent billing
### Phase 3C — RESTful API endpoint

### Post-Stripe validation queue
- **SciELO** — check `SCIELO:parse-ok` in debug logs after deploy. If consistently empty/erroring, deregister.
- **CA** — check `CHRONICLING_AMERICA:proxy-ok` or `proxy-fail`. Confirm new LOC API is reachable.
- **NCBI MeSH** — check `meshheadinglist` population rate. If < 20% of results have keywords, escalate to batch efetch XML.

---
## Key architectural constraints
- **No stubs.** Dialnet has no JSON API — added as launcher only.
- **SSOT discipline.** Scoring: `src/lib/scoring.js`. Filtering: `src/hooks/useFilters.js`. Cross-adapter dedup: `useSearch.js`. Filter UI: `FilterBar.jsx`.
- **FilterBar derives options from live results.** Type and language pills are only shown when those values actually appear in current results. No hardcoded option lists.
- **filterState resets on each new search** (set to `{}` in `handleSearch`).
- **Edge runtime.** `DOMParser` available in Edge. Node APIs need `runtime: 'nodejs'`.
- **CORS.** Client fetches → `api/proxy.js`. Server edge routes fetch directly.
- **Admin debug UI.** `VITE_ADMIN_EMAILS` env var. Triple-click logo copies log.
- **Antigravity Protocol (Mode C).** Large tasks: plan → approval → execute.
