---
tags: [adapter, capability, dossier]
adapter_id: PRINCETON_DPUL
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/PRINCETON_DPUL.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Princeton Digital PUL — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `PRINCETON_DPUL` |
| Source file | `src/adapters/extensions/princetonDpul.js` |
| Official API name | Princeton Digital PUL (DPUL) — Blacklight catalog.json |
| Provider | Princeton University Library (PUL) |
| Base URL | `https://dpul.princeton.edu/catalog.json` |
| Item detail URL | `https://dpul.princeton.edu/catalog/{id}.json` |
| Protocol | Blacklight JSON:API (Solr backend) |
| Docs URL | No official API docs; GitHub: https://github.com/pulibrary/dpul |
| TOS/license URL | No published API TOS; individual item `edm-rights` fields present |
| Pre-audit tier estimate | C |
| Dossier date | 2026-06-09 |

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard | Blacklight JSON:API (custom Solr field convention); IIIF manifests (Figgy repository) |
| Serialization | JSON (JSON:API with `data[]`, `meta`, `included` sections) |
| Schema URL | None published |
| Schema version | Unversioned (Blacklight/Pomegranate stack; Phusion Passenger backend) |

Two-tier response structure: the `catalog.json` search response returns **minimal attributes** (title, collections, creator, publisher, format via `readonly_*_ssim` embedded objects). Full Solr field inventory is only available via the per-item `catalog/{id}.json` endpoint which returns a `response.document` object with 70+ fields.

## 3. Complete Field / Tag Inventory

### 3a. catalog.json search response (per data item)

| Field | Type | Always present? | Meaning | OpenCITE maps to |
|-------|------|----------------|---------|-----------------|
| `id` | string | yes | Solr document UUID | `id` prefix |
| `type` | null | yes | Always null in search | — |
| `links.self` | string | yes | Item catalog URL | `url` |
| `attributes.title` | string (HTML) | yes | HTML-formatted title | `title` (after HTML strip) |
| `attributes.readonly_title_ssim.attributes.value` | string | yes | Plain-text title | `title` (preferred) |
| `attributes.readonly_creator_ssim.attributes.value` | string | no | Creator plain text | `authors` |
| `attributes.readonly_publisher_ssim.attributes.value` | string | no | Publisher plain text | `publisher` |
| `attributes.readonly_format_ssim.attributes.value` | string | no | Format (e.g., "Pamphlets", "Visual material") | unmapped |
| `attributes.readonly_collections_ssim.attributes.value` | string (HTML) | yes | Collection HTML | collection display |
| `attributes.readonly_collections_tesim.attributes.value` | string | yes | Collection name plain text | unmapped |

**Critical gap**: `description`, `subject`, `date`, `language`, `IIIF manifest`, `thumbnail`, `abstract`, `call-number`, `rights` are **NOT returned in search results** — only in per-item detail.

### 3b. catalog/{id}.json item detail — response.document (70+ fields)

Selected fields of interest:

