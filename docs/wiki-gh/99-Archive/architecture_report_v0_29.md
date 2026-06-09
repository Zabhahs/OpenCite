<!-- AUTO-GENERATED from docs/wiki/99-Archive/architecture_report_v0_29.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->
# OpenCITE — Architecture Report
> **Canonical reference for the next Claude instance picking up this project.**
> Read this before touching any code. Contains full sprint history, schema, file map, roadmap, and execution checklists.
> Last updated: v0.29 — Humanities worldwide-coverage adapters + capability-aware ranking + dedup SSOT & unified-view load-more fixes
---
## Project overview
OpenCITE is a free meta-search engine for open-access scholarly databases. Searches multiple academic APIs in parallel, returns results with MLA 9 and APA 7 citations ready to paste. Deployed on Vercel at `citation.today` / `opencite.space`.

**Author:** Shahbaz Yusuf (baazijan). Moves fast, expects precise execution. Mode C (plan + halt) before large tasks. Mode B (fast path) for small changes. Never pad responses.

**Stack:** React/Vite frontend, Vercel Edge + Node.js serverless functions, Prisma + Supabase (Postgres), Auth.js v5 Google OAuth.

**Repo:** `Zabhahs/opencite_deploy` on GitHub, deployed via Vercel.

---
## What changed in v0.29

v0.29 is a four-commit release spanning two concerns: (1) expanding the adapter registry with 7 live-verified humanities and global-coverage sources, and (2) wiring the BM25F scorer to per-adapter capability data so heterogeneous sources rank fairly. Two follow-on commits added secondary dedup and unified-view book-chapter clustering.

### Commits (in order)
| Hash | Title |
|---|---|
| `bb14e2c` | v0.29: capability-aware adapter ranking (Sprints 1-3) |
| `19528b3` | v0.29: humanities worldwide-coverage adapters (Wave A + South Asia) |
| `a79236c` | api: secondary dedup by title+year+author fingerprint |
| `9252338` | ui: book-chapter clustering in unified view |
| `ac84623` | dedup: SSOT module + client-side title dedup; fix unified-view load-more |

---

### Sprint 1 — Machine-readable `capability` descriptor on all adapters

**What:** A `capability` block added to every registered adapter object as the SSOT for rank fitness, pagination logic, and UI signals. No behaviour change — additive data only.

**Descriptor shape:**
```js
capability: {
  protocol:   "rest-json",   // rest-json | sru | sparql | oai-pmh | graphql | elasticsearch | blacklight | mediawiki
  fulltext:   false,
  pagination: "offset",      // page | offset | cursor | token | none
  totalCount: true,
  maxWindow:  null,
  auth:       "none",        // none | key | polite
  rankFields: { abstract: "full", subjects: "full", citedBy: false },
}
```

**`capability` typedef + enums** live in `src/adapters/_shared/base.js`.

**Verified `rankFields` per adapter** (code-checked against actual emitted fields):

| Adapter | abstract | subjects | citedBy |
|---|---|---|---|
| OpenAlex, CuratedJournals | full | full | true |
| DOAJ, SciELO, Europeana, DPLA | full | full | false |
| Mexicana | full | full | false |
| Internet Archive | full | full | true (downloads — gated in scorer) |
| NCBI | **full** (Sprint 3: efetch abstract) | full (MeSH) | false |
| Crossref | sparse | sparse | **true** (Sprint 3: is-referenced-by-count) |
| Northwestern | full | **full** (Sprint 3: subject+genre facets) | false |
| BnF | none | full | false |
| Smithsonian, Gallica, ONB, BDH, BL, LC Datasets, Wikidata, Chronicling America | sparse | full | false |
| ENA | full | sparse | false |
| Princeton DPUL | sparse | none | false |
| Thaqalayn | full | none | false |
| OpenContext | sparse | none | false |
| Met, Rijksmuseum, PANGAEA, OpenNeuro | sparse | sparse | false |
| OAPEN, LA Referencia, OpenEdition, Open Library, CORE, NDLI, BASE | full | full | false |

**Files touched:** `src/adapters/_shared/base.js` + every adapter under `src/adapters/core/` and `src/adapters/extensions/`.

---

### Sprint 2 — Capability-aware BM25F scoring (`src/lib/scoring.js`)

Two scorer behaviours wired to `capability.rankFields`:

**1. `citedBy` tiebreak gating.**
The citation bonus (`min(citedBy / 5000, 0.3)`) now fires **only** when `capability.rankFields.citedBy === true`. Prevents IA download-counts from masquerading as citations, and avoids penalising sources that simply can't report citations.

