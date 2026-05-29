# OpenCITE — Architecture Report
> **Canonical reference for the next Claude instance picking up this project.**
> Read this before touching any code. Contains full sprint history, schema, file map, roadmap, and execution checklists.
> Last updated: v0.28 — Phase 3C kickoff: public REST search endpoint (`/api/search`)
---
## Project overview
OpenCITE is a free meta-search engine for open-access scholarly databases. Searches multiple academic APIs in parallel, returns results with MLA 9 and APA 7 citations ready to paste. Deployed on Vercel at `citation.today` / `opencite.space`.

**Author:** Shahbaz Yusuf (baazijan). Moves fast, expects precise execution. Mode C (plan + halt) before large tasks. Mode B (fast path) for small changes. Never pad responses.

**Stack:** React/Vite frontend, Vercel Edge + Node.js serverless functions, Prisma + Supabase (Postgres), Auth.js v5 Google OAuth.

**Repo:** `Zabhahs/opencite_deploy` on GitHub, deployed via Vercel.

---
## What changed in v.28 — Public REST search endpoint (`/api/search`)

**Why.** Two goals at once: (1) a headless test harness — the search pipeline could previously only be exercised through the browser UI, which made relevance/scoring iteration slow; (2) the Phase 3C "RESTful API endpoint" deliverable, as a real product feature. Both are served by one server-side endpoint that reuses the *same* retrieval + normalize + ranking code the UI runs, so API output matches the app.

### New file
| Path | Description |
|---|---|
| `api/search.js` | Node serverless function. `GET /api/search?q=…` → ranked JSON results with MLA/APA (and optional BibTeX/RIS/CSL) citations. Reuses `runSearch`, `scoreResults`, `buildMLA/APA`, `exportAs`. |

### Modified file
| Path | Change |
|---|---|
| `src/constants/app.js` | `APP_VERSION` → `"v.28"` |

### How it reuses the UI pipeline (parity is the point)
- **Retrieval + normalize:** imports `{ ADAPTERS, runSearch }` from `src/adapters/index.js` — identical per-adapter `search()` → `sanitize` → `normalizeRecord` (NCR) path as the browser.
- **Ranking:** `scoreResults` (BM25F + phrase/proximity) from `src/lib/scoring.js`, run once over the full candidate set so IDF is consistent across adapters.
- **Dedup + gate:** cross-adapter DOI dedup (keeps highest-scored copy) + the v0.27 **global low-confidence gate** (`meaningfulTerms` → if any genuine hit exists anywhere, drop all zero-score loose matches; else surface best guesses flagged `lowConfidence`). This mirrors `useSearch.js` + `useFilters.js`.
- **Citations:** `buildMLA/buildAPA` + `segmentsToPlain`, and `exportAs` for bibtex/ris/csl-json — same SSOT as the ResultCard export menu.

### Scope (v1) — core scholarly adapters only
`SERVER_SAFE_IDS = { OPENALEX, CROSSREF, DOAJ, CURATED }`. These four use plain `fetch()` to public JSON APIs — **no `api/proxy.js`, no `DOMParser`** — so they run unchanged server-side. Heritage/SRU/OAI adapters depend on the browser CORS proxy (relative `/api/proxy` URL) and/or DOMParser-style XML parsing and are deliberately **excluded** until those are made server-aware (see roadmap). `?sources=` is allowlist-filtered to these four.

> **Why Node runtime, not Edge:** Vercel **Edge** routes cannot import from `src/` (documented in `xmlUtils.js`). The `/api/search` function imports the adapter registry + lib from `src/`, so it must be a **Node** function (the default for `api/*.js` with no `config.runtime = 'edge'` export). The whole registry is imported for SSOT; only the four allowlisted adapters are ever invoked. Confirmed no adapter touches `window`/`document`/`DOMParser` at module top-level, so the Node import is safe.

### API contract
```
GET /api/search
  q        required — query; multi-keyword separated by ";"  (mirrors useSearch)
  limit    optional — 1..100 (default 25), caps the merged ranked list
  sources  optional — comma-separated subset of OPENALEX,CROSSREF,DOAJ,CURATED
  authors  optional — 1/true → author-inclusive search (settings.authorSearch)
  mailto   optional — polite-pool email (default env OPENCITE_MAILTO)
  cite     optional — extra per-result formats: bibtex,ris,csl-json (mla+apa always on)
  format   optional — json (default) | mla | apa | bibtex | ris | csl-json
                      non-json returns a text/plain bibliography (csl-json → JSON array)
```
JSON response: `{ query, terms, lowConfidence, count, totalCandidates, tookMs, sources:{ID:{count,error}}, results:[{…UnifiedResult, score, lowConfidence, citations:{mla,apa,…}}] }`.