| Field | Type | Always present? | Meaning | OpenCITE maps to |
|-------|------|----------------|---------|-----------------|
| `id` | string | yes | Solr document UUID | `id` |
| `readonly_title_ssim` | string[] | yes | Title(s) | `title` |
| `readonly_creator_ssim` | string[] | no | Creator(s) | `authors` |
| `readonly_date_ssim` | string[] | no | Date (e.g., "1557-1572") | `year` |
| `readonly_created_ssim` | string[] | no | ISO date range | `year` (structured) |
| `readonly_description_ssim` | string[] | no | Description | `abstract` |
| `readonly_abstract_ssim` | string[] | no | Abstract text | `abstract` (preferred) |
| `readonly_subject_ssim` | string[] | no | Subject terms | `subjects` |
| `readonly_language_ssim` | string[] | no | Language names | `language` |
| `readonly_publisher_ssim` | string[] | no | Publisher | `publisher` |
| `readonly_format_ssim` | string[] | no | Format type | `type` |
| `readonly_call-number_ssim` | string[] | no | Call number | unmapped |
| `readonly_extent_ssim` | string[] | no | Physical description | unmapped |
| `readonly_identifier_ssim` | string[] | no | ARK identifier | `doi`-equivalent |
| `readonly_references_ssim` | string[] | no | Bibliographic references | unmapped (rich!) |
| `readonly_contributor_ssim` | string[] | no | Contributors | unmapped |
| `readonly_donor_ssim` | string[] | no | Donor name | unmapped |
| `readonly_source-acquisition_ssim` | string[] | no | Acquisition source | unmapped |
| `readonly_edm-rights_ssim` | string[] | no | Rights URL (Europeana EDM) | `isOA` check |
| `readonly_uniform-title_ssim` | string[] | no | Uniform/transliterated title | unmapped |
| `readonly_range-label_ssim` | string[] | no | Range label (foliation) | unmapped |
| `readonly_location_ssim` | string[] | no | Physical location | unmapped |
| `thumbnail_ssim` | string[] | no | **IIIF thumbnail URL** | `previewImage` (not mapped in current adapter) |
| `full_image_url_ssm` | string[] | no | **Full-size image URL** | unmapped |
| `content_metadata_iiif_manifest_field_ssi` | string | no | **IIIF manifest URL** (Figgy) | unmapped (not in catalog.json!) |
| `tile_source_ssim` | string[] | no | IIIF tile source URLs | unmapped |
| `readonly_available-online_ssim` | string[] | no | Online availability HTML link | unmapped |
| `sort_title_ssi` | string | no | Sort-normalized title | unmapped |
| `sort_date_ssi` | string | no | Sort-normalized date | unmapped |
| `system_created_at_dtsi` | string | yes | Record creation timestamp | unmapped |
| `system_updated_at_dtsi` | string | yes | Record update timestamp | unmapped |
| `full_title_tesim` | string[] | no | Full analyzed title | unmapped |

### 3c. Facets (in `included[]` of catalog.json)

Available facet fields (confirmed from live probe):

| Facet ID | Label | Example values |
|----------|-------|----------------|
| `readonly_collections_ssim` | Collections | "Manuscripts of the Islamic World" (3482), "Middle East Manuscripts" (1628) |
| `readonly_language_ssim` | Language | "Arabic" (4781), "English" (831), "Greek, Ancient (to 1453)" (562) |
| `readonly_subject_ssim` | Subject | "Manuscripts, Arabic—New Jersey—Princeton" (2398) |

Sort options: `relevance`, `sort_title` (A-Z), `sort_date_desc`, `sort_date_asc`, `sort_author`.

Search fields: `all_fields`, `title`, `publisher`, `subject`.

## 4. Query Semantics

- **Lexical vs semantic**: Fully lexical Solr BM25F (Blacklight default). No semantic/vector search.
- **NL tolerance**: Solr tokenizes NL sentences; AND among tokens by default. NL queries work but are purely lexical.
- **Multi-keyword default**: AND (Solr default; confirmed from sort=relevance behavior).
- **Phrase syntax**: Lucene phrase queries `"exact phrase"` should work in Solr but undocumented for this endpoint.
- **Boolean operators**: Lucene syntax works in `q=` param (AND, OR, NOT, field:term). Undocumented but functional.
- **Fielded query param**: `search_field=title`, `search_field=subject`, `search_field=publisher`, `search_field=all_fields`.
- **Author-name pollution control**: `search_field=title` provides title-only scoping, reliably suppressing creator-field pollution. Confirmed effective in probe ("darwin" + `search_field=title` returns 124 title-matching records, not creator matches). Recommended for topic queries in OpenCITE.
- **Cross-lingual**: No — but DPUL has multilingual content (Arabic, Persian, Greek) indexed; Solr analyzes per-language fields.

## 5. OA / Free-Access

| Property | Value |
|----------|-------|
| Whole-corpus OA? | Yes — all DPUL content is digitized and freely available online |
| OA flag field | `readonly_edm-rights_ssim` (EDM rights URL, e.g., CC or rights statement) — only in item detail |
| Best-OA URL | `links.self` in search response → item page |
| OA-only filter param | None in search API |
| Sort-by-OA | No |
| Flag coverage % | 100% accessible online (by definition of the platform); specific rights vary |
| Recommended strategy | `isOA: true` hardcoded is appropriate — all DPUL items are digitized and accessible. Individual rights via `readonly_edm-rights_ssim` in item detail. |

## 6. Images / Thumbnails / IIIF

