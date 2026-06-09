---
tags: [adapter, capability, dossier]
adapter_id: NORTHWESTERN
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/NORTHWESTERN.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Northwestern University Digital Collections — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `NORTHWESTERN` |
| Source file | `src/adapters/extensions/northwestern.js` |
| Official API name | Northwestern University Libraries DC API v2 |
| Provider | Northwestern University Library |
| Base URL | `https://api.dc.library.northwestern.edu/api/v2/search` |
| Protocol | REST-JSON POST (Amazon OpenSearch / Elasticsearch backend) |
| Docs URL | https://api.dc.library.northwestern.edu/api/v2 (no dedicated docs page; 404 on /docs) |
| GitHub | https://github.com/nulib/dc-api-v2 |
| TOS/license URL | No published TOS; item-level `rights_statement` and `license` fields |
| Pre-audit tier estimate | B |
| Dossier date | 2026-06-09 |

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard | Custom DC (Dublin Core extended) with LOC authority URIs; rights via RightsStatements.org and creativecommons.org |
| Serialization | JSON (custom envelope: `{data, pagination, info}`) |
| Schema URL | None published |
| Schema version | v2 (current); v1 deprecated |

The API wraps an **Amazon OpenSearch Service** (Elasticsearch-compatible) index. Per-document fields are extensive (60+ keys confirmed). Embeddings are computed via **Cohere `embed-multilingual-v3`** but are **not exposed in the public search API** — they are internal to OpenSearch. The public endpoint uses ES `query_string` DSL only.

## 3. Complete Field / Tag Inventory

### 3a. Search response envelope

| Field | Type | Always present? | Meaning | OpenCITE maps to |
|-------|------|----------------|---------|-----------------|
| `data[]` | array | yes | Result documents | results |
| `pagination.total_hits` | number | yes | Total matching docs | total |
| `pagination.current_page` | number | yes | Current page | page tracking |
| `pagination.total_pages` | number | yes | Total pages | hasMore |
| `pagination.next_url` | string | no | Next page URL with searchToken | hasMore |
| `pagination.search_token` | string | yes | Opaque JWT-like token for pagination | store for next page |

### 3b. Per-document fields (confirmed from live probe — full inventory)

