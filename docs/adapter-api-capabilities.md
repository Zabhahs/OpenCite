# Adapter API Capabilities

Reference for every search adapter in OpenCite: official API documentation, wire
protocol, authentication, query/pagination capability, and an efficiency tier.
Compiled from a per-adapter documentation deep-dive.

- **Scope:** 27 registered adapters + 1 deregistered (`SemanticScholar`).
- **Endpoints** are the exact URLs the app currently calls (see `src/adapters/` and `api/search/`).
- **"unverified"** = the behaviour could not be confirmed from official docs.

---

## Capability tiers (efficiency)

Tiers rank adapters by how cheap and predictable they are to query at scale
(requests per result, paging depth, throttling, doc quality).

### Tier 1 — Rich REST, easy to scale
Single JSON request, free-text + filters, totals returned, deep paging via cursor.
Cheapest and most predictable.

> OpenAlex · Crossref · DOAJ · CuratedJournals · DPLA · Europeana · Smithsonian · Internet Archive

### Tier 2 — Capable but protocol-specific
Powerful, but require a protocol-aware query builder. Worth sharing a builder per
protocol family.

> Gallica · BnF catalogue · ONB (SRU/CQL) · British Library (SPARQL) · PANGAEA (raw Elasticsearch) · OpenNeuro (GraphQL) · Northwestern (OpenSearch)

### Tier 3 — Extra round-trips or hard caps
Cost more per result: two-step ID→detail fetches, small page caps, or aggressive throttling.

> Met (IDs → per-object fetch) · NCBI/PubMed (esearch → esummary) · Gallica (≤50/page) · Chronicling America & LC Datasets (100k paging cap + 429 throttling)

### Tier 4 — Constrained or fragile
Architecturally mismatched, undocumented, or community-run.

> Mexicana (OAI-PMH — no keyword search) · Wikidata (lookup ≤50, no totals) · Thaqalayn · Princeton DPUL · BDH/BNE · SciELO (sparse docs)

---

## Master table

| Adapter | Protocol | Auth | Search depth | Pagination & cap | Total count |
|---|---|---|---|---|---|
| DOAJ | REST-JSON (ES syntax) | none | metadata + abstract | page/pageSize | yes |
| OpenAlex | REST-JSON | free key (polite) | metadata + abstract | page ≤10k, then cursor | yes |
| Crossref | REST-JSON | mailto polite pool | metadata | offset/rows; deep→cursor | yes |
| CuratedJournals | REST-JSON (OpenAlex) | free key | metadata | same as OpenAlex | yes |
| NCBI / PubMed | XML E-utilities | key → 10 r/s | metadata, fielded | retstart/retmax | yes |
| SciELO | REST-JSON (Elasticsearch) | none | abstract + keywords | start/rows | yes (`hits.total`) |
| Europeana | REST-JSON | free key | metadata + facets | start/rows; >1000→cursor | yes |
| DPLA | REST-JSON-LD | free key | metadata | page/page_size | yes |
| Smithsonian | REST-JSON | key (api.data.gov) | metadata + filters | start/rows | yes |
| Rijksmuseum | REST | legacy key | metadata | p/ps; new API cursor | yes |
| Met | REST-JSON | none | metadata | IDs only → per-object fetch | yes |
| Internet Archive | REST-JSON | none | metadata + full-text | offset/limit + cursor | yes |
| OpenContext | REST JSON-LD | User-Agent required | faceted (URI slugs) | start/rows ≤1000 | yes |
| PANGAEA | raw Elasticsearch (unofficial) | none | ES DSL | from/size, 10k window | yes |
| OpenNeuro | GraphQL | optional token | schema-based | cursor (introspect) | unverified |
| ENA | REST | none | fielded, by result type | offset/limit; 50 r/s; 100k cap | yes (`limit=0`) |
| Northwestern | REST (OpenSearch) | none | boolean + aggregations | unverified | unverified |
| Gallica | SRU 1.2 / CQL | none | metadata + full-text | startRecord/max ≤50 | yes |
| BnF catalogue | SRU 1.2 / CQL | none | metadata (bib/aut) | startRecord/max | yes |
| ONB | Alma SRU / CQL | none / basic | metadata | startRecord/max ≤10k | yes |
| British Library | SPARQL | none | arbitrary RDF | LIMIT/OFFSET | via COUNT() |
| Wikidata | MediaWiki API | none (UA) | entity lookup ≤50 | `continue` token | no |
| Chronicling America | LoC JSON (`fo=json`) | none | free-text | sp/c ≤1000; 100k cap, 429s | yes |
| LC Datasets | LoC JSON | none | free-text | sp/c ≤1000; rate-limited | yes |
| BDH / BNE | linked-data REST + SPARQL | none | keyword | start/rows | unverified |
| Mexicana | OAI-PMH | none | harvest-only, no keyword | resumptionToken | no |
| Princeton DPUL | Blacklight JSON | none | free-text + facets | page-based | yes |
| Thaqalayn | REST-JSON | none | keyword (`|` OR) | unverified | unverified |
| _SemanticScholar (deregistered)_ | REST | approval key | metadata | offset/limit | yes |