| Property | Value |
|----------|-------|
| Has images? | Yes — IIIF images via Figgy repository (iiif-cloud.princeton.edu) |
| Thumbnail field | `thumbnail_ssim[0]` in item detail — IIIF URL with size params `!200,150` |
| Full-res field | `full_image_url_ssm[0]` in item detail — IIIF URL with size `!800,800` |
| IIIF manifest field | `content_metadata_iiif_manifest_field_ssi` in item detail — full Figgy manifest URL |
| IIIF version | IIIF Presentation API v2 (Figgy-generated) |
| Multi-image? | Yes — manuscripts have multiple folios/pages; IIIF manifest covers all pages |
| Image licensing | Per item `readonly_edm-rights_ssim` |
| Display strategy | Thumbnail and IIIF manifest are only in **item detail** (`catalog/{id}.json`), not in search `catalog.json`. Current adapter does not make this extra call and does not map images. **This is a significant under-exploitation.** |

Confirmed example: `thumbnail_ssim: ["https://iiif-cloud.princeton.edu/iiif/2/dc%2Ff3%2F97%2F...intermediate_file/full/!200,150/0/default.jpg"]`

## 7. Discipline / Subject Tags

| Property | Value |
|----------|-------|
| Vocabulary | LOC Subject Headings (LCSH) via Solr `readonly_subject_ssim`; uncontrolled collection tags |
| Field path | `readonly_subject_ssim` (item detail only) |
| Granularity | Medium — LCSH with subdivisions (e.g., "Manuscripts, Arabic—New Jersey—Princeton") |
| Example values | "Illuminations (visual works)", "Manuscripts, Arabic—New Jersey—Princeton", "Watermarks" |
| Hierarchy depth | 1-2 (LCSH subdivision with `—` separator) |
| Facet/filter param | `readonly_subject_ssim` facet in catalog.json (confirmed); `search_field=subject` |
| Usability for faceting | **High** — LCSH subject facet returns counts; deep subject hierarchy (subdivisions) but needs subdivision parser (`—`). Note: subject only in item detail, not search response. |

## 8. Native Relevance & Scoring

| Property | Value |
|----------|-------|
| Score returned? | **No** — `catalog.json` search response does not include Solr `score` field (confirmed from live probe: `attributes` contains only 6 `readonly_*` fields). |
| Score field in Solr | `score` exists in the underlying Solr index (confirmed: `sort=relevance` works as a sort option) but is not exposed in the JSON:API response |
| Score available in item detail? | Not confirmed — item detail returns document fields but `score` is a query-specific field |
| Semantics | Solr BM25F (inferred from Blacklight default) |
| Default sort | `relevance` (Solr BM25F ordering) by default when `sort=relevance` |
| Sort params | `sort=relevance`, `sort=sort_title`, `sort=sort_date_desc`, `sort=sort_date_asc`, `sort=sort_author` |

The Elasticsearch/Solr protocol fairness caveat: Blacklight does NOT expose `_score` in its JSON:API output. A1 = 0 for DPUL.

## 9. Pagination

| Property | Value |
|----------|-------|
| Mechanism | Offset + page-based (`page=N`, `per_page=N`) |
| Param names | `page`, `per_page` |
| Max page size | Undocumented; empirically `per_page=100` works |
| Stated depth cap | None documented |
| Empirical depth | 578 results observed for "quran" query; total_count accurate |
| Cursor expiry | N/A — stateless pagination |

### 9b. Measured Latency (live probe, warm)

| Query type | Latency |
|-----------|---------|
| Keyword (1 term) | 668–760 ms |
| Multi-keyword | ~760 ms |
| NL sentence | **864–1021 ms** |

Latency is consistent ~750ms for typical queries. No extra resolve calls needed for search results (but images require additional call to item detail). NL sentences slightly slower (~1s).

## 10. Rate Limits & Auth