| Field | Type | Always present? | Meaning | OpenCITE maps to |
|-------|------|----------------|---------|-----------------|
| `id` | string | yes | UUID | `id` suffix |
| `title` | string | yes | Primary title | `title` |
| `alternate_title` | string[] | no | Alternative titles | unmapped |
| `creator` | object[] | no | `{label, variants[], id, role}` with LOC authority | `authors[].label` |
| `contributor` | object[] | no | Contributors with authority IDs | unmapped |
| `description` | string[] | no | Descriptive note(s) | `abstract[0]` |
| `abstract` | string[] | no | Formal abstract | `abstract` (preferred over description) |
| `scope_and_contents` | string[] | no | Scope and contents note | unmapped (rich!) |
| `table_of_contents` | string[] | no | Table of contents | unmapped |
| `notes` | object[] | no | `{type, note}` typed notes | unmapped |
| `provenance` | string[] | no | Provenance history | unmapped |
| `date_created` | object[] | no | `{label}` human-readable dates | `year` regex extract |
| `date_created_edtf` | string | no | EDTF date string | unmapped |
| `subject` | object[] | no | `{label, variants[], id, role, facet, label_with_role}` with LOC/WorldCat authority URIs | `subjects[].label` |
| `genre` | object[] | no | `{label, variants[], id, facet}` with Getty AAT | `subjects[].label` (merged) |
| `style_period` | object[] | no | Art style/period with authority | unmapped |
| `technique` | object[] | no | Production technique | unmapped |
| `language` | object[] | no | `{label, variants[], id, facet}` with LOC language authority | `language[0].label` |
| `keyword` | string[] | no | Free-text keywords | `keywords` |
| `location` | object[] | no | Geographic location | unmapped |
| `nav_place` | object[] | no | Navigation place | unmapped |
| `cultural_context` | object[] | no | Cultural context | unmapped |
| `work_type` | string | no | "Image", "Audio", "Video", etc. | `type` |
| `collection` | object | no | `{description, id, title}` parent collection | unmapped |
| `rights_statement` | object | no | `{label, id}` RightsStatements.org URI | `isOA` check |
| `license` | object | no | `{label, id}` Creative Commons URI | `isOA` check |
| `terms_of_use` | string | no | Free-text terms of use | unmapped |
| `visibility` | string | yes | "Public", "Institution", "Private" | unmapped |
| `published` | boolean | yes | Is published | filter check |
| `thumbnail` | string | no | Thumbnail URL (IIIF API) | `previewImage` |
| `representative_file_set` | object | no | `{aspect_ratio, id, url}` — base IIIF URL | `previewImage` construction |
| `iiif_manifest` | string | no | Full IIIF manifest URL (v3) | unmapped |
| `api_link` | string | no | Self-referential API URL | unmapped |
| `canonical_link` | string | yes | Canonical public URL | `url` |
| `ark` | string | no | ARK persistent identifier | unmapped (stable ID!) |
| `identifier` | string[] | no | Other identifiers | unmapped |
| `legacy_identifier` | string[] | no | Legacy system IDs | unmapped |
| `accession_number` | string | no | Accession number | unmapped |
| `catalog_key` | string | no | Library catalog key | unmapped |
| `physical_description_size` | string[] | no | Physical dimensions | unmapped |
| `physical_description_material` | string[] | no | Physical material | unmapped |
| `publisher` | string[] | no | Publisher name | `publisher` |
| `source` | string[] | no | Source institution | unmapped |
| `rights_holder` | string[] | no | Rights holder name | unmapped |
| `related_url` | object[] | no | Related URLs | unmapped |
| `related_material` | string[] | no | Related material notes | unmapped |
| `series` | string[] | no | Series name | unmapped |
| `box_name` | string | no | Archival box name | unmapped |
| `box_number` | string | no | Archival box number | unmapped |
| `folder_name` | string | no | Archival folder name | unmapped |
| `folder_number` | string | no | Archival folder number | unmapped |
| `embedding_model` | string | no | Cohere model ID (internal) | unmapped — NOT in public search response |
| `embedding_text_length` | number | no | Length of embedded text (internal) | unmapped — NOT in public search response |
| `embedding` | array | no | Vector embedding — **NOT returned in public API** | N/A |
| `file_sets` | object[] | no | File set references | unmapped |
| `status` | string | no | "Done", etc. | unmapped |
| `indexed_at` | string | no | Last indexed timestamp | unmapped |
| `modified_date` | string | no | Last modified date | unmapped |
| `create_date` | string | no | Creation date | unmapped |

## 4. Query Semantics

- **Lexical vs semantic**: Primarily lexical ES `query_string`. Vector embeddings are stored internally but **not accessible via public API** (confirmed: `/knn` endpoint returns 400 "Bad Request"; no vector search endpoint exposed).
- **NL tolerance**: ES `query_string` with `default_operator=AND` — NL sentences are tokenized and all terms AND'd. Works but is over-constrained for long sentences. OR mode available via `default_operator=OR`.
- **Multi-keyword default**: AND (current OpenCITE `default_operator: "AND"`).
- **Phrase syntax**: ES `query_string` supports `"exact phrase"` in double quotes.
- **Boolean operators**: Full ES `query_string` DSL: `AND`, `OR`, `NOT`, `field:value`, range `[a TO b]`, fuzzy `~`, wildcard `*`, grouping `()`.
- **Fielded query**: `title:term`, `subject.label:term`, `creator.label:term`, etc. in `query_string` DSL.
- **Author-name pollution control**: `query_string` searches all indexed fields by default. Scoped queries `title:term` are supported and effective. The current adapter uses all-field `query_string` — author-name pollution occurs (probe: "cage" returns John Cage correspondence records). Fix: use `fields:["title","description","subject.label"]` in multi_match for topic queries.
- **Cross-lingual**: Collection includes items in Arabic, Hausa/Ajami, French, etc. ES multilingual tokenization applies. Cohere multilingual embeddings are internal only.

