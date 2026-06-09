<!-- AUTO-GENERATED from docs/wiki/99-Archive/architecture_report_v0_20.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->
# OpenCITE — Architecture Report
> **Canonical reference for the next Claude instance picking up this project.**
> Read this before touching any code. Contains full sprint history, schema, file map, roadmap, and execution checklists.
> Last updated: v0.20 — Adapter repair sprint
---
## Project overview
OpenCITE is a free meta-search engine for open-access scholarly databases. Searches multiple academic APIs in parallel, returns results with MLA 9 and APA 7 citations ready to paste. Deployed on Vercel at `citation.today` / `opencite.space`.

**Author:** Shahbaz Yusuf (baazijan). Moves fast, expects precise execution. Mode C (plan + halt) before large tasks. Mode B (fast path) for small changes. Never pad responses.

**Stack:** React/Vite frontend, Vercel Edge + Node.js serverless functions, Prisma + Supabase (Postgres), Auth.js v5 Google OAuth.

**Repo:** `Zabhahs/opencite_deploy` on GitHub, deployed via Vercel.

---
## ⚡ NEXT SPRINT: Phase 3A — Stripe Integration
**This is the next sprint. Do not touch adapters until Stripe is done.**

Phase 3A deliverables:
- Stripe Checkout (Starter $2.99/mo, Pro $9.99/mo)
- Webhook handler (`api/stripe/webhook.js`) → writes `plan` field to Prisma user record
- Billing context (`src/contexts/BillingContext.jsx`) already stubbed — wire it up
- Gate search result counts and adapter access by plan tier
- Settings panel billing section (current plan, upgrade CTA, manage subscription link)

---
## ⚡ NEXT-NEXT SPRINT: v.21 — Adapter repairs (post-Stripe)
Two categories of work queued for after Stripe:

### v.21A — Chronicling America URL migration (1 fix)
The LOC permanently redirected (308) `chroniclingamerica.loc.gov/search/pages/results/` to `www.loc.gov/collections/chronicling-america/`. The proxy doesn't follow cross-domain redirects so CA now gets 404. Fix:
- Update CA adapter URL to `https://www.loc.gov/collections/chronicling-america/?qs=QUERY&dl=page&fo=json&c=N`
- Add `www.loc.gov` to `api/proxy.js` ALLOWED_DOMAINS
- Update result parser: new API returns `results[]` with different field names (`title`, `date`, `url`, `image_url`, `description`)

### v.21B — Spanish-language archive replacements (new adapters)
BDPI and MEXICANA are permanently broken (see v.20 post-mortem below). Two candidates to replace them:
- **Dialnet** (`dialnet.unirioja.es`) — Spanish-language academic journals, OAI-PMH at `dialnet.unirioja.es/oai/OAIHandler`. No key required. Strong Latin American coverage.
- **SciELO** (`scielo.org`) — Latin American scientific literature. Has ArticleMeta REST API. Check `articlemeta.scielo.org` for endpoint details.

---
## v.20 Post-mortem — what was fixed, what is still broken

### Confirmed fixed in v.20
| Adapter | Fix | Evidence |
|---|---|---|
| **BL** | 8s AbortController timeout + graceful 200 | `"BL timed out (8s)" ms=8xxx` — no more 18s hang |
| **MEXICANA** (server) | 8s timeout + graceful 200 on OAI error | `MEXICANA:empty rawCount=0` — no adapter-error |
| **MEXICANA** (client) | Removed re-throw on `data.error` | Graceful empty in UI |
| **ONB** | Migrated from dead `search.onb.ac.at/SRU` to Alma ExLibris SRU | `ONB:parse-ok items=3` for Tepehuan and climate change |
| **BDH** | New edge route `api/search/bdh.js` fetches server-side | `BDH:empty` (no proxy-fail) — geo-block bypassed, BNE just has no holdings for test queries |
| **CA** | Added to proxy allowlist, adapter uses `proxiedFetch` | `CA:proxy-attempt` fires — but new 404 issue (see below) |
| **PANGAEA** | Slash escaped in Elasticsearch `query_string` | `PANGAEA:proxy-ok 200` on DOI query (was 400) |
| **NORTHWESTERN** | Same slash escape | `NORTHWESTERN:empty` on DOI query (was 400) |
| **DPLA** | Strip `10.XXXX/` DOI prefix before `q=` | `DPLA:proxy-ok 200` on DOI query, `q=nature12373` |
| **vercel.json** | Rewrite lookahead tightened `/((?!api/).*)` → `/((?!api).*)` | Proxy route correctly reached for all requests |

