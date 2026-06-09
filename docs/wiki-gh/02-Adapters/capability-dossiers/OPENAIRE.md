---
tags: [adapter, capability, dossier, revival-candidate]
adapter_id: OPENAIRE
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/OPENAIRE.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# OPENAIRE — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | OPENAIRE |
| Official API name | OpenAIRE Graph API v1 (Graph API) |
| Provider | OpenAIRE AMKE (European OA infrastructure) |
| Base URL | `https://api.openaire.eu/graph/v1` |
| Protocol | REST-JSON |
| Docs URL | https://graph.openaire.eu/docs/apis/graph-api/ |
| Swagger UI | https://api.openaire.eu/graph/swagger-ui/index.html |
| TOS URL | https://graph.openaire.eu/docs/apis/terms/ |
| Pre-audit tier | unranked (not yet integrated) |
| Dossier date | 2026-06-09 |

**IMPORTANT NOTE on API versions:** The **old Search API** (`api.openaire.eu/search`) was **deprecated and phased out on 31 May 2026**. The dossier below covers the **current Graph API** (`api.openaire.eu/graph/v1`). The `graph/v1` path serves publications and other research products.

**Integration role assessment:** SEARCH source — complementary to OpenAlex. OpenAIRE aggregates EU-funded research, OA publications, datasets, and software from 100k+ European repositories. Unique value: EU/Horizon funding linkage, European institutional coverage, Green OA repository links. Coverage overlaps OpenAlex significantly but includes research products not in OpenAlex (certain grey literature, EU project outputs). Relevant for: EU-funded research discovery, OA linking, software publications.

**Critical observation from live probe:** Abstracts/descriptions are largely absent in Graph API v1 responses (`descriptions: null` or empty value) even for papers that have abstracts in the source. This is a significant limitation vs. the old Search API. MeSH terms, subjects, and OA colour are also frequently null.

---

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard | OpenAIRE information model (custom); aligns with Dublin Core, CERIF, OpenAIRE Guidelines |
| Serialization | JSON |
| Schema URL | https://graph.openaire.eu/docs/apis/graph-api/ |
| Schema version | Graph API v1 (current); search API v2 (deprecated May 2026) |

---

## 3. Complete Field/Tag Inventory

Live probe: `GET https://api.openaire.eu/graph/v1/researchProducts?search=machine+learning+cancer&type=publication&pageSize=1`

**Response envelope:**

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|----------------|---------|-----------------|
| `header.numFound` | integer | yes | Total matching results | `totalCount` |
| `header.maxScore` | float | yes | Highest relevance score (e.g. `8.554265`) | internal |
| `header.queryTime` | integer | yes | Server-side query time in ms | latency |
| `header.page` | integer | yes | Current page number | — |
| `header.pageSize` | integer | yes | Page size used | — |
| `header.nextCursor` | string | sometimes | Cursor token for next page (empty string when none) | `nextPage` |
| `results[]` | array | yes | Array of research product objects | `results` |

