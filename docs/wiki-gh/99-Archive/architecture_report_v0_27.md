<!-- AUTO-GENERATED from docs/wiki/99-Archive/architecture_report_v0_27.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->
# OpenCITE — Architecture Report
> **Canonical reference for the next Claude instance picking up this project.**
> Read this before touching any code. Contains full sprint history, schema, file map, roadmap, and execution checklists.
> Last updated: v0.27 — phrase & proximity-aware scoring (Phase B), richer OpenAlex metadata intake (Phase C)
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
## What changed in v.27 — Phrase/proximity scoring + richer metadata

### v.27 Phase B — phrase & proximity-aware scoring (`src/lib/scoring.js`)
Two problems fixed/added:
1. **Latent multi-word BM25F bug (fixed).** A query like `machine learning` arrives from `useSearch` as a *single* array element `["machine learning"]`. The old scorer called `termFreq("machine learning", tokens)` against single-word tokens — it never matched, BM25F scored 0, and the result fell to the zero-score low-confidence fallback. `scoreResults` now splits every term into component words (`scoringWords`), strips stopwords, dedups, and runs BM25F word-by-word.
2. **Phrase bonus** — `phraseBonus`: when a multi-word query appears as a *contiguous token run* in a field, add `FIELD_WEIGHTS[f] × PHRASE_BOOST` (2.0). Rewards verbatim matches over scattered words.
3. **Proximity bonus** — `proximityBonus`: when ≥2 *distinct* query words appear within `PROX_WINDOW` (6) tokens of each other in a field, add `FIELD_WEIGHTS[f] × PROX_BOOST × (1 − (minGap−1)/PROX_WINDOW)`. Closer = larger; decays to 0 at the window edge.

Both bonuses gate on `score > 0` (only enrich already-relevant docs) and only fire on multi-word queries (single-word → no phrase, proximity needs ≥2 words). Constants `PHRASE_BOOST=2.0`, `PROX_BOOST=1.0`, `PROX_WINDOW=6` at the top of scoring.js.

### v.27 Phase C — richer OpenAlex metadata intake (`parseOpenAlex.js`, `openalex.js`, `curatedJournals.js`)
1. **MeSH enrichment** — `parseOpenAlexWork` now folds `w.mesh[].descriptor_name` (NLM controlled-vocabulary subject terms) into `keywords`, improving biomedical recall via the keywords field (BM25F weight 2.0).
2. **`select=` payload trimming** — both OpenAlex-backed adapters now send `&select=<OA_SELECT>`, requesting only the top-level fields the parser reads. `OA_SELECT` is exported from `parseOpenAlex.js` (SSOT, kept in sync with field accesses). The deprecated `host_venue` is intentionally excluded — selecting it 400s the request (parser keeps it only as a defensive fallback if present).

### v.27 relevance fix — global low-confidence gate (fixes "Memons of Kutch" pollution)
**Symptom:** niche/heritage queries surfaced tangential junk tagged "loose match" (e.g. a coastal-Junagadh water paper, unrelated Library of Congress newspapers) at positions #7–#9, and "Show 10 more" appeared to do nothing.

**Root cause:** the low-confidence fallback in `useSearch.js` is *per-adapter*. When all of an adapter's results score 0, it keeps them tagged `_lowConfidence` instead of dropping them ("best guesses > nothing"). With ~25 adapters, every all-field heritage adapter that can't match a niche query independently dumps its guesses. The fallback decision was *local* but should be *global*.

**Fix (`useFilters.js`):** compute `anyGenuine` across **all** sections (any result not flagged `_lowConfidence`). If a genuine match exists anywhere, drop every adapter's loose matches; only when *nothing anywhere* matched do guesses still show (original intent preserved, now globally scoped). `UnifiedResultList.jsx` now derives the "more available" prompt from `filteredSections` (post-gate visible results), so adapters whose hits were all gated out no longer keep a dead "Show more" button alive.

