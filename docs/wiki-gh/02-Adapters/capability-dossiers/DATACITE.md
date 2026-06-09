---
tags: [adapter, capability, dossier, revival-candidate]
adapter_id: DATACITE
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/DATACITE.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# DATACITE — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | DATACITE |
| Official API name | DataCite REST API (Public) |
| Provider | DataCite (international DOI registration agency for research data) |
| Base URL | `https://api.datacite.org` |
| Protocol | REST-JSON (JSON:API specification) |
| Docs URL | https://support.datacite.org/docs/api |
| TOS URL | https://support.datacite.org (CC-BY for metadata) |
| Pre-audit tier | unranked (not yet integrated) |
| Dossier date | 2026-06-09 |

**Integration role assessment:** SEARCH source — primary for research datasets, software, and data publications. DataCite is the DOI registration authority for research data. It supports full-text metadata search across ~57M+ DOIs including datasets, software, workflows, images, and some journal articles deposited in Zenodo/figshare/Dryad/etc. This fills a gap OpenCITE's current sources do not cover: research datasets with DOIs.

---

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard | DataCite Metadata Schema 4.x (kernel-4) — https://schema.datacite.org |
| Serialization | JSON (JSON:API envelope: `data[]`, `meta`, `links`) |
| Schema URL | http://datacite.org/schema/kernel-4 (in `schemaVersion` field) |
| Schema version | kernel-4 (current); kernel-3 legacy records also exist |

---

## 3. Complete Field/Tag Inventory

Live probe: `GET https://api.datacite.org/dois?query=climate+change&page[size]=2`

**Envelope structure:**
- `data[]` — array of DOI objects
- `data[].id` — DOI string
- `data[].type` — always "dois"
- `data[].attributes` — full metadata (see below)
- `data[].relationships` — linked entities (client, provider)
- `meta.total` — total hits
- `meta.totalPages` — total pages
- `meta.page` — current page
- `links.self` / `links.next` / `links.prev` — pagination links

