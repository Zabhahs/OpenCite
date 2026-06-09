---
tags: [adapter, capability, dossier]
adapter_id: OAPEN
---

# OAPEN — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| **Adapter ID** | `OAPEN` |
| **Adapter file** | `src/adapters/extensions/oapen.js` |
| **Official API name** | OAPEN Library DSpace REST API |
| **Provider** | OAPEN Foundation (Netherlands) |
| **Base URL** | `https://library.oapen.org/rest/search` |
| **Protocol** | DSpace 5.x REST-JSON |
| **Docs URL** | `https://www.oapen.org/article/8185269-search-using-a-rest-api` (403 in probe; known from search); `https://wiki.lyrasis.org/display/DSDOC5x/REST+API` |
| **TOS/License URL** | `https://oapen.org` — metadata CC0 1.0; full-text PDFs CC-licensed per book |
| **Pre-audit tier** | B (estimated) |
| **Dossier date** | 2026-06-09 |

**Live probe**: Fully accessible. No auth required. OAI-PMH also available at `https://library.oapen.org/oai/request`.

---

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| **Standard** | Dublin Core + OAPEN extensions (`oapen.*`) + peer-review metadata (`peerreview.*`) + funder metadata (`grantor.*`) |
| **Serialization** | JSON (REST); XML (OAI-PMH in oai_dc, MODS, METS, DIDL formats) |
| **Schema URL** | DSpace 5.x: `https://wiki.lyrasis.org/display/DSDOC5x/REST+API` |
| **Schema version** | DSpace 5.x (support ended 2023; OAPEN has not migrated to DSpace 7 as of audit) |

---

## 3. Complete Field/Tag Inventory

Response is an array of items. Each item has top-level fields + `metadata[]` array:

### Top-Level Item Fields

| Field | Type | Always? | Meaning | OpenCITE maps to |
|-------|------|---------|---------|-----------------|
| `uuid` | string | yes | DSpace item UUID | `id` prefix (`oapen-{uuid}`) |
| `name` | string | yes (may be null) | Item name (often = title) | Fallback `title` |
| `handle` | string | yes | Handle persistent identifier (e.g. `20.500.12657/62154`) | `url` fallback |
| `type` | string | yes | Always `"item"` | — |
| `archived` | string | yes | `"true"` or `"false"` | — |
| `withdrawn` | string | yes | `"true"` or `"false"` | — |
| `lastModified` | string | yes | Last modified timestamp | NOT mapped |
| `link` | string | yes | REST API link to item | NOT mapped |
| `bitstreams` | array\|null | when expanded | File bitstreams (PDF/thumbnail) | NOT mapped ★ |

### Metadata Fields (key-value pairs in `metadata[]`)

| Key | Type | Coverage | Meaning | OpenCITE maps to |
|-----|------|----------|---------|-----------------|
| `dc.title` | string | high | Main title | `title` |
| `dc.title.alternative` | string | medium | Alternative/subtitle | NOT mapped ★ |
| `dc.contributor.author` | string | high | Author (one entry per author) | `authors` (all values) |
| `dc.contributor.editor` | string | medium | Editor | NOT mapped ★ |
| `dc.date.issued` | string | high | Publication year/date | `year` (regex) |
| `dc.date.accessioned` | string | yes | Date ingested into OAPEN | NOT mapped |
| `dc.date.available` | string | yes | Date made available | NOT mapped |
| `dc.description.abstract` | string | high (~80%) | Full abstract | `abstract` (stripHtml) |
| `dc.language` | string | high | Language code (e.g. `"en"`, `"de"`) | `language` |
| `dc.subject.classification` | string | medium | Subject classification (BIC → Thema from 2024) | `subjects` |
| `dc.subject.other` | string | medium | Free-text keywords | `subjects` (combined) |
| `dc.type` | string | high | Document type (e.g. `"book"`, `"chapter"`) | `type` |
| `dc.identifier` | string | medium | Additional identifier (ISBN ONIX, etc.) | NOT mapped |
| `dc.identifier.uri` | string | high | Handle URL | `url` fallback |
| `dc.relation.ispartofseries` | string | medium | Series membership | NOT mapped ★ |
| `oapen.identifier.doi` | string | high (~90%) | DOI (may include `https://doi.org/` prefix) | `doi` (prefix stripped) |
| `oapen.relation.isPublishedBy` | string | high | Publisher name | `publisher` fallback |
| `oapen.relation.hasChapter` | string | no | Chapter UUIDs (for edited volumes) | NOT mapped ★ |
| `oapen.relation.isFundedBy` | string | no | Funder UUID | NOT mapped |
| `oapen.imprint` | string | medium | Imprint name | NOT mapped |
| `oapen.pages` | string | medium | Page count | `pages` |
| `oapen.place.publication` | string | medium | Place of publication | NOT mapped ★ |
| `publisher.name` | string | high | Publisher name | `publisher` (primary) |
| `publisher.website` | string | medium | Publisher website | NOT mapped |
| `grantor.name` | string | no | Funder/grantor name | NOT mapped ★ |
| `grantor.acronym` | string | no | Funder acronym | NOT mapped |
| `grantor.doi` | string | no | Funder DOI (e.g. Crossref Funder ID) | NOT mapped ★ |
| `oapen.grant.number` | string | no | Grant number | NOT mapped |
| `peerreview.id` | string | no | Peer review record ID | NOT mapped |
| `peerreview.review.type` | string | no | Review type (double-blind, open, etc.) | NOT mapped ★ |
| `peerreview.anonymity` | string | no | Anonymity level | NOT mapped |
| `peerreview.open.review` | string | no | Open review flag | NOT mapped |
| `peerreview.review.stage` | string | no | Review stage | NOT mapped |
| `peerreview.reviewer.type` | string | no | Reviewer type | NOT mapped |
| `oapen.review.comments` | string | no | Reviewer comments (open review) | NOT mapped ★ |
| `oapen.review.comments` → title | string | no | Title of review | NOT mapped |