**Per-result fields (researchProduct):**

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|----------------|---------|-----------------|
| `id` | string | yes | OpenAIRE internal ID (e.g. `doi_dedup___::...`) | `sourceId` |
| `type` | string | yes | `publication`, `dataset`, `software`, `other` | `type` |
| `mainTitle` | string | yes | Primary title | `title` |
| `subTitle` | string/null | sometimes | Subtitle | `subtitle` |
| `authors[]` | array/null | sometimes | Author objects | `authors` |
| `authors[].fullName` | string | yes | Full name | `author.name` |
| `authors[].name` | string/null | sometimes | Given name (often null) | — |
| `authors[].surname` | string/null | sometimes | Family name (often null) | — |
| `authors[].rank` | integer | yes | Author order position | `author.rank` |
| `authors[].pid.id.scheme` | string | sometimes | PID scheme (e.g. `orcid`) | — |
| `authors[].pid.id.value` | string | sometimes | ORCID value | `author.orcid` |
| `pids[]` | array/null | sometimes | Persistent identifiers | `ids` |
| `pids[].scheme` | string | yes | `doi`, `pmid`, `arxiv`, etc. | `id.type` |
| `pids[].value` | string | yes | Identifier value | `id.value` |
| `originalIds[]` | array/null | sometimes | Source repository IDs (may include DOIs, datacite IDs, etc.) | internal |
| `publicationDate` | string/null | sometimes | ISO date of publication | `year` |
| `publisher` | string/null | sometimes | Publisher name | `publisher` |
| `language.code` | string | yes | ISO 639-1 code (e.g. `"eng"`) | `language` |
| `language.label` | string | yes | Language name | — |
| `descriptions[]` | array/null | mostly null in live probe | Description/abstract objects | `abstract` |
| `descriptions[].value` | string | yes | Description text | `abstract` |
| `descriptions[].lang` | string | sometimes | Language of description | — |
| `subjects[]` | array/null | mostly null in live probe | Subject/keyword objects | `subjects` |
| `container` | object/null | sometimes | Journal container info | `journal` |
| `container.name` | string | yes | Journal name | `journal` |
| `container.issnPrinted` | string/null | sometimes | Print ISSN | `issn` |
| `container.issnOnline` | string/null | sometimes | Electronic ISSN | `eissn` |
| `container.vol` | string/null | sometimes | Volume | `volume` |
| `container.iss` | string/null | sometimes | Issue | `issue` |
| `container.sp` | string/null | sometimes | Start page | `pageStart` |
| `container.ep` | string/null | sometimes | End page | `pageEnd` |
| `bestAccessRight.code` | string/null | sometimes | COAR access rights code (e.g. `c_abf2`) | — |
| `bestAccessRight.label` | string/null | sometimes | `OPEN`, `RESTRICTED`, `CLOSED`, `EMBARGOED` | `isOA` |
| `bestAccessRight.scheme` | string/null | sometimes | Vocabulary scheme URI | — |
| `isGreen` | boolean/null | sometimes | Green OA (self-archived copy) | `isGreen` |
| `isInDiamondJournal` | boolean/null | sometimes | Published in diamond OA journal | `isDiamondOA` |
| `openAccessColor` | string/null | mostly null | `gold`, `hybrid`, `bronze`, `diamond` | `oaColor` |
| `publiclyFunded` | boolean/null | sometimes | Has public funding | `isPubliclyFunded` |
| `instances[]` | array | yes | Concrete manifestations (landing pages, downloads) | `urls` |
| `instances[].type` | string | yes | Content type: `Article`, `Software`, `Dataset`, etc. | `instanceType` |
| `instances[].urls[]` | array | yes | URLs to the instance | `url` |
| `instances[].publicationDate` | string/null | sometimes | Version-specific date | — |
| `instances[].refereed` | string | yes | `peerReviewed`, `nonPeerReviewed`, `unknown` | `peerReviewed` |
| `instances[].pids[]` | array/null | sometimes | DOIs for this specific instance | — |
| `instances[].alternateIdentifiers[]` | array/null | sometimes | Additional IDs | — |
| `countries[]` | array/null | sometimes | Country codes | `countries` |
| `coverages[]` | array/null | sometimes | Coverage/period info | — |
| `formats[]` | array/null | sometimes | File formats | `formats` |
| `sources[]` | array/null | sometimes | Source repositories (e.g. `"Crossref"`) | `sources` |
| `indicators.citationImpact.citationCount` | float | yes | Citation count | `citedByCount` |
| `indicators.citationImpact.influence` | float | yes | Influence score (OpenAIRE-calculated) | `influence` |
| `indicators.citationImpact.popularity` | float | yes | Popularity score | `popularity` |
| `indicators.citationImpact.impulse` | float | yes | Impulse score (recent citation surge) | `impulse` |
| `indicators.citationImpact.citationClass` | string | yes | Percentile class (`C1`–`C5`) | `citationClass` |
| `indicators.citationImpact.influenceClass` | string | yes | Percentile class | `influenceClass` |
| `indicators.citationImpact.popularityClass` | string | yes | Percentile class | `popularityClass` |
| `indicators.citationImpact.impulseClass` | string | yes | Percentile class | `impulseClass` |
| `documentationUrls[]` | array/null | sometimes (software) | Documentation URLs | — |
| `codeRepositoryUrl` | string/null | sometimes (software) | Code repository URL | `codeUrl` |
| `programmingLanguage` | string/null | sometimes (software) | Programming language | — |