---

## Per-adapter detail

### Core

#### DOAJ
- **Docs:** https://doaj.org/api/v3/docs
- **Endpoint:** `https://doaj.org/api/v3/search/articles/{query}?pageSize=&page=`
- **Protocol:** REST-JSON, Elasticsearch query syntax (dot-notation fielded queries).
- **Auth:** none for search (API key only for writes).
- **Query:** free-text + fielded; metadata + abstract.
- **Pagination:** `page` / `pageSize`. Total count returned.
- **Rate limits:** ~2 req/s (bursts to 5).
- **Sorting:** yes (`sort=field:asc|desc`).
- **Gotchas:** v4 exists; app uses v3.

#### OpenAlex
- **Docs:** https://developers.openalex.org/api-reference/introduction
- **Endpoint:** `https://api.openalex.org/works?filter=&sort=&per_page=&page=&select=`
- **Protocol:** REST-JSON.
- **Auth:** free API key / polite-pool email recommended.
- **Query:** free-text + rich `filter=`; metadata + reconstructed abstract.
- **Pagination:** `page`/`per_page` (max 100/page) capped at **10,000 results**; use **cursor** paging beyond that.
- **Total count:** yes (`meta.count`).
- **Gotchas:** cursor required for deep paging.

#### Crossref
- **Docs:** https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- **Endpoint:** `https://api.crossref.org/works?query=&rows=&offset=&mailto=`
- **Protocol:** REST-JSON.
- **Auth:** none; `mailto` opts into the faster "polite pool".
- **Query:** free-text + filters + faceting; metadata.
- **Pagination:** `offset`/`rows`; deep paging via cursor (`cursor=*`).
- **Rate limits:** ~50 req/s (varies by pool).
- **Gotchas:** always send `mailto` for stability.

#### CuratedJournals
- **Docs:** (uses OpenAlex) https://developers.openalex.org/api-reference/introduction
- **Endpoint:** `https://api.openalex.org/works?filter=...` (curated journal filter)
- Inherits all OpenAlex capabilities and caps.

---

### Sciences

#### NCBI / PubMed (E-utilities)
- **Docs:** https://www.ncbi.nlm.nih.gov/books/NBK25497/
- **Endpoints:** `esearch.fcgi` (UIDs) then `esummary.fcgi` (db=pubmed).
- **Protocol:** XML (JSON for some utilities).
- **Auth:** none = 3 req/s; **API key = 10 req/s**.
- **Query:** free-text + field tags.
- **Pagination:** `retstart`/`retmax`. esearch returns total count.
- **Gotchas:** **two-step** pattern (search → summary) costs extra requests; register `tool`+`email`.

#### SciELO
- **Docs:** https://scielo.readthedocs.io/
- **Endpoint:** `https://search.scielo.org/api/v2/search?q=&rows=&start=&lang=en`
- **Protocol:** REST-JSON.
- **Auth:** none.
- **Query:** free-text; metadata.
- **Pagination:** `start`/`rows`. Total count unverified.
- **Gotchas:** v2 search docs are sparse; ArticleMeta API is better documented.