★ = exploitable but not currently used.

---

## 4. Query Semantics

- **Lexical vs semantic**: Lexical (DSpace Solr backend). No semantic/vector mode.
- **NL tolerance**: Tolerant — multi-word query tokenized by Solr. NL sentence query tested (colonialism in Africa) → 1,323 ms median; returns contextually relevant results via token matching.
- **Multi-keyword default**: OR (DSpace /rest/search default is OR across metadata fields).
- **Phrase syntax**: Not tested via REST; DSpace Solr supports quoted phrases but REST API param is not documented for fielded syntax.
- **Boolean operators**: Not exposed via the `/rest/search?query=` param. Full DSpace Solr DSL not accessible through REST search endpoint.
- **Fielded query**: `dc.title:history` in `query=` param was tested — returned 2 results (works as Solr field prefix) but not officially documented.
- **Author-name pollution control**:
  - Default `/rest/search`: searches across ALL metadata fields including `dc.contributor.author` → pollution risk HIGH.
  - No documented scope param.
  - Tested `darwin` query: returns grantor items (Darwin College) as false positives — confirms full-field search.
  - Recommended: use Solr field-prefix `dc.title:(darwin)` or accept inherent pollution (book corpus is niche enough that author-name overlap is lower than journals).
- **Cross-lingual support**: None. Many records are multilingual (German, French, English).

---

## 5. OA / Free-Access

| Field | Value |
|-------|-------|
| **Whole-corpus OA?** | Yes — OAPEN hosts only OA books (DOAB/OAPEN mission). Every item is OA by definition. |
| **OA flag field** | None in REST response (structural guarantee) |
| **Best-OA URL field** | `oapen.identifier.doi` → `https://doi.org/{doi}` OR `dc.identifier.uri` (handle URL) OR `bitstreams[*].retrieveLink` (PDF direct) |
| **OA-only filter param** | Not needed |
| **Sort-by-OA** | N/A |
| **Flag coverage** | 100% |
| **Recommended strategy** | Use DOI link; expand `bitstreams` when PDF direct-link needed; metadata CC0 1.0 |

---

## 6. Images / Thumbnails / IIIF

| Field | Value |
|-------|-------|
| **Has images?** | Yes — via `expand=bitstreams` |
| **Thumbnail field** | `bitstreams[?].retrieveLink` where `bundleName=="THUMBNAIL"` — e.g. `/rest/bitstreams/{uuid}/retrieve` (JPEG) |
| **Full-res field** | `bitstreams[?].retrieveLink` where `bundleName=="ORIGINAL"` (PDF) or `bundleName=="COVER_PAGE"` |
| **IIIF manifest** | Not available (DSpace 5.x does not expose IIIF) |
| **Multi-image?** | Not typical for books |
| **Image licensing** | Varies per book; metadata CC0 |
| **Display strategy** | Expand bitstreams on demand; use THUMBNAIL bundleName; construct full URL as `https://library.oapen.org{retrieveLink}` |

---

## 7. Discipline / Subject Tags

| Field | Value |
|-------|-------|
| **Vocabulary** | BIC (Book Industry Communication) through 2023; **Thema** classification added 2024; free-text in `dc.subject.other` |
| **Field paths** | `dc.subject.classification` (Thema/BIC codes), `dc.subject.other` (free-text keywords) |
| **Granularity** | 2-level (Thema: subject code + label); free-text is flat |
| **Example values** | `"Social & cultural anthropology, ethnography"`, `"History of science"` |
| **Hierarchy depth** | 2 levels (Thema categories) |
| **Facet param** | Not exposed via REST API (no facet endpoint) |
| **Usability** | Medium — Thema is a structured controlled vocabulary well-suited to humanities/SSH; free-text adds coverage |