**2. Thin-source prior.**
A source is "thin" when `rankFields.abstract ∈ {none, sparse}` AND `rankFields.subjects ∈ {none, sparse}`. On a complete title match (`score > 0` + every meaningful query word present in the title), a bounded additive prior `THIN_SOURCE_PRIOR = 0.4` is added. Protects catalogue and primary-source records from being structurally buried beneath abstract-rich-but-loosely-relevant articles.

**Threading:** `scoreResults(results, terms, getCapability)` takes an optional 3rd argument — a resolver `(result) → capability`. `useSearch.js` passes `() => adapter.capability` (homogeneous per-adapter batch); `api/search.js` pools all adapters and resolves via `capBySource[r.source]`.

**Files touched:** `src/lib/scoring.js`, `src/hooks/useSearch.js`, `api/search.js`.

---

### Sprint 3 — Tier-B field fixes (dropped signal recovered)

Each item is independently shippable; all three shipped in `bb14e2c`:

1. **Crossref `citedBy`** — maps `item["is-referenced-by-count"]` → `citedBy` (numeric guard → null when absent). Flipped `rankFields.citedBy` to true. (`src/adapters/core/crossref.js`)

2. **NCBI abstract via efetch** — parallel `efetch.fcgi?db=pubmed&id=…&rettype=abstract&retmode=xml` call alongside esummary. Local `parsePubmedAbstracts(xml)` helper concatenates `<AbstractText>` segments per PMID (Label-tagged sections joined). Failure degrades to empty abstract; never throws. Flipped `rankFields.abstract` to full. (`src/adapters/extensions/ncbi.js`)

3. **Northwestern subjects** — maps DC `subject[]` + `genre[]` label objects + free `keywords[]` → `subjects`/`keywords`. Flipped `rankFields.subjects` to full. (`src/adapters/extensions/northwestern.js`)

*Not fixable:* Princeton DPUL (`catalog.json` exposes only `readonly_*` facets, no subject field), OpenContext (no clean topical category term in `uri-meta`), Thaqalayn (no subject concept in hadith API).

---

### Wave A — Humanities worldwide-coverage adapters (`19528b3`)

Seven live-verified adapters added. Each is geared to its own API's field structure and emits the four ranker-read fields (`title`, `abstract`, `subjects`, `keywords`) with an honest `capability` descriptor.

| Adapter | File | Transport | Notes |
|---|---|---|---|
| `OAPEN` | `extensions/oapen.js` | client + proxy | DSpace REST; Pattern C (no total); subjects from `dc.subject.*` |
| `LA_REFERENCIA` | `extensions/laReferencia.js` | client + proxy | VuFind JSON; Pattern B; ORCID-stripping authors; nested array-of-arrays subject digging |
| `OPENEDITION` | `extensions/openEdition.js` + `api/search/openedition.js` | Edge route | Francophone/European SSH; POST `{q, pagination}` to `search-api.openedition.org`; server-side ranked-four mapping |
| `OPEN_LIBRARY` | `extensions/openLibrary.js` | client + proxy | 40M+ book edition records; rich subjects from OpenLibrary subject fields |
| `CORE` | `extensions/coreAc.js` | client + proxy | 200M+ OA outputs; full abstract + subjects |
| `NDLI` | `extensions/ndli.js` | client + proxy | National Digital Library of India |
| `BASE` | `extensions/base.js` | client + proxy | 300M+ OA documents; `needsKey: true` (free API key from base-search.net) |

**PhilPapers excluded** — live verification showed no public keyword-search JSON endpoint (only key-gated taxonomy feed + ToS-restricted bibliographic API + OAI-PMH harvest only). Tombstoned in `extensions/index.js` with full reasoning.

**New settings** added to `src/constants/defaults.js` for BASE API key.

**New authoring standard** codified as `docs/adapter-authoring-standard.md` — canonical procedure for all future adapters. Key mandates: live-verified contract, ranked four geared to the source API, honest `capability.rankFields`, pagination pattern matching `capability.totalCount`.

**Files touched (Wave A):** `api/proxy.js` (3 new allowlist entries), `api/search/openedition.js` (new Edge route), `docs/adapter-authoring-standard.md` (new), `src/adapters/extensions/{base,coreAc,laReferencia,ndli,oapen,openEdition,openLibrary}.js` (all new), `src/adapters/extensions/index.js`, `src/adapters/index.js`, `src/components/Panels.jsx`, `src/constants/{app,defaults}.js`.

---

### Secondary dedup in `api/search.js` (`a79236c`)