Note: The `embedding_model: cohere.embed-multilingual-v3` field confirmed in documents suggests AWS OpenSearch performs semantic indexing, but Northwestern has NOT exposed a vector search endpoint publicly. The feature is used by their internal AI search tool only (launched fall 2024 per AWS blog).

## 5. OA / Free-Access

| Property | Value |
|----------|-------|
| Whole-corpus OA? | Mixed — `visibility: "Public"` items are accessible; `"Institution"` items require Northwestern authentication |
| OA flag field | `rights_statement.id` (RightsStatements.org URI) + `license.id` (CC URI) |
| Best-OA URL | `canonical_link` (always present) |
| OA-only filter param | No explicit `isOA` filter; use `visibility: Public` + exclude `rights_statement.id=InC*` |
| Sort-by-OA | No |
| Flag coverage % | `visibility: "Public"` is the access gate; many items are "In Copyright" but still publicly viewable (educational use) |
| Recommended strategy | Current adapter hardcodes `isOA: true` — this overstates OA status. Some items have `rights_statement.label: "In Copyright"`. Map `license.id` (CC) and `rights_statement.id` for accurate OA flagging. |

Live probe: `rights_statement: {label: "In Copyright", id: "...InC/1.0/"}` — these are IN FACT publicly viewable but not freely reusable.

## 6. Images / Thumbnails / IIIF

| Property | Value |
|----------|-------|
| Has images? | Yes — IIIF Image API (api.dc.library.northwestern.edu/api/v2/works/{id}) |
| Thumbnail field | `thumbnail` (direct URL) OR `representative_file_set.url` + `/full/300,/0/default.jpg` |
| Full-res field | `representative_file_set.url` + `/full/max/0/default.jpg` |
| IIIF manifest field | `iiif_manifest` (IIIF v3 manifest URL) |
| IIIF version | IIIF Presentation API v3 |
| Multi-image? | Yes — `file_sets[]` array; IIIF manifest covers all pages |
| Image licensing | Per `rights_statement` and `license` fields |
| Display strategy | `previewImage = thumbnail \|\| (representative_file_set?.url + '/full/300,/0/default.jpg')` — both in search response (current adapter maps this). IIIF manifest unmapped but available. |

Current adapter already maps `thumbnail` and `representative_file_set.url` for `previewImage`. IIIF v3 manifest is present per item but not forwarded to OpenCITE clients.

## 7. Discipline / Subject Tags

| Property | Value |
|----------|-------|
| Vocabulary | LOC Subject Headings (LCSH) with WorldCat FAST IDs; Getty AAT for genre |
| Field paths | `subject[]{label, id, role, variants[]}`, `genre[]{label, id, variants[]}` |
| Granularity | High — subjects have LOC authority URIs, role classification (Topical/Geographical/etc.), variant spellings. Genre linked to Getty AAT. |
| Example values | `{label:"Cage, John", id:"http://id.loc.gov/authorities/names/n50032828", role:"Topical"}`, `{label:"personal correspondence", id:"http://vocab.getty.edu/aat/300048730"}` |
| Hierarchy depth | 2+ (LCSH subdivisions; facetable role types: Topical/Geographical/Temporal) |
| Facet/filter param | `subject.label:term` or `subject.id:uri` in `query_string` |
| Usability for faceting | **High** — LOC authority IDs enable deduplication and hierarchy traversal; Getty AAT for genre; role-separated (Topical vs Geographical vs Temporal); variant spellings for NLP disambiguation. Best subject tag quality of all five adapters. |

## 8. Native Relevance & Scoring

| Property | Value |
|----------|-------|
| Score returned? | **No** — `_score` is NOT included in API response (confirmed from probe: `_score=undefined` for all documents even when ES `sort=[_score]` requested). |
| Score field | None in public response |
| Semantics | ES BM25 internal; OpenSearch scores documents but strips `_score` from API output |
| Range | N/A (not exposed) |
| Cross-query comparable? | No |
| Default sort | Unspecified (search relevance ordering applied server-side) |
| Sort params | Not documented for public API |