### Deregistered in v.20 (no working API)
| Adapter | Root cause | File |
|---|---|---|
| **NLS** | `data.nls.uk/api/search/` returns 404 — Data Foundry has no public search API | `src/adapters/extensions/nls.js` (retained) |
| **DELPHER** | `delpher.nl/nl/platform/api/search` returns 404 — KB API requires legal credentials | `src/adapters/extensions/delpher.js` (retained) |
| **BDPI** | `/gdl/ExternalSearch.do` JSONP endpoint removed — new `/BDPI/Search.do` is JS-only | `src/adapters/extensions/bdpi.js` (retained) |

### Still broken / known issues after v.20
| Adapter | Issue | Fix |
|---|---|---|
| **CA** | `chroniclingamerica.loc.gov` permanently redirected to `www.loc.gov/chroniclingamerica/` — proxy gets 404 | v.21A — update to new loc.gov API |
| **BL** | `bnb.data.bl.uk/sparql` consistently times out at 8s | Structural — SPARQL endpoint unreliable, timeout is the correct mitigation |
| **MEXICANA** | `mexicana.cultura.gob.mx` SSL-unreachable from non-Mexican IPs (Vercel edge nodes) — geo-block or cert failure | v.21B — replace with Dialnet/SciELO |

---
## What changed in v.19
Diagnostics-only sprint. SSOT loggers (client + server). `runSearch()` chokepoint logging. Admin debug UI. No logic changes.

See `architecture_report_v0_18.md` for detailed v.19 file list.

---
## What changed in v.20
### New files
| Path | Description |
|---|---|
| `api/search/bdh.js` | Edge route: fetches `datos.bne.es` server-side, 8s timeout, graceful empty |

### Modified files
| Path | Change |
|---|---|
| `vercel.json` | Rewrite lookahead: `/((?!api/).*)` → `/((?!api).*)` |
| `api/proxy.js` | ALLOWED_DOMAINS: replaced `search.onb.ac.at` with `obv-at-oenb.alma.exlibrisgroup.com`; added `chroniclingamerica.loc.gov` |
| `api/search/bl.js` | 8s AbortController + graceful 200 on timeout/error (was 18s hang → 502) |
| `api/search/mexicana.js` | 8s AbortController + graceful 200 on all failures |
| `src/adapters/extensions/bdh.js` | Simplified: calls `/api/search/bdh` instead of `proxiedFetch` |
| `src/adapters/extensions/chroniclingAmerica.js` | Uses `proxiedFetch` instead of bare `fetch` (CORS fix); needs URL update in v.21 |
| `src/adapters/extensions/dpla.js` | Strips `10.XXXX/` DOI prefix before `q=` param |
| `src/adapters/extensions/mexicana.js` | Removed `if (data.error) throw` — server returns graceful `{error, results:[]}` with 200 |
| `src/adapters/extensions/northwestern.js` | Escapes `/` → `\/` in Elasticsearch `query_string` |
| `src/adapters/extensions/onb.js` | New Alma ExLibris SRU endpoint; `alma.all_for_ui` CQL index; `dc:contributor` for authors |
| `src/adapters/extensions/pangaea.js` | Escapes `/` → `\/` in Elasticsearch `query_string` |
| `src/adapters/extensions/index.js` | Deregistered NLS, DELPHER, BDPI (comments explain why) |
| `src/adapters/index.js` | Removed NLS, DELPHER, BDPI from ADAPTERS array and imports |
| `src/constants/app.js` | `APP_VERSION = "v.20"` |