Collapses papers registered under multiple DOIs (e.g. JSTOR + publisher copy) that DOI-dedup misses. Uses a title+year+first-author-surname fingerprint as the key; keeps the highest-scored copy.

```js
const titleFingerprint = (r) => {
  const t = (r.title || "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const surname = (r.authors?.[0] || "").split(" ").pop().toLowerCase();
  return `${t}|${r.year || ""}|${surname}`;
};
```

Runs after DOI dedup. Results with no title (`key === null`) pass through untouched.

**File touched:** `api/search.js`.

> **Superseded by `ac84623`:** this inline fingerprint was generalized into `src/lib/dedup.js` and ported to the browser path — see *Dedup SSOT + unified-view load-more fixes* above. The UI gap is closed.

---

### Book-chapter clustering in the unified view (`9252338`)

**What:** chapters belonging to the same container book are displayed under a shared parent-work header in the unified ranked list, matching the behaviour that already existed in per-source view.

**How:**
- `src/lib/groupResults.js` — new module; exports `groupByParentWork(results)`. Detects `r._type === "book-chapter"` (or `book-section`, `book-part`, `reference-entry`) and groups by `r.journal` (the container title field). Non-chapter results pass through as single-item groups (`parentTitle: null`).
- `src/components/UnifiedResultList.jsx` — consumes `groupByParentWork`; renders parent-work headers with publisher/editors/year, per-chapter source attribution chips inside each group.
- `src/components/SourceSection.jsx` — refactored to import `groupByParentWork` instead of containing its own copy of the clustering logic (shared SSOT).
- Pagination counts **groups** rather than individual items so a cluster is never split across a page boundary.

**Files touched:** `src/lib/groupResults.js` (new), `src/components/UnifiedResultList.jsx`, `src/components/SourceSection.jsx`.

---

### Dedup SSOT + unified-view load-more fixes

Closes the v0.29 "UI gap": the secondary title-fingerprint dedup that `a79236c` added to `api/search.js` only is now generalized into a shared module and applied on **both** the browser and server paths. Two unified-view "Show 10 more" bugs fixed alongside.

**New SSOT module — `src/lib/dedup.js`.** Result identity + de-duplication, extracted from the inline copies that had appeared in `api/search.js` and `useSearch.js`:
- `doiKey(r)` / `titleFingerprint(r)` — the two dedup keys (DOI, then title+year+first-author-surname). A null key means no identity to key on → never deduped.
- `dedupFirstWins(records, keyFn, seen)` — streaming dedup for per-adapter arrival; first occurrence wins, the shared `Set` persists across batches and load-more pages. Browser path.
- `dedupHighestScore(records, keyFn)` — pooled dedup keeping the highest-scored copy per key. API path.

Two helpers because the arrival models genuinely differ: the browser scores each adapter's batch in isolation as it streams in, so scores aren't comparable across not-yet-arrived sources (→ first-wins); the API pools and scores everything once (→ keep highest).

**New gate SSOT — `applyConfidenceGate(scored, meaningful)` in `src/lib/scoring.js`.** The "drop loose matches unless nothing genuine matched" rule, previously written out three times (browser `search`, browser `loadMore`, API pooled gate) with subtle drift. Returns `{ results, lowConfidence }`.

**Browser path now matches the API** (`src/hooks/useSearch.js`): both `search` and `loadMore` run `dedupFirstWins` by DOI then title fingerprint (parallel `seenDOIs` + `seenTitles` refs, both reset per query) and gate via `applyConfidenceGate`.

**Bug fixes (unified view):**
1. **Multi-DOI duplicates in the UI** — title-fingerprint dedup now runs client-side, so a paper registered under both a JSTOR and a publisher DOI no longer renders as two cards.
2. **`loadMore` low-confidence leak** — load-more results that scored 0 were never flagged `_lowConfidence`, so they slipped past `useFilters`' `anyGenuine` gate and injected junk into the pool. Now gated identically to the initial search.
3. **"Show 10 more" appeared dead** (`src/App.jsx` `handleLoadMoreAll`) — it fired `loadMore` for every adapter with `hasMore` in `sectionStates`, including ones whose results were entirely gated out, fetching more junk that filtered to nothing visible. Now gated on `(filteredSections[a.id]?.results?.length || 0) > 0`, matching the button's own `hasMoreRemote` check.

**Files touched:** `src/lib/dedup.js` (new), `src/lib/scoring.js` (+`applyConfidenceGate`), `src/hooks/useSearch.js`, `src/App.jsx`, `api/search.js` (all dedup sites refactored onto the shared helpers).

---

## Retrieval + scoring architecture (v0.29)