Per the Elasticsearch protocol fairness caveat: despite being an ES backend, `_score` is NOT leaked in the response (`undefined` in probe). A1 = 0.

## 9. Pagination

| Property | Value |
|----------|-------|
| Mechanism | Search token + page-based GET (`searchToken` + `page=N` + `size=N`) |
| Param names | POST: `from`, `size`; GET (with token): `searchToken`, `page`, `size` |
| Max page size | `size=100` works empirically |
| Stated depth cap | `maxWindow: 10000` per adapter (OpenSearch default deep-page limit) |
| Empirical depth | `total_hits: 3587` for "manuscript"; 129,861 for multi-OR query |
| Cursor expiry | Search token is a JWT with `exp` claim; empirically stable across the probe session |

### 9b. Measured Latency (live probe, warm)

| Query type | Latency |
|-----------|---------|
| Keyword (1 term) | **599–762 ms** |
| Multi-keyword (NL full sentence) | **633–774 ms** |
| No NL vs keyword delta | ~1.0× |

Consistent ~700ms for all query types. POST endpoint has CORS restrictions for browser (requires proxy). No extra resolve calls — all fields in single response.

## 10. Rate Limits & Auth

| Property | Value |
|----------|-------|
| Key required? | No |
| Auth type | Session cookie (`dcapi56a927b` JWT) auto-issued; scopes `read:Public`, `read:Published` |
| Acquisition speed | Auto-issued on first request (no registration) |
| Backend-safe? | Yes (`serverSafe: true`); browser requires proxy (CORS restriction) |
| Rate limits | None documented; `Apigw-Requestid` header confirms API Gateway backend |
| Burst | Unknown |
| Quota | None published |
| CORS note | Browser direct fetch fails (CORS); must use server proxy (adapter handles this via `proxiedFetch` for browser, direct `fetch` for server) |

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `description` | Array; may be empty array | `[]` | `Array.isArray(d.description) ? d.description[0] : d.description` with null check |
| `abstract` | Array; may be empty | `[]` | Same as description; prefer over description when present |
| `creator` | Array of objects (not strings); has `label`, `variants[]`, `id` | `{label:"Cage, John", variants:[...]}` | `(d.creator \|\| []).map(c => c.label \|\| c)` |
| `subject` | Array of objects with `label`, `id`, `role`, `facet`, `variants[]` | Complex authority object | `(d.subject \|\| []).map(s => s?.label \|\| s)` |
| `genre` | Array of objects similar to subject | `{label:"personal correspondence", id:"...", variants:[...]}` | Same pattern as subject |
| `language` | Array of objects | `{label:"English", id:"...", variants:[]}` | `(d.language \|\| []).map(l => l?.label \|\| l)` |
| `date_created` | Array of objects `{label}` with free-text | `["August 1, 1977 to August 9, 1977"]` | `String(d.date_created?.[0]?.label \|\| '').match(/\d{4}/)?.[0]` |
| `rights_statement` | Object `{label, id}` not string | `{label:"In Copyright", id:"...InC/1.0/"}` | `d.rights_statement?.label` or URI check |
| `license` | May be `null` (not absent) | `null` | `d.license \|\| null` check |
| `visibility` | String enum; "Institution" items visible but restricted | `"Institution"` | Do not assume all items are fully OA |
| `thumbnail` | Full URL to IIIF endpoint; may truncate at 80 chars in display | Long URL | Store full URL; don't truncate |
| `notes` | Array of `{type, note}` typed objects | `[{type:"Local Note", note:"..."}]` | Typed notes; join by type for display |
| `scope_and_contents` | Array; highly variable length | Long scholarly finding-aid text | First 500 chars for display; full text for indexing |

## 12. Exploitation Notes

### Under-exploited fields

