# OpenCITE — Architecture Report
> **Canonical reference for the next Claude instance picking up this project.**
> Read this before touching any code. Contains full sprint history, schema, file map, roadmap, and execution checklists.
> Last updated: v0.25 — BM25F scoring, semantic search, RRF fusion, synonym expansion
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
## What changed in v.25

### v.25A — BM25F content relevance scorer

Replaced the naive keyword-overlap scorer (`scoreResult`) with a proper Okapi BM25F batch scorer (`scoreResults`) in `src/lib/scoring.js`. Content fields only — no author matching.

**BM25F formula:**
```
score(D,Q) = Σ IDF(qi) × tf_weighted(qi,D) × (k1+1) / (tf_weighted(qi,D) + k1)
```

Where `tf_weighted` is the per-field weighted term frequency:
```
tf_weighted(qi) = Σ wf × tf(qi, field) / (1 - b + b × |field|/avg|field|)
```

**Field weights:**
| Field | Weight | Source fields |
|-------|--------|---------------|
| `title` | 3.0 | `result.title` |
| `keywords` | 2.0 | `result.keywords[]` + `result.subjects[]` |
| `abstract` | 1.0 | `result.abstract` |

**Parameters:** `k1 = 1.2`, `b = 0.75` (standard Okapi defaults). CitedBy kept as small additive bonus (`min(citedBy/500, 2)`).

**Interface change:** `scoreResult(result, terms)` → `scoreResults(results[], terms)` — batch function required because IDF and avgdl need the full result set. Both initial search and loadMore paths updated in `useSearch.js`.

### v.25B — Synonym expansion (toggleable)

New module `src/lib/synonyms.js` — curated map of ~30 academic synonym clusters covering:
- Scientific equivalents (climate change / global warming / climate crisis)
- Spelling variants (behaviour / behavior, analyse / analyze)
- Medical/bio abbreviations (DNA / deoxyribonucleic acid, COVID-19 / SARS-CoV-2)

`expandTerms(terms, enabled)` widens the term set for scoring. **Score-side only** — original query terms go to APIs unchanged. Synonyms only affect how BM25F ranks returned results.

Setting: `settings.synonyms` (default `false`). Toggle in SettingsPanel.

### v.25C — Semantic search (toggleable, client-side)

Client-side semantic scoring using `@xenova/transformers` loaded from CDN in a Web Worker. Model: `Xenova/all-MiniLM-L6-v2` (384-dim, ~23MB ONNX). First use downloads the model; cached permanently in browser via Cache API.

**Pipeline:**
1. `src/workers/embed.worker.js` — Web Worker that loads transformers.js from CDN, initializes pipeline, embeds text batches
2. `src/lib/semantic.js` — manages worker lifecycle, exposes `computeSemanticRanks(query, results)` → Map of index → rank
3. Embeds query + each result's `title + abstract` (truncated to 512 chars)
4. Cosine similarity (embeddings are L2-normalized, so dot product) between query and each result
5. Returns rank positions sorted by similarity desc

Setting: `settings.semanticSearch` (default `false`). Toggle in SettingsPanel.

### v.25D — Reciprocal Rank Fusion (RRF)

`src/lib/rrf.js` — combines BM25F lexical ranks and semantic similarity ranks using weighted RRF:

```
WeightedRRF(d) = Σ w_r / (k + rank_r(d))
```

**Weights:** lexical 0.6, semantic 0.4 (lexical-heavy default). **k = 60** (standard default).

RRF operates on rank positions, not raw scores — no normalization needed between BM25F and cosine similarity scales.

### v.25E — Semantic rerank hook

`src/hooks/useSemanticRerank.js` orchestrates the hybrid pipeline:

1. BM25F scores results per-adapter as they resolve (immediate, existing behavior)
2. Results appear in UI ranked by BM25F (no delay)
3. Once **all adapters settle** and `settings.semanticSearch` is enabled:
   - Pools all results across adapters
   - Computes BM25F lexical ranks from existing `_score` values
   - Sends texts to embed worker → gets semantic ranks
   - RRF fuses both rank lists → new `_score` on each result
   - Maps fused scores back into per-adapter section structure
4. UI re-sorts with fused scores

**Fallback:** If embedding fails (network, browser support, timeout), falls back silently to BM25F-only ranking. `rerankStatus` state exposed for UI feedback: `idle | reranking | done`.

**Integration in App.jsx:**
```js
const { rerankedStates, rerankStatus } = useSemanticRerank(sectionStates, query, settings.semanticSearch);
const effectiveStates = rerankedStates || sectionStates;
const filteredSections = useFilters(effectiveStates, filterState);
```

Raw `sectionStates` still used for loading detection, SearchStatusBar, loadMore, and allDone computation. Only `useFilters` receives reranked states.