> ★ Projects/funding: requires separate call to `GET /graph/v1/projects?relResearchProductId={id}` or linked via `hasProjectRel` filter.

---

## 4. Query Semantics

**Full-text search supported.** The `search` parameter is free-text:

```
GET https://api.openaire.eu/graph/v1/researchProducts?search=climate+change&type=publication&pageSize=10
```

**Key search parameters:**
- `search`: Free-text search across title, abstract, subjects
- `mainTitle`: Title-exact or title-scoped search
- `description`: Search in descriptions
- `subjects`: Subject/keyword search
- `authorFullName`: Author name search
- `authorOrcid`: ORCID-keyed author filter
- `publisher`: Publisher filter
- `fromPublicationDate` / `toPublicationDate`: Date range (ISO format)
- `type`: `publication`, `dataset`, `software`, `other`
- `bestOpenAccessRightLabel`: `OPEN`, `RESTRICTED`, `CLOSED`, `EMBARGOED` (OA filter — confirmed working)
- `isGreen`: Boolean OA type filter
- `isInDiamondJournal`: Boolean diamond OA filter
- `openAccessColor`: `gold`, `hybrid`, `bronze`, `diamond`
- `isPeerReviewed`: Boolean peer review filter
- `isPubliclyFunded`: Boolean funding filter
- `countryCode`: ISO country code (e.g. `DE`, `FR`)
- `sdg`: UN Sustainable Development Goal number
- `relProjectId`: Filter by linked project ID
- `relProjectFundingShortName`: e.g. `H2020`, `FP7`
- `relOrganizationId`: Filter by organisation
- `instanceType`: `Article`, `Software`, `Dataset`, etc.
- `rorId`: ROR identifier for affiliation/organisation
- `logicalOperator`: `AND` (default) or `OR` between filter params
- `sortBy`: `publicationDate` (asc/desc), relevance
- `page` / `pageSize` / `cursor`: Pagination

**Author-name pollution control:**
- Default `search=` parameter includes title, abstract, authors (scope unclear from docs)
- `mainTitle=` param restricts to title
- `authorFullName=` param is for intentional author search
- Recommended pattern: use `search=` for general search; use `mainTitle={q}` to restrict to title when author pollution is a concern
- Live probe confirmed search includes title at minimum; abstract inclusion is uncertain given the frequent `descriptions: null` in responses

---

## 5. OA / Free-Access

| Field | Value |
|-------|-------|
| Whole-corpus OA? | No — but strong OA fraction (467,265 OPEN results for "climate change" out of 968,786 total = ~48%) |
| OA flag field | `bestAccessRight.label`: `OPEN`, `RESTRICTED`, `CLOSED`, `EMBARGOED` |
| OA URL field | `instances[].urls[]` where `bestAccessRight.label == "OPEN"` |
| OA-only filter param | `bestOpenAccessRightLabel=OPEN` — confirmed working (returns OPEN-labelled records only) |
| Green OA | `isGreen=true` filter parameter |
| Diamond OA | `isInDiamondJournal=true` filter |
| OA colour | `openAccessColor=gold/hybrid/bronze/diamond` filter; `openAccessColor` field often `null` in responses |
| Sort-by-OA | No |
| Flag coverage | Variable — EU-aggregated sources have good OA flags; some records have `null` bestAccessRight |
| Recommended strategy | `bestOpenAccessRightLabel=OPEN` filter for OA-only results; extract `instances[].urls` for direct links |

---

## 6. Images / Thumbnails / IIIF

Not applicable. OpenAIRE does not provide thumbnails or IIIF manifests.

---

## 7. Discipline / Subject Tags