| Field path | Why valuable |
|-----------|-------------|
| `scope_and_contents[]` | Finding-aid style descriptive text — far richer than `description`. Currently unmapped. Best content signal for manuscripts. |
| `iiif_manifest` | IIIF v3 manifest URL. Enables viewer embedding, multi-page browsing. Currently unmapped. |
| `ark` | ARK persistent identifier. Stable cross-system ID. Currently unmapped. |
| `abstract[]` | Formal abstract when present (preferred over `description`). Currently NOT preferred in adapter (uses `description`). |
| `subject[].id` + `subject[].role` | LOC authority URI + role (Topical/Geographical/Temporal/etc.). Enables entity-level faceting and deduplication. Currently only `label` extracted. |
| `genre[].id` (Getty AAT) | Genre linked to Getty vocabulary. Enables cross-adapter genre faceting. |
| `collection.title` | Parent collection name. Useful for collection-level browsing UI. |
| `license.id` | CC license URI. Enables accurate `isOA` flag (currently hardcoded `true`). |
| `cultural_context[]` | Cultural attribution of manuscripts — valuable for West African / Arabic manuscript corpus. Unmapped. |
| `style_period[]` | Art historical period. Unmapped. |

### Query-strategy upgrade

1. **Add field scoping for topic queries** — use `multi_match` with `fields: ["title", "description", "subject.label", "scope_and_contents"]` instead of all-field `query_string` to eliminate creator-field author pollution.
2. **Prefer `abstract` over `description`** — `abstract` is the formal field; `description` is a generic note. Prefer `abstract[0] \|\| description[0]`.
3. **Map `scope_and_contents[0]` as abstract fallback** — for manuscripts with no formal abstract, `scope_and_contents` is the richest descriptive text.
4. **Fix `isOA` flag** — check `license.id` for CC URI, `rights_statement.id` for InC vs allowed. Don't hardcode `true`.
5. **Map `iiif_manifest`** — forward IIIF v3 manifest URL to OpenCITE for viewer embedding.

### Semantic search potential (future)

The `embedding_model: cohere.embed-multilingual-v3` in documents confirms all items are vectorized. Northwestern's internal AI search (launched fall 2024) uses this for semantic NL queries. If Northwestern exposes a vector search endpoint in a future API version, this would become the best semantic search source in the roster for manuscript content.

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score *(1.5×)* | **0** | ES backend exists but `_score` not returned in API response (confirmed). Sort by score works server-side but value is inaccessible. |
| A2 Query expressiveness | **3** | Full ES `query_string` DSL: fielded, boolean, phrase, wildcard, fuzzy, range. Also supports `multi_match`, `match`, and other ES query types in POST body. Best expressiveness of all five adapters. |
| A3 Sort & filter control | **2** | Rich ES filtering (all fields filterable via query DSL); no documented facet API but any field can be aggregated. `visibility`, `work_type`, `rights_statement.id`, `language.label` all filterable. |
| A4 Pagination depth / cursor | **2** | Search-token cursor + offset; cap 10k (OpenSearch default); `total_hits` accurate. |
| A5 Batch / bulk endpoint | **2** | Paginate full corpus via offset; 100k+ items retrievable. No OAI-PMH. |
| A6 Throughput & rate limits | **2** | API Gateway backed; no documented limit; ~700ms median. Keyless for public items. |
| A7 ID linkage / crosswalk | **2** | `ark` (ARK persistent ID), `catalog_key` (library catalog), `accession_number`, LOC authority IDs on subjects/creators. No DOI for most items (manuscripts, not publications). |
| A8 Result-count accuracy | **2** | `total_hits` is ES document count; accurate for the indexed set. |
| A9 Semantic / NL query *(1.5×)* | **1** | Lexical only via public API. Cohere multilingual embeddings internal but not exposed. NL-tolerant via ES tokenization. |
| A10 Author-name pollution control | **1** | `query_string` searches all fields by default including `creator.label`. Fielded scoping possible (`title:term`) but requires explicit implementation. Currently no scoping in adapter. |