### v.27 RRF wiring — Phase B/C participate in both arms (`semantic.js`)
- **Phase B (phrase/proximity)** already flows into RRF: the bonuses live in `_score`, and the lexical rank sorts by `_score`. No change needed.
- **Phase C (MeSH keywords)** now also feeds the **semantic** arm — `computeSemanticRanks` builds the embedded text as title → abstract → keywords/subjects. Keywords get a **reserved 140-char tail budget** (`KW_BUDGET`) and the abstract fills the remaining room within the 512-char window (`EMBED_MAX`); without the reservation a long abstract truncated keywords out of the window entirely, making the signal inert for the biomedical records MeSH targets. So enriched metadata genuinely influences both lexical and semantic ranks before fusion.
- **Synonyms** already feed `scoreResults` (lexical) via `expandTerms`; semantic embeds the raw query by design (embeddings capture meaning inherently).

### v.27 deprecation — Semantic Scholar deregistered
Removed from the `ADAPTERS` registry and from the settings key UI. The adapter file is retained but inert. Rationale: approval-gated API key (can take days), poor cost/benefit vs. OpenAlex/Crossref coverage.

### Modified files (v.27)
| Path | Change |
|---|---|
| `src/lib/scoring.js` | Word-level BM25F (fixes multi-word bug) + `phraseBonus` + `proximityBonus`; boost constants |
| `src/adapters/_shared/parseOpenAlex.js` | MeSH descriptors → keywords; exported `OA_SELECT` field list |
| `src/adapters/core/openalex.js` | `&select=${OA_SELECT}` payload trim |
| `src/adapters/core/curatedJournals.js` | `&select=${OA_SELECT}` payload trim |
| `src/hooks/useFilters.js` | **Global low-confidence gate** — suppress loose matches when any genuine hit exists |
| `src/components/UnifiedResultList.jsx` | "More available" prompt derived from post-gate visible results |
| `src/lib/semantic.js` | Embed keywords/subjects (reserved `KW_BUDGET` tail) so Phase C metadata feeds the semantic RRF arm |
| `src/adapters/index.js` | Semantic Scholar deregistered |
| `src/components/Panels.jsx` | Removed S2 API-key input |
| `src/constants/app.js` | `APP_VERSION` → `"v.27"` |

---
## What changed in v.26 — Search relevance overhaul (retrieval layer)

### The problem (root cause of "memon returns the wrong papers")
v0.25 fixed *ranking* (BM25F scores title/abstract/keywords only) but not *retrieval*. Federated APIs received the raw query and matched it against **every** indexed field — including author display names and cited-reference metadata. So a query like `memon` returned papers *authored by* someone named Memon; BM25F then scored those on content, found the term in none of them, and the zero-score fallback surfaced the author guesses anyway. **The stem was upstream of the scorer, in adapter query construction.**

### v.26A — Field-scoped retrieval (Phase A: core scholarly adapters)
Each scholarly adapter now scopes its query to content fields by default, so author/affiliation matches never enter the candidate set.

| Adapter | Before | After (default) |
|---|---|---|
| OpenAlex | `?search=<q>` (all fields incl. authorships) | `filter=…,title_and_abstract.search:<q>&sort=relevance_score:desc` |
| Curated Journals | `?search=<q>&filter=issn:…` | `filter=issn:…,title_and_abstract.search:<q>&sort=relevance_score:desc` |
| DOAJ | `/search/articles/<q>` (all fields incl. `bibjson.author`) | `bibjson.title:(<q>) OR bibjson.abstract:(<q>) OR bibjson.keywords:(<q>)` |
| Crossref | `query.bibliographic` (title+author+journal) | unchanged retrieval (no abstract index; `query.title` deprecated) — author-only hits score 0 in BM25F and drop downstream |

`title_and_abstract.search` applies OpenAlex's Kstem stemming + stopword removal server-side. Commas are stripped from the OpenAlex query value (commas delimit filters). DOAJ strips Lucene reserved chars so we control the query structure.