---
## File structure (v0.20)
```
opencite/
├── api/
│   ├── _shared/
│   │   ├── prisma.js
│   │   ├── auth.js
│   │   └── log.js
│   ├── proxy.js                              ← chroniclingamerica.loc.gov + obv-at-oenb added
│   ├── history.js
│   ├── library.js
│   ├── settings.js
│   ├── search/
│   │   ├── bdh.js                            ← [NEW v0.20] edge route for BNE/datos.bne.es
│   │   ├── bdpi.js                           ← dead (JSONP API gone), deregistered
│   │   ├── bl.js                             ← [MODIFIED v0.20] 8s timeout + graceful 200
│   │   ├── gallica.js
│   │   ├── mexicana.js                       ← [MODIFIED v0.20] 8s timeout + graceful 200
│   │   └── opencontext.js
│   └── auth/
│       └── handler.js
│
├── vercel.json                               ← [MODIFIED v0.20] rewrite lookahead fix
│
├── src/
│   ├── App.jsx
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
│   │   │   ├── index.js                      ← [MODIFIED v0.20] NLS/DELPHER/BDPI deregistered
│   │   │   ├── semanticScholar.js
│   │   │   ├── europeana.js
│   │   │   ├── met.js
│   │   │   ├── smithsonian.js
│   │   │   ├── dpla.js                       ← [MODIFIED v0.20] DOI prefix strip
│   │   │   ├── rijksmuseum.js
│   │   │   ├── internetArchive.js
│   │   │   ├── bdpi.js                       ← dead, deregistered
│   │   │   ├── gallica.js
│   │   │   ├── thaqalayn.js
│   │   │   ├── ncbi.js
│   │   │   ├── openContext.js
│   │   │   ├── northwestern.js               ← [MODIFIED v0.20] slash escape
│   │   │   ├── princetonDpul.js
│   │   │   ├── pangaea.js                    ← [MODIFIED v0.20] slash escape
│   │   │   ├── openNeuro.js
│   │   │   ├── ena.js
│   │   │   ├── chroniclingAmerica.js         ← [MODIFIED v0.20] proxiedFetch; ⚠️ URL needs v.21 update
│   │   │   ├── onb.js                        ← [MODIFIED v0.20] Alma ExLibris SRU
│   │   │   ├── bdh.js                        ← [MODIFIED v0.20] calls /api/search/bdh
│   │   │   ├── bnfApi.js
│   │   │   ├── britishLibrary.js
│   │   │   ├── delpher.js                    ← dead, deregistered
│   │   │   ├── lcDatasets.js
│   │   │   ├── mexicana.js                   ← [MODIFIED v0.20] removed re-throw
│   │   │   └── nls.js                        ← dead, deregistered
│   │   └── index.js                          ← [MODIFIED v0.20] NLS/DELPHER/BDPI removed
│   ├── components/
│   │   ├── EagleTooltip.jsx
│   │   ├── Layout.jsx
│   │   ├── LauncherBlock.jsx
│   │   ├── Panels.jsx
│   │   ├── ResultCard.jsx
│   │   ├── SearchInput.jsx
│   │   └── SourceSection.jsx
│   ├── constants/
│   │   ├── app.js                            ← APP_VERSION = "v.20"
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
│   │   ├── admin.js
│   │   ├── auth-client.js
│   │   ├── citations.js
│   │   ├── helpers.js
│   │   ├── history.js
│   │   ├── library.js
│   │   ├── log.js
│   │   └── storage.js
│   ├── input.css
│   └── main.jsx
```