**`data[].attributes` fields (confirmed via live probe):**

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|----------------|---------|-----------------|
| `doi` | string | yes | Lowercase DOI string | `doi` |
| `identifiers[]` | array | sometimes | Additional identifiers (OAI ID, etc.) | `ids` |
| `identifiers[].identifier` | string | yes | ID value | — |
| `identifiers[].identifierType` | string | yes | Type (e.g. `oai`) | — |
| `creators[]` | array | yes | Author/creator objects | `authors` |
| `creators[].name` | string | yes | Full name | `author.name` |
| `creators[].nameType` | string | sometimes | `Personal` or `Organizational` | — |
| `creators[].givenName` | string | sometimes | Given name | `author.first` |
| `creators[].familyName` | string | sometimes | Family name | `author.last` |
| `creators[].nameIdentifiers[]` | array | sometimes | ORCID, ISNI, etc. | `author.orcid` |
| `creators[].nameIdentifiers[].nameIdentifier` | string | yes | Identifier value | `author.orcid` |
| `creators[].nameIdentifiers[].nameIdentifierScheme` | string | yes | `ORCID`, `ISNI`, etc. | — |
| `creators[].affiliation[]` | array | sometimes | Affiliation objects (may have ROR ID) | `author.affiliation` |
| `titles[]` | array | yes | Title objects | `title` |
| `titles[0].title` | string | yes | Primary title | `title` |
| `publisher` | string | yes | Repository/publisher name (e.g. `Zenodo`) | `publisher` |
| `container` | object | sometimes | Container (journal/collection) metadata | `journal` |
| `publicationYear` | integer | yes | Year of publication | `year` |
| `subjects[]` | array | sometimes | Subject terms (free-text or vocab) | `subjects` |
| `subjects[].subject` | string | yes | Subject term | `subject` |
| `subjects[].subjectScheme` | string | sometimes | Vocabulary name | — |
| `contributors[]` | array | sometimes | Non-author contributors | `contributors` |
| `dates[]` | array | sometimes | Dated events (Issued, Updated, etc.) | `dates` |
| `dates[].date` | string | yes | ISO date | — |
| `dates[].dateType` | string | yes | `Issued`, `Updated`, `Available`, etc. | — |
| `language` | string/null | sometimes | BCP47 language code | `language` |
| `types` | object | yes | Resource type metadata | `type` |
| `types.resourceType` | string | sometimes | Free-text resource type | `type.specific` |
| `types.resourceTypeGeneral` | string | yes | Controlled vocab: `Dataset`, `Software`, `Text`, `Image`, `Other`, etc. | `type.general` |
| `types.ris` | string | yes | RIS type code | — |
| `types.bibtex` | string | yes | BibTeX entry type | — |
| `types.citeproc` | string | yes | CSL type | — |
| `types.schemaOrg` | string | yes | schema.org type | — |
| `relatedIdentifiers[]` | array | sometimes | Related DOIs (IsPartOf, IsVersionOf, etc.) | `relatedDois` |
| `relatedIdentifiers[].relatedIdentifier` | string | yes | Related DOI | — |
| `relatedIdentifiers[].relatedIdentifierType` | string | yes | `DOI`, `URL`, `arXiv`, etc. | — |
| `relatedIdentifiers[].relationType` | string | yes | `IsVersionOf`, `IsPartOf`, `Cites`, `IsCitedBy`, etc. | — |
| `rightsList[]` | array | sometimes | License/rights objects | `license` |
| `rightsList[].rights` | string | yes | License name | `license.name` |
| `rightsList[].rightsUri` | string | sometimes | License URL | `license.url` |
| `rightsList[].rightsIdentifier` | string | sometimes | SPDX identifier (e.g. `mit`, `cc-by-4.0`) | `license.spdx` |
| `descriptions[]` | array | sometimes | Abstract/description objects | `abstract` |
| `descriptions[].description` | string | yes | Description text | `abstract` |
| `descriptions[].descriptionType` | string | yes | `Abstract`, `Methods`, `TechnicalInfo`, etc. | — |
| `geoLocations[]` | array | sometimes | Spatial coverage objects | `geoLocation` |
| `fundingReferences[]` | array | sometimes | Funder objects | `funders` |
| `fundingReferences[].funderName` | string | yes | Funder name | `funder.name` |
| `fundingReferences[].awardNumber` | string | sometimes | Grant number | `funder.grant` |
| `fundingReferences[].funderIdentifier` | string | sometimes | Funder DOI or ROR | `funder.id` |
| `url` | string | yes | Landing page URL | `url` |
| `contentUrl` | string/null | sometimes | Direct download URL | `contentUrl` |
| `schemaVersion` | string | yes | `http://datacite.org/schema/kernel-4` | internal |
| `source` | string | yes | Registration source (`api`, `mds`, etc.) | internal |
| `isActive` | boolean | yes | Whether the DOI is active | internal |
| `state` | string | yes | `findable`, `registered`, `draft` | `state` |
| `viewCount` | integer | yes | Views | `viewCount` |
| `downloadCount` | integer | yes | Downloads | `downloadCount` |
| `referenceCount` | integer | yes | References | `referenceCount` |
| `citationCount` | integer | yes | Citations | `citedByCount` |
| `created` | string | yes | ISO datetime when DOI was created in DataCite | internal |
| `registered` | string | yes | ISO datetime when DOI was registered in global handle server | internal |
| `published` | string/null | sometimes | Publication date | `publishedDate` |
| `updated` | string | yes | ISO datetime last updated | internal |

---

## 4. Query Semantics

**Full-text search supported.** The `query` parameter accepts Elasticsearch-style query syntax:

```
GET https://api.datacite.org/dois?query=climate+change&page[size]=25&sort=relevance
```

**Query capabilities:**
- Free-text keyword search across title, description, subject, creator
- Boolean operators: `AND`, `OR`, `NOT` (implicit AND between terms)
- Phrase search: `"machine learning"` with quotes
- Fielded search: `titles.title:"climate change"`, `creators.name:Smith`
- Wildcard: `clim*`
- Fuzzy: `climat~`

**Filter parameters (non-query):**
- `resource-type-id`: e.g. `dataset`, `software`, `collection`
- `prefix`: DOI prefix (e.g. `10.5281` for Zenodo)
- `client-id`: repository identifier
- `provider-id`: member organisation
- `affiliation-id`: ROR URL
- `funded-by`: funder ROR URL
- `created`: year filter
- `registered`: year filter

**Sort options:** `relevance` (default), `created`, `updated`, `published`, `-created`, etc.

**Author-name pollution control:** The `query=` parameter searches all fields by default, which includes creator names. Use fielded syntax `titles.title:query` to restrict to title-only search. Empirical test ("Smith ecology") confirmed author matches are included in default query — creator name pollution is present. Recommend `titles.title:{query}+OR+descriptions.description:{query}` pattern for topic queries.