---

## 8. Native Relevance & Scoring

| Field | Value |
|-------|-------|
| **Score returned?** | No — DSpace REST does not expose `_score` |
| **Field name** | N/A |
| **Semantics** | Solr BM25 internally (opaque) |
| **Range** | N/A |
| **Cross-query comparable?** | No |
| **Default sort** | Relevance (Solr internal); results return in Solr relevance order |
| **Sort params** | `sort=title&order=asc` → HTTP 500 (not supported in DSpace 5 REST) |

---

## 9. Pagination

| Field | Value |
|-------|-------|
| **Mechanism** | Offset-based (`offset=`, `limit=`) |
| **Param names** | `limit`, `offset` |
| **Max page size** | Not documented; 5 tested, no rejection observed |
| **Stated depth cap** | None found |
| **Empirical depth** | Offset 500 returns results for `history` query — no cap observed |
| **Total count** | NOT returned — `/rest/search` returns bare array with no `totalItems` field |
| **Cursor expiry** | N/A |
| **hasMore inference** | Compare result count to requested limit (current adapter: `results.length === pageSize`) |

### 9b. Measured Latency (live probe, 3 warm calls)

| Query type | Median (ms) | Notes |
|-----------|------------|-------|
| Keyword (`history`) | 939 ms | Cold=1,403 ms |
| Multi-keyword (`medieval europe society`) | 927 ms | Consistently slow |
| NL full-sentence | 1,323 ms | Slower for long queries |
| NL vs keyword delta | ~1.4× | Moderate overhead |
| Cold vs warm | ~1.5× | Less caching benefit than Solr-only APIs |

**Query strategy implication**: OAPEN is the slowest of the 4 audited APIs. Median ~940 ms means it will often be the tail of the fan-out. Expand bitstreams on second-pass only (adds latency).

---

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| **Key required?** | No — fully open |
| **Key type** | None |
| **Acquisition speed** | Instant |
| **Backend-safe?** | Yes (`serverSafe: true`) |
| **Anon limits** | None observed |
| **Rate-limit code** | None observed |
| **Retry-After** | N/A |
| **OAI-PMH** | Also available at `https://library.oapen.org/oai/request`; no key required |

---

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|--------------|
| `dc.description.abstract` | Contains HTML markup (`<br>`, `<p>`, `&amp;`) | `"<p>This book examines...</p>"` | `stripHtml()` (handled) |
| `oapen.identifier.doi` | May include `https://doi.org/` prefix | `"https://doi.org/10.1017/..."` | Strip prefix (handled) |
| `dc.date.issued` | Free-text — year only, ISO date, or datetime | `"2018"`, `"2018-03-15"`, `"2018-03-29T15:51:28Z"` | Regex `/\d{4}/` (handled) |
| `metadata` array | All values returned as strings regardless of semantic type | `oapen.pages: "312"` | `parseInt()` for numeric fields |
| `dc.contributor.author` | Multiple entries — one per author (not delimited) | 3 separate metadata entries with same key | `md.filter(m => m.key === 'dc.contributor.author').map(m => m.value)` (handled) |
| `dc.language` | Language code may be ISO 639-1 (`"en"`) or BCP-47 (`"en-GB"`) | `"en"`, `"de"`, `"fr"` | Use as-is; no known hazard |
| `name` field | May be `null` for some items | `"name": null` | Fallback to `dc.title` (handled) |
| `dc.type` | Values include `"book"`, `"chapter"`, `"grantor"` — `"grantor"` are funder records, not books | `"type": "grantor"` in `darwin` probe | Filter `dc.type !== "grantor"` in results |

---

## 12. Exploitation Notes

| Opportunity | Field/Path | Value |
|------------|-----------|-------|
| **Thumbnail from bitstreams** | `bitstreams[bundleName=THUMBNAIL].retrieveLink` | Requires `expand=bitstreams` in request; adds book cover images — high value for book discovery UX |
| **PDF direct link** | `bitstreams[bundleName=ORIGINAL].retrieveLink` | Direct PDF link for OA books; avoids DOI redirect chain |
| **Alternative title / subtitle** | `dc.title.alternative` | Often contains subtitle — improves display and title-field BM25F matching |
| **Place of publication** | `oapen.place.publication` | Useful provenance signal for geographic faceting |
| **Funder data** | `grantor.name`, `grantor.doi` | Crossref Funder ID available — could crosswalk to funding agency facet |
| **Peer review signal** | `peerreview.review.type`, `peerreview.anonymity` | Machine-readable peer review transparency — unique quality signal for book corpus |
| **OAI-PMH bulk harvest** | `https://library.oapen.org/oai/request` | MODS and oai_dc formats; resumption tokens; enables complete local index of ~30K OA books |
| **DOAB filter** | OAI-PMH `setSpec` | Books in DOAB (Directory of OA Books) can be targeted via OAI set filter |
| **Thema subject codes** | `dc.subject.classification` | Thema is a rich hierarchical vocab (replacing BIC) — map codes to human-readable labels for faceted browsing |