| Field | Value |
|-------|-------|
| Vocabulary | OpenAIRE uses FOS (Fields of Science), SDGs (Sustainable Development Goals), and source-provided subjects |
| Field paths | `subjects[]` (often null in live probes) + `sdg` filter param |
| Granularity | Low-Medium — `subjects` frequently null in Graph API v1; FOS available but not consistently populated |
| SDG | `sdg` filter (1-17 SDG numbers) is a unique feature for policy-relevant research filtering |
| Usability for faceting | Low in current state — subjects sparsely populated; SDG filter is novel differentiator |

---

## 8. Native Relevance & Scoring

| Field | Value |
|-------|-------|
| Score returned? | YES — `header.maxScore` is the top score (e.g. `8.554265`); **but per-result score not in individual records** |
| Per-result score | No per-document `_score` field in results array |
| Citation impact scores | `indicators.citationImpact.influence`, `popularity`, `impulse`, `citationCount` — all present in live probe |
| Percentile classes | `citationClass`, `influenceClass`, `popularityClass`, `impulseClass` (C1-C5 bands) |
| Sort | `sortBy=publicationDate asc/desc`; `relevance desc` (default); no sort by citation score available |
| Cross-query comparable? | No |
| Semantics | Elasticsearch-based (presumed); undocumented |

---

## 9. Pagination

| Field | Value |
|-------|-------|
| Mechanism | Page-number (offset) OR cursor-based |
| Offset params | `page` (integer), `pageSize` (default 10, max ?) |
| Cursor | `cursor=*` to start; `header.nextCursor` from response as next cursor value |
| Depth cap (offset) | 10,000 records max |
| Depth cap (cursor) | No cap — confirmed working in live probe (`nextCursor` returned) |
| Cursor expiry | Not documented |
| Count field | `header.numFound` — exact integer |

**9b. Measured Latency (live probe, 3 warm calls, 2026-06-09):**

| Query type | Latency ms (×3) | Median |
|-----------|----------------|--------|
| Keyword (`climate change`, type=publication) | 2361, 1047, 944 | 1047 ms |
| Multi-keyword (machine learning cancer detection) | 2035, 1064, 1074 | 1064 ms |
| NL full sentence (effects of climate change on biodiversity...) | 1689, 1966, 1672 | 1689 ms |
| NL vs keyword delta | — | ~1.6× |

**Notes:** Cold first call ~2.4 s; warm median ~1-1.1 s for keyword/multi-keyword. NL queries slightly slower (~1.7 s). Acceptable for fan-out search. Server-side `queryTime` is ~250 ms suggesting network/encoding overhead is ~800 ms warm.

---

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No for public (unauthenticated) requests |
| Unauthenticated rate limit | **60 requests/hour** (very low) |
| Authenticated rate limit | **7,200 requests/hour** (~120/min) |
| Auth method | Personal Access Token (1-hour validity) or Client Credentials (registered service) |
| Token acquisition | Register at OpenAIRE → personal access token page; 1h validity; refresh token (1 month) available |
| Backend-safe? | YES — token in Authorization header |
| Rate-limit code | HTTP 429 |
| Note | The 60 req/hour unauthenticated limit is a **critical constraint** — authentication is mandatory for production use |

---

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `descriptions` | Frequently `null` or empty-value array — major gap | `"descriptions": null` on many publications | Always null-check; do not assume abstract present |
| `descriptions[].value` | When present, may be empty string `""` | `{"value": "", "lang": null}` | Filter out empty-string values |
| `subjects` | Frequently `null` | `"subjects": null` | Always null-check |
| `openAccessColor` | Frequently `null` even when `bestAccessRight.label == "OPEN"` | `"openAccessColor": null` | Fall back to `bestAccessRight.label` for OA determination |
| `bestAccessRight` | Null on some records | `"bestAccessRight": null` | Null-check before accessing `.label` |
| `authors` | Null on some records (software especially) | `"authors": null` | Always null-check |
| `authors[].name` / `.surname` | Often null; only `fullName` is reliable | `"name": null, "surname": null, "fullName": "Smith J"` | Use `fullName` exclusively; split as last resort |
| `pids` | Null on some records; when present, DOI in scheme/value pairs | `null` or `[{"scheme":"doi","value":"10.xxx"}]` | Extract DOI as `pids?.find(p => p.scheme === 'doi')?.value` |
| `originalIds` | Contains internal repo IDs in inconsistent formats | `"50|doiboost____|..."` — pipe-separated with internal prefix | Skip if only `pids` DOI is needed |
| `indicators.citationImpact.citationCount` | Float, not integer | `9.0` | `Math.round()` before display |
| `publicationDate` | Sometimes `null`; when present, may be year-only or full ISO date | `"2024-01-01"` or `null` | Extract year with `new Date(d).getFullYear()` |
| Unauthenticated rate limit | 60 req/hour — extremely low; will hit limit immediately in production | — | Authenticate — mandatory for production |

