---
tags: [adapter, capability, dossier, revival-candidate]
adapter_id: EUROPE_PMC
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/EUROPE_PMC.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# EUROPE_PMC — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | EUROPE_PMC |
| Official API name | Europe PMC RESTful Web Service |
| Provider | European Bioinformatics Institute (EMBL-EBI), UK |
| Base URL | `https://www.ebi.ac.uk/europepmc/webservices/rest/` |
| Protocol | REST-JSON (also XML, Dublin Core) |
| Docs URL | https://europepmc.org/RestfulWebService |
| TOS URL | https://europepmc.org/developers (API free to use including commercially; automated bulk download of non-OA content prohibited) |
| Pre-audit tier | unranked (not yet integrated) |
| Dossier date | 2026-06-09 |

**Integration role assessment:** SEARCH source — strong primary. Europe PMC is the European PubMed mirror and aggregator: 33M+ publications from PubMed/MEDLINE, preprints (arXiv, bioRxiv, medRxiv, ChemRxiv, etc.), Agricola, patents, and more. 6.5M+ OA full-text articles. Strongest for biomedical/life sciences + preprints + clinical literature. Provides abstracts (~85%+), MeSH terms, citation counts, and OA flags. Closest to PubMed-class coverage available free via API.

---

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard | Custom EPMC schema; MEDLINE-aligned for PubMed subset; Dublin Core available |
| Serialization | JSON (default with `format=json`), XML, Dublin Core (RDF/XML) |
| Schema URL | Not published as OpenAPI; see https://europepmc.org/RestfulWebService for field documentation |
| Schema version | v6.9 (confirmed in live probe `version` field) |

---

## 3. Complete Field/Tag Inventory

Live probe: `GET https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=machine+learning+cancer&format=json&resultType=core&pageSize=2`

**Response envelope (core resultType):**

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|----------------|---------|-----------------|
| `version` | string | yes | API version (e.g. `6.9`) | internal |
| `hitCount` | integer | yes | Total matching results | `totalCount` |
| `nextCursorMark` | string | yes | Cursor token for next page (Base64) | `nextPage` |
| `nextPageUrl` | string | yes | Full URL for next page | — |
| `request.queryString` | string | yes | Query as processed | internal |
| `request.resultType` | string | yes | `core`, `lite`, or `idlist` | internal |
| `resultList.result[]` | array | yes | Array of result objects | `results` |

