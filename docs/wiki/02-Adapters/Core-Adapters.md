---
machine_ids: [adapters.core.crossref, adapters.core.doaj, adapters.core.openalex, adapters.core.curatedJournals]
findings: [F-103]
runtime: both
status: healthy
tags: [adapter, core]
---

# Core Adapters

> The four always-on adapters (DOAJ, OpenAlex, Crossref, CuratedJournals) that anchor every search.

## What it is

Core adapters (`ADAPTER_CATEGORY.CORE`) are always enabled by default (`isAdapterDefaultEnabled` returns true for them). All four are `serverSafe: true`, use direct HTTPS upstream fetches (no `/api/proxy` required), and emit `nativeScore` or `nativeRank` for v.35 RRF fusion. They share `parseOpenAlexWork` (OpenAlex + CuratedJournals) and the pattern of field-scoped query construction to prevent author-name pollution.

## Dependencies

- All four import: `constants/defaults.js`, `constants/vocabulary.js`
- OpenAlex + CuratedJournals import: `adapters/_shared/parseOpenAlex.js`
- Crossref imports: `lib/helpers.js` (stripHtml), `lib/scoring.js` (hasContentMatch)
- DOAJ imports: `lib/helpers.js` (stripHtml)
- Imported by: `src/adapters/index.js` (ADAPTERS array)

---

## crossref

**File:** `src/adapters/core/crossref.js` · id: `CROSSREF` · 89 lines

**Upstream:** `https://api.crossref.org/works` (REST/JSON, Polite Pool)
**Corpus:** ~155M works
**Auth:** none required; `mailto=` param for polite pool
**Pagination:** offset (`rows` + `offset`); max window 10,000; `total-results` in response
**Protocol:** `rest-json`

### Field mapping
| Upstream | UnifiedResult |
|---|---|
| `it.title[0]` | `title` (stripHtml) |
| `it.author[].given + family` | `authors` |
| `it.editor[]` | `editors` |
| `it.issued.date-parts[0][0]` | `year` |
| `it.container-title[0]` | `journal` |
| `it.publisher` | `publisher` |
| `it.DOI` | `doi` |
| `it.URL` | `url` |
| `it.abstract` | `abstract` (stripHtml) |
| `it.subject[]` | `subjects` |
| `it.is-referenced-by-count` | `citedBy` |
| `it.score` | `nativeScore` (v.35) |
| `offset + i` | `nativeRank` (v.35) |

### Query construction
- Single word: `query=<term>` (all-field Solr)
- Multi-word + authorSearch off: `query.bibliographic=<term>` (title+author+journal+year)
- authorSearch on: `query.author=<term>`
- Post-filter (authorSearch off): `hasContentMatch(r, words)` drops results where the query term appears only in author name, not title/abstract/journal. This is the SSOT at `lib/scoring.js`.

