<!-- AUTO-GENERATED from docs/wiki/99-Archive/architecture_report_v0_21.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->
# OpenCITE — Architecture Report
> **Canonical reference for the next Claude instance picking up this project.**
> Read this before touching any code. Contains full sprint history, schema, file map, roadmap, and execution checklists.
> Last updated: v0.21 — Search quality + UX (C/D) + Adapter enrichment (E)
---
## Project overview
OpenCITE is a free meta-search engine for open-access scholarly databases. Searches multiple academic APIs in parallel, returns results with MLA 9 and APA 7 citations ready to paste. Deployed on Vercel at `citation.today` / `opencite.space`.

**Author:** Shahbaz Yusuf (baazijan). Moves fast, expects precise execution. Mode C (plan + halt) before large tasks. Mode B (fast path) for small changes. Never pad responses.

**Stack:** React/Vite frontend, Vercel Edge + Node.js serverless functions, Prisma + Supabase (Postgres), Auth.js v5 Google OAuth.

**Repo:** `Zabhahs/opencite_deploy` on GitHub, deployed via Vercel.

---
## ⚡ NEXT SPRINT: Phase 3A — Stripe Integration
**This is the next sprint after v.21.**

Phase 3A deliverables:
- Stripe Checkout (Starter $2.99/mo, Pro $9.99/mo)
- Webhook handler (`api/stripe/webhook.js`) → writes `plan` field to Prisma user record
- Billing context (`src/contexts/BillingContext.jsx`) already stubbed — wire it up
- Gate search result counts and adapter access by plan tier
- Settings panel billing section (current plan, upgrade CTA, manage subscription link)

---
## ⚡ NEXT-NEXT SPRINT: v.22 — Adapter repairs (post-Stripe)

### v.22A — Chronicling America URL migration (1 fix)
The LOC permanently redirected (308) `chroniclingamerica.loc.gov/search/pages/results/` to `www.loc.gov/collections/chronicling-america/`. Fix:
- Update CA adapter URL to `https://www.loc.gov/collections/chronicling-america/?qs=QUERY&dl=page&fo=json&c=N`
- Add `www.loc.gov` to `api/proxy.js` ALLOWED_DOMAINS
- Update result parser: new API returns `results[]` with `title`, `date`, `url`, `image_url`, `description`

### v.22B — Spanish-language archive replacements
BDPI and MEXICANA are permanently broken. Candidates:
- **Dialnet** (`dialnet.unirioja.es`) — OAI-PMH at `dialnet.unirioja.es/oai/OAIHandler`. No key. Strong Latin American coverage.
- **SciELO** (`articlemeta.scielo.org`) — Latin American scientific literature REST API.

### v.22C — Filter UI (C2 companion)
`useFilters.js` is wired and functional in v.21 but `filterState` is a static empty object in `App.jsx`. A `FilterBar` component needs to be built to let users set `type`, `language`, `yearMin`, `yearMax`, `sortBy`. This is the remaining C2 UI work.

### v.22D — NCBI MeSH validation
In production, check debug logs for `NCBI:parse-ok` and whether `meshheadinglist` is consistently populated in `esummary` JSON. If consistently empty, escalate to batch `efetch` XML call.

---
## What changed in v.21
### Sprint C+D — Search quality + UX

| Item | Change | File(s) |
|---|---|---|
| C1 — Cross-adapter DOI dedup | `seenDOIs` ref (Set) in `useSearch.js`; reset per search; filters results after each adapter resolves | `src/hooks/useSearch.js` |
| C2 — Client-side filters | `useFilters` hook: pure derivation of filtered/sorted sections from `sectionStates` | `src/hooks/useFilters.js` (NEW) |
| C3 — Multi-keyword parsing | `query.split(";")` in `search()`; per-adapter `Promise.all` across terms; `hasMore=false` for multi-term | `src/hooks/useSearch.js` |
| C4 — Relevance scoring | `scoreResult(result, terms)` pure function; `_score` attached to each result post-resolve | `src/lib/scoring.js` (NEW), `src/hooks/useSearch.js` |
| D1 — Title opens DOI link | `<h4>` title wrapped in `<a href="https://doi.org/...">` when doi present, fallback to url | `src/components/ResultCard.jsx` |
| D2 — Sparse results prompt | `isSparseResults` signal from `useSearch.js`; amber callout above results when total < 5 | `src/hooks/useSearch.js`, `src/App.jsx` |
| D3 — External launcher prompt | Same `isSparseResults` signal; note renders above existing `LauncherBlock` | `src/App.jsx` |

### Sprint E — Adapter enrichment

