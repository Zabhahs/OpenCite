---
machine_ids: [adapters.extensions.internetArchive, adapters.extensions.europeana, adapters.extensions.dpla, adapters.extensions.smithsonian, adapters.extensions.met, adapters.extensions.rijksmuseum, adapters.extensions.gallica, adapters.extensions.thaqalayn, adapters.extensions.ncbi, adapters.extensions.openContext, adapters.extensions.northwestern, adapters.extensions.princetonDpul, adapters.extensions.pangaea, adapters.extensions.openNeuro, adapters.extensions.ena, adapters.extensions.scielo, adapters.extensions.laReferencia, adapters.extensions.oapen, adapters.extensions.openEdition, adapters.extensions.openLibrary, adapters.extensions.coreAc, adapters.extensions.ndli, adapters.extensions.base, adapters.extensions.chroniclingAmerica, adapters.extensions.onb, adapters.extensions.bdh, adapters.extensions.bnfApi, adapters.extensions.britishLibrary, adapters.extensions.lcDatasets, adapters.extensions.mexicana, adapters.extensions.wikidata, adapters.extensions.semanticScholar]
findings: [F-104, F-105, F-106, F-107, F-108, F-109, F-110, F-111, F-112, F-113, F-114, F-115, F-116]
runtime: both
status: mixed
tags: [adapter, extension]
---

# Extension Adapters

> All 30 registered extension adapters plus 1 deregistered (Semantic Scholar). One subsection per adapter.

Extension adapters are `ADAPTER_CATEGORY.EXTENSION`. Most are disabled by default; the user enables them in settings. "Server-safe" (`capability.serverSafe: true`) adapters run in the `/api/search` Node fan-out; the rest are browser-only.