```
Query
  │
  ├── RETRIEVAL (per adapter)  ← content-scoped by default (v0.26)
  │     scholarly: title/abstract/keywords only (authorSearch OFF)
  │     heritage:  all-field (creator = legitimate discovery)
  │
  ├── expandTerms(terms, synonyms) ──→ expanded terms (UI only; API v1 = synonyms off)
  │
  ├── BM25F(results, terms, getCapability) ──→ _score per result   ← scoring.js
  │     citedBy tiebreak gated by capability.rankFields.citedBy
  │     thin-source prior gated by both rankFields being sparse/none
  │
  ├── cross-adapter dedup: DOI + title+year+author fingerprint (both paths, via lib/dedup.js)
  │   + global low-confidence gate (lib/scoring.js applyConfidenceGate)
  │
  └── [UI only, semanticSearch ON] Embed → cosine → RRF(lexical×0.6, semantic×0.4, k=60)
```

---

## SSOT boundaries (current)

| Concern | SSOT file |
|---|---|
| Adapter retrieval query construction | each adapter file |
| Author-search mode | `settings.authorSearch` |
| BM25F lexical scoring + thin-source prior + citedBy gating | `src/lib/scoring.js` |
| Synonym expansion | `src/lib/synonyms.js` |
| Semantic embedding | `src/lib/semantic.js` + `src/workers/embed.worker.js` |
| Rank fusion | `src/lib/rrf.js` |
| Citation formatting / export | `src/lib/citations.js` |
| Book-chapter clustering | `src/lib/groupResults.js` |
| Browser search orchestration | `src/hooks/useSearch.js` + `src/hooks/useFilters.js` |
| Server search orchestration | `api/search.js` |
| Cross-adapter dedup (DOI + title+year+author) | `src/lib/dedup.js` — `dedupFirstWins` (UI) / `dedupHighestScore` (API) |
| Low-confidence gate | `src/lib/scoring.js` — `applyConfidenceGate` (both paths) |
| Adapter capability SSOT | `capability` block on each adapter object; typedef in `_shared/base.js` |
| Adapter authoring procedure | `docs/adapter-authoring-standard.md` |

---

## UnifiedResult schema (unchanged from v0.17)
```js
// Required: title, id, source
// Standard: authors[], year, journal, publisher, volume, issue, pages, doi, url, abstract, isOA, type
// Enrichment (v0.17+): editors[], keywords[], subjects[], language, citedBy, previewImage
// Pipeline-internal (_): _normalized, _type, _authorsParsed, _editorsParsed, _score, _lowConfidence
```

---

## Adapter registry (v0.29)

### Core (always on)
`DOAJ`, `OPENALEX`, `CROSSREF`, `CURATED` (OpenAlex filter over user ISSN list)

### Extensions (opt-in, 29 registered)
Pre-v0.18 heritage: `EUROPEANA`, `MET`, `SMITHSONIAN`, `DPLA`, `RIJKSMUSEUM`, `INTERNET_ARCHIVE`, `GALLICA`, `THAQALAYN`, `NCBI`, `OPENCONTEXT`, `NORTHWESTERN`, `PRINCETON_DPUL`, `PANGAEA`, `OPENNEURO`, `ENA`

v0.18 heritage: `CHRONICLING_AMERICA`, `ONB`, `BDH`, `BNF_API`, `BRITISH_LIBRARY`, `LC_DATASETS`, `MEXICANA`, `WIKIDATA`

v0.22B: `SCIELO`

v0.29 humanities: `LA_REFERENCIA`, `OAPEN`, `OPENEDITION`, `OPEN_LIBRARY`, `CORE`, `NDLI`, `BASE`

### Server-safe (usable by `api/search.js`)
`OPENALEX`, `CROSSREF`, `DOAJ`, `CURATED` — plain JSON fetch, no proxy/DOMParser needed.

### Tombstoned
`BDPI` — JSONP endpoint removed, new endpoint JS-only (no JSON API). `DELPHER` — requires legal credentials. `NLS` — no public search API. `PHILPAPERS` — no keyword-search JSON (OAI-only + ToS-gated). `SEMANTIC_SCHOLAR` — approval-only key, poor cost/benefit (deregistered v0.27).

---

## Sprint history summary