---

## 5. OA / Free-Access

| Field | Value |
|-------|-------|
| Whole-corpus OA? | No — but large fraction is OA (most datasets/software are open) |
| OA flag field | `rightsList[].rightsIdentifier` (SPDX license code) or `rightsList[].rightsUri` |
| Best-OA URL field | `url` (landing page) + `contentUrl` (direct download, if present) |
| OA-only filter param | No direct `isOA` filter param; filter via `rightsList` content client-side |
| Sort-by-OA | No sort-by-OA param |
| Flag coverage | Variable — depends on repository; Zenodo/Dryad/OSF records typically include license |
| Recommended strategy | Extract SPDX ID from `rightsList[].rightsIdentifier`; treat CC-* / MIT / Apache / public-domain as OA; display license badge in card |

---

## 6. Images / Thumbnails / IIIF

Limited. DataCite records do not provide thumbnails or IIIF manifests directly. The `types.resourceTypeGeneral = "Image"` subset exists but landing pages host images. No thumbnail field in API response.

---

## 7. Discipline / Subject Tags

| Field | Value |
|-------|-------|
| Vocabulary | Free-text (`subjects[].subject`) + optional vocab (`subjects[].subjectScheme`) |
| Field path | `attributes.subjects[].subject` |
| Granularity | Highly variable — from broad (`"Earth Sciences"`) to specific (`"16S rRNA"`) |
| Example values | `"Dataset"`, `"Climate change"`, `"FOS: Earth and related environmental sciences"` |
| Facet param | No dedicated facet param in public API; `meta` doesn't return facet counts by default |
| Usability for faceting | Low-Medium — inconsistent vocabulary coverage; some repos use FOS (Field of Science), others free-text. Useful for broad filtering, not reliable fine-grained faceting |

---

## 8. Native Relevance & Scoring

| Field | Value |
|-------|-------|
| Score returned? | No `_score` field in response — confirmed absent via live probe |
| Default sort | `relevance` when `sort=relevance` is specified; otherwise `created` (newest first) |
| Sort params | `relevance`, `created`, `-created`, `updated`, `published`, `view-count`, `-view-count`, `download-count`, `citation-count` |
| Cross-query comparable? | No — Elasticsearch-powered but score not exposed |
| Semantics | Elasticsearch BM25 (presumed) for relevance sort; undocumented |

**Notes:** DataCite uses Elasticsearch internally but does not expose `_score`. Results with `sort=relevance` are ranked by BM25 but scores are opaque. Use for RRF by position.

---

## 9. Pagination

| Field | Value |
|-------|-------|
| Mechanism | Page-number (offset) OR cursor (preferred for deep pagination) |
| Offset params | `page[number]`, `page[size]` (default 25, max 1000) |
| Cursor params | `page[cursor]=1` to start cursor mode; `links.next` contains next cursor token |
| Offset max depth | 10,000 records (400 pages × 25 default) |
| Cursor max depth | No stated cap — cursor can traverse full corpus |
| Cursor expiry | Not documented |
| Count field | `meta.total` (exact integer — confirmed `299868` for `climate change` query) |

**9b. Measured Latency (live probe, 3 warm calls, 2026-06-09):**

| Query type | Latency ms (×3) | Median |
|-----------|----------------|--------|
| Keyword (`climate change`) | 2711, 1289, 938 | 1289 ms |
| Multi-keyword fielded | 1004, 1187, 839 | 1004 ms |
| NL sentence (effects of climate...) | 3123, 3520, 2135 | 3123 ms |
| NL vs keyword delta | — | ~2.4× |

**Notes:** Cold calls ~2.7 s, warm median ~1-1.3 s for keyword. NL sentence queries are notably slower (~3 s+) — ES processes longer query strings less efficiently. For production use, keep queries short (3-5 terms). The first call (cold) shows >2 s — implement connection keepalive.

---

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No — public API is keyless |
| Identified tier | `mailto=` param or User-Agent with email → 1000 req/5-min per IP |
| Unidentified tier | No identifying info → 500 req/5-min per IP |
| Authenticated tier | DataCite credentials (for member organisations) → 3000 req/5-min per IP |
| Backend-safe? | Yes — keyless public API; no per-user auth |
| Rate-limit code | HTTP 429 |
| Retry-After? | Not documented; implement exponential backoff |
| Content-negotiation (doi.org) | Capped at 1000 req/5-min separately |