### v.26B — Field-scoped retrieval (Phase D: all other adapters reviewed)
Reviewed **every** adapter (core + extension + proxy edge routes). Applied content-scoping where (a) the source is scholarly/data, and (b) the field syntax is rock-solid (won't break in production, since we test only on Vercel):

| Adapter | Change |
|---|---|
| NCBI / PubMed | Tag each word `[Title/Abstract]` (was bare term spanning `[Author]`); toggle → `[Author]` |
| Internet Archive | `(title:(<q>) OR description:(<q>) OR subject:(<q>)) AND mediatype:texts` (was bare query spanning `creator`) |
| OpenNeuro | Client-side match haystack drops `description.Authors` by default (was included) |

**Left intentionally all-field (documented, not a bug):**
- **Cultural-heritage / museum / library sources** — Europeana, Met, Smithsonian, DPLA, Rijksmuseum, Gallica, Northwestern, Princeton DPUL, ONB, BnF, BDH, LC Datasets, Mexicana, Chronicling America. *Rationale: for art/heritage, the creator IS legitimate discovery metadata — searching "Rembrandt" at the Rijksmuseum should return his works. The author-pollution problem is specific to scholarly databases.*
- **Already content-scoped** — ENA (`study_title`/`study_description`), British Library (SPARQL `FILTER(CONTAINS(title…))`), Thaqalayn (hadith full text), Open Context (no author field), Chronicling America (newspaper OCR, no authors).
- **Deferred (field syntax uncertain — would risk breaking in prod)** — SciELO (ES mapping unclear), PANGAEA (ES field names unclear), Smithsonian/Europeana/Northwestern fielded syntax, SRU CQL index scoping (ONB/BnF/Gallica). Tracked in the field-scoping queue below.

### v.26C — Author-search toggle
New setting `settings.authorSearch` (default `false`). When **off** (default), scholarly adapters search content only. When **on**, they revert to author-inclusive / all-field search (OpenAlex `default.search`, Crossref `query.author`, DOAJ plain, NCBI `[Author]`, IA all-field, OpenNeuro includes Authors). Toggle added to SettingsPanel. This is the "separate author search toggle" reserved since v0.25.

### Modified files (v.26)
| Path | Change |
|---|---|
| `src/adapters/core/openalex.js` | Query moved into `title_and_abstract.search` filter + `sort=relevance_score:desc`; authorSearch → `default.search` |
| `src/adapters/core/curatedJournals.js` | Same field-scoped filter pattern as OpenAlex |
| `src/adapters/core/crossref.js` | authorSearch → `query.author`; content default unchanged |
| `src/adapters/core/doaj.js` | Lucene `bibjson.title/abstract/keywords` scoping; authorSearch → plain |
| `src/adapters/extensions/ncbi.js` | `[Title/Abstract]` field tags; authorSearch → `[Author]` |
| `src/adapters/extensions/internetArchive.js` | `title/description/subject` Lucene scoping; authorSearch → all-field |
| `src/adapters/extensions/openNeuro.js` | Authors dropped from client-side match haystack unless authorSearch |
| `src/constants/defaults.js` | Added `authorSearch: false` to `DEFAULT_SETTINGS` |
| `src/constants/app.js` | `APP_VERSION` → `"v.26"` |
| `src/components/Panels.jsx` | Added "Author search" toggle in SettingsPanel |

---
## Retrieval + scoring architecture (v0.27)

```
Query
  │
  ├── RETRIEVAL (per adapter)  ← [NEW v0.26] content-scoped by default
  │     scholarly: title/abstract/keywords only (authorSearch OFF)
  │     heritage:  all-field (creator = legitimate discovery)
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

### BM25F + phrase/proximity (v0.27)
`score(D,Q) = Σ IDF(qi) × tf_weighted × (k1+1) / (tf_weighted + k1)`, `tf_weighted = Σ wf × tf/(1−b+b×|field|/avg|field|)`. Field weights: title 3.0, keywords 2.0, abstract 1.0. `k1=1.2`, `b=0.75`. Content fields only. **Multi-word query terms are split into component words** (v0.27 — fixes the latent zero-match bug). **Phase B bonuses** added on top when `score > 0`: a verbatim-phrase bonus (contiguous token run → `wf × 2.0`) and a proximity bonus (distinct query words within 6 tokens → `wf × 1.0 ×` linear-decay). CitedBy additive bonus capped at +0.3.

### SSOT boundaries
| Concern | SSOT file |
|---|---|
| Adapter retrieval query construction | each adapter file (core/*, extensions/*, api/search/*) |
| Author-search mode | `settings.authorSearch` (read inside each adapter) |
| BM25F lexical scoring | `src/lib/scoring.js` |
| Synonym expansion | `src/lib/synonyms.js` |
| Semantic embedding | `src/lib/semantic.js` + `src/workers/embed.worker.js` |
| Rank fusion | `src/lib/rrf.js` |
| Semantic rerank orchestration | `src/hooks/useSemanticRerank.js` |
| Filtering | `src/hooks/useFilters.js` |
| Cross-adapter dedup | `src/hooks/useSearch.js` (`seenDOIs` ref) |

---
## Active adapter status (v0.26)
| Adapter | Status | Retrieval scope (authorSearch OFF) |
|---|---|---|
| DOAJ | ✅ working | content: `bibjson.title/abstract/keywords` |
| OpenAlex | ✅ working | content: `title_and_abstract.search` |
| Crossref | ✅ working | `query.bibliographic` (author hits drop in BM25F) |
| Curated Journals | ✅ working | content: `title_and_abstract.search` + ISSN filter |
| NCBI | ✅ working | content: `[Title/Abstract]` tags |
| Internet Archive | ✅ working | content: `title/description/subject` |
| OpenNeuro | ✅ working | content: Authors excluded from match haystack |
| ENA | ✅ working | content: already `study_title/description` |
| British Library | ⚠️ graceful timeout | content: SPARQL title filter (already scoped) |
| Wikidata | ✅ working | CirrusSearch on scholarly items (label≈title) |
| Europeana | ✅ working | all-field (heritage — creator legit) |
| MET | ✅ working | all-field + `artistOrCulture` (museum — creator legit) |
| Smithsonian | ✅ working | all-field (heritage) |
| DPLA | ✅ working | all-field (heritage) |
| Rijksmuseum | ✅ working | all-field (museum — maker legit) |
| Gallica | ✅ working | all-field SRU `dc.any` (heritage) |
| Northwestern | ✅ working | all-field ES query_string (heritage MSS) |
| Princeton DPUL | ✅ working | all-field Blacklight (heritage MSS) |
| PANGAEA | ✅ working | all-field ES (field scoping deferred) |
| Chronicling America | ⚠️ needs prod test | all-field (newspaper OCR, no authors) |
| ONB | ✅ working | all-field SRU `alma.all_for_ui` (heritage) |
| BDH | ✅ working | all-field (heritage) |
| BnF API | ✅ working | all-field SRU `bib.anywhere` (heritage) |
| LC Datasets | ✅ working | all-field loc.gov (heritage) |
| Mexicana | ⚠️ graceful empty | all-field (heritage) |
| SciELO | ⚠️ needs prod test | all-field (field scoping deferred) |
| Thaqalayn | ✅ working | full-text hadith (no authors) |
| Open Context | ✅ working | all-field (no author field) |
| Semantic Scholar | ❌ deregistered v0.27 | approval-only key, poor cost/benefit — file kept, removed from registry + settings UI |
| NLS / DELPHER / BDPI | ❌ deregistered | — |

---
## UnifiedResult schema (v0.26 — unchanged from v0.17)
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

### Pipeline-internal fields (underscore-prefixed)
```js
_normalized:    boolean
_type:          string
_authorsParsed: Author[]
_editorsParsed: Author[]
_score:         number    // BM25F, or RRF-fused if semantic ON
_lowConfidence: boolean   // set when all results scored 0 (topic absent from DB)
```

### Settings schema (v0.26)
```js
// DEFAULT_SETTINGS (src/constants/defaults.js)
viewMode:       "unified" | "source"   // default "unified"
synonyms:       boolean                // default false — score-side synonym expansion
semanticSearch: boolean                // default false — client-side embedding + RRF
authorSearch:   boolean                // default false — when true, adapters search author/all fields
```

---
## Sprint history summary
| Version | Summary |
|---|---|
| v0.21 | Search quality + UX (C1–C4, D1–D3). Adapter enrichment (E1–E5). scoring.js + useFilters.js SSOT. |
| v0.22 | CA → www.loc.gov. SciELO adapter. FilterBar UI. Dialnet launcher. |
| v0.23 | Language normalization. Art types (MET/Rijks→"image"). Topics facet. OA Only toggle. |
| v0.24 | Unified ranked view (default). Source view toggle. Zero-result chip row. SearchStatusBar. |
| v0.25 | BM25F scorer. Synonym expansion (30 clusters + Moby Thesaurus). Client-side semantic search (all-MiniLM-L6-v2). RRF fusion. Zero adapter changes. |
| v0.26 | **Field-scoped retrieval** — fixed author-name pollution at the source. Core scholarly adapters (OpenAlex, Curated, DOAJ, Crossref) + NCBI/IA/OpenNeuro scope to content; heritage/museum sources keep creator-inclusive search by design. Author-search toggle. |
| v0.27 | **Phase B** — phrase & proximity-aware scoring; fixed latent multi-word BM25F bug (terms now split into words). **Phase C** — MeSH descriptors enrich OpenAlex keywords; `select=` payload trimming on OpenAlex/Curated adapters. **Relevance fix** — global low-confidence gate (suppress loose-match pollution when any genuine hit exists). **RRF** — keywords now feed the semantic arm. **Deprecation** — Semantic Scholar deregistered. |

---
## Roadmap
### ⚡ NOW — Phase 3A: Stripe billing
### Phase 3B — Agent billing
### Phase 3C — RESTful API endpoint

### Field-scoping queue (deferred from v0.26 — verify syntax before applying)
- **SciELO** — confirm ES mapping; likely `ti:`/`ab:` or `title:`/`ab:`. Test in `SCIELO:parse-ok` logs after change.
- **PANGAEA** — ES `query_string` `fields:["title","agg-datasetname",…]` once abstract field name confirmed.
- **Smithsonian / Europeana / Northwestern** — fielded query syntax (EDAN `title:`/`topic:`; Europeana `title:`/`proxy_dc_description:`/`what:`; NU ES `query_string.fields`).
- **SRU CQL scoping** — ONB `alma.title`, BnF `bib.title`, Gallica `gallica.title` — only if heritage author-pollution becomes a real complaint.

### Search quality tuning queue
- **BM25F parameter tuning** — k1, b, field weights from user feedback
- **RRF weight tuning** — lexical/semantic blend ratio
- **Phase B (✅ shipped v0.27)** — phrase & proximity-aware scoring in `scoring.js`. *Still open:* push phrase intent down to adapter retrieval (OpenAlex boolean, DOAJ quotes) so verbatim phrases narrow the candidate set, not just the ranking.
- **Phase C (✅ shipped v0.27)** — MeSH keyword enrichment + `select=` payload trim. *Still open:* abstract/keyword enrichment for non-OpenAlex adapters.
- **Cross-adapter semantic rerank on loadMore**

---
## Key architectural constraints
- **Retrieval is content-scoped for scholarly sources, all-field for heritage.** The author-pollution bug ("memon" → author papers) is a scholarly-database problem. For museums/art/libraries, creator is legitimate discovery metadata, so those adapters stay all-field. The `authorSearch` toggle flips scholarly adapters to author-inclusive.
- **No stubs.** Dialnet has no JSON API — launcher only.
- **SSOT discipline.** Retrieval query lives in each adapter; scoring/fusion in lib/.
- **BM25F is content-only.** Fields: title, abstract, keywords/subjects. No author matching in scoring.
- **Semantic search is client-side.** Model loaded from CDN in Web Worker. Zero Vercel cost. Cached after first download.
- **RRF is rank-based, not score-based.** Scale-agnostic fusion.
- **Semantic rerank is a post-processing pass.** BM25F appears immediately; rerank fires once all adapters settle; fails silently to BM25F.
- **We test on Vercel, not locally.** Never run `npm install` / local builds. Push to git; Vercel deploys. This is why uncertain field-scoping syntax is deferred rather than blind-applied — a wrong field name breaks an adapter in production.
- **`effectiveStates` pattern.** Raw `sectionStates` for loading/SearchStatusBar/loadMore/allDone; reranked states feed only `useFilters`.
- **Zero-result vs error.** `results: []` = no matches (collapses to chip). `results: null` = adapter error (stays in-list).
- **Edge runtime.** `DOMParser` available in Edge. Node APIs need `runtime: 'nodejs'`.
- **Antigravity Protocol (Mode C).** Large tasks: plan → approval → execute.
```