---
## Active adapter status (v0.20)
| Adapter | Status | Notes |
|---|---|---|
| DOAJ | ✅ working | |
| OpenAlex | ✅ working | |
| Crossref | ✅ working | |
| Curated Journals | ✅ working | |
| Europeana | ✅ working | |
| MET | ✅ working | |
| Smithsonian | ✅ working | |
| DPLA | ✅ working | DOI queries now sanitized |
| Internet Archive | ✅ working | |
| NCBI | ✅ working | |
| OpenContext | ✅ working | |
| Gallica | ✅ working | |
| Thaqalayn | ✅ working | |
| Northwestern | ✅ working | DOI queries now sanitized |
| Princeton DPUL | ✅ working | |
| PANGAEA | ✅ working | DOI queries now sanitized |
| OpenNeuro | ✅ working | |
| ENA | ✅ working | |
| ONB | ✅ working | New Alma ExLibris SRU endpoint |
| BDH | ✅ working | Edge route, server-side fetch |
| BnF API | ✅ working | |
| British Library | ⚠️ graceful timeout | SPARQL endpoint unreliable; 8s timeout in place |
| LC Datasets | ✅ working | |
| Mexicana | ⚠️ graceful empty | Domain unreachable from Vercel IPs |
| Chronicling America | ⚠️ proxy-fail 404 | LOC migrated to www.loc.gov — needs v.21A URL fix |
| Rijksmuseum | ✅ working | |
| Semantic Scholar | ✅ working | |
| NLS | ❌ deregistered | No public search API |
| DELPHER | ❌ deregistered | API requires legal credentials |
| BDPI | ❌ deregistered | JSONP API removed |

---
## UnifiedResult schema (v0.20 — unchanged from v0.17)
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
| v0.19 | Diagnostics sprint. SSOT loggers (client + server). `runSearch()` chokepoint logging. Admin debug UI. |
| v0.20 | Adapter repair: BL timeout, MEXICANA graceful, ONB endpoint migration, BDH edge route, CA proxy routing, PANGAEA/NW/DPLA slash sanitization, vercel.json fix. Deregistered NLS/DELPHER/BDPI. |
| v0.21 | **TODO** — CA URL migration (LOC → www.loc.gov). Dialnet + SciELO adapters. After Stripe. |

---
## Roadmap
### ⚡ NOW — Phase 3A: Stripe billing
- Stripe Checkout (Starter $2.99/mo, Pro $9.99/mo)
- `api/stripe/webhook.js` — writes plan to Prisma user
- `BillingContext.jsx` — wire up plan-gating
- Settings panel billing section

### Phase 3B — Agent billing (after 3A)
- Base L2, SIWE

### Phase 3C — RESTful API endpoint
- `/api/search` public endpoint

### v.21 — Adapter queue (after Stripe)
- **v.21A** — CA: update to `www.loc.gov/collections/chronicling-america/` API
- **v.21B** — Replace BDPI/MEXICANA with Dialnet + SciELO Mexico

### Phase 2 — Search quality (queued)
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

---
## Key architectural constraints
- **No stubs.** If a real API can't be fully implemented, deregister the adapter and document here.
- **SSOT discipline.** Factory pattern and tag vocabulary are single sources of truth.
- **Edge runtime limitations.** `DOMParser` is available in Vercel Edge (confirmed — Gallica parses fine). Node.js APIs (`crypto`, Prisma) require Node runtime — set via `export const config = { runtime: 'nodejs' }`.
- **CORS strategy.** Client-side fetches to third-party APIs use `api/proxy.js`. Server-side edge routes (`api/search/*.js`) fetch directly without CORS issues.
- **Admin debug UI.** Set `VITE_ADMIN_EMAILS=shahbaz.citationtoday@gmail.com` in Vercel env vars. Sign in with that email → Settings panel shows debug log section. Triple-click logo copies buffer to clipboard.
- **Antigravity Protocol (Mode C).** Large tasks follow: plan → approval → execute → checklist. No code without explicit approval.