---

## 12. Exploitation Notes

**Integration Opportunity: SEARCH source — complementary (EU/OA focus) with mandatory authentication**

OpenAIRE's strengths relative to existing OpenCITE sources:

1. **EU funding linkage**: The only source with reliable EU Horizon/FP7/H2020 grant linkage. `relProjectFundingShortName=H2020` filter enables "EU-funded research" facet — a strong differentiator for European users and policy research.

2. **SDG tagging**: `sdg=13` (Climate Action), `sdg=3` (Good Health), etc. — unique controlled vocabulary for policy-relevant research discovery. No other current OpenCITE source offers UN SDG filtering.

3. **Green OA flag**: `isGreen` and `isInDiamondJournal` flags at per-record level — enables "self-archived / repo copy" indicator in cards.

4. **Software publications**: OpenAIRE indexes software DOIs from Zenodo and other software repositories — complements DataCite's software coverage with EU-deposited items.

5. **European repository coverage**: 100k+ European OA repositories (DART-Europe, OpenDOAR members, national aggregators) — papers not indexed in OpenAlex/Crossref may appear here.

6. **Citation impact classes**: `citationClass`/`influenceClass`/`popularityClass` percentile bands are pre-computed ranking signals usable for OpenCITE's ranker without a separate computation.

**Critical limitations:**
- Abstracts largely absent in Graph API v1 — cannot use for abstract-based relevance scoring
- 60 req/hour unauthenticated → **must authenticate**; token must be managed server-side (1h expiry with refresh)
- Subjects frequently null → limited faceting capability

**Under-exploited fields:**
- `indicators.citationImpact.impulseClass`: identifies papers with recent citation surge (C1 = top 10% for recent citations) — novel ranking signal
- `sdg` filter: policy-research vertical (no other source has this)
- `isPubliclyFunded` + `relProjectFundingShortName`: funder-based faceting

**Recommendation**: Authenticate server-side with refresh token; include in fan-out but weight lower than Europe PMC / DataCite due to abstract absence; use primarily for EU-funded, OA, and SDG-linked queries.

---

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score | 1 | `header.maxScore` present but per-document score absent; monotone order within request |
| A2 Query expressiveness | 2 | `search` free-text + `mainTitle`, `authorFullName`, `subjects` fields + type filter + date range + OA filter; no native boolean operators in `search=` param itself (AND/OR must be handled by filter params) |
| A3 Sort & filter control | 2 | Rich filter params (30+: type, OA, country, SDG, funding, peer-review, date); sort by date or relevance; no facet counts returned |
| A4 Pagination depth / cursor | 3 | Cursor with no depth cap; confirmed working; offset limited to 10k |
| A5 Batch / bulk endpoint | 2 | Full OpenAIRE Graph dataset download available (CC-BY); cursor-driven harvest; no batch ID endpoint |
| A6 Throughput & rate limits | 1 | 60 req/hr unauthenticated (unusable); 7200 req/hr authenticated (~120/min) — requires auth token management |
| A7 ID linkage / crosswalk | 2 | DOI, PMID, arXiv, OpenAIRE ID, ORCID (authors), ROR (organisations), internal dedup IDs |
| A8 Result-count accuracy | 3 | `header.numFound` exact integer; stable in live probe |
| A9 Semantic / NL query mode | 1 | Elasticsearch BM25 presumed; `search=` NL-tolerant; no semantic/vector; no cross-lingual |
| A10 Author-name pollution control | 1 | `mainTitle=` restricts to title; `authorFullName=` for author search; `search=` scope unclear — may include authors; opt-in field restriction |