| Property | Value |
|----------|-------|
| Key required? | No |
| Auth type | None |
| Acquisition speed | N/A |
| Backend-safe? | Yes (`serverSafe: true`) |
| Rate limits | None documented; session cookie issued (`_pomegranate_session`) but not required |
| Burst | Unknown |
| Quota | None published |
| Rate-limit code | Unknown |
| Response headers | `X-Runtime: 0.213729` (Phusion Passenger) — fast server-side processing |

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `attributes.title` | HTML markup in title | `<ul><li dir="ltr">About the Quran</li></ul>` | Use `readonly_title_ssim.attributes.value` (plain text) or `stripHtml()` |
| `readonly_collections_ssim.attributes.value` | HTML with anchor tags | `<ul><li><a href="/sae">South Asia...</a></li></ul>` | Use `readonly_collections_tesim.attributes.value` for plain text |
| Date fields | Free-text ranges, ISO ranges, bare years | `"1557-1572"`, `"1557-01-01T00:00:00Z/1572-12-31T23:59:59Z"` | `String(dateRaw).match(/\d{4}/)?.[0]` |
| `readonly_created_ssim` | ISO date range with `/` separator | `"1557-01-01T00:00:00Z/1572-12-31T23:59:59Z"` | Extract first 4-digit year |
| `readonly_date_ssim` | May be absent even when `readonly_created_ssim` present | Missing | Try both fields; fallback chain |
| `readonly_abstract_ssim` vs `readonly_description_ssim` | Both may be present; semantically different | Abstract = scholarly description, Description = cataloger notes | Prefer `abstract_ssim`; fall back to `description_ssim` |
| `readonly_available-online_ssim` | HTML anchor | `<a href='https://catalog.princeton.edu/...'>...</a>` | Parse href or skip |
| `readonly_uniform-title_ssim` | May contain non-Latin script variants | `["Romance of Amīr Ḥamza","حمزه‌نامه"]` | Treat as array; join for display |
| Missing item detail fields | Item detail returns 70+ fields; catalog.json returns only 6 | `thumbnail_ssim` absent from search | Requires second API call to item detail |

## 12. Exploitation Notes

### Under-exploited fields (require per-item detail call)

| Field path | Why valuable |
|-----------|-------------|
| `content_metadata_iiif_manifest_field_ssi` | Full IIIF manifest URL (Figgy). Enables viewer embedding, page-flip, folio navigation for manuscripts. Currently completely unmapped. |
| `thumbnail_ssim[0]` | IIIF thumbnail with exact pixel dimensions. Would populate `previewImage`. Currently unmapped. |
| `readonly_abstract_ssim` | Scholarly abstract text — far better than the currently blank abstract. Present for many Islamic manuscripts. |
| `readonly_subject_ssim` | LCSH subject terms with subdivisions — excellent for faceting. Not in search response. |
| `readonly_references_ssim` | Bibliographic references (published catalog entries). Extremely valuable for manuscript scholarship context. |
| `readonly_edm-rights_ssim` | EDM rights URI (e.g., CC license). Enables per-record rights display. |
| `readonly_identifier_ssim` | ARK identifier (e.g., `ark:/88435/dcnc581109k`). Stable, citable ID. |
| `readonly_call-number_ssim` | Physical call number. Useful for library holdings display. |

### Query-strategy upgrade

1. **Add `search_field=title` for topic queries** — eliminates creator-field pollution. Currently the adapter sends `q=` with no `search_field` param, querying `all_fields` including creator. Fix: add `search_field=title` by default; allow `all_fields` for `authorSearch` mode.
2. **Make a per-item detail call** — a second call to `catalog/{id}.json` (or `{item_id}.json`) would retrieve IIIF manifest, thumbnail, abstract, subjects, and rights for each result. This is the only way to get images and rich metadata. Given the 50k corpus and typical page size of 5-10 results, this is feasible (5-10 extra calls per page).
3. **Add `readonly_language_ssim` facet filter** — enables Arabic/Persian/Greek/English language faceting. Already available in Blacklight facets.
4. **Add `f[readonly_collections_ssim][]` filter** — collection-scoped search (e.g., "Manuscripts of the Islamic World" only).

### Batch/harvest opportunity

Pagination to full 50k corpus is feasible via offset. No OAI-PMH or bulk dump via this API.

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score *(1.5×)* | **0** | Solr BM25F score is not exposed in JSON:API response. `sort=relevance` works but score value is inaccessible. |
| A2 Query expressiveness | **2** | Lucene syntax in `q=`; `search_field` for field scoping (title/subject/publisher/all); facet filters. No exposed boolean syntax in docs but Lucene-native. |
| A3 Sort & filter control | **2** | 5 sort options (relevance, title, date asc/desc, author); 3 facets with counts (collections, language, subject); collection/language/subject filter params. |
| A4 Pagination depth / cursor | **2** | Offset/page pagination; `total_count` accurate; no stated depth cap; 578+ results pageable. |
| A5 Batch / bulk endpoint | **1** | Offset pagination to full corpus; no bulk dump. |
| A6 Throughput & rate limits | **2** | No documented limit; keyless; <1s median response. |
| A7 ID linkage / crosswalk | **1** | ARK identifier (`readonly_identifier_ssim`) in item detail; `links.self` as canonical URL. No DOI/Wikidata. |
| A8 Result-count accuracy | **2** | `meta.pages.total_count` is accurate (578 for "quran"). |
| A9 Semantic / NL query *(1.5×)* | **1** | Solr BM25F; NL sentences tokenized and matched. No semantic lift. |
| A10 Author-name pollution control | **2** | `search_field=title` reliably scopes to title field only (confirmed in probe). Pollution is avoidable via this param. Current adapter doesn't use it. |