---

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `creators[]` | Array can be empty `[]` on some older records | `"creators": []` | Always check `length > 0` |
| `creators[].nameIdentifiers` | Array may be empty; ORCID not guaranteed | `"nameIdentifiers": []` | `?.find(n => n.nameIdentifierScheme === 'ORCID')?.nameIdentifier` |
| `titles[]` | Multiple titles possible (e.g. subtitle, translated title); take `[0]` as primary | 2-element array | Always `titles[0].title`; check `titleType` for subtitle |
| `descriptions[]` | May contain HTML markup, installation instructions, not just abstract | Zenodo software descriptions have code/paths | Strip HTML; detect non-abstract `descriptionType` |
| `subjects[]` | Highly heterogeneous vocab; duplicates possible; multi-language | `[{subject:"Climate"}, {subject:"Klima"}]` | Deduplicate; prefer `subjectScheme` like `FOS` |
| `language` | Null on many records; when present, may be ISO 639-3 or BCP47 | `null`, `"en"`, `"eng"`, `"en-US"` | Normalize to ISO 639-1 two-letter code |
| `publicationYear` | Integer, not null — but may be incorrect (registration year ≠ publication year) | `2026` when data is from 2015 | Use `dates[].date` with `dateType: "Issued"` as more reliable source |
| `citationCount` / `viewCount` | Integer; may be 0 for all new records; not reliable for all repos | `"citationCount": 0` on a widely-cited dataset | Don't use 0 as "not cited"; supplement with OpenCitations |
| `container` | Often empty `{}` for datasets | `"container": {}` | Check `container !== null && Object.keys(container).length > 0` |
| `relatedIdentifiers[]` | Can be very large array (100+ items) for versioned datasets | Version history chain | Truncate display; focus on `IsVersionOf`/`IsNewVersionOf` |

---

## 12. Exploitation Notes

**Integration Opportunity: SEARCH source — research datasets and software**

DataCite is the only source in OpenCITE's roster that specialises in DOI-bearing research datasets, software, workflows, and data publications. This fills a critical gap:

1. **Primary search source for data-focused queries**: `resourceTypeGeneral=Dataset` + `resourceTypeGeneral=Software` filter. Users searching for replicable research data or code get zero coverage from OpenAlex/Crossref without this.

2. **Zenodo/Dryad/figshare/OSF coverage**: These are among the most important data repositories globally, all registered through DataCite. Many deposits include full descriptions/abstracts that index well with keyword search.

3. **SPDX license extraction for OA display**: `rightsList[].rightsIdentifier` carries SPDX identifiers — directly mappable to a license badge in the UI without a separate API call.

4. **Funder/grant linkage**: `fundingReferences` provides funder name + award number — enables "funded by NSF/NIH/EU" facet, differentiating OpenCITE from basic citation indices.

5. **Version chain navigation**: `relatedIdentifiers[relationType=IsVersionOf]` enables linking current version to all prior versions — valuable for reproducibility-focused users.

6. **Download/view metrics**: `downloadCount` and `viewCount` are unique among OpenCITE sources — usable as a soft popularity signal for dataset quality ranking.

**Query strategy recommendation:** Use `titles.title:{query} OR descriptions.description:{query}` as fielded query to reduce author-name pollution. Add `resource-type-id=dataset,software,collection` filter to scope to DataCite's unique corpus. Combine with OpenAlex for article coverage.

**Under-exploited fields:**
- `fundingReferences[].funderIdentifier` (ROR): facet by funder agency
- `geoLocations[]`: geographic facet for spatial datasets
- `types.resourceTypeGeneral`: type filter (Dataset vs Software vs Image vs Text)
- `contentUrl`: direct download link for data files — display "Download dataset" button