**Per-result fields (resultType=core):**

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|----------------|---------|-----------------|
| `id` | string | yes | Europe PMC internal ID (e.g. `42210259` or `PPR1244021`) | `sourceId` |
| `source` | string | yes | Source DB: `MED` (PubMed), `PPR` (preprint), `AGR` (Agricola), `PAT`, `CTX`, `NBK`, `ETH` | `source` |
| `pmid` | string | sometimes | PubMed ID | `pmid` |
| `pmcid` | string | sometimes | PubMed Central ID (e.g. `PMC13239807`) | `pmcid` |
| `doi` | string | sometimes | DOI | `doi` |
| `title` | string | yes | Article title | `title` |
| `authorString` | string | yes | Authors as formatted string (e.g. `Smith J, Jones A.`) | `authorString` |
| `authorList.author[]` | array | yes | Structured author objects | `authors` |
| `authorList.author[].fullName` | string | yes | Full name | `author.name` |
| `authorList.author[].firstName` | string | sometimes | First name | `author.first` |
| `authorList.author[].lastName` | string | sometimes | Last name | `author.last` |
| `authorList.author[].initials` | string | sometimes | Initials | — |
| `authorList.author[].authorId.type` | string | sometimes | `ORCID` | — |
| `authorList.author[].authorId.value` | string | sometimes | ORCID value | `author.orcid` |
| `authorList.author[].authorAffiliationDetailsList` | array | sometimes | Affiliation objects | `author.affiliation` |
| `authorIdList.authorId[]` | array | sometimes | List of ORCID IDs for all authors | — |
| `pubYear` | string | yes | Publication year (string `"2026"`) | `year` |
| `journalInfo` | object | sometimes | Journal metadata | `journal` |
| `journalInfo.journal.title` | string | yes | Journal name | `journal` |
| `journalInfo.journal.issn` | string | sometimes | Print ISSN | `issn` |
| `journalInfo.journal.essn` | string | sometimes | Electronic ISSN | `eissn` |
| `journalInfo.volume` | string | sometimes | Volume | `volume` |
| `journalInfo.issue` | string | sometimes | Issue | `issue` |
| `journalInfo.dateOfPublication` | string | sometimes | Full publication date | `pubDate` |
| `pageInfo` | string | sometimes | Page range (e.g. `"1634-1645"`) | `pages` |
| `abstractText` | string | sometimes | Full abstract text | `abstract` |
| `affiliation` | string | sometimes | Corresponding author affiliation | `affiliation` |
| `publicationStatus` | string | sometimes | `ppublish`, `epublish`, `aheadofprint` | `pubStatus` |
| `language` | string | sometimes | ISO language code (e.g. `"eng"`) | `language` |
| `pubModel` | string | sometimes | Publication model | internal |
| `pubTypeList.pubType[]` | array | sometimes | Publication types: `Journal Article`, `Review`, `Preprint`, etc. | `type` |
| `grantsList.grant[]` | array | sometimes | Funding grant objects | `funders` |
| `grantsList.grant[].grantId` | string | sometimes | Grant number | `grant.id` |
| `grantsList.grant[].agency` | string | yes | Funding agency name | `grant.agency` |
| `keywordList.keyword[]` | array | sometimes | Author-supplied keywords | `keywords` |
| `meshHeadingList.meshHeading[]` | array | sometimes | MeSH terms (PubMed-sourced records only) | `meshTerms` |
| `meshHeadingList.meshHeading[].descriptorName` | string | yes | MeSH descriptor | `mesh.term` |
| `meshHeadingList.meshHeading[].majorTopic_YN` | string | yes | `Y` or `N` | `mesh.isMajor` |
| `fullTextUrlList.fullTextUrl[]` | array | sometimes | Links to full text | `fullTextUrls` |
| `fullTextUrlList.fullTextUrl[].availability` | string | yes | `Free` or `Subscription required` | `isOA` |
| `fullTextUrlList.fullTextUrl[].availabilityCode` | string | yes | `F` or `S` | — |
| `fullTextUrlList.fullTextUrl[].documentStyle` | string | yes | `doi`, `html`, `pdf`, etc. | `urlType` |
| `fullTextUrlList.fullTextUrl[].url` | string | yes | URL | `url` |
| `isOpenAccess` | string | yes | `"Y"` or `"N"` | `isOA` |
| `inEPMC` | string | yes | `"Y"` or `"N"` — full text in EPMC | `inEPMC` |
| `inPMC` | string | yes | `"Y"` or `"N"` — full text in PMC | `inPMC` |
| `hasPDF` | string | yes | `"Y"` or `"N"` | `hasPDF` |
| `license` | string | sometimes | License string (e.g. `"cc by"`) | `license` |
| `citedByCount` | integer | yes | Citation count | `citedByCount` |
| `hasData` | string | yes | `"Y"` / `"N"` — has linked data | `hasData` |
| `hasReferences` | string | yes | `"Y"` / `"N"` — reference list available | `hasReferences` |
| `hasTextMinedTerms` | string | yes | `"Y"` / `"N"` — text-mining annotations available | internal |
| `hasDbCrossReferences` | string | yes | `"Y"` / `"N"` — DB cross-references (UniProt, ENA, etc.) | internal |
| `dataLinksTagsList.dataLinkstag[]` | array | sometimes | Data links: `altmetrics`, `fullText`, etc. | internal |
| `subsetList.subset[]` | array | sometimes | MEDLINE subsets (e.g. `"Index Medicus"`) | internal |
| `firstPublicationDate` | string | yes | ISO date of first publication | `firstPubDate` |
| `dateOfCreation` | string | yes | ISO date added to EPMC | internal |
| `electronicPublicationDate` | string | sometimes | ISO date of electronic publication | `epubDate` |
| `versionList.version[]` | array | sometimes | Preprint versions | `versions` |
| `bookOrReportDetails.publisher` | string | sometimes | For preprints: preprint server name | `publisher` |