#### PANGAEA
- **Docs:** https://wiki.pangaea.de/wiki/Technology (no dedicated ES doc)
- **Endpoint:** `https://ws.pangaea.de/es/pangaea/panmd/_search`
- **Protocol:** raw Elasticsearch DSL — **not officially advertised as a public API**.
- **Auth:** none.
- **Pagination:** `from`/`size`; standard 10k ES window.
- **Total count:** yes (`hits.total`).
- **Gotchas:** no SLA/support guarantees; preferred access is OAI-PMH or client libs (`pangaeapy`, `pangaear`).

#### OpenNeuro
- **Docs:** https://docs.openneuro.org/api.html
- **Endpoint:** `https://openneuro.org/crn/graphql`
- **Protocol:** GraphQL (Dataset/Snapshot types).
- **Auth:** optional bearer token.
- **Query:** GraphQL schema; discover via introspection.
- **Pagination / totals:** unverified — inspect schema.
- **Gotchas:** mutations require auth; search semantics undocumented.

#### ENA (European Nucleotide Archive)
- **Docs:** https://ena-docs.readthedocs.io/en/latest/retrieval/programmatic-access.html
- **Endpoint:** `https://www.ebi.ac.uk/ena/portal/api/search?result=study&query=&fields=&format=json&limit=&offset=`
- **Protocol:** REST (JSON/TSV/XML).
- **Auth:** none.
- **Query:** ENA query syntax, fielded; result types (study, sample, read_run, …).
- **Pagination:** `offset`/`limit`. Total count unverified.
- **Rate limits:** **50 req/s** (HTTP 429 on excess).
- **Gotchas:** Portal API "doc" is a Google Doc; query `/searchFields?result={type}` for available fields.

#### OpenContext
- **Docs:** https://opencontext.org/about/services
- **Endpoint:** `https://opencontext.org/query/.json?q=&rows=&start=&response=uri-meta`
- **Protocol:** REST JSON-LD / GeoJSON-LD.
- **Auth:** none, but **User-Agent header required** or risk blocking.
- **Query:** faceted via URI slugs; Boolean OR (`||`); hierarchy via `---`.
- **Pagination:** `start`/`rows` (default 20, max 1000). Total count returned.

---

### Cultural & primary sources

#### Europeana
- **Docs:** https://europeana.atlassian.net/wiki/spaces/EF/pages/2385313793/Europeana+APIs+Documentation
- **Endpoint:** `https://api.europeana.eu/record/v2/search.json?wskey=&query=&rows=&start=&profile=rich`
- **Protocol:** REST-JSON.
- **Auth:** free self-serve API key (`wskey`).
- **Query:** free-text + facets; metadata.
- **Pagination:** `start`/`rows`; **>1000 results requires cursor** (`cursor=*`).
- **Total count:** yes.

#### DPLA
- **Docs:** https://pro.dp.la/developers/api-codex
- **Endpoint:** `https://api.dp.la/v2/items?q=&page=&page_size=&api_key=`
- **Protocol:** REST-JSON-LD.
- **Auth:** free self-serve API key (32-char).
- **Query:** free-text + fielded; metadata.
- **Pagination:** `page`/`page_size`; response has `count`/`start`/`limit`. Total count returned.

#### Smithsonian Open Access
- **Docs:** https://www.si.edu/openaccess/devtools
- **Endpoint:** `https://api.si.edu/openaccess/api/v1.0/search?q=&start=&rows=&api_key=`
- **Protocol:** REST-JSON.
- **Auth:** API key via **api.data.gov** signup (free, separate account).
- **Query:** free-text + category/type filters.
- **Pagination:** `start`/`rows`. Total count + sort supported.