| Item | Change | File |
|---|---|---|
| E1 — NCBI MeSH | `keywords: (it.meshheadinglist || []).map(m => m.name)` from existing esummary response | `src/adapters/extensions/ncbi.js` |
| E2 — PANGAEA keywords | Added `keyword`, `parameter` to `_source` array; mapped to `keywords` field | `src/adapters/extensions/pangaea.js` |
| E3 — ENA taxonomy | Added `tax_id,scientific_name,study_type` to fields; mapped `scientific_name`+`study_type` to `subjects` | `src/adapters/extensions/ena.js` |
| E4 — OpenNeuro species | Added `species` to GraphQL `summary` query; mapped to `keywords` | `src/adapters/extensions/openNeuro.js` |
| E5 — Gallica enrichment | Extracted `dc:type`, `dc:subject`, `dc:language` from existing XML parse; mapped to `type`, `subjects`, `language` | `api/search/gallica.js` |

### New files (v.21)
| Path | Description |
|---|---|
| `src/lib/scoring.js` | SSOT relevance scorer — `scoreResult(result, terms)` pure function |
| `src/hooks/useFilters.js` | SSOT client-side filter/sort — pure derivation of filtered sections from `sectionStates` |

### Modified files (v.21)
| Path | Change |
|---|---|
| `src/hooks/useSearch.js` | C1 dedup ref + C3 multi-keyword + C4 scoring + D2/D3 `isSparseResults` signal; now returns `isSparseResults` |
| `src/components/ResultCard.jsx` | D1 — title wrapped in DOI/URL anchor |
| `src/App.jsx` | Imports `useFilters`; passes `filteredSections` to `SourceSection`; D2/D3 callouts |
| `api/search/gallica.js` | E5 — dc:type, dc:subject, dc:language extraction |
| `src/adapters/extensions/pangaea.js` | E2 — keyword+parameter in _source + keywords field |
| `src/adapters/extensions/ena.js` | E3 — taxonomy fields + subjects |
| `src/adapters/extensions/openNeuro.js` | E4 — species in GraphQL + keywords |
| `src/adapters/extensions/ncbi.js` | E1 — MeSH from esummary meshheadinglist |

---
## SSOT discipline (v.21)
- **Relevance scoring** — only in `src/lib/scoring.js`
- **Filter/sort logic** — only in `src/hooks/useFilters.js`
- **Cross-adapter DOI dedup** — only in `src/hooks/useSearch.js` (`seenDOIs` ref)
- **Multi-keyword parsing** — only in `src/hooks/useSearch.js` (`query.split(";")`)
- **Sparse-results signal** — only in `src/hooks/useSearch.js` return value (`isSparseResults`)
- **Field coercion** — only in `src/adapters/_shared/base.js` (`AbstractAdapter.sanitize()`) — all E-sprint fields flow through unchanged
- **Type canonicalization** — only in `src/adapters/_shared/normalize.js` (`TYPE_MAP`)

---
## UnifiedResult schema (v0.21 — unchanged from v0.17)
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

### Pipeline-internal fields (not in UnifiedResult contract)
```js
_normalized:    boolean   // set by normalizeRecord()
_type:          string    // canonicalized type from TYPE_MAP
_authorsParsed: Author[]  // structured author objects for export
_editorsParsed: Author[]  // structured editor objects for export
_score:         number    // relevance score (v.21 — set by useSearch after runSearch)
```

---
## File structure (v0.21)
```
opencite/
├── api/
│   ├── _shared/
│   │   ├── prisma.js
│   │   ├── auth.js
│   │   └── log.js
│   ├── proxy.js
│   ├── history.js
│   ├── library.js
│   ├── settings.js
│   ├── search/
│   │   ├── bdh.js
│   │   ├── bdpi.js                           ← dead, deregistered
│   │   ├── bl.js
│   │   ├── gallica.js                        ← [MODIFIED v0.21] dc:type, dc:subject, dc:language
│   │   ├── mexicana.js
│   │   └── opencontext.js
│   └── auth/
│       └── handler.js
│
├── vercel.json
│
├── src/
│   ├── App.jsx                               ← [MODIFIED v0.21] useFilters + isSparseResults D2/D3 callouts
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
│   │   │   ├── index.js
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
│   │   │   ├── ncbi.js                       ← [MODIFIED v0.21] E1 MeSH keywords
│   │   │   ├── openContext.js
│   │   │   ├── northwestern.js
│   │   │   ├── princetonDpul.js
│   │   │   ├── pangaea.js                    ← [MODIFIED v0.21] E2 keyword+parameter
│   │   │   ├── openNeuro.js                  ← [MODIFIED v0.21] E4 species
│   │   │   ├── ena.js                        ← [MODIFIED v0.21] E3 taxonomy
│   │   │   ├── chroniclingAmerica.js         ← ⚠️ URL needs v.22A update
│   │   │   ├── onb.js
│   │   │   ├── bdh.js
│   │   │   ├── bnfApi.js
│   │   │   ├── britishLibrary.js
│   │   │   ├── delpher.js                    ← dead, deregistered
│   │   │   ├── lcDatasets.js
│   │   │   ├── mexicana.js
│   │   │   └── nls.js                        ← dead, deregistered
│   │   └── index.js
│   ├── components/
│   │   ├── EagleTooltip.jsx
│   │   ├── Layout.jsx
│   │   ├── LauncherBlock.jsx
│   │   ├── Panels.jsx
│   │   ├── ResultCard.jsx                    ← [MODIFIED v0.21] D1 title DOI link
│   │   ├── SearchInput.jsx
│   │   └── SourceSection.jsx
│   ├── constants/
│   │   ├── app.js                            ← APP_VERSION = "v.20" (bump to v.21 on deploy)
│   │   ├── defaults.js
│   │   ├── themes.js
│   │   └── vocabulary.js
│   ├── contexts/
│   │   ├── AuthContext.jsx
│   │   ├── BillingContext.jsx
│   │   └── SettingsContext.jsx
│   ├── hooks/
│   │   ├── useEagleTooltip.js
│   │   ├── useFilters.js                     ← [NEW v0.21] C2 SSOT filter/sort
│   │   ├── useHistory.js
│   │   ├── useLibrary.js
│   │   ├── useSearch.js                      ← [MODIFIED v0.21] C1+C3+C4+D2+D3
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
│   │   ├── scoring.js                        ← [NEW v0.21] C4 SSOT relevance scorer
│   │   └── storage.js
│   ├── input.css
│   └── main.jsx
```