```
Raw_A = (0×1.5 + 2 + 2 + 2 + 1 + 2 + 1 + 2 + 1×1.5 + 2) / 11
      = (0 + 2 + 2 + 2 + 1 + 2 + 1 + 2 + 1.5 + 2) / 11
      = 15.5 / 11
      = 1.41
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | **2** | Title + creator + date + format structured in search response. Item detail adds call number, language, publisher, uniform title. Missing journal/DOI (manuscripts, not publications). |
| B2 Abstract / full-text *(1.5×)* | **1** | `readonly_abstract_ssim` and `readonly_description_ssim` exist in item detail but NOT in search response. Current adapter returns blank abstract. Richness exists but is unexploited (requires extra call). |
| B3 Citation graph | **0** | No citation data. `readonly_references_ssim` contains bibliographic references (published catalog entries) but these are citation sources TO the manuscript, not citation counts. |
| B4 Discipline / subject tags | **2** | LCSH subjects with subdivisions in item detail; facetable. Language facet with counts. Collection facet. Well-structured. |
| B5 OA / free-access *(1.5×)* | **2** | All items freely accessible online. `readonly_edm-rights_ssim` per item. No filter param. Mixed rights statements (some CC, some institution-specific). |
| B6 Rich media / IIIF / thumbnails | **2** | Full IIIF manifest (Figgy), thumbnail URL, full-image URL available — but only in **item detail** (extra call). Search response has no image fields. Current adapter maps zero image fields. Score reflects ceiling capability. |
| B7 Holdings / availability | **2** | `readonly_location_ssim` (physical location), `readonly_call-number_ssim`, `readonly_available-online_ssim`. Single institution (PUL). Structured holdings. |
| B8 Record-quality signals | **1** | `system_created_at_dtsi` and `system_updated_at_dtsi` (timestamps). No completeness score. |

```
Raw_B = (2 + 1×1.5 + 0 + 2 + 2×1.5 + 2 + 2 + 1) / 9
      = (2 + 1.5 + 0 + 2 + 3 + 2 + 2 + 1) / 9
      = 13.5 / 9
      = 1.50
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | **2** | ~750ms median; Phusion Passenger backend; no formal SLA; stable uptime observed. |
| C2 Auth friction | **3** | Fully keyless. |
| C3 Redistribution / TOS risk | **2** | All items freely accessible online by PUL policy. Individual rights via EDM field. Display + aggregation aligns with institution's open-access mission. LOW TOS risk. |
| C4 Protocol / client maturity | **1** | No API documentation; Blacklight JSON:API convention but undocumented for external use. Two-tier response (search vs item detail) adds complexity. No versioning. |
| C5 Data hygiene & parseability | **1** | HTML in title/collections fields; two-tier schema (search vs detail); date format variation; some fields only in item detail; `readonly_*` naming convention is consistent once understood. Multiple quirks. |

```
Raw_C = (2 + 3 + 2 + 1 + 1) / 5
      = 9 / 5
      = 1.80
```

### Rollup

```
Overall = Raw_A × 0.45 + Raw_B × 0.40 + Raw_C × 0.15
        = 1.41 × 0.45 + 1.50 × 0.40 + 1.80 × 0.15
        = 0.635 + 0.600 + 0.270
        = 1.50
```

**TIER B — Complementary** (borderline B/C)

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | **LOW** — PUL open-access digital library; free online access is the purpose. |
| Currently quarantined? | No |
| Recommended action | Fix immediately: (1) add `search_field=title` to all topic queries (3-line change); (2) add per-item detail call to retrieve `thumbnail_ssim`, `content_metadata_iiif_manifest_field_ssi`, and `readonly_abstract_ssim`. These two changes alone would push this adapter from B to A-tier for its specific corpus (Islamic manuscripts). |
| Blocking issues | Images and abstracts are ONLY in item detail, not in search response. Current adapter returns blank previewImage and blank abstract — degrading perceived quality. The 50k corpus is small but highly specialized (Islamic world manuscripts). |