---

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score | 1 | Score not exposed in response; `sort=relevance` works but is opaque/monotone within request only |
| A2 Query expressiveness | 2 | Elasticsearch query syntax: fielded, boolean (AND/OR/NOT), phrase, wildcard; well-documented |
| A3 Sort & filter control | 2 | Multiple sort options (relevance/date/citation/download/view); `resource-type-id`, `prefix`, `affiliation`, `funded-by` filters; no facet counts in public API response |
| A4 Pagination depth / cursor | 3 | Cursor with no stated depth cap; offset limited to 10k but cursor removes cap |
| A5 Batch / bulk endpoint | 2 | Full cursor-driven harvest + random sample endpoint; no single batch ID endpoint |
| A6 Throughput & rate limits | 2 | 1000 req/5-min identified (~200/min = ~3.3/s); keyless backend-safe |
| A7 ID linkage / crosswalk | 2 | DOI, ORCID (creators), ROR (affiliation/funder), relatedIdentifiers (arXiv, URL, etc.) |
| A8 Result-count accuracy | 3 | Exact `meta.total` confirmed (299868 for climate change); stable across pages |
| A9 Semantic / NL query mode | 1 | Elasticsearch BM25 with NL-tolerant tokenisation; no semantic/vector mode; NL queries work but are slower; no cross-lingual |
| A10 Author-name pollution control | 1 | Default query includes `creators.name`; fielded syntax `titles.title:` exists and works; opt-in scoping, not default |

```
Raw_A = (1×1.5 + 2 + 2 + 3 + 2 + 2 + 2 + 3 + 1×1.5 + 1) / 11
      = (1.5 + 2 + 2 + 3 + 2 + 2 + 2 + 3 + 1.5 + 1) / 11
      = 20/11 = 1.82
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | 3 | Title + structured authors (ORCID where avail) + year + publisher + DOI + language + type + related IDs + container |
| B2 Abstract / full-text access | 1 | `descriptions[descriptionType=Abstract]` present for ~40-60% of records; Zenodo records have full technical descriptions but not abstracts for all |
| B3 Citation graph | 1 | `citationCount` integer only; no reference list or citing DOI list |
| B4 Discipline / field-tag granularity | 1 | `subjects[]` free-text with optional scheme; heterogeneous — some records use FOS, some have no subjects |
| B5 OA / free-access guarantee | 2 | `rightsList[].rightsIdentifier` (SPDX) present for ~70% of records; `url` + `contentUrl` for landing/direct access; no single `isOA` boolean; OA-only filter requires client-side logic |
| B6 Rich media / IIIF | 0 | No thumbnails or IIIF; `contentUrl` links to file but not a viewing experience |
| B7 Holdings / availability | 1 | `url` (landing page at repository); `contentUrl` for download; repository name in `publisher` |
| B8 Record-quality signals | 2 | `state` (findable/registered/draft); `isActive`; `viewCount`/`downloadCount`/`citationCount`; `schemaVersion`; `source` |

```
Raw_B = (3 + 1×1.5 + 1 + 1 + 2×1.5 + 0 + 1 + 2) / 9
      = (3 + 1.5 + 1 + 1 + 3 + 0 + 1 + 2) / 9
      = 12.5/9 = 1.39
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | 2 | ~1.3 s warm median; DataCite is a production DOI registration infrastructure; no explicit SLA but >99% track record |
| C2 Auth friction | 3 | Keyless public API; backend-safe; `mailto=` for polite pool; no registration required |
| C3 Redistribution / TOS risk | 3 | Metadata CC-BY by policy; DataCite explicitly states "all content CC-BY" → LOW/NONE risk for display |
| C4 Protocol / client maturity | 2 | JSON:API spec + versioned (kernel-4); detailed docs; no official SDK or OpenAPI spec |
| C5 Data hygiene & parseability | 2 | Generally well-typed; known quirks (empty containers, heterogeneous subjects, HTML in descriptions); datacite schema is versioned |

```
Raw_C = (2 + 3 + 3 + 2 + 2) / 5 = 12/5 = 2.40
```

### Rollup

```
Raw_A = 1.82
Raw_B = 1.39
Raw_C = 2.40

Overall = 1.82 × 0.45 + 1.39 × 0.40 + 2.40 × 0.15
        = 0.82 + 0.56 + 0.36
        = 1.74
```

**TIER = B** (1.5–1.9)

---

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | NONE — metadata CC-BY; display + aggregation explicitly allowed; attribution to DataCite recommended |
| Currently quarantined? | No (not yet integrated) |
| Recommended action | **INTEGRATE as SEARCH source** — unique dataset/software corpus (Zenodo, Dryad, figshare, OSF); no other current OpenCITE source covers this type; TIER B → include in fan-out for all queries |
| Blocking issues | None. Latency ~1.3 s warm — acceptable. NL queries slower (~3 s); keep query terms concise. Author pollution requires fielded query pattern. |