- **No-`q` request** returns `{ ok, usage }` — the endpoint self-documents.
- **Per-adapter isolation:** each adapter runs under a 12s timeout via `Promise.race`; a failure/timeout is recorded in `sources[ID].error` and never sinks the request.
- **Auth:** open by default. If env `OPENCITE_API_KEY` is set, requests must send a matching `x-api-key` header or `?key=`. CORS is `*` (GET/OPTIONS).
- **Pagination:** v1 fetches only the first page per adapter (`offset:0`), matching the UI's initial render (~3–5 results/source). Deeper paging is deferred (the client's offset/page-size math is tuned for its incremental load-more flow and would need a faithful loop to avoid overlap).

### Verified (live smoke test, Node 24, 2026-05-28)
`q=machine learning` → 14 candidates across all 4 sources, deduped/scored to 8, MLA + BibTeX emitted, ~760ms. `format=bibtex` returns a valid `@misc{…}` bibliography. No-`q` returns the usage doc. (Run locally with a mock req/res; not part of the repo.)

---
## What changed in v.27 — Phrase/proximity scoring + richer metadata

### v.27 Phase B — phrase & proximity-aware scoring (`src/lib/scoring.js`)
1. **Latent multi-word BM25F bug (fixed).** `machine learning` arrives as one array element; the old scorer matched it against single-word tokens, scored 0, and fell to the low-confidence fallback. `scoreResults` now splits terms into component words (`scoringWords`), strips stopwords, dedups, runs BM25F word-by-word.
2. **Phrase bonus** — verbatim contiguous run → `FIELD_WEIGHTS[f] × PHRASE_BOOST` (2.0).
3. **Proximity bonus** — ≥2 distinct query words within `PROX_WINDOW` (6) tokens → linear-decay bonus. Both gate on `score > 0`.

### v.27 Phase C — richer OpenAlex metadata (`parseOpenAlex.js`, `openalex.js`, `curatedJournals.js`)
1. **MeSH enrichment** — `w.mesh[].descriptor_name` folded into `keywords`.
2. **`select=` payload trimming** — `OA_SELECT` SSOT; `host_venue` excluded (would 400).

### v.27 relevance fix — global low-confidence gate (`useFilters.js`)
Loose-match pollution fixed: compute `anyGenuine` across **all** sections; if a genuine match exists anywhere, drop every adapter's loose matches; guesses show only when nothing anywhere matched.

### v.27 RRF wiring (`semantic.js`)
Phase C keywords now feed the semantic arm too — keywords get a reserved 140-char tail budget (`KW_BUDGET`) within the 512-char window.

### v.27 deprecation
Semantic Scholar deregistered from `ADAPTERS` and the settings UI (file retained, inert).

---
## What changed in v.26 — Search relevance overhaul (retrieval layer)
Field-scoped retrieval fixed author-name pollution at the source. Core scholarly adapters (OpenAlex, Curated, DOAJ, Crossref) + NCBI/IA/OpenNeuro scope to content fields; heritage/museum sources keep creator-inclusive search by design. `authorSearch` toggle (default false) flips scholarly adapters back to author-inclusive. See v0.27 report history for the full per-adapter table.

---
## Retrieval + scoring architecture (v0.28)

```
Query
  │
  ├── RETRIEVAL (per adapter)  ← content-scoped by default (v0.26)
  │     scholarly: title/abstract/keywords only (authorSearch OFF)
  │     heritage:  all-field (creator = legitimate discovery)
  │
  ├── expandTerms(terms, synonyms) ──→ expanded terms (UI only; API v1 = synonyms off)
  │
  ├── BM25F(results, terms) ──→ _score per result   ← scoring.js (shared UI + API)
  │
  ├── cross-adapter DOI dedup + global low-confidence gate   ← useFilters.js (UI) / api/search.js (API)
  │
  └── [UI only, semanticSearch ON] Embed → cosine → RRF(lexical×0.6, semantic×0.4, k=60)
```

**Two front-ends over one core:**
- **Browser:** `useSearch.js` (orchestration) + `useFilters.js` (gate) + optional client-side semantic RRF.
- **Server:** `api/search.js` (orchestration + gate inline). **Semantic rerank is browser-only by design** (model runs in a Web Worker; zero Vercel cost) — the API returns BM25F-ranked results.