```
Raw_A = (0×1.5 + 3 + 2 + 2 + 2 + 2 + 2 + 2 + 1×1.5 + 1) / 11
      = (0 + 3 + 2 + 2 + 2 + 2 + 2 + 2 + 1.5 + 1) / 11
      = 17.5 / 11
      = 1.59
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | **2** | Title + creator (structured with LOC authority) + date + language + publisher; missing journal/volume/DOI (manuscripts). Well-structured for archival materials. |
| B2 Abstract / full-text *(1.5×)* | **2** | `description`, `abstract`, `scope_and_contents` all available in single response — no extra round trip. `scope_and_contents` is extremely rich for manuscripts. Coverage ~60-80% for manuscripts with finding aids. No full-text XML. |
| B3 Citation graph | **0** | No citation data. |
| B4 Discipline / subject tags | **3** | LOC authority subjects with URI, role, and variants; Getty AAT genre; style_period; cultural_context. Best controlled-vocabulary tagging of all five adapters. Role-separated (Topical/Geographical/Temporal). |
| B5 OA / free-access *(1.5×)* | **1** | `rights_statement` and `license` fields present per item but mixed (In Copyright, Educational Use, CC0). Current adapter overclaims `isOA: true`. No OA-only filter param. No authoritative OA guarantee. |
| B6 Rich media / IIIF / thumbnails | **2** | `thumbnail` URL (IIIF) + `representative_file_set.url` (IIIF base) + `iiif_manifest` (v3 manifest). Consistent fields in single response (no extra call). Thumbnail mapped; IIIF manifest unmapped. Multi-image via manifest. |
| B7 Holdings / availability | **2** | `collection.title/description`, `library_unit`, `box_name/number`, `folder_name/number`, `series` — archival hierarchy. Single institution. Structured archival finding-aid fields. |
| B8 Record-quality signals | **2** | `indexed_at`, `modified_date`, `create_date` (timestamps); `status: "Done"` (processing status); `published: true/false` (publication state). Multiple provenance signals. |

```
Raw_B = (2 + 2×1.5 + 0 + 3 + 1×1.5 + 2 + 2 + 2) / 9
      = (2 + 3 + 0 + 3 + 1.5 + 2 + 2 + 2) / 9
      = 15.5 / 9
      = 1.72
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | **2** | ~700ms median; API Gateway backed; no formal SLA. CORS requires proxy for browser. |
| C2 Auth friction | **3** | Keyless; session cookie auto-issued; no registration required. |
| C3 Redistribution / TOS risk | **2** | Open access digital library; items vary from CC0 to In Copyright. Display + aggregation aligns with institution purpose. No explicit API TOS. LOW risk for metadata display. |
| C4 Protocol / client maturity | **2** | ES-compatible POST body; versioned (`v2`); API Gateway indicates investment; no OpenAPI schema published. |
| C5 Data hygiene & parseability | **2** | Consistent field types (arrays always arrays; objects always objects); creator/subject/genre all use `{label, id}` objects consistently; date as `{label}` objects. `description` and `abstract` both empty-array not absent. Well-typed. |

```
Raw_C = (2 + 3 + 2 + 2 + 2) / 5
      = 11 / 5
      = 2.20
```

### Rollup

```
Overall = Raw_A × 0.45 + Raw_B × 0.40 + Raw_C × 0.15
        = 1.59 × 0.45 + 1.72 × 0.40 + 2.20 × 0.15
        = 0.716 + 0.688 + 0.330
        = 1.73
```

**TIER B — Complementary**

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | **LOW** — Open access digital library; item-level rights clearly stated. No API TOS restriction. |
| Currently quarantined? | No |
| Recommended action | Strong source for its niche (West African manuscripts, Hausa Ajami, archival collections). Fix: (1) add field scoping for topic queries (multi_match on title/description/subject.label); (2) prefer `abstract` over `description`; (3) map `scope_and_contents` as abstract fallback; (4) fix `isOA` using `license.id`; (5) map `iiif_manifest`. Future: monitor for vector search endpoint exposure. |
| Blocking issues | CORS restriction requires server proxy for all browser requests. `_score` not exposed despite ES backend — no ranking signal available. `visibility: "Institution"` items reach public users but may have restricted reuse rights. |