### Known quirks
- `hasContentMatch` filter at `crossref.js:86` removes items but does **not** renumber `nativeRank`. The pre-filter Crossref position is preserved as the true source rank — correct for RRF.
- `isOA: false` hardcoded — Crossref doesn't return OA status in the works endpoint.
- `abstract` is sparse (Crossref doesn't index full abstracts for most works). `rankFields.abstract: "sparse"`.

---

## doaj

**File:** `src/adapters/core/doaj.js` · id: `DOAJ` · 68 lines

**Upstream:** `https://doaj.org/api/v3/search/articles/<query>` (Elasticsearch query string)
**Corpus:** ~10M articles
**Auth:** none
**Pagination:** page (`page` + `pageSize`); `data.total` in response
**Protocol:** `rest-json` (Elasticsearch behind a REST facade)

### Field mapping
| Upstream | UnifiedResult |
|---|---|
| `b.title` | `title` |
| `b.author[].name` | `authors` |
| `b.year` | `year` |
| `b.journal.title` | `journal` |
| `b.journal.publisher` | `publisher` |
| `b.journal.volume` / `b.journal.number` | `volume` / `issue` |
| `b.identifier[type=doi].id` | `doi` |
| `b.link[type=fulltext].url` | `url` |
| `b.abstract` (stripHtml) | `abstract` |
| `b.keywords[]` | `keywords` |
| `b.subject[].term` | `subjects` |
| `b.journal.language[0]` | `language` |
| `offset + i` | `nativeRank` (v.35) |

`isOA: true` hardcoded (DOAJ only indexes OA articles by definition).
`citedBy` not emitted (DOAJ has no citation count field).

### Query construction
- authorSearch off: `bibjson.title:(<clean>) OR bibjson.abstract:(<clean>) OR bibjson.keywords:(<clean>)` — field-scoped Lucene
- authorSearch on: bare `clean` query (all fields)
- Lucene reserved chars stripped from input: `doaj.js:29`
- DOAJ uses its default relevance order; no explicit sort → `nativeRelevance: "rank"` (position only)

---

## openalex

**File:** `src/adapters/core/openalex.js` · id: `OPENALEX` · 56 lines

**Upstream:** `https://api.openalex.org/works` (REST/JSON)
**Corpus:** ~250M works
**Auth:** optional `api_key=` or `mailto=` for polite pool
**Pagination:** page (`per_page` + `page`); `data.meta.count` in response; max window 10,000
**Protocol:** `rest-json`

Delegates result parsing entirely to `parseOpenAlexWork()` from `_shared/parseOpenAlex.js`. See [[02-Adapters/Adapter-Architecture#parseOpenAlexWork]].

### Query construction
- `is_oa:true` filter always applied (OA-only)
- authorSearch off: `title_and_abstract.search:<query>` — Kstem-stemmed, stopword-removed
- authorSearch on: `default.search:<query>` — all fields incl. authorships
- Commas stripped from query to prevent misparse as OpenAlex filter delimiter (`openalex.js:38`)
- `sort=relevance_score:desc` explicit — required when using `.search` filters
- `select=<OA_SELECT>` trims payload (v.27); `host_venue` intentionally excluded (400s if selected)

### Key emit
`nativeScore` = `w.relevance_score` (full-corpus float from OpenAlex), `nativeRank` = array position. Both passed to `parseOpenAlexWork` as `rank`.

---

## curatedJournals

**File:** `src/adapters/core/curatedJournals.js` · id: `CURATED` · 51 lines

**Upstream:** `https://api.openalex.org/works` (same as OpenAlex adapter)
**Corpus:** ~10K (user ISSN list subset of OpenAlex; conservative)
**Auth:** optional `openAlexKey` or `crossrefEmail`
**Pagination:** page (`per_page=5` fixed, `page`); `data.meta.count` in response
**Protocol:** `rest-json`

### What makes it different
- Requires at least one journal ISSN in `settings.curatedJournals`; throws `"No curated journals configured"` if empty.
- Filters by `primary_location.source.issn:<issn1>|<issn2>|...` before the title/abstract search filter.
- `per_page` is hardcoded to **5** (`curatedJournals.js:27`) regardless of `INITIAL_PAGE_SIZE` or `LOAD_MORE_PAGE_SIZE`. This is intentional (small trusted set) but means page math may drift if the defaults change.
- Output source tag overridden: `{ ...item, source: "CURATED" }` (not "OPENALEX") at `curatedJournals.js:48`.
- Delegates field mapping to `parseOpenAlexWork()` exactly like OPENALEX.

### Known quirks
- F-103: `per_page=5` is a magic number with no named constant; differs from all other adapters.

---

## 🩺 Health audit

- **Verdict:** healthy — all four adapters are clean, well-typed, and actively maintained.
- **Findings:**
  - [F-103] CuratedJournals `per_page` hardcoded to 5 at `curatedJournals.js:27` — not drawn from `INITIAL_PAGE_SIZE`/`LOAD_MORE_PAGE_SIZE`. Minor inconsistency; intentional design choice but undocumented.
- **Reuse:** OpenAlex and CuratedJournals correctly share `parseOpenAlexWork` — exemplary. Crossref and DOAJ both call `fetch()` directly (no proxy needed, correct).
- **Smells:** None critical. Crossref `isOA: false` hardcode is accurate but worth noting for future OA enrichment.

## See also

[[02-Adapters/Adapter-Architecture]] · [[02-Adapters/Extension-Adapters]] · [[02-Adapters/Adapter-Health-Matrix]] · [[03-Search-Pipeline/Ranking-Scoring]]

---

## F-103 — CuratedJournals per_page hardcoded to 5

`src/adapters/core/curatedJournals.js:27`: `const pageSize = 5;` — not drawn from `INITIAL_PAGE_SIZE` or `LOAD_MORE_PAGE_SIZE`. The page-math `Math.floor(offset / pageSize) + 1` will silently produce wrong page numbers if offset was advanced by a different page size elsewhere. **Severity: low** (only affects pagination when curated journals are configured; the user must set this up deliberately).

**Fix hint:** Use `const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;` and import those constants (already available in the file).
