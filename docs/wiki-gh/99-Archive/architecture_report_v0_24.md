<!-- AUTO-GENERATED from docs/wiki/99-Archive/architecture_report_v0_24.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->
# OpenCITE — Architecture Report
> **Canonical reference for the next Claude instance picking up this project.**
> Read this before touching any code. Contains full sprint history, schema, file map, roadmap, and execution checklists.
> Last updated: v0.24 — Unified ranked view (default), source view toggle, section quality sort
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
## What changed in v.24

### v.24A — Unified ranked view (new default)

`UnifiedResultList` (`src/components/UnifiedResultList.jsx`, NEW) pools every result from every adapter in `filteredSections`, sorts by `_score` desc (citedBy as tie-breaker), and presents a single paginated list — 20 results initially, 10 per "Show more". A coloured source attribution chip appears above each `ResultCard` (adapter `color.bg/text` + `adapter.name`). Replaces the per-adapter `SourceSection` loop in `App.jsx` when `settings.viewMode === "unified"`.

Key behaviours:
- `searchKey` prop (= `searchCount` from App.jsx) resets `displayCount` to 20 on every new search via `useEffect`
- "Show more" first pages the already-loaded pool; when `displayCount >= allResults.length` AND adapters still have `hasMore: true`, it calls `onLoadMoreAll()` to trigger remote fetches
- `onLoadMoreAll` is `handleLoadMoreAll` in App.jsx — iterates `ADAPTERS.filter(isEnabled)`, calls `loadMore(a.id, query)` for every adapter where `s.hasMore && !s.loadingMore && !s.loading`
- Book-chapter grouping (existing `groupByParentWork` in SourceSection) is **not** applied in unified mode — chapters render flat with "In: Book Title" via the existing `isChapterInGroup=false` path in `ResultCard`

### v.24B — SearchStatusBar

`src/components/SearchStatusBar.jsx` (NEW) — compact one-liner above unified results:
- While loading: amber pulse dot + "Searching N sources…"
- On completion: "✓ X sources searched · Y unavailable" (unavailable = adapter `error` set)
- Auto-dismisses 2 seconds after `allSettled` (all adapters resolved). Re-shows on next search (`allSettled` goes false again → `useEffect` resets `visible` to true).

### v.24C — Source view improvements (Mode B)

Source view (`settings.viewMode === "source"`) retains full `SourceSection` rendering but with two improvements:

**Section quality sort** — once all adapters have settled (`allDone`), `sortedAdapters` is computed: sections with results sort by avg `_score` desc; sections with zero results or errors go to the bottom. No reorder during loading — avoids layout shift while adapters are still resolving.

**Zero-result chip row** — adapters where `sectionStates[a.id].results` is `[]` (empty, not null/error) are removed from the main `withResults` list and rendered as a compact dim chip row under a "No matches in" label at the very bottom. Adapters with `error` (results: null) stay in the main list so their error message remains visible.

### v.24D — Settings toggle

`DEFAULT_SETTINGS.viewMode = "unified"` added to `src/constants/defaults.js`. Existing users get `"unified"` as fallback via `settings.viewMode || "unified"` in App.jsx (useSettings merges defaults on load).

"Result layout" row added to `SettingsPanel` in `src/components/Panels.jsx`, just above the Sources section. Two pills: **Unified (default)** / **Source view**. Calls `upd({ viewMode: val })` — instant, no restart.

### New files (v.24)
| Path | Description |
|---|---|
| `src/components/UnifiedResultList.jsx` | Ranked cross-adapter result list — pools filteredSections, sorts by _score, paginates 20+10, coloured source chips, load-more-all |
| `src/components/SearchStatusBar.jsx` | Loading status bar for unified view — shows adapter progress, auto-dismisses on completion |

### Modified files (v.24)
| Path | Change |
|---|---|
| `src/App.jsx` | Conditional render: unified (UnifiedResultList + SearchStatusBar) vs source (sorted SourceSections + chip row). `handleLoadMoreAll` callback. `isUnified`, `allDone`, `sortedAdapters`, `withResults`, `withoutResults` computed inline. |
| `src/components/Panels.jsx` | "Result layout" toggle added to SettingsPanel (above Sources section) |
| `src/constants/defaults.js` | `viewMode: "unified"` added to `DEFAULT_SETTINGS` |

---
## What changed in v.23

### New files (v.23)
| Path | Description |
|---|---|
| `src/lib/langNormalize.js` | SSOT language normalizer — ISO 639-1, ISO 639-2, full English names → `{ code, display }`. Covers ancient languages (grc=Ancient Greek, syc=Syriac, san=Sanskrit, arc=Aramaic, cop=Coptic). Skip list: mul/und/zxx. |