| Version | Summary |
|---|---|
| v0.24 | Unified ranked view (default). Source view toggle. Zero-result chip row. SearchStatusBar. |
| v0.25 | BM25F scorer. Synonym expansion. Client-side semantic search (all-MiniLM-L6-v2). RRF fusion. |
| v0.26 | Field-scoped retrieval — fixed author-name pollution at the source. Author-search toggle. |
| v0.27 | Phrase/proximity scoring (fixed multi-word BM25F bug). MeSH keyword enrichment + `select=` trim. Global low-confidence gate. Keywords feed semantic arm. Semantic Scholar deregistered. |
| v0.28 | Public REST search endpoint (`api/search.js`) — Node function reusing the UI's retrieval/normalize/BM25F/citation pipeline. Core scholarly adapters only; JSON + bibliography formats; optional API-key gate. |
| v0.29 | **Capability-aware ranking** (Sprint 1-3: descriptor SSOT, citedBy gating, thin-source prior, Crossref citedBy, NCBI efetch abstract, Northwestern subjects). **7 humanities adapters** (OAPEN, LA Referencia, OpenEdition, Open Library, CORE, NDLI, BASE). **Secondary dedup** (title+year+author fingerprint) generalized into `lib/dedup.js` and applied on both paths. **Book-chapter clustering** in unified view. **Unified-view load-more fixes** (`loadMore` low-confidence gating + `handleLoadMoreAll` visible-results gate). `docs/adapter-authoring-standard.md` codified. |

---

## Roadmap

### Phase 3A — Stripe billing (Starter $2.99/mo, Pro $9.99/mo); webhook → `plan` on Prisma user; gate result counts/adapters by tier.
### Phase 3B — Agent billing (Base L2, SIWE).
### Phase 3C — RESTful API endpoint — kicked off in v0.28. Remaining:
- **Server-side proxy adapters** — make `proxiedFetch` server-aware (absolute base URL from request host, or fetch upstream directly since CORS is a browser-only constraint) + a regex/non-DOMParser XML path for heritage/SRU/OAI adapters. Then widen `SERVER_SAFE_IDS`.
- **Pagination** — `offset`/`page` params with a faithful per-adapter loop.
- **Rate limiting / quotas** — tie to Phase 3A plan tiers.
- **Synonym expansion in the API** — `?synonyms=1` param.
- **OpenAPI/usage docs** — expand the self-documenting no-`q` response.

### Search quality queue
- **Relative score floor (future sprint — needs A/B testing).** API probe (2026-05-29) identified near-zero-score tangential results (e.g. score 0.09) passing the global low-confidence gate because they have `_score > 0`. A per-query relative floor (drop results with `score < N% of top score` when strong genuine hits exist) would eliminate this noise. Requires A/B testing to determine what threshold loses relevant results vs. what we accept as pollution — do not ship without data.
- BM25F params (k1, b, weights) tuning; RRF blend ratio.
- Abstract/keyword enrichment for non-OpenAlex adapters.
- Cross-adapter semantic rerank on loadMore.
- Push phrase intent into adapter retrieval as opt-in quoted-phrase support.

### Field-scoping queue (deferred from v0.26)
SciELO ES mapping; PANGAEA ES fields; Smithsonian/Europeana/Northwestern fielded syntax; SRU CQL scoping (ONB/BnF/Gallica) — only if heritage author-pollution becomes a real complaint.

### Adapter backlog (structural / fragility)
- **Mexicana** OAI-PMH cannot keyword-search — decide drop vs replace.
- **Rijksmuseum** / **British Library** on legacy/at-risk endpoints.
- **PANGAEA** raw undocumented Elasticsearch endpoint.
- **LoC pair** 100k cap + 429/CAPTCHA — defensive paging guard.
- **Wave B humanities adapters** — philosophy (PhilPapers alternative), East Asia, Middle East/Arabic.

---

## Key architectural constraints
- **One core, two front-ends.** Browser (`useSearch`/`useFilters`) and server (`api/search.js`) share `scoring.js`, `citations.js`, `normalize.js`, and the adapter registry. Keep ranking/citation logic in `lib/`, not in either front-end.
- **Edge routes cannot import from `src/`; Node functions can.** `/api/search` is a Node function for exactly this reason. Edge adapter routes (`api/search/*.js`) keep their inline helpers.
- **Semantic search is browser-only.** Model loads from CDN in a Web Worker; zero Vercel cost. The API stays BM25F-ranked.
- **Retrieval is content-scoped for scholarly sources, all-field for heritage.** Author-pollution bug is scholarly-specific; `authorSearch` flips scholarly adapters.
- **No stubs.** Document gaps here instead.
- **We test on Vercel, not locally.** Never run `npm install` / Vite builds locally. (A throwaway Node smoke test of the pure-fetch API endpoint is the one safe exception.)
- **Zero-result vs error.** `results: []` = no matches. `results: null` = adapter error.
- **Antigravity Protocol (Mode C).** Large tasks: plan → approval → execute.