### SSOT boundaries
| Concern | SSOT file |
|---|---|
| Adapter retrieval query construction | each adapter file (core/*, extensions/*, api/search/*) |
| Author-search mode | `settings.authorSearch` |
| BM25F lexical scoring | `src/lib/scoring.js` |
| Synonym expansion | `src/lib/synonyms.js` |
| Semantic embedding | `src/lib/semantic.js` + `src/workers/embed.worker.js` |
| Rank fusion | `src/lib/rrf.js` |
| Citation formatting / export | `src/lib/citations.js` |
| Browser search orchestration | `src/hooks/useSearch.js` + `src/hooks/useFilters.js` |
| **Server search orchestration** | **`api/search.js`** |
| Cross-adapter dedup | `useSearch.js` (UI) / `api/search.js` (API) |

---
## UnifiedResult schema (unchanged from v0.17)
```js
// Required: title, id, source
// Standard: authors[], year, journal, publisher, volume, issue, pages, doi, url, abstract, isOA, type
// Enrichment (v0.17+): editors[], keywords[], subjects[], language, citedBy, previewImage
// Pipeline-internal (_): _normalized, _type, _authorsParsed, _editorsParsed, _score, _lowConfidence
```
The API exposes the public fields + `score` + `lowConfidence` + `citations`, dropping the underscore-prefixed internals.

---
## Sprint history summary
| Version | Summary |
|---|---|
| v0.24 | Unified ranked view (default). Source view toggle. Zero-result chip row. SearchStatusBar. |
| v0.25 | BM25F scorer. Synonym expansion. Client-side semantic search (all-MiniLM-L6-v2). RRF fusion. |
| v0.26 | Field-scoped retrieval — fixed author-name pollution at the source. Author-search toggle. |
| v0.27 | Phrase/proximity scoring (fixed multi-word BM25F bug). MeSH keyword enrichment + `select=` trim. Global low-confidence gate. Keywords feed semantic arm. Semantic Scholar deregistered. |
| v0.28 | **Public REST search endpoint** (`api/search.js`) — Node function reusing the UI's retrieval/normalize/BM25F/citation pipeline. Core scholarly adapters only; JSON + bibliography formats; optional API-key gate. Headless test harness + Phase 3C feature kickoff. |

---
## Roadmap
### Phase 3A — Stripe billing (Starter $2.99/mo, Pro $9.99/mo); webhook → `plan` on Prisma user; gate result counts/adapters by tier.
### Phase 3B — Agent billing (Base L2, SIWE).
### Phase 3C — RESTful API endpoint — **kicked off in v0.28.** Remaining:
- **Server-side proxy adapters** — make `proxiedFetch` server-aware (absolute base URL from request host, or fetch upstream directly since CORS is a browser-only constraint) + a regex/non-DOMParser XML path so heritage/SRU/OAI adapters can run in the API. Then widen `SERVER_SAFE_IDS`.
- **Pagination** — `offset`/`page` params with a faithful per-adapter loop (mirror the client's `offset = combined.length` semantics; dedup by DOI to absorb OpenAlex page overlap).
- **Rate limiting / quotas** — tie to Phase 3A plan tiers; the `OPENCITE_API_KEY` env gate is a stopgap.
- **Synonym expansion in the API** — wire `expandTerms` behind a `?synonyms=1` param.
- **OpenAPI/usage docs** — expand the self-documenting no-`q` response into a published schema.

### Field-scoping queue (deferred from v0.26 — verify syntax before applying)
SciELO ES mapping; PANGAEA ES fields; Smithsonian/Europeana/Northwestern fielded syntax; SRU CQL scoping (ONB/BnF/Gallica) — only if heritage author-pollution becomes a real complaint.

### Search quality tuning queue
BM25F params (k1, b, weights); RRF blend ratio; push phrase intent into adapter retrieval; abstract/keyword enrichment for non-OpenAlex adapters; cross-adapter semantic rerank on loadMore.

---
## Key architectural constraints
- **One core, two front-ends.** Browser (`useSearch`/`useFilters`) and server (`api/search.js`) share `scoring.js`, `citations.js`, `normalize.js`, and the adapter registry. Keep ranking/citation logic in `lib/`, not in either front-end.
- **Edge routes cannot import from `src/`; Node functions can.** `/api/search` is a Node function for exactly this reason. Edge adapter routes (`api/search/*.js`) keep their inline helpers.
- **Semantic search is browser-only.** Model loads from CDN in a Web Worker; zero Vercel cost. The API stays BM25F-ranked.
- **Retrieval is content-scoped for scholarly sources, all-field for heritage.** The author-pollution bug is scholarly-specific; `authorSearch` flips scholarly adapters.
- **No stubs.** Document gaps here instead.
- **We test on Vercel, not locally.** Never run `npm install` / Vite builds locally. (A throwaway Node smoke test of the pure-fetch API endpoint is the one safe exception — it validates server logic before deploy without touching the build.)
- **Zero-result vs error.** `results: []` = no matches. `results: null` = adapter error. The API maps these to `sources[ID].count` / `sources[ID].error`.
- **Antigravity Protocol (Mode C).** Large tasks: plan → approval → execute.
```