> ★ Reference list: call `https://www.ebi.ac.uk/europepmc/webservices/rest/{source}/{id}/references` for full reference list when `hasReferences == "Y"`.
> ★ Citations: call `https://www.ebi.ac.uk/europepmc/webservices/rest/{source}/{id}/citations` for citing papers.

---

## 4. Query Semantics

**Full-text metadata search supported.** The `/search` endpoint accepts a `query` parameter with rich search syntax:

**Basic:**
```
query=climate change             # implicit AND between terms
query="climate change"           # phrase search
query=clim*                      # wildcard
```

**Fielded search:**
```
query=TITLE:cancer               # title-only
query=AUTH:Smith                 # author name
query=JOURNAL:"Nature Medicine"  # journal name
query=ABSTRACT:immunotherapy     # abstract text
query=MESH:neoplasms             # MeSH term
query=DOI:10.1038/s41591-026-04377-8  # by DOI
query=EXT_ID:42162298            # by PMID or source ID
```

**Boolean:**
```
query=cancer AND immunotherapy   # AND
query=cancer OR tumour           # OR
query=cancer NOT immunotherapy   # NOT
query=TITLE:cancer AND OPEN_ACCESS:Y  # combined with filter
```

**Filters built into query syntax:**
```
OPEN_ACCESS:Y                    # OA only
HAS_ABSTRACT:Y                   # has abstract
SRC:MED                          # PubMed only
SRC:PPR                          # preprints only
FIRST_PDATE:[2020 TO 2026]       # date range
PUB_TYPE:review                  # review articles
```

**Sort options** (via `sort` parameter):
- Default: relevance
- `CITED desc`: most cited first
- `P_PDATE_D desc` / `P_PDATE_D asc`: by publication date
- `AUTH_FIRST asc`: by first author
- Can also embed in query: `sort_cited:y`, `sort_date:y`

**Author-name pollution control:**
- Default query searches all fields including author name
- Use `TITLE:{query}` or `ABSTRACT:{query}` to restrict to content fields
- `AUTH:` prefix for intentional author search
- Empirical test: "Darwin" query returned hospital and geography results (Darwin, Australia) not just Charles Darwin — topic scoping needed
- Recommended OpenCITE topic-query pattern: `TITLE:{q} OR ABSTRACT:{q} OR MESH:{q}`

**Cross-lingual:** Synonym expansion available via `synonym=true` query parameter. No cross-lingual semantic search.

---

## 5. OA / Free-Access

| Field | Value |
|-------|-------|
| Whole-corpus OA? | No — 33M+ total; 6.5M OA full-text; OA fraction varies by source |
| OA flag field | `isOpenAccess` (string `"Y"`/`"N"`) + `fullTextUrlList[].availability` (`"Free"` or `"Subscription required"`) |
| Best-OA URL field | `fullTextUrlList[]` entries where `availabilityCode == "F"` and `documentStyle == "pdf"` |
| OA-only filter param | `OPEN_ACCESS:Y` in query string; confirmed working (hitCount=2,156,263) |
| Sort-by-OA | No dedicated sort |
| Flag coverage | High reliability for PubMed/PMC records (>95%); preprints inconsistent (`isOpenAccess: "N"` even when preprint is free) |
| Recommended strategy | `OPEN_ACCESS:Y` filter in query for OA-only results; fall back to `fullTextUrlList[availabilityCode=F]` for URL extraction |

---

## 6. Images / Thumbnails / IIIF

No thumbnails or IIIF. `hasPDF` flag available but no direct PDF URL in metadata (go via `fullTextUrlList`). No image content.

---

## 7. Discipline / Subject Tags