```
Raw_A = (1×1.5 + 2 + 2 + 3 + 2 + 1 + 2 + 3 + 1×1.5 + 1) / 11
      = (1.5 + 2 + 2 + 3 + 2 + 1 + 2 + 3 + 1.5 + 1) / 11
      = 19/11 = 1.73
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | 2 | Title + authors (ORCID sometimes) + year + journal (container) + DOI + PIDs + language + type; pages missing for most records |
| B2 Abstract / full-text access | 0 | `descriptions` largely null in live probe — confirmed across multiple queries; Graph API v1 does not reliably surface abstracts |
| B3 Citation graph | 1 | `citationCount` float available; no reference list; citation/reference lists require separate API endpoint or follow-up call |
| B4 Discipline / field-tag granularity | 1 | `subjects` frequently null; `sdg` filter is unique but not facet-able in response; limited controlled vocab in practice |
| B5 OA / free-access guarantee | 2 | `bestAccessRight.label = OPEN` + `isGreen` + `isInDiamondJournal` + `openAccessColor`; `bestOpenAccessRightLabel=OPEN` filter confirmed working; OA URL via `instances[].urls[]`; fairly reliable |
| B6 Rich media / IIIF | 0 | No images or IIIF |
| B7 Holdings / availability | 1 | `instances[].urls[]` provides access links; `sources[]` shows originating repos; no holdings structure |
| B8 Record-quality signals | 2 | `indicators.citationImpact.*Class` percentile bands; `instances[].refereed` (peerReviewed/non); `isPubliclyFunded`; `sources[]`; dedup ID in `id` field |

```
Raw_B = (2 + 0×1.5 + 1 + 1 + 2×1.5 + 0 + 1 + 2) / 9
      = (2 + 0 + 1 + 1 + 3 + 0 + 1 + 2) / 9
      = 10/9 = 1.11
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | 2 | ~1.05 s warm median; OpenAIRE is EU research infrastructure; reasonable uptime track record; no SLA published |
| C2 Auth friction | 1 | Free token via registration (minutes); BUT 1-hour expiry requires token refresh logic in backend; moderate friction for server-side management |
| C3 Redistribution / TOS risk | 2 | CC-BY with attribution to OpenAIRE; commercial use permitted; LOW risk |
| C4 Protocol / client maturity | 2 | Swagger UI available; versioned (v1); reasonable docs; no official SDK; old search API deprecated (migration required) |
| C5 Data hygiene & parseability | 1 | Frequent null fields (descriptions, subjects, openAccessColor, bestAccessRight); inconsistent data quality from aggregated sources; `originalIds` format is messy |

```
Raw_C = (2 + 1 + 2 + 2 + 1) / 5 = 8/5 = 1.60
```

### Rollup

```
Raw_A = 1.73
Raw_B = 1.11
Raw_C = 1.60

Overall = 1.73 × 0.45 + 1.11 × 0.40 + 1.60 × 0.15
        = 0.78 + 0.44 + 0.24
        = 1.46
```

**TIER = C** (1.0–1.4 → borderline C, rounds to 1.46 which is B-floor but just below B=1.5)

**TIER = C** (1.46 < 1.5 — just below Tier B threshold)

---

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | LOW — CC-BY; commercial use permitted; attribution to OpenAIRE required |
| Currently quarantined? | No (not yet integrated) |
| Recommended action | **INTEGRATE as SEARCH source — TIER C** — include in fan-out for EU-focused / OA-heavy / SDG-filtered queries; weight lower than EPMC/DataCite due to absent abstracts and auth complexity; authenticate server-side with token refresh |
| Blocking issues | (1) Unauthenticated rate limit (60/hr) is unusable — must implement OAuth token refresh server-side. (2) Abstracts largely absent in Graph API v1 — cannot use for abstract relevance scoring. Monitor API updates for abstract availability. |