#### Rijksmuseum
- **Docs (legacy, used by app):** https://data.rijksmuseum.nl/object-metadata/api/
- **Docs (new, keyless):** https://data.rijksmuseum.nl/docs/search
- **Endpoint:** `https://www.rijksmuseum.nl/api/en/collection?key=&q=&p=&ps=&imgonly=true`
- **Protocol:** REST.
- **Auth:** app uses **legacy key**; the newer Linked-Art API needs no key.
- **Query:** free-text + fielded (creator, material, dating).
- **Pagination:** `p`/`ps` (legacy); new API is cursor (`pageToken`, max 100/page). Total count returned.
- **Gotchas:** migrate to `data.rijksmuseum.nl` (keyless, cursor) when possible.

#### Met (Metropolitan Museum)
- **Docs:** https://metmuseum.github.io/
- **Endpoints:** `.../search?q=&hasImages=true` then `.../objects/{id}`
- **Protocol:** REST-JSON.
- **Auth:** none.
- **Query:** free-text + filters (department, date, medium, geography…).
- **Pagination:** **none — search returns an array of objectIDs**; each needs a separate `/objects/{id}` call. Total count returned.
- **Rate limits:** ~80 req/s advisory.
- **Gotchas:** mandatory **two-step** fetch — batch detail calls.

#### Internet Archive
- **Docs:** https://archive.org/developers/
- **Endpoints:** `https://archive.org/advancedsearch.php` (metadata) and `https://be-api.us.archive.org/ia-pub-fts-api/` (full-text inside items).
- **Protocol:** REST-JSON.
- **Auth:** none.
- **Query:** Lucene-like fielded Boolean; **full-text supported**.
- **Pagination:** offset/limit or cursor (scraping API). Total count + sort returned.
- **Gotchas:** the `be-api` full-text endpoint lacks formal docs.

#### Northwestern University Digital Collections
- **Docs:** https://api.dc.library.northwestern.edu/docs/v2/index.html (source: https://github.com/nulib/dc-api-v2)
- **Endpoint:** `https://api.dc.library.northwestern.edu/api/v2/search`
- **Protocol:** REST-JSON over OpenSearch.
- **Auth:** none (public read).
- **Query:** Boolean, aggregations, range queries.
- **Pagination / totals / rate limits:** unverified from web docs; check the OpenAPI spec.
- **Gotchas:** also serves IIIF manifests.