---
## Active adapter status (v0.21)
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
| NCBI | ✅ working | E1: MeSH keywords from esummary |
| OpenContext | ✅ working | |
| Gallica | ✅ working | E5: dc:type, dc:subject, dc:language |
| Thaqalayn | ✅ working | |
| Northwestern | ✅ working | |
| Princeton DPUL | ✅ working | |
| PANGAEA | ✅ working | E2: keyword+parameter fields |
| OpenNeuro | ✅ working | E4: species field |
| ENA | ✅ working | E3: scientific_name, study_type → subjects |
| ONB | ✅ working | |
| BDH | ✅ working | |
| BnF API | ✅ working | |
| British Library | ⚠️ graceful timeout | SPARQL unreliable; 8s timeout |
| LC Datasets | ✅ working | |
| Mexicana | ⚠️ graceful empty | Unreachable from Vercel IPs |
| Chronicling America | ⚠️ proxy-fail 404 | LOC migrated — needs v.22A URL fix |
| Rijksmuseum | ✅ working | |
| Semantic Scholar | ✅ working | |
| NLS | ❌ deregistered | |
| DELPHER | ❌ deregistered | |
| BDPI | ❌ deregistered | |

---
## Sprint history summary
| Version | Summary |
|---|---|
| v0.17 | Adapter enrichment: type passthrough, keywords, subjects, citedBy, language. Book-chapter grouping. |
| v0.18 | SOW heritage adapters (9 new). Per-adapter file split. xmlUtils.js SSOT. TYPE_MAP expanded. |
| v0.19 | Diagnostics sprint. SSOT loggers. runSearch() chokepoint logging. Admin debug UI. |
| v0.20 | Adapter repair: BL timeout, MEXICANA graceful, ONB endpoint, BDH edge route, CA proxy, slash sanitization, vercel.json fix. Deregistered NLS/DELPHER/BDPI. |
| v0.21 | Search quality + UX (C1–C4, D1–D3). Adapter enrichment (E1–E5). 2 new SSOT files. |

---
## Roadmap
### ⚡ NOW — Phase 3A: Stripe billing
- Stripe Checkout (Starter $2.99/mo, Pro $9.99/mo)
- `api/stripe/webhook.js` — writes plan to Prisma user
- `BillingContext.jsx` — wire up plan-gating
- Settings panel billing section

### Phase 3B — Agent billing (after 3A)
### Phase 3C — RESTful API endpoint (`/api/search`)

### v.22 — Queued work
- **v.22A** — CA: update to `www.loc.gov/collections/chronicling-america/` API
- **v.22B** — Replace BDPI/MEXICANA with Dialnet + SciELO
- **v.22C** — FilterBar UI component (C2 companion — `filterState` wired in App.jsx, UI not yet built)
- **v.22D** — NCBI MeSH validation: check production logs; escalate to batch efetch XML if `meshheadinglist` consistently empty

---
## Key architectural constraints
- **No stubs.** If a real API can't be fully implemented, deregister the adapter and document here.
- **SSOT discipline.** See SSOT section above — each concern lives in exactly one file.
- **Edge runtime limitations.** `DOMParser` available in Vercel Edge (confirmed). Node.js APIs require `export const config = { runtime: 'nodejs' }`.
- **CORS strategy.** Client-side fetches use `api/proxy.js`. Server-side edge routes fetch directly.
- **`_score` field.** Pipeline-internal (like `_type`, `_normalized`). Set by `useSearch.js` after `runSearch()`. Not part of adapter contract. Not persisted.
- **`filterState` in App.jsx.** Currently a static `{}` — filters pass through as no-ops. FilterBar UI (v.22C) will provide the state setter.
- **Admin debug UI.** Set `VITE_ADMIN_EMAILS=shahbaz.citationtoday@gmail.com` in Vercel env vars. Triple-click logo copies log buffer.
- **Antigravity Protocol (Mode C).** Large tasks: plan → approval → execute → checklist. No code without explicit approval.