| Field | Value |
|-------|-------|
| Vocabulary | MeSH (for MEDLINE records); author keywords; subset lists |
| Field paths | `meshHeadingList.meshHeading[].descriptorName` + `meshQualifierList` / `keywordList.keyword[]` |
| Granularity | High for MeSH (multi-level, ~30,000 terms); author keywords are free-text |
| Example values | `Neoplasms`, `Climate Change`, `Precision Medicine`, `Tumor Microenvironment` |
| Hierarchy depth | MeSH has 12+ hierarchy levels; accessible via MESH: query field |
| Facet param | `MESH:{term}` query filter; no direct facet counts in response |
| Usability | HIGH for biomedical (MeSH is gold standard for life sciences faceting); LOW for non-biomedical records (Agricola/preprints often have author keywords only) |

---

## 8. Native Relevance & Scoring

| Field | Value |
|-------|-------|
| Score returned? | NO — confirmed absent in live probe (all response keys listed: no `score` field) |
| Default sort | Relevance (Lucene BM25 presumed) |
| Sort params | `sort_cited:y` (citation count), `sort_date:y` (newest first), `P_PDATE_D desc`, `CITED desc`, `AUTH_FIRST asc` |
| Cross-query comparable? | No |
| Semantics | Lucene/BM25 presumed (EBI uses Lucene-based search infrastructure); undocumented |

---

## 9. Pagination

| Field | Value |
|-------|-------|
| Mechanism | Cursor-based (`cursorMark` — Solr-style deep pagination) |
| Start | `cursorMark=*` for first page |
| Next page | Use `nextCursorMark` from response as `cursorMark` in next request |
| Page size | `pageSize` param; max empirically 1000; default 25 |
| Depth cap | No stated cap; cursor supports deep traversal |
| Cursor expiry | Not documented |
| Count field | `hitCount` — exact integer (461,639 for "climate change") |

**9b. Measured Latency (live probe, 3 warm calls, 2026-06-09):**

| Query type | Latency ms (×3) | Median |
|-----------|----------------|--------|
| Keyword (`climate change`) | 1063, 936, 659 | 936 ms |
| Multi-keyword fielded (TITLE:machine learning METHODS:cancer) | 786, 597, 565 | 597 ms |
| NL full sentence | 965, 749, 1043 | 965 ms |
| NL vs keyword delta | — | ~1.03× |

**Notes:** Excellent latency profile — sub-1 s median for all query types. NL queries perform nearly as well as keyword (within 5% delta for warm calls). Fielded multi-keyword actually faster than plain keyword (~600 ms). Cold first call ~1.2 s. No extra resolve round-trips needed for core resultType.

---

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No — completely keyless |
| Rate limits | 10 requests/second per IP (500 req/min) — confirmed via community forum; no per-day cap stated |
| Auth friction | None — open API, no registration |
| Backend-safe? | Yes |
| Identified tier | No tiered system — same rate for all |
| Rate-limit code | Not documented; likely HTTP 429 or 503 |
| Retry-After? | Not documented |
| Bulk restriction | "Not permissible to use any automated process to bulk download non-OA content from Europe PMC" |

---

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `isOpenAccess` | String `"Y"`/`"N"` not boolean; `"N"` for preprints even when free-to-read | `"isOpenAccess": "N"` on ResearchSquare preprint | Cross-check with `fullTextUrlList[availabilityCode="F"]` |
| `pubYear` | String, not integer | `"pubYear": "2026"` | `parseInt(r.pubYear, 10)` |
| `meshHeadingList` | Absent for non-PubMed sources (preprints, Agricola, patents) | PPR sources never have MeSH | Always null-check before accessing |
| `abstractText` | Contains JATS XML markup (`<title>Abstract</title>`, `<p>`) for some preprint records | `"<title>Abstract</title>  <p>Evolution..."` | Strip XML tags; use regex or DOMParser |
| `authorList.author[].authorId` | May be empty object `{}` | `"authorId": {}` | Check `authorId.type` exists before accessing `authorId.value` |
| `citedByCount` | Integer; always 0 for newly-indexed records; not always available for all sources | `0` on 2026 preprint | Don't penalise 0 — supplement with OpenCitations |
| `fullTextUrlList.fullTextUrl` | Array of objects serialised as strings in PowerShell output (`@{...}`) — JSON proper is correct | PS display artefact | Use native JSON parser; not a real hazard |
| `keywordList.keyword` | Array of strings; may be empty or contain single-element arrays | `[]` | Always `[].concat(val).filter(Boolean)` |
| `source` | Single char code (`MED`, `PPR`, `AGR`, etc.) required for resolve-by-ID calls | Must use `source`+`id` not just `id` | Store `source` alongside `id` for reference/citation resolve calls |
| `license` | Free-text string, not SPDX | `"cc by"`, `"cc-by-nc"`, `"CC BY 4.0"` | Normalise to SPDX via lookup table |