#### Princeton DPUL
- **Docs:** none official (source: https://github.com/pulibrary/dpul)
- **Endpoint:** `https://dpul.princeton.edu/catalog.json?q=&per_page=&page=`
- **Protocol:** Blacklight JSON (JSON-API).
- **Auth:** none.
- **Query:** free-text (`q`) + `search_field` + facet filters (`f[field][]`).
- **Pagination:** page-based; response has `total_count`, `next_page`, `total_pages`.

---

### Library & linked-data protocols

#### Gallica (BnF digital library)
- **Docs:** https://api.bnf.fr/fr/api-gallica-de-recherche
- **Endpoint:** `https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&query=`
- **Protocol:** SRU 1.2 / CQL (`dc.title`, `dc.creator`, `text`; operators all/any/adj/prox).
- **Auth:** none.
- **Query:** fielded CQL + **full-text of content**.
- **Pagination:** `startRecord`/`maximumRecords` — **hard-capped at 50/page** (default 15). Total count returned.
- **Response:** XML (SRU / Dublin Core).
- **Gotchas:** companion Categories service returns JSON facets.

#### BnF catalogue général
- **Docs:** https://api.bnf.fr/fr/api-sru-catalogue-general (overview: https://api.bnf.fr/fr/decouvrir-api-bnf-fr)
- **Endpoint:** `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=`
- **Protocol:** SRU 1.2 / CQL (`bib.` and `aut.` contexts).
- **Auth:** none.
- **Query:** fielded CQL (author, title, subject, ISBN/EAN, ARK…); metadata.
- **Pagination:** `startRecord`/`maximumRecords`. Total count (`srw:numberOfRecords`).
- **Response:** UNIMARC (default) / Intermarc / Dublin Core.
- **Gotchas:** `bib.` and `aut.` contexts cannot be mixed.

#### ONB (Austrian National Library, Alma SRU)
- **Docs:** https://labs.onb.ac.at/en/dataset/catalogue/ (Alma SRU: https://developers.exlibrisgroup.com/alma/integrations/sru/)
- **Endpoint:** `https://obv-at-oenb.alma.exlibrisgroup.com/view/sru/43ACC_ONB?version=1.2&operation=searchRetrieve&query=`
- **Protocol:** Alma SRU 1.2 / CQL; institution code `43ACC_ONB`.
- **Auth:** none / optional basic.
- **Query:** CQL fielded (MMS-ID, AC-Number, Barcode, MARC indexes).
- **Pagination:** `startRecord`/`maximumRecords` — limit **10,000 records**. Total count returned.
- **Response:** marcxml (default) / Dublin Core.
- **Gotchas:** OAI-PMH also available at a parallel endpoint.

#### British Library (British National Bibliography)
- **Docs:** https://bnb.data.bl.uk/
- **Endpoint:** `https://bnb.data.bl.uk/sparql`
- **Protocol:** SPARQL over RDF.
- **Auth:** none.
- **Query:** arbitrary SPARQL graph queries (books, serials, forthcoming).
- **Pagination:** `LIMIT`/`OFFSET`; count via `COUNT(*)`.
- **Response:** RDF/XML, N-Triples, JSON-LD (content negotiation).
- **Gotchas:** service resumed post-2023 cyber incident; migration to a new "Share Family" platform announced — **at risk**.

#### Wikidata
- **Docs:** https://www.wikidata.org/wiki/Wikidata:Data_access
- **Endpoint:** `https://www.wikidata.org/w/api.php`
- **Protocol:** MediaWiki Action API (JSON). (Separate SPARQL service at query.wikidata.org.)
- **Auth:** none; send a descriptive User-Agent.
- **Query:** entity lookup (`action=query`), 50 titles/request (500 elevated); full-text via Elasticsearch.
- **Pagination:** `continue` token. **No guaranteed total count.**
- **Gotchas:** MediaWiki API (lookups) vs WDQS SPARQL (graph queries) are distinct tools; honor 429 / Retry-After.

---

### National / heritage (LoC + others)

#### Chronicling America (Library of Congress)
- **Docs:** https://www.loc.gov/apis/json-and-yaml/
- **Endpoint:** `https://www.loc.gov/collections/chronicling-america/?q=&fo=json&c=&sp=`
- **Protocol:** LoC JSON API (`fo=json`; public but lightly documented).
- **Auth:** none.
- **Query:** free-text + facets (`c=`).
- **Pagination:** `sp=` (page), `c=` up to 1000/page; **100,000-item deep-paging limit**.
- **Rate limits:** enforced — **429s and CAPTCHA under load**. Total count returned.
- **Gotchas:** legacy `chroniclingamerica.loc.gov` redirects to loc.gov; results can differ.

#### LC Datasets (Library of Congress search)
- **Docs:** https://www.loc.gov/apis/json-and-yaml/
- **Endpoint:** `https://loc.gov/search/?q=&fo=json&c=&sp=`
- Same protocol, caps, and throttling as Chronicling America (all loc.gov content).
- **Gotchas:** performance degrades with large `c`.

#### BDH / BNE (Biblioteca Nacional de España)
- **Docs:** no HTML docs; PDF at https://www.bne.es/sites/default/files/repositorio-archivos/API.pdf
- **Endpoint (server proxy):** `https://datos.bne.es/api/records?q=&start=&rows=&format=json`
- **Protocol:** linked-data REST (OpenSearch variant); separate SPARQL endpoint.
- **Auth:** none.
- **Query:** keyword (`q`); metadata derived from MARC 21 → RDF.
- **Pagination:** `start`/`rows`. Total count unverified.
- **Gotchas:** `datos.bne.es` (linked data) is distinct from `search.bne.es`.

#### Mexicana
- **Docs:** https://mexicana.cultura.gob.mx/en/repositorio/documentacion-tecnica
- **Endpoint (server proxy):** `https://mexicana.cultura.gob.mx/oai`
- **Protocol:** **OAI-PMH** (harvest-based).
- **Auth:** none.
- **Query:** OAI verbs (ListRecords, etc.) — **cannot do relevance keyword search**; only selective harvest by set/date/identifier.
- **Pagination:** `resumptionToken`. No reliable total.
- **Gotchas:** **architecturally mismatched to live keyword search** — flag for replacement.

#### Thaqalayn
- **Docs:** https://www.thaqalayn-api.net/api-docs/ (Swagger)
- **Endpoint:** `https://www.thaqalayn-api.net/api/v2/query?q=`
- **Protocol:** REST-JSON.
- **Auth:** none.
- **Query:** case-insensitive keyword, OR via `|`.
- **Pagination / totals:** unverified.
- **Gotchas:** community-run (unofficial); scrapes thaqalayn.net weekly; minimal parameter docs.

---

### Deregistered

#### Semantic Scholar (deregistered v0.27)
- **Docs:** https://api.semanticscholar.org/
- **Endpoint:** `https://api.semanticscholar.org/graph/v1/paper/search?query=&offset=&limit=&fields=`
- **Protocol:** REST.
- **Auth:** approval-only API key (poor cost/benefit → deregistered).
- **Query:** free-text; metadata. Pagination `offset`/`limit`; total count returned.
- Kept in `extensions/` but not registered.

---

## Action items surfaced by the review

1. **Mexicana** is OAI-PMH (harvest-only) — it cannot keyword-search. Mismatched to live search; consider dropping or replacing.
2. **Rijksmuseum** and **British Library** use legacy / at-risk endpoints. Rijksmuseum has a newer keyless cursor API; BnB SPARQL is post-incident and migrating to the "Share Family" platform.
3. **PANGAEA** queries a raw, undocumented Elasticsearch endpoint with no SLA — fragile; consider the supported OAI/REST path.
4. **Met** and **NCBI** require two-step (IDs → details) fetches — the main per-query cost amplifier; batch the detail calls.
5. **LoC pair** (Chronicling America, LC Datasets) has a 100k paging cap and 429/CAPTCHA throttling with no key to raise limits — cap paging defensively.

---

## Rank fitness (BM25F field coverage)

The unified view pools every adapter's results into one list and ranks them with
**BM25F over `title` (×3), `keywords`+`subjects` (×2), `abstract` (×1)**, plus a
small `citedBy` tiebreak (`src/lib/scoring.js`). An adapter ranks well **only if it
populates those text fields**. Below: what each adapter currently emits vs. what its
API can actually provide. "Gap" = the API exposes the field but the adapter drops it.

| Adapter | abstract | keywords/subjects | citedBy | Rank-relevant gap (fixable) |
|---|---|---|---|---|
| OpenAlex / CuratedJournals | ✅ | ✅ | ✅ | — (reference citizen) |
| Internet Archive | ✅ | ✅ | ✅ (downloads) | — |
| SemanticScholar *(deregistered)* | ✅ | ✅ | ✅ | — |
| DOAJ | ✅ | ✅ | ➖ none in API | — |
| SciELO | ✅ | ✅ | ➖ none in API | — |
| Crossref | ⚠️ sparse | ✅ subjects | ❌ **drops `is-referenced-by-count`** | **add `citedBy`** |
| NCBI / PubMed | ❌ **empty** | ✅ MeSH | ➖ | **add `efetch` abstract** |
| ONB | ✅ | ✅ | ➖ | — |
| ENA | ✅ | ✅ | ➖ | — |
| PANGAEA | ✅ | ✅ | ➖ | — |
| OpenNeuro | ✅ | ✅ | ➖ | — |
| Rijksmuseum | ✅ (longTitle) | ✅ | ➖ | — |
| Met | ⚠️ non-topical | ⚠️ non-topical | ➖ | weak by nature (object metadata) |
| BDH / BNE | ✅ | ✅ | ➖ | — |
| British Library | ✅ | ✅ | ➖ | — |
| Europeana | ✅ | ❌ | ➖ | **add `dcSubject`/`dcType` → subjects** |
| DPLA | ✅ | ❌ | ➖ | **add `sourceResource.subject` → subjects** |
| Smithsonian | ✅ | ❌ | ➖ | **add topic/index terms → subjects** |
| Northwestern | ✅ | ❌ | ➖ | check `subject`/`genre` facets |
| Princeton DPUL | ✅ | ❌ | ➖ | check Blacklight subject facet |
| Chronicling America | ✅ | ❌ | ➖ | LoC `subject` array available |
| LC Datasets | ✅ | ❌ | ➖ | LoC `subject` array available |
| Gallica | ⚠️ sparse | ❌ | ➖ | `dc:subject` when present |
| OpenContext | ✅ | ➖ | ➖ | category facets available |
| Mexicana | ✅ | ❌ | ➖ | OAI `dc:subject` |
| Thaqalayn | ✅ | ❌ | ➖ | minimal source data |
| BnF catalogue | ❌ **empty** | ❌ | ➖ | `dc:description` (sparse), `dc:subject` |
| Wikidata | ⚠️ short label | ❌ | ➖ | optional: Wikipedia extract enrichment |

### Rank-fitness tiers

- **A — full signal:** OpenAlex, CuratedJournals, Internet Archive, DOAJ, SciELO. Title + abstract + subject terms (+ citations where they exist). These dominate the pool correctly.
- **B — fixable gap:** **Crossref** (add citedBy — 1 line), **NCBI** (add efetch abstract), **Europeana / DPLA / Smithsonian / LoC pair / Chronicling America** (subject terms dropped — easy keyword wins).
- **C — structurally thin:** Met (object metadata, not topical text), Wikidata (one-line label), Gallica & BnF (catalogue records, little/no abstract). These will always under-score abstract-rich articles in a shared pool → candidates for a **per-source rank prior / floor** so they aren't buried.

### Enrichment facts (verified)

- **Crossref** citation count = `message.items[].is-referenced-by-count` (number). Abstract present but often missing (publisher-dependent).
- **NCBI** abstract is NOT in `esummary`; requires `efetch.fcgi?db=pubmed&id=…&rettype=abstract&retmode=xml`. One extra request per page.
- **BnF / Gallica** SRU expose `dc:description` (UNIMARC 330) but it is sparse for catalogue/digitized records — abstract-poor by nature.
- **Wikidata** longer text = Wikipedia TextExtracts API (`prop=extracts&exintro&explaintext`) via the entity's sitelink, not the Wikidata short description.

---

## Proposed machine-readable capability descriptor

Add a `capability` block to each adapter object so the registry, ranker, and UI can
reason about sources instead of hard-coding per-adapter behaviour. Strawman shape:

```js
capability: {
  protocol:    "rest-json",   // rest-json | sru | sparql | oai-pmh | graphql | elasticsearch | blacklight | mediawiki
  fulltext:    false,         // searches content body, not just metadata (IA, Gallica)
  pagination:  "offset",      // page | offset | cursor | token | none
  totalCount:  true,
  maxWindow:   10000,         // deep-paging cap, or null
  auth:        "none",        // none | key | polite
  rankFields:  {              // what the adapter actually emits today
    abstract:  "full",        // full | sparse | none
    subjects:  "full",        // full | sparse | none
    citedBy:   false,
  },
}
```

**How the rank system uses it (unified view):**
- `rankFields` → apply a **source prior / score floor** for thin sources (tier C) so
  primary-source records aren't structurally buried under abstract-rich articles.
- `citedBy` flag → only apply the citation tiebreak where the signal actually exists.
- `fulltext` → can weight/segment full-text snippet matches differently from metadata.
- `pagination` / `maxWindow` / `totalCount` → drive load-more and deep-paging guards
  generically instead of per-adapter `hasMore` math.

This descriptor is the single source of truth that ties the API capabilities above to
the per-adapter rank behaviour.