### Modified files (v.23)
| Path | Change |
|---|---|
| `src/hooks/useFilters.js` | Language filter uses `normalizeLanguage().code` comparison (fixes duplicate pill bug). New filter branches: `keyword` (case-insensitive match against `r.keywords[]` and `r.subjects[]`), `oaOnly` (`r.isOA === true`). |
| `src/components/FilterBar.jsx` | `LangDropdown` replaces flat language pill row (handles high-cardinality language sets with counts). Topics facet row: top-8 keywords/subjects by frequency from live results. OA Only toggle in always-visible sort row. `TYPE_LABELS["image"]` → `"Image / Artwork"`. `hasActiveFilters` extended to include `keyword` and `oaOnly`. |
| `src/adapters/extensions/met.js` | `type` changed from `"primary-source"` to `"image"`. Added `subjects: [classification, culture, period, artistNationality]`. |
| `src/adapters/extensions/rijksmuseum.js` | `type` changed from `"primary-source"` to `"image"`. Added `subjects: [...objectTypes, ...materials, ...productionPlaces]`. |
| `src/adapters/extensions/europeana.js` | Added `EUROPEANA_TYPE_MAP` (IMAGE→image, TEXT→primary-source, SOUND/VIDEO→misc, 3D→primary-source). Extracts `it.language[0]` → `language` and `it.dcSubject[]` → `subjects`. |
| `src/adapters/extensions/dpla.js` | Added `DPLA_TYPE_MAP` mapping `sourceResource.type` to canonical types. Extracts `sourceResource.subject[].name` → `subjects`. |
| `src/adapters/extensions/smithsonian.js` | Added `subjects: [...idx.type, ...idx.topic, ...idx.culture, ...idx.set_name]`. |
| `src/adapters/_shared/parseOpenAlex.js` | `keywords` now includes `topics[].display_name` and `topics[].field.display_name` via Set deduplication. |

---
## What changed in v.22

### v.22A — Chronicling America URL migration
- `src/adapters/extensions/chroniclingAmerica.js` — new URL: `https://www.loc.gov/collections/chronicling-america/?q=QUERY&fo=json&c=N&sp=PAGE`
- `api/proxy.js` — added `www.loc.gov` to ALLOWED_DOMAINS

### v.22B — SciELO adapter + Dialnet launcher
- `src/adapters/extensions/scielo.js` (NEW) — SciELO Search API at `search.scielo.org/api/v2/search`; routed via proxy
- `src/launchers/index.js` — Dialnet added as launcher (no public JSON API — web search only)

### v.22C — FilterBar UI
- `src/components/FilterBar.jsx` (NEW) — sort pills, type pills, language, year range, collapse/expand

---
## Active adapter status (v0.24)
| Adapter | Status | Notes |
|---|---|---|
| DOAJ | ✅ working | |
| OpenAlex | ✅ working | topics[] hierarchy in keywords |
| Crossref | ✅ working | |
| Curated Journals | ✅ working | |
| Europeana | ✅ working | native type + language + dcSubject extracted |
| MET | ✅ working | type="image"; subjects: classification/culture/period |
| Smithsonian | ✅ working | subjects: idx.type/topic/culture/set_name |
| DPLA | ✅ working | native type + sourceResource subjects |
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
| Rijksmuseum | ✅ working | type="image"; subjects: objectTypes/materials/productionPlaces |
| Semantic Scholar | ✅ working | |
| NLS | ❌ deregistered | No public search API |
| DELPHER | ❌ deregistered | API requires legal credentials |
| BDPI | ❌ deregistered | JSONP API removed |

---
## UnifiedResult schema (v0.24 — unchanged from v0.17)
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

### Settings schema (v0.24 additions)
```js
// DEFAULT_SETTINGS (src/constants/defaults.js)
viewMode: "unified" | "source"   // NEW v0.24 — default "unified"
```