### New files (v.25)
| Path | Description |
|---|---|
| `src/lib/synonyms.js` | Synonym clusters + `expandTerms(terms, enabled)` — score-side expansion |
| `src/lib/semantic.js` | Web Worker wrapper for embeddings + cosine similarity scoring |
| `src/lib/rrf.js` | `fuseRanks(results, rankLists, k)` — weighted Reciprocal Rank Fusion |
| `src/workers/embed.worker.js` | Web Worker — loads `@xenova/transformers` from CDN, runs all-MiniLM-L6-v2 |
| `src/hooks/useSemanticRerank.js` | React hook — watches allDone, runs semantic + RRF, returns reranked states |

### Modified files (v.25)
| Path | Change |
|---|---|
| `src/lib/scoring.js` | **Rewritten** — BM25F batch scorer replacing naive overlap. Content fields only (title 3x, keywords 2x, abstract 1x). |
| `src/hooks/useSearch.js` | `scoreResult` → `scoreResults` batch call. Added `expandTerms` gated by `settings.synonyms`. |
| `src/App.jsx` | Import `useSemanticRerank`. Wire `effectiveStates = rerankedStates \|\| sectionStates` into `useFilters`. |
| `src/constants/defaults.js` | Added `synonyms: false`, `semanticSearch: false` to `DEFAULT_SETTINGS` |
| `src/constants/app.js` | `APP_VERSION` → `"v.25"` |
| `src/components/Panels.jsx` | Added "Synonym expansion" toggle + "Semantic search" toggle in SettingsPanel |

---
## Scoring architecture (v0.25)

```
Query terms
  │
  ├── expandTerms(terms, synonyms) ──→ expanded terms (if synonyms ON)
  │
  ├── BM25F(results, terms) ──→ _score per result (per-adapter, immediate)
  │                                │
  │                                ├── Results appear in UI ranked by BM25F
  │                                │
  │                        [all adapters settle]
  │                                │
  │                                ▼
  │                     ┌── semanticSearch OFF? ──→ done (BM25F only)
  │                     │
  │                     └── semanticSearch ON?
  │                                │
  │                                ▼
  ├── Embed(query + titles/abstracts) ──→ cosine similarity ──→ semantic ranks
  │                                                                    │
  └── RRF(lexical_ranks × 0.6, semantic_ranks × 0.4, k=60) ──→ fused _score
                                                                       │
                                                                  UI re-sorts
```

### SSOT boundaries
| Concern | SSOT file |
|---|---|
| BM25F lexical scoring | `src/lib/scoring.js` |
| Synonym expansion | `src/lib/synonyms.js` |
| Semantic embedding | `src/lib/semantic.js` + `src/workers/embed.worker.js` |
| Rank fusion | `src/lib/rrf.js` |
| Semantic rerank orchestration | `src/hooks/useSemanticRerank.js` |
| Filtering | `src/hooks/useFilters.js` |
| Language normalization | `src/lib/langNormalize.js` |
| Cross-adapter dedup | `src/hooks/useSearch.js` (`seenDOIs` ref) |
| Filter UI | `src/components/FilterBar.jsx` |
| Unified result rendering | `src/components/UnifiedResultList.jsx` |