---

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score (×1.5) | **0** | No score returned; DSpace REST does not expose Solr `_score` |
| A2 Query expressiveness | **1** | `query=` param accepts Solr field-prefix syntax (untested officially); no documented boolean/phrase syntax; basic keyword only in practice |
| A3 Sort & filter control | **1** | No sort (500 on `sort=` param); no filter; `offset`/`limit` work |
| A4 Pagination depth/cursor | **2** | Offset-based; empirically deep (offset 500 works); no total count returned |
| A5 Batch/bulk | **2** | OAI-PMH with resumption tokens for full harvest; `expand=all` for rich per-item data |
| A6 Throughput & rate limits | **2** | Keyless; no rate limit observed; but ~940 ms median limits effective throughput |
| A7 ID linkage | **2** | DOI + Handle URI; no ORCID/PMID/arXiv |
| A8 Result-count accuracy | **1** | No total count in REST response; `hasMore` inferred from page fill |
| A9 Semantic/NL mode (×1.5) | **1** | Lexical Solr only; NL queries work via token matching |
| A10 Author-name pollution | **1** | Full-field search; no scope param documented; `dc.title:X` field prefix possible but undocumented |

```
Raw_A = (0×1.5 + 1 + 1 + 2 + 2 + 2 + 2 + 1 + 1×1.5 + 1) / 11
      = (0 + 1 + 1 + 2 + 2 + 2 + 2 + 1 + 1.5 + 1) / 11
      = 13.5 / 11
      = 1.23
```

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | **3** | Title + structured authors + date + DOI + publisher + pages + language + type + place; ORCID absent but rare for books |
| B2 Abstract / full-text (×1.5) | **2** | `dc.description.abstract` present for ~80% of records; full-text via bitstream PDFs; not >85% |
| B3 Citation graph | **0** | None |
| B4 Discipline / subject tags | **2** | Thema classification (2-level controlled vocab from 2024) + free-text keywords; facet not exposed via REST |
| B5 OA / free-access (×1.5) | **3** | Whole corpus OA; CC0 metadata; PDF accessible via bitstreams; DOI for ~90% of records |
| B6 Rich media / IIIF | **1** | Thumbnail + cover via `expand=bitstreams`; no IIIF manifest; requires extra round-trip |
| B7 Holdings / availability | **0** | None |
| B8 Record-quality signals | **2** | `peerreview.*` fields provide peer review transparency signal; `oapen.relation.isFundedBy` for provenance; `archived`/`withdrawn` flags |

```
Raw_B = (3 + 2×1.5 + 0 + 2 + 3×1.5 + 1 + 0 + 2) / 9
      = (3 + 3 + 0 + 2 + 4.5 + 1 + 0 + 2) / 9
      = 15.5 / 9
      = 1.72
```

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | **1** | ~940 ms median warm — slow; no SLA; generally stable |
| C2 Auth friction | **3** | Fully keyless; instant access |
| C3 Redistribution / TOS risk | **3** | Metadata CC0 1.0 (explicitly confirmed); full-text CC-licensed per book; no restriction on aggregation display |
| C4 Protocol / client maturity | **1** | DSpace 5.x (EOL 2023); no OpenAPI/versioning; REST docs sparse; OAI-PMH is better-documented path |
| C5 Data hygiene | **2** | Well-structured metadata array; known HTML in abstracts; `dc.type="grantor"` pollution; consistent null handling |

```
Raw_C = (1 + 3 + 3 + 1 + 2) / 5 = 10 / 5 = 2.00
```

### Rollup

```
Overall = 1.23 × 0.45 + 1.72 × 0.40 + 2.00 × 0.15
        = 0.554 + 0.689 + 0.300
        = 1.54
```

**TIER: B** (1.5–1.9 band)

---

## 14. Flags

| Field | Value |
|-------|-------|
| **TOS legal risk** | NONE — metadata CC0 1.0; explicit public domain dedication; full OA corpus |
| **Currently quarantined?** | No |
| **Recommended action** | (1) Filter out `dc.type="grantor"` records (funder pollution); (2) Map `dc.title.alternative` as subtitle; (3) Add `expand=bitstreams` on second pass for thumbnail; (4) Consider OAI-PMH pre-index for full corpus (~30K books); (5) Test `dc.title:(query)` fielded scope to reduce author pollution |
| **Blocking issues** | No total count in REST response (must infer `hasMore` from page size); DSpace 5.x EOL — OAPEN may eventually migrate to DSpace 7 breaking the REST contract |