---

## 12. Exploitation Notes

**Integration Opportunity: SEARCH source — first-class for biomedical, preprints, clinical**

Europe PMC fills critical coverage gaps not met by OpenAlex/Crossref for:

1. **Biomedical depth**: 33M+ records with MeSH indexing, MEDLINE coverage, structured clinical trial data. OpenAlex covers similar volume but EPMC's per-record detail (MeSH, grants, DB cross-refs) is richer for bio/med queries.

2. **Preprint coverage**: Includes bioRxiv, medRxiv, ChemRxiv, ResearchSquare, arXiv life-science papers — the most complete free preprint aggregator in this API landscape. `SRC:PPR` filter isolates preprints.

3. **OA full-text**: 6.5M OA full-text articles with XML/HTML access via `inEPMC:Y`. This is the only source in the roster that provides structured full text for a significant corpus.

4. **MeSH faceting**: `MESH:{term}` queries enable controlled-vocabulary semantic search for life sciences — superior to keyword matching for biomedical queries.

5. **Grant/funder data**: Structured `grantsList` with agency + grant ID — enables "funded by NIH/Wellcome/HFSP" facet.

6. **Cross-database linking**: `hasDbCrossReferences:Y` + `DB:UNIPROT`, `DB:ENA` enable links to protein/genomic databases — relevant for bioinformatics users.

**Under-exploited fields:**
- `versionList.version[]`: Track preprint version history (v1 → v2 → published)
- `dataLinksTagsList.dataLinkstag[]`: `altmetrics` tag → Altmetric score available for this record
- `subsetList.subset[]`: MEDLINE classification enables disciplinary scoping
- Text-mining annotations: `hasTextMinedTerms:Y` enables querying chemical/gene/disease-tagged records via separate annotation API endpoint

**Query strategy recommendation:**
- Topic queries: `TITLE:{q} OR ABSTRACT:{q} OR MESH:{q}` to avoid author pollution
- OA-only mode: append `AND OPEN_ACCESS:Y`
- Preprint-only: `AND SRC:PPR`
- Date filter: `AND FIRST_PDATE:[{year} TO 2026]`

---

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score | 1 | Score not exposed; default ordering is relevance-ranked (Lucene BM25 presumed); monotone within request |
| A2 Query expressiveness | 2 | Fielded queries (TITLE/ABSTRACT/MESH/AUTH/SRC/OPEN_ACCESS); AND/OR/NOT; phrase; date ranges; no nested parens beyond simple chains |
| A3 Sort & filter control | 2 | Multiple sorts (cited, date, author); SRC filter, OPEN_ACCESS filter, PUB_TYPE filter; no facet counts in response |
| A4 Pagination depth / cursor | 3 | Solr cursor (`cursorMark`), no stated depth cap; confirmed working for deep traversal |
| A5 Batch / bulk endpoint | 2 | OAI-PMH service available for harvest; no batch ID endpoint; cursor for full crawl |
| A6 Throughput & rate limits | 2 | 10 req/s = 600 req/min; keyless; generous for a free API |
| A7 ID linkage / crosswalk | 3 | PMID, PMCID, DOI, ORCID (authors), database cross-refs (UniProt, ENA, OMIM); 4+ namespaces |
| A8 Result-count accuracy | 3 | `hitCount` exact integer confirmed (461,639 for climate change; 158,362 for ML+cancer); stable |
| A9 Semantic / NL query mode | 1 | BM25 with NL-tolerant tokenisation; `synonym=true` param for synonym expansion; no vector/semantic mode; NL queries perform well empirically (~same latency as keyword) |
| A10 Author-name pollution control | 2 | `TITLE:`, `ABSTRACT:`, `MESH:` field-scope params exist and work reliably; topic-query pattern eliminates author matches on opt-in; default scope is all-fields |