Three adapters are confirmed dead in production: [[#openneuro]], [[#ena]], [[#scielo]]. See [[02-Adapters/Adapter-Health-Matrix]] and [[09-Audit/Bugs]].

---

## internetArchive

**id:** `IA` · **file:** `src/adapters/extensions/internetArchive.js` · **status:** 🟢 healthy
**Upstream:** `https://archive.org/advancedsearch.php` (metadata) + `https://be-api.us.archive.org/ia-pub-fts-api/` (full-text OCR)
**Auth:** none · **Proxy:** no (direct fetch) · **serverSafe:** true
**Corpus:** ~40M texts · **Pagination:** page (metadata) + offset (FTS) · **totalCount:** true (metadata)

Dual-endpoint: metadata search returns rich item descriptions; FTS "search inside" catches matches that live only in OCR'd page text. Results are merged by `_identifier`; FTS snippets enrich metadata records that lack an abstract.

### Field mapping quirk — citedBy = downloads (F-104)
`internetArchive.js:100` (metadata) and `internetArchive.js:141` (FTS): `citedBy: downloads > 0 ? downloads : null`. IA does not expose citation counts; the `downloads` field is a cumulative download counter. This inflates `citedBy` for popular but non-scholarly items (e.g. Project Gutenberg novels). **Mitigated:** `rankFields.citedBy: false` tells the ranker to ignore it for scoring. The value is emitted for display only. The comments at `internetArchive.js:157–163` document this explicitly. Old v.35 D2 bug (popularity-sort) is **fixed**: no `sort=downloads+desc` anymore (`internetArchive.js:184`).

### nativeRank stamping
`internetArchive.js:230`: after merge, `nativeRank = offset + i` is assigned inline and `_identifier` deleted. This is the only adapter that stamps nativeRank **after** its own internal merge step — correct.

---

## europeana

**id:** `EUROPEANA` · **file:** `src/adapters/extensions/europeana.js` · **status:** 🔑 keyed (backend-injected)
**Upstream:** `https://api.europeana.eu/record/v2/search.json` · **Auth:** `wskey=` API key
**Proxy:** no · **serverSafe:** true · **Corpus:** ~58M records · **Pagination:** offset+1 (1-based `start`)

Hybrid routing: browser without user key → `/api/search/europeana` (backend-injected key, v.34); server or browser with user key → direct upstream. `needsKey: false` in descriptor (backend key is injected server-side). Type mapped via `EUROPEANA_TYPE_MAP`. Subjects from `dcSubject` (Dublin Core).

---

## dpla

**id:** `DPLA` · **file:** `src/adapters/extensions/dpla.js` · **status:** 🔑 keyed (backend-injected)
**Upstream:** `https://api.dp.la/v2/items` · **Auth:** `api_key=` param · **Proxy:** proxiedFetch (server)
**serverSafe:** true · **Corpus:** ~10M · **Pagination:** page

Browser → `/api/search/dpla` (backend key); server → `proxiedFetch` with `settings.dplaKey` injected. DOI-in-query handled: strips the `10.xxxx/` prefix before submitting to DPLA's keyword search. Type mapped via `DPLA_TYPE_MAP`. Subjects from `sourceResource.subject[]` (handles string or `{name}` object shapes).

---

## smithsonian

**id:** `SMITHSONIAN` · **file:** `src/adapters/extensions/smithsonian.js` · **status:** 🔑 keyed (backend-injected)
**Upstream:** `https://api.si.edu/openaccess/api/v1.0/search` · **Auth:** `api_key=` param
**Proxy:** no (direct fetch, server-side) · **serverSafe:** true · **Corpus:** ~18M · **Pagination:** offset

Browser → `/api/search/smithsonian` (backend key); server → direct fetch with `settings.smithsonianKey`. Type hardcoded `"primary-source"` — no type mapping (Smithsonian objects span wildly different categories, but the adapter omits the `type` field from `idx`). Subjects from `idx.type + idx.topic + idx.culture + idx.set_name`.

---

## met

**id:** `MET` · **file:** `src/adapters/extensions/met.js` · **status:** 🟢 healthy
**Upstream:** `https://collectionapi.metmuseum.org/public/collection/v1/search` then `/objects/<id>` per hit
**Auth:** none · **Proxy:** no · **serverSafe:** true · **Corpus:** ~500K · **Pagination:** none (client-side slice)

Two-step: search returns `objectIDs[]`, then parallel per-object detail fetch (`pageSize × 3` slice, then client-side relevance filter to `pageSize`). F-113: the fan-out is unbounded per page (up to `pageSize × 3` concurrent requests). `hasMore` based on objectIDs position, not count of fetched+filtered. `type` hardcoded `"image"`. `abstract` constructed from `medium + dimensions + creditLine`. No `nativeRank` / `nativeScore` emitted.

---

## rijksmuseum

**id:** `RIJKS` · **file:** `src/adapters/extensions/rijksmuseum.js` · **status:** 🟢 healthy (complex)
**Upstream:** `https://data.rijksmuseum.nl/search/collection` (Linked-Art Search) + per-object resolve
**Auth:** none · **Proxy:** proxiedFetch · **serverSafe:** true · **Corpus:** ~700K · **Pagination:** token (opaque)

Most complex adapter in the codebase. Three-step:
1. Parallel title= + creator= search streams (creator= page-1 only)
2. Per-object Linked-Art JSON-LD resolve
3. Per-object 2-hop image resolve (shows → VisualItem → DigitalObject → IIIF URL)

All resolves run concurrently in one `Promise.all`. No free-text `q=` param (API limitation, documented). Pagination via opaque `next.id` token from title stream. `abstract: ""` hardcoded — Linked-Art records have no free-text abstract. F-115: image resolve adds 2 extra sequential round-trips per item (inside the concurrent batch), making Rijksmuseum the slowest adapter by wall-clock time.

---

## gallica

**id:** `GALLICA` · **file:** `src/adapters/extensions/gallica.js` · **status:** 🟡 thin-shim
**Upstream:** BnF Gallica SRU via `/api/search/gallica` (server route)
**Auth:** none · **Proxy:** backend route · **serverSafe:** not set (browser shim only)
**Corpus:** ~9M · **Pagination:** offset · **Protocol:** SRU

Thin shim: all parsing done in the `/api/search/gallica` edge route. The adapter itself is 28 lines with no field mapping. Missing `serverSafe` and `corpusSize` in capability. `rankFields.abstract: "sparse"` (Gallica SRU abstracts are brief).

---

## thaqalayn

**id:** `THAQALAYN` · **file:** `src/adapters/extensions/thaqalayn.js` · **status:** 🟢 healthy
**Upstream:** `https://www.thaqalayn-api.net/api/v2/query` · **Auth:** none · **Proxy:** no
**serverSafe:** true · **Corpus:** ~50K hadiths · **Pagination:** none (client-side slice of full result set)

Single endpoint returns full match set; pagination is a client-side `all.slice(offset, offset+pageSize)`. `url` is always `https://thaqalayn.net/` (not item-level) — no deep link available from the API. `authors: []` hardcoded. `type: "textual"`. Subjects: none. Abstract = English or Arabic hadith text. F-108: url is always the homepage, not a deep link.

---

## ncbi

**id:** `NCBI` · **file:** `src/adapters/extensions/ncbi.js` · **status:** 🟢 healthy
**Upstream:** NCBI E-utilities (esearch → esummary + efetch in parallel)
**Auth:** none (public tier; no key required) · **Proxy:** no · **serverSafe:** true
**Corpus:** ~37M PubMed records · **Pagination:** offset · **Protocol:** rest-json (JSON + XML)

Three-step: esearch (IDs), esummary (metadata JSON) + efetch (abstract XML) run in parallel. Abstract parsed from PubMed XML using inline regex (`parsePubmedAbstracts`). MeSH headings → `keywords`. Field-scoped: `[Title/Abstract]` per word (authorSearch: `[Author]`). `isOA: false` hardcoded (PubMed doesn't reliably expose OA status in esummary). No `nativeRank` / `nativeScore`.

---

## openContext

**id:** `OPENCONTEXT` · **file:** `src/adapters/extensions/openContext.js` · **status:** 🟡 thin-shim
**Upstream:** `/api/search/opencontext` (server route) · **Auth:** none · **Proxy:** backend route
**serverSafe:** not set · **Corpus:** unknown · **Pagination:** offset

Thin shim (27 lines). No field mapping. Missing `serverSafe` and `corpusSize`. `rankFields.subjects: "none"` — subjects not mapped. `abstract: "sparse"`.

---

## northwestern

**id:** `NORTHWESTERN` · **file:** `src/adapters/extensions/northwestern.js` · **status:** 🟢 healthy
**Upstream:** `https://api.dc.library.northwestern.edu/api/v2/search` (Elasticsearch POST)
**Auth:** none · **Proxy:** try-direct-then-proxy (same pattern as OPENNEURO — see F-102)
**serverSafe:** true · **Corpus:** ~100K · **Pagination:** offset

Elasticsearch POST body. Subjects from `d.subject[] + d.genre[]` (label objects). Keywords from `d.keywords[]`. `previewImage` from IIIF thumbnail. `type: "manuscript"` hardcoded. F-102 pattern: tries `fetch()` directly first, falls back to `proxiedFetch` on catch — adds CORS error noise in browser.

---

## princetonDpul

**id:** `PRINCETON_DPUL` · **file:** `src/adapters/extensions/princetonDpul.js` · **status:** 🟢 healthy
**Upstream:** `https://dpul.princeton.edu/catalog.json` (Blacklight)
**Auth:** none · **Proxy:** proxiedFetch · **serverSafe:** true
**Corpus:** ~50K · **Pagination:** page

`getAttr` helper handles Blacklight's mixed attribute shapes (string, `{attributes: {value}}`, array). Multiple title field fallbacks. `type: "manuscript"` hardcoded. No subjects mapped (`rankFields.subjects: "none"`).

---

## pangaea

**id:** `PANGAEA` · **file:** `src/adapters/extensions/pangaea.js` · **status:** 🟢 healthy (verbose)
**Upstream:** `https://ws.pangaea.de/es/pangaea/panmd/_search` (Elasticsearch POST) + per-hit RIS fetch
**Auth:** none · **Proxy:** proxiedFetch · **serverSafe:** true
**Corpus:** ~400K · **Pagination:** offset

Two-step: Elasticsearch for IDs/titles, then `Promise.all` of per-hit RIS fetches for abstract/doi/keywords. Items missing both `doi` and `title` are filtered out (`pangaea.js:100`). F-116: every page triggers `pageSize` concurrent RIS fetches — significant fan-out (up to 20 extra requests per page). `type: "genomic-data"` hardcoded.

---

## openneuro

**id:** `OPENNEURO` · **file:** `src/adapters/extensions/openNeuro.js` · **status:** 🔴 dead
**Upstream:** `https://openneuro.org/crn/graphql` · **Auth:** none
**Proxy:** try-direct-then-proxy · **serverSafe:** true · **Corpus:** ~1K · **Pagination:** none

**Dead adapter confirmed.** GraphQL query fetches only the latest 100 datasets (`first: 100, orderBy: {created: descending}`). Client-side text filter then matches against query. The GraphQL endpoint has been returning errors or empty results in prod (v.36 diagnostic confirmed). F-107: `corpusSize: 1000` — only 100 datasets fetched; effectively a local client-side search over 100 items that may not match most queries. F-102 pattern: tries raw `fetch()` before proxy.

---

## ena

**id:** `ENA` · **file:** `src/adapters/extensions/ena.js` · **status:** 🔴 dead
**Upstream:** `https://www.ebi.ac.uk/ena/portal/api/search` · **Auth:** none · **Proxy:** no
**serverSafe:** true · **Corpus:** ~500K · **Pagination:** offset (no totalCount)

**Dead adapter confirmed.** The EBI ENA Portal API query syntax `study_title="*term*" OR study_description="*term*"` uses wildcard-within-quotes syntax that ENA frequently rejects with HTTP 400. `hasMore` is a page-full heuristic (`items.length === pageSize`) — no real total. F-109: wildcard syntax `"*query*"` triggers 400 errors on ENA's Portal API for most free-text queries, causing the adapter to always throw. No `nativeRank` / `nativeScore`.

---

## scielo

**id:** `SCIELO` · **file:** `src/adapters/extensions/scielo.js` · **status:** 🔴 dead
**Upstream:** `https://search.scielo.org/api/v2/search` (Elasticsearch)
**Auth:** none · **Proxy:** proxiedFetch · **serverSafe:** true · **Corpus:** ~1M · **Pagination:** offset

**Dead adapter confirmed.** `search.scielo.org/api/v2/search` is a private internal Elasticsearch endpoint not intended for public API use. Returns CORS errors or 403 in most environments. F-110: no public SciELO search API exists at this endpoint; the v2 search API requires internal access. `total` derived from `data.hits?.total` (scalar or nested `{value}`) — handled defensively. No `nativeRank` / `nativeScore`. No `citedBy`. Abstract multilingual object handled correctly.

---

## laReferencia

**id:** `LA_REFERENCIA` · **file:** `src/adapters/extensions/laReferencia.js` · **status:** 🟢 healthy
**Upstream:** `https://www.lareferencia.info/vufind/api/v1/search` (VuFind v1)
**Auth:** none · **Proxy:** proxiedFetch · **serverSafe:** true
**Corpus:** ~3M · **Pagination:** page · **totalCount:** true

Subjects decoded from VuFind's nested-array format (leaf of each branch, `::` split). Authors from `rec.authors.primary` keys (pipe-separated). `abstract: ""` hardcoded (`rankFields.abstract: "none"`) — VuFind records rarely carry abstracts. No `nativeRank` / `nativeScore`.

---

## oapen

**id:** `OAPEN` · **file:** `src/adapters/extensions/oapen.js` · **status:** 🟢 healthy
**Upstream:** `https://library.oapen.org/rest/search` (DSpace REST)
**Auth:** none · **Proxy:** proxiedFetch · **serverSafe:** true
**Corpus:** ~30K · **Pagination:** offset · **totalCount:** false (page-full heuristic)

`hasMore = results.length === pageSize` — no total count from DSpace REST. Metadata from `item.metadata[]` array filtered by `m.key`. Subjects from `dc.subject.classification` + `dc.subject.other`. Pages from `oapen.pages`. DOI stripped of URL prefix. `type` from `dc.type` (falls back to `"book"`).

---

## openEdition

**id:** `OPENEDITION` · **file:** `src/adapters/extensions/openEdition.js` · **status:** 🟡 thin-shim
**Upstream:** `/api/search/openedition` (server route, JSON POST proxied)
**Auth:** none · **Proxy:** backend route · **serverSafe:** not set · **Corpus:** unknown · **Pagination:** page

Thin shim (31 lines). No field mapping — all parsing in the server route. Missing `serverSafe` and `corpusSize`. Note: the upstream requires a JSON POST which the generic proxy can't carry (comment at `openEdition.js:5`); hence the dedicated route.

---

## openLibrary

**id:** `OPEN_LIBRARY` · **file:** `src/adapters/extensions/openLibrary.js` · **status:** 🟢 healthy
**Upstream:** `https://openlibrary.org/search.json`
**Auth:** none · **Proxy:** proxiedFetch · **serverSafe:** true
**Corpus:** ~40M editions · **Pagination:** offset · **totalCount:** true (`numFound`)

No abstract field (`rankFields.abstract: "none"`). Subjects are rich (verified: controlled vocabulary, up to 40 per record). `isOA` = whether `d.ia[]` is non-empty (scanned copy on IA). `type: "book"` hardcoded. No `nativeRank` / `nativeScore`. F-111: no abstract emitted; BM25F relies entirely on title + subjects.

---

## coreAc

**id:** `CORE` · **file:** `src/adapters/extensions/coreAc.js` · **status:** 🔑 keyed (user-managed)
**Upstream:** `https://api.core.ac.uk/v3/search/works`
**Auth:** `api_key=` (free, instant — user must register) · **Proxy:** proxiedFetch
**serverSafe:** intentionally absent/false (TOS D7: web/app human-only, excluded from /api/search)
**Corpus:** ~300M · **Pagination:** offset · **totalCount:** true

Key passed as query param (not `Authorization: Bearer`, which proxy strips). Keywords from `item.topics[].name`; subjects from `item.subjects[]`. URL priority: DOI → downloadUrl → fullTextIdentifier → first link. `language.code` (ISO 639). Auto-drops when `settings.coreKey` absent (throws with user-friendly message).

---

## ndli

**id:** `NDLI` · **file:** `src/adapters/extensions/ndli.js` · **status:** 🔑 keyed (user-managed)
**Upstream:** `https://ndl.iitkgp.ac.in/rest-api/search`
**Auth:** `api-key=` (free, user registers) · **Proxy:** proxiedFetch
**serverSafe:** intentionally absent/false (TOS D8: individual credentials only)
**Corpus:** ~90M · **Pagination:** offset · **totalCount:** true

DC fields arrive as string or array — all access is defensive (`str()` / `all()` helpers inline). `creator` field may be comma/semicolon-delimited — split and flattened. DOI extracted from identifier URL by regex pattern. `title.eng` fallback for bilingual records. Auto-drops when `settings.ndliKey` absent.

---

## base

**id:** `BASE` · **file:** `src/adapters/extensions/base.js` · **status:** 🟢 healthy
**Upstream:** `https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi` (Solr/JSON)
**Auth:** none · **Proxy:** proxiedFetch · **serverSafe:** not set · **Corpus:** ~300M · **Pagination:** offset

Field-scoped Solr query: `dctitle:(q) OR dcdescription:(q) OR dcsubject:(q)`. `dccreator` handles tab-delimited string (old records) or array (new). `dctype` and `dclanguage` may be arrays — `first()` helper. DOI stripped of URL prefix. No `nativeRank` / `nativeScore`. F-112: missing `serverSafe` and `corpusSize` in capability despite being a direct-fetch adapter that would work server-side.

---

## chroniclingAmerica

**id:** `CHRONICLING_AMERICA` · **file:** `src/adapters/extensions/chroniclingAmerica.js` · **status:** 🟢 healthy
**Upstream:** `https://www.loc.gov/collections/chronicling-america/?fo=json`
**Auth:** none · **Proxy:** proxiedFetch · **serverSafe:** true
**Corpus:** ~20M pages · **Pagination:** page · **totalCount:** true

Updated v.22A to `www.loc.gov` (after `chroniclingamerica.loc.gov` 308 redirect). Full-text OCR search. `abstract` is `description.join(" ").slice(0, 500)` — truncated at 500 chars. `authors: []` hardcoded. `type: "primary-source"` hardcoded.

---

## onb

**id:** `ONB` · **file:** `src/adapters/extensions/onb.js` · **status:** 🟢 healthy
**Upstream:** `https://obv-at-oenb.alma.exlibrisgroup.com/view/sru/43ACC_ONB` (SRU/DC)
**Auth:** none · **Proxy:** try-direct-then-proxy · **serverSafe:** true
**Corpus:** ~2M · **Pagination:** offset (SRU 1-based `startRecord`) · **totalCount:** true

Uses `xmlUtils.js`: `dcOne`, `dcAll`, `sruTotal`, `sruRecords`. Author role suffixes stripped (`", author."`, `", editor."` etc.) from `dc:contributor`. DOI extracted from `dc:identifier` (prefix check). `isOA: false` hardcoded. `type: "book"` hardcoded. F-102-variant: tries direct fetch first then proxy — same pattern as Northwestern.

---

## bdh

**id:** `BDH` · **file:** `src/adapters/extensions/bdh.js` · **status:** 🟡 thin-shim
**Upstream:** `/api/search/bdh` (server route, datos.bne.es REST)
**Auth:** none · **Proxy:** backend route · **serverSafe:** not set · **Corpus:** unknown · **Pagination:** offset

Thin shim (28 lines). No field mapping. Missing `serverSafe` and `corpusSize`.

---

## bnfApi

**id:** `BNF_API` · **file:** `src/adapters/extensions/bnfApi.js` · **status:** 🟢 healthy
**Upstream:** `https://catalogue.bnf.fr/api/SRU` (SRU/UNIMARC)
**Auth:** none · **Proxy:** try-direct-then-proxy · **serverSafe:** true
**Corpus:** ~15M · **Pagination:** offset (SRU 1-based) · **totalCount:** true

Uses `xmlUtils.js`: `sruTotal`, `sruRecords`, `unimarcOne`, `unimarcAll`. Subjects from UNIMARC 600/606/607 `$a` subfields. Author: prefers personal (700 family+given), falls back to corporate (710). No abstract (`rankFields.abstract: "none"` — UNIMARC has no abstract field). `isOA: true` hardcoded (incorrect — BnF catalogue records include non-OA items). F-114: `isOA: true` hardcode is wrong.

---

## britishLibrary

**id:** `BL` · **file:** `src/adapters/extensions/britishLibrary.js` · **status:** 🟡 thin-shim
**Upstream:** `/api/search/bl` (server route, BL SPARQL endpoint)
**Auth:** none · **Proxy:** backend route · **serverSafe:** not set · **Corpus:** unknown · **Pagination:** offset

Thin shim (29 lines). No field mapping. Missing `serverSafe`, `corpusSize`. SPARQL/BNB — no COUNT query, so `hasMore` depends on the server route's heuristic. `totalCount: false`.

---

## lcDatasets

**id:** `LC_DATASETS` · **file:** `src/adapters/extensions/lcDatasets.js` · **status:** 🟢 healthy
**Upstream:** `https://loc.gov/search/?fo=json` · **Auth:** none · **Proxy:** no (direct fetch)
**serverSafe:** true · **Corpus:** ~5M · **Pagination:** page · **totalCount:** true

`subject[]` may be strings or `{subject: "..."}` objects — handled. `url` prefixed with `https://loc.gov` if not already absolute. `type` mapped: `"online text"` → `"textual"`, else `"primary-source"`. `previewImage` from `image_url[0]`.

---

## mexicana

**id:** `MEXICANA` · **file:** `src/adapters/extensions/mexicana.js` · **status:** 🟡 thin-shim
**Upstream:** `/api/search/mexicana` (server route, OAI-PMH + client-side filter)
**Auth:** none · **Proxy:** backend route · **serverSafe:** not set · **Corpus:** unknown · **Pagination:** token

Thin shim (32 lines). OAI-PMH is harvest-only; search is a client-side filter over the harvested batch. No real total (`totalCount: false`). Token-based pagination. `nextToken` returned in response (adapter-specific key, not the generic `nextPageToken`). F-106: uses `nextToken` (non-standard key) instead of the generic `nextPageToken` field that `runSearch` propagates.

---

## wikidata

**id:** `WIKIDATA` · **file:** `src/adapters/extensions/wikidata.js` · **status:** 🟢 healthy
**Upstream:** Wikidata MediaWiki API (`action=query&list=search` + `action=wbgetentities`)
**Auth:** none (polite User-Agent header) · **Proxy:** no · **serverSafe:** true
**Corpus:** ~30M scholarly items · **Pagination:** offset · **totalCount:** true

Three-step: CirrusSearch (IDs) → batch entity fetch (metadata) → batch label fetch (journals, publishers, subjects, authors by Q-ID). `haswbstatement:P31=Q13442814` scopes to scholarly articles. Author priority: P2093 (plain string) over P50 (item Q-ID resolved to label). `LANG_MAP` avoids label fetches for common languages. No `nativeRank` / `nativeScore`.

---

## semanticScholar (DEREGISTERED)

**id:** `S2` · **file:** `src/adapters/extensions/semanticScholar.js` · **status:** deprecated
**Upstream:** `https://api.semanticscholar.org/graph/v1/paper/search`
**Auth:** `x-api-key` header (required; approval-gated — days wait)

Deregistered v.27. File kept in `extensions/` but **not** in `extensions/index.js` exports and **not** in the `ADAPTERS` array. Comment at `adapters/index.js:13–14` explains: approval-only key with poor cost/benefit. `protocol: "graphql"` in capability is incorrect — it's a REST/JSON endpoint, not GraphQL. F-116 (minor).

---

## 🩺 Health audit

- **Verdict:** mixed — 3 dead adapters, 4 thin shims missing capability metadata, 1 isOA bug.
- **Findings:** [F-104] [F-105] [F-106] [F-107] [F-108] [F-109] [F-110] [F-111] [F-112] [F-113] [F-114] [F-115] [F-116]
- **Reuse:** Many adapters duplicate the `try{direct-fetch}catch{proxiedFetch}` pattern (Northwestern, ONB, BnF) — see [[09-Audit/Duplication-and-Reuse#r-102]].
- **Smells:** Thin shims (Gallica, OpenContext, BDH, BritishLibrary, OpenEdition) are missing `serverSafe` and `corpusSize` — the ranker/coverage engine can't reason about them.

## See also

[[02-Adapters/Adapter-Architecture]] · [[02-Adapters/Core-Adapters]] · [[02-Adapters/Adapter-Health-Matrix]] · [[09-Audit/Bugs]] · [[09-Audit/Duplication-and-Reuse]]