---
## File structure (v0.24)
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
│   ├── App.jsx                               ← [MODIFIED v0.24] unified/source conditional render; handleLoadMoreAll; section sort
│   ├── adapters/
│   │   ├── _shared/
│   │   │   ├── base.js
│   │   │   ├── normalize.js
│   │   │   ├── parseOpenAlex.js              ← [MODIFIED v0.23] topics[].display_name in keywords
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
│   │   │   ├── europeana.js                  ← [MODIFIED v0.23] EUROPEANA_TYPE_MAP + language + subjects
│   │   │   ├── met.js                        ← [MODIFIED v0.23] type→"image", +subjects
│   │   │   ├── smithsonian.js                ← [MODIFIED v0.23] +subjects
│   │   │   ├── dpla.js                       ← [MODIFIED v0.23] DPLA_TYPE_MAP + subjects
│   │   │   ├── rijksmuseum.js                ← [MODIFIED v0.23] type→"image", +subjects
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
│   │   ├── FilterBar.jsx                     ← [MODIFIED v0.23] LangDropdown + Topics facet + OA toggle
│   │   ├── Layout.jsx
│   │   ├── LauncherBlock.jsx
│   │   ├── Panels.jsx                        ← [MODIFIED v0.24] "Result layout" toggle in SettingsPanel
│   │   ├── ResultCard.jsx
│   │   ├── SearchInput.jsx
│   │   ├── SearchStatusBar.jsx               ← [NEW v0.24] loading progress bar for unified view
│   │   ├── SourceSection.jsx
│   │   └── UnifiedResultList.jsx             ← [NEW v0.24] cross-adapter ranked result list
│   ├── constants/
│   │   ├── app.js
│   │   ├── defaults.js                       ← [MODIFIED v0.24] viewMode: "unified" in DEFAULT_SETTINGS
│   │   ├── themes.js
│   │   └── vocabulary.js
│   ├── contexts/
│   │   ├── AuthContext.jsx
│   │   ├── BillingContext.jsx
│   │   └── SettingsContext.jsx
│   ├── hooks/
│   │   ├── useEagleTooltip.js
│   │   ├── useFilters.js                     ← [MODIFIED v0.23] normalizeLanguage(), keyword, oaOnly
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
│   │   ├── langNormalize.js                  ← [NEW v0.23] SSOT language normalizer
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
| v0.23 | Language normalization (langNormalize.js SSOT). Art types (MET/Rijks→"image"). Topics facet. OA Only toggle. Museum/OpenAlex subject enrichment. |
| v0.24 | Unified ranked view (default). Source view toggle in settings. Section quality sort. Zero-result chip row. SearchStatusBar. |

---
## Roadmap
### ⚡ NOW — Phase 3A: Stripe billing
### Phase 3B — Agent billing
### Phase 3C — RESTful API endpoint

### Post-Stripe validation queue
- **SciELO** — check `SCIELO:parse-ok` in debug logs. If consistently empty/erroring, deregister.
- **CA** — check `CHRONICLING_AMERICA:proxy-ok`. Confirm new LOC API is reachable.
- **NCBI MeSH** — check `meshheadinglist` population rate. If < 20%, escalate to batch efetch XML.

---
## Key architectural constraints
- **No stubs.** Dialnet has no JSON API — added as launcher only.
- **SSOT discipline.**
  - Scoring: `src/lib/scoring.js`
  - Filtering: `src/hooks/useFilters.js`
  - Language normalization: `src/lib/langNormalize.js`
  - Cross-adapter dedup: `useSearch.js` (`seenDOIs` ref)
  - Filter UI: `FilterBar.jsx`
  - Unified result rendering: `UnifiedResultList.jsx`
  - View mode setting: `settings.viewMode` read via `settings.viewMode || "unified"` in App.jsx
- **Two display modes.**
  - `"unified"` (default) — `UnifiedResultList` pools all `filteredSections` results, ranks by `_score` desc, paginates 20+10. `SearchStatusBar` shows adapter loading progress.
  - `"source"` — per-adapter `SourceSection` blocks, sorted by avg score once settled, zero-result adapters collapse to chip row.
- **`handleLoadMoreAll` in App.jsx** — fires `loadMore(a.id, query)` for every enabled adapter where `s.hasMore && !s.loadingMore && !s.loading`. No changes to `useSearch.js` required.
- **`searchKey` = `searchCount`** — passed to `UnifiedResultList` to reset `displayCount` pagination on each new search.
- **Zero-result vs error distinction** — `results: []` (empty array) = no matches, collapses to chip row in source view. `results: null` (error) = adapter failed, stays in-list so error message is readable.
- **FilterBar derives options from live results.** Type pills, LangDropdown, Topics facet are only shown when those values appear in current `filteredSections`. No hardcoded lists.
- **filterState resets on each new search** (set to `{}` in `handleSearch`).
- **Edge runtime.** `DOMParser` available in Edge. Node APIs need `runtime: 'nodejs'`.
- **CORS.** Client fetches → `api/proxy.js`. Server edge routes fetch directly.
- **Admin debug UI.** `VITE_ADMIN_EMAILS` env var. Triple-click logo copies log.
- **Antigravity Protocol (Mode C).** Large tasks: plan → approval → execute.