```
Raw_A = (1×1.5 + 2 + 2 + 3 + 2 + 2 + 3 + 3 + 1×1.5 + 2) / 11
      = (1.5 + 2 + 2 + 3 + 2 + 2 + 3 + 3 + 1.5 + 2) / 11
      = 22/11 = 2.00
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | 3 | Title + structured authors (ORCID where avail) + year + journal (title/ISSN/vol/issue) + DOI + PMID + pages + language + pub type + affiliation |
| B2 Abstract / full-text access | 3 | Abstract present ~85%+ for PubMed records (confirmed in live probes: 3/3 had abstracts with 1500-2500 chars); 6.5M OA full-text articles via `inEPMC:Y` |
| B3 Citation graph | 2 | `citedByCount` integer + `hasReferences:Y` flag + separate `/citations` and `/references` API endpoints; full in/out citation lists with DOIs available |
| B4 Discipline / field-tag granularity | 3 | MeSH headings (multi-level, 30k terms, with major-topic flag and qualifiers) for PubMed records; author keywords for all; FOS tags for some |
| B5 OA / free-access guarantee | 2 | `isOpenAccess: "Y"/"N"` + `OPEN_ACCESS:Y` filter + `fullTextUrl[availabilityCode="F"]` for direct link; 6.5M OA full-text; flag slightly unreliable for preprints |
| B6 Rich media / IIIF | 0 | No thumbnails, images, or IIIF |
| B7 Holdings / availability | 1 | `inEPMC`/`inPMC` flags + `fullTextUrlList` shows availability; no multi-institution holdings |
| B8 Record-quality signals | 2 | `hasAbstract`, `hasData`, `hasReferences` flags; `license` field; `source` code; publication status; `isOpenAccess` |

```
Raw_B = (3 + 3×1.5 + 2 + 3 + 2×1.5 + 0 + 1 + 2) / 9
      = (3 + 4.5 + 2 + 3 + 3 + 0 + 1 + 2) / 9
      = 18.5/9 = 2.06
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | 2 | 936 ms warm median; EBI-hosted (high institutional uptime); no explicit SLA but production-grade infrastructure; no rate-limit transparency |
| C2 Auth friction | 3 | Completely keyless; no registration; open to all including commercial |
| C3 Redistribution / TOS risk | 2 | API free including commercial use (confirmed); bulk download of non-OA content prohibited; OA content has per-item licenses (CC-BY etc.); metadata is MEDLINE-derived — display + aggregation LOW risk |
| C4 Protocol / client maturity | 2 | Versioned API (v6.9); documented field list; Solr cursor paging; no OpenAPI spec; R package available (europepmc) |
| C5 Data hygiene & parseability | 2 | Consistent structure; known quirks (Y/N strings, JATS markup in abstracts, null MeSH for non-PubMed); generally predictable |

```
Raw_C = (2 + 3 + 2 + 2 + 2) / 5 = 11/5 = 2.20
```

### Rollup

```
Raw_A = 2.00
Raw_B = 2.06
Raw_C = 2.20

Overall = 2.00 × 0.45 + 2.06 × 0.40 + 2.20 × 0.15
        = 0.90 + 0.82 + 0.33
        = 2.05
```

**TIER = A** (2.0–2.4)

---

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | LOW — API explicitly allowed for commercial use; bulk non-OA download prohibited (not a concern for per-query search); individual OA content carries CC-BY license → display allowed |
| Currently quarantined? | No (not yet integrated) |
| Recommended action | **INTEGRATE as SEARCH source — TIER A** — primary source for biomedical/life sciences queries; best preprint aggregation in the roster; sub-1 s latency; MeSH tags enable superior faceting; `TITLE/ABSTRACT/MESH` query pattern prevents author pollution |
| Blocking issues | None. Implement `TITLE:{q} OR ABSTRACT:{q}` default topic-query pattern to prevent author-name pollution. Strip JATS markup from abstracts. |