---
## Active adapter status (v0.25 — unchanged from v0.24)
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
## UnifiedResult schema (v0.25 — unchanged from v0.17)
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
_score:         number    // relevance score — BM25F, or RRF-fused if semantic ON
```

### Settings schema (v0.25)
```js
// DEFAULT_SETTINGS (src/constants/defaults.js)
viewMode:       "unified" | "source"   // default "unified"
synonyms:       boolean                // default false — score-side synonym expansion
semanticSearch: boolean                // default false — client-side embedding + RRF
```

---
## File structure (v0.25)
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
│   │   ├── gallica.js
│   │   ├── mexicana.js
│   │   └── opencontext.js
│   └── auth/
│       └── handler.js
│
├── vercel.json
│
├── src/
│   ├── App.jsx                               ← [MODIFIED v0.25] +useSemanticRerank, effectiveStates
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
│   │   │   ├── ncbi.js
│   │   │   ├── openContext.js
│   │   │   ├── northwestern.js
│   │   │   ├── princetonDpul.js
│   │   │   ├── pangaea.js
│   │   │   ├── openNeuro.js
│   │   │   ├── ena.js
│   │   │   ├── scielo.js
│   │   │   ├── chroniclingAmerica.js
│   │   │   ├── onb.js
│   │   │   ├── bdh.js
│   │   │   ├── bnfApi.js
│   │   │   ├── britishLibrary.js
│   │   │   ├── delpher.js                    ← dead, deregistered
│   │   │   ├── lcDatasets.js
│   │   │   ├── mexicana.js
│   │   │   ├── wikidata.js
│   │   │   └── nls.js                        ← dead, deregistered
│   │   └── index.js
│   ├── components/
│   │   ├── EagleTooltip.jsx
│   │   ├── FilterBar.jsx
│   │   ├── Layout.jsx
│   │   ├── LauncherBlock.jsx
│   │   ├── Panels.jsx                        ← [MODIFIED v0.25] +synonym toggle, +semantic search toggle
│   │   ├── ResultCard.jsx
│   │   ├── SearchInput.jsx
│   │   ├── SearchStatusBar.jsx
│   │   ├── SourceSection.jsx
│   │   └── UnifiedResultList.jsx
│   ├── constants/
│   │   ├── app.js                            ← [MODIFIED v0.25] APP_VERSION = "v.25"
│   │   ├── defaults.js                       ← [MODIFIED v0.25] +synonyms, +semanticSearch
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
│   │   ├── useSearch.js                      ← [MODIFIED v0.25] scoreResults batch + expandTerms
│   │   ├── useSemanticRerank.js              ← [NEW v0.25] semantic rerank hook
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
│   │   ├── langNormalize.js
│   │   ├── library.js
│   │   ├── log.js
│   │   ├── rrf.js                            ← [NEW v0.25] Reciprocal Rank Fusion
│   │   ├── scoring.js                        ← [REWRITTEN v0.25] BM25F batch scorer
│   │   ├── semantic.js                       ← [NEW v0.25] Web Worker embedding wrapper
│   │   ├── synonyms.js                       ← [NEW v0.25] synonym expansion map
│   │   └── storage.js
│   ├── workers/
│   │   └── embed.worker.js                   ← [NEW v0.25] transformers.js Web Worker
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
| v0.25 | BM25F scorer (title 3x, keywords 2x, abstract 1x). Synonym expansion (30 clusters, toggleable). Client-side semantic search (all-MiniLM-L6-v2 via Web Worker). RRF fusion (0.6 lexical / 0.4 semantic). Zero adapter changes. |

---
## Roadmap
### ⚡ NOW — Phase 3A: Stripe billing
### Phase 3B — Agent billing
### Phase 3C — RESTful API endpoint

### Post-Stripe validation queue
- **SciELO** — check `SCIELO:parse-ok` in debug logs. If consistently empty/erroring, deregister.
- **CA** — check `CHRONICLING_AMERICA:proxy-ok`. Confirm new LOC API is reachable.
- **NCBI MeSH** — check `meshheadinglist` population rate. If < 20%, escalate to batch efetch XML.

### Search quality tuning queue
- **BM25F parameter tuning** — adjust k1, b, field weights based on user feedback
- **RRF weight tuning** — adjust lexical/semantic blend ratio
- **Author search toggle** — separate search mode for finding works by specific authors
- **Cross-adapter semantic rerank on loadMore** — re-fuse when new results arrive

---
## Key architectural constraints
- **No stubs.** Dialnet has no JSON API — added as launcher only.
- **SSOT discipline.** See scoring architecture section above for full SSOT boundary map.
- **Scoring is content-only.** BM25F fields are title, abstract, keywords/subjects. No author matching — reserved for a future author search toggle.
- **Semantic search is client-side.** Model loaded from CDN in Web Worker. No server-side compute, no API keys. Zero Vercel cost. Model cached permanently after first download.
- **RRF is rank-based, not score-based.** BM25F scores and cosine similarities have incompatible scales. RRF only uses rank positions, making fusion scale-agnostic.
- **Semantic rerank is a post-processing pass.** BM25F results appear immediately as adapters resolve. Semantic rerank fires once all adapters settle. If it fails, UI keeps BM25F ranking silently.
- **Two display modes.**
  - `"unified"` (default) — `UnifiedResultList` pools all `filteredSections` results, ranks by `_score` desc, paginates 20+10. `SearchStatusBar` shows adapter loading progress.
  - `"source"` — per-adapter `SourceSection` blocks, sorted by avg score once settled, zero-result adapters collapse to chip row.
- **`effectiveStates` pattern.** Raw `sectionStates` used for loading detection, SearchStatusBar, loadMore, allDone. Reranked states (when available) fed only to `useFilters` → `filteredSections` → rendering.
- **`handleLoadMoreAll` in App.jsx** — fires `loadMore(a.id, query)` for every enabled adapter where `s.hasMore && !s.loadingMore && !s.loading`.
- **`searchKey` = `searchCount`** — passed to `UnifiedResultList` to reset `displayCount` pagination on each new search.
- **Zero-result vs error distinction** — `results: []` (empty array) = no matches, collapses to chip row in source view. `results: null` (error) = adapter failed, stays in-list so error message is readable.
- **FilterBar derives options from live results.** Type pills, LangDropdown, Topics facet are only shown when those values appear in current `filteredSections`. No hardcoded lists.
- **filterState resets on each new search** (set to `{}` in `handleSearch`).
- **Edge runtime.** `DOMParser` available in Edge. Node APIs need `runtime: 'nodejs'`.
- **CORS.** Client fetches → `api/proxy.js`. Server edge routes fetch directly.
- **Admin debug UI.** `VITE_ADMIN_EMAILS` env var. Triple-click logo copies log.
- **Antigravity Protocol (Mode C).** Large tasks: plan → approval → execute.
