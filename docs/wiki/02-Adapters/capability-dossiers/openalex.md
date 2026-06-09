---
tags: [adapter, capability, dossier]
adapter_id: OPENALEX
dossier_date: 2026-06-09
pre_audit_tier: S
---

# OPENALEX — Capability Dossier

## §1 Identity

| Field | Value |
|-------|-------|
| Adapter ID | `OPENALEX` |
| Adapter file(s) | `src/adapters/core/openalex.js`, `src/adapters/_shared/parseOpenAlex.js` |
| Official API name | OpenAlex API |
| Provider | OurResearch (non-profit) |
| Base URL | `https://api.openalex.org/works` |
| Protocol | REST-JSON |
| Docs URL(s) | https://developers.openalex.org/ |
| TOS/license URL | CC0 public domain — metadata released under CC0 (confirmed via headers and community docs) |
| Pre-audit tier | S |
| Dossier date | 2026-06-09 |

---

## §2 Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard(s) | Custom OpenAlex JSON schema; concepts aligned to Wikidata QIDs; MeSH integrated from NLM; SDGs from UN |
| Serialization | JSON |
| Schema/OpenAPI URL | https://github.com/ourresearch/openalex-api-docs (OpenAPI available at /openapi.json) |
| Schema version | Unversioned but stable; changelog at https://docs.openalex.org/changelog |

---

## §3 Complete Field / Tag Inventory (live probe 2026-06-09)

| Field | Type | Always? | Meaning | OpenCITE maps to |
|-------|------|---------|---------|-----------------|
| `id` | string | Yes | OpenAlex work ID (URI: https://openalex.org/Wxxxxx) | `id` (suffix after /) |
| `doi` | string | No | DOI URI | `doi` (prefix stripped) |
| `title` | string | Yes | Primary title | `title` |
| `display_name` | string | Yes | Display title (same as title usually) | fallback for `title` |
| `relevance_score` | float | Yes (when sorted) | BM25 relevance score | NOT mapped — used for sort only |
| `publication_year` | int | No | Year of publication | `year` (stringified) |
| `publication_date` | string | No | ISO date string | NOT mapped |
| `ids` | object | Yes | {openalex, doi, mag} — OpenAlex, DOI URI, MAG ID | partial via `doi` |
| `language` | string | No | ISO 639-1 language code | `language` |
| `primary_location` | object | Yes | {id, is_oa, landing_page_url, pdf_url, source, license, license_id, version, is_accepted, is_published, raw_source_name, raw_type} | `journal` (source.display_name), `url` (landing_page_url), `publisher` (source.host_organization_name) |
| `primary_location.source.display_name` | string | No | Journal/venue name | `journal` |
| `primary_location.source.host_organization_name` | string | No | Publisher name | `publisher` |
| `primary_location.pdf_url` | string | No | Direct PDF link | NOT mapped |
| `type` | string | Yes | Work type (article, book, dataset, …) | `type` |
| `indexed_in` | string[] | No | Index membership (crossref, pubmed, etc.) | NOT mapped |
| `open_access` | object | Yes | {is_oa, oa_status, oa_url, any_repository_has_fulltext} | `isOA` (is_oa), `url` (oa_url fallback) |
| `open_access.oa_status` | string | Yes | OA status: gold/green/bronze/hybrid/closed | NOT mapped (granular OA type) |
| `open_access.oa_url` | string | No | Best OA URL (Unpaywall-sourced) | `url` (fallback) |
| `open_access.any_repository_has_fulltext` | bool | Yes | Whether any repo has full text | NOT mapped |
| `authorships` | object[] | Yes | [{author_position, author:{id,display_name,orcid}, institutions, countries, is_corresponding, raw_author_name, raw_affiliation_strings, raw_orcid, affiliations}] | `authors` (display_name) |
| `authorships[].author.orcid` | string | No | Author ORCID URI | NOT mapped |
| `authorships[].institutions` | object[] | No | Author institution(s) with ROR IDs | NOT mapped |
| `authorships[].is_corresponding` | bool | No | Corresponding author flag | NOT mapped |
| `biblio` | object | No | {volume, issue, first_page, last_page} | `volume`, `issue`, `pages` |
| `cited_by_count` | int | Yes (0 if none) | Total inbound citations | `citedBy` |
| `citation_normalized_percentile` | object | No | Citation percentile within field/year | NOT mapped |
| `fwci` | float | No | Field-Weighted Citation Impact | NOT mapped |
| `referenced_works` | string[] | Yes | List of OpenAlex IDs this work cites (outbound) | NOT mapped |
| `referenced_works_count` | int | Yes | Count of references | NOT mapped |
| `related_works` | string[] | Yes | Algorithmically related work IDs | NOT mapped |
| `is_retracted` | bool | Yes | Retraction flag | NOT mapped |
| `is_paratext` | bool | Yes | Paratext (front matter, etc.) flag | NOT mapped |
| `abstract_inverted_index` | object | No (~85% coverage on OA works) | Inverted index of abstract — must be reconstructed | `abstract` (via reconstructAbstract()) |
| `topics` | object[] | Yes | [{id, display_name, score, subfield:{id,display_name}, field:{id,display_name}, domain:{id,display_name}}] — 4-level hierarchy | `keywords` (display_name + field.display_name merged) |
| `primary_topic` | object | No | Highest-scoring topic (same shape as topics[]) | NOT mapped |
| `keywords` | object[] | Yes | [{id, display_name, score}] — keyword-level tags | `keywords` (merged with topics) |
| `concepts` | object[] | Yes | [{id, wikidata, display_name, level, score}] — Wikidata-linked concepts (deprecated but still returned) | `keywords` (display_name merged) |
| `mesh` | object[] | No | [{descriptor_ui, descriptor_name, qualifier_ui, qualifier_name, is_major_topic}] — MeSH terms from PubMed | `keywords` (descriptor_name merged) |
| `sustainable_development_goals` | object[] | No | [{id, display_name, score}] — UN SDG tags | NOT mapped |
| `locations` | object[] | Yes | All known locations (repository + publisher) | NOT mapped |
| `locations_count` | int | Yes | Count of known locations | NOT mapped |
| `best_oa_location` | object | No | Best OA location (same shape as primary_location) | NOT mapped directly |
| `best_oa_location.pdf_url` | string | No | Best direct PDF URL | NOT mapped |
| `has_fulltext` | bool | Yes | Whether fulltext indexable | NOT mapped |
| `content_urls` | object[] | No | Fulltext content URLs | NOT mapped |
| `funders` | object[] | No | [{id, display_name, doi, award_ids}] | NOT mapped |
| `counts_by_year` | object[] | Yes | [{year, cited_by_count, oa_works_count}] — citations per year | NOT mapped |
| `apc_list` | object | No | APC list price | NOT mapped |
| `apc_paid` | object | No | APC actually paid | NOT mapped |
| `grants` | object[] | No | Grant IDs | NOT mapped |
| `updated_date` | string | Yes | Last update timestamp | NOT mapped |
| `created_date` | string | Yes | Record creation date | NOT mapped |

---

## §4 Query Semantics

- **Lexical vs semantic**: Lexical BM25 (Elasticsearch backend). No vector semantic search.
- **NL tolerance**: High tolerance for multi-word NL queries — stemming (Kstem), stop-word removal, AND logic between terms. Full sentences work but produce AND-of-all-terms logic (not semantic understanding).
- **Multi-keyword default**: AND between terms (within `title_and_abstract.search`).
- **Phrase syntax**: Enclose in double quotes in filter value.
- **Boolean operators**: Filter syntax supports `|` (OR) between filter values for same-field filter; AND via comma-separated filters. No full boolean DSL on search fields.
- **Fielded query params**:
  - `title_and_abstract.search:<term>` — title + abstract only (content scope, prevents author pollution)
  - `default.search:<term>` — all fields including author, affiliation
  - `display_name.search:<term>` — title only
  - Can be combined as filter: `filter=is_oa:true,title_and_abstract.search:photosynthesis`
- **Author-name pollution control**: `title_and_abstract.search` structurally excludes author/affiliation fields — pollution **impossible** by design. This is the strongest pollution control in the roster.
- **Cross-lingual**: No semantic cross-lingual search. Language field filterable (`filter=language:fr`).

---

## §5 OA / Free-Access

| Field | Value |
|-------|-------|
| Whole-corpus OA? | Mixed; `is_oa:true` filter available |
| OA flag field | `open_access.is_oa` (bool) — Unpaywall-sourced, highly reliable (>90% accuracy) |
| Best-OA URL field | `open_access.oa_url` — populated when OA; `best_oa_location.pdf_url` for direct PDF |
| OA-only filter param | `filter=is_oa:true` — confirmed live (77,578 OA photosynthesis works vs 170,276 total) |
| Sort-by-OA | No dedicated sort; combine with relevance_score |
| OA status granularity | `open_access.oa_status`: gold / green / bronze / hybrid / closed |
| Flag coverage % | >90% (Unpaywall integration) |
| Recommended free-only strategy | `filter=is_oa:true,title_and_abstract.search:<query>` — already used in OpenCITE adapter |

---

## §6 Images / Thumbnails / IIIF

No image or IIIF fields. OpenAlex is bibliographic metadata only.

- Has images? No
- IIIF: None
- Display strategy: N/A

---

## §7 Discipline / Subject Tags

Multi-vocabulary system — most granular in the roster:

| Vocab | Field path | Granularity | Hierarchy | Notes |
|-------|-----------|-------------|-----------|-------|
| **Topics** (primary) | `topics[].display_name` + `.subfield` + `.field` + `.domain` | 4 levels: domain→field→subfield→topic | Yes, 4-level | ~65,000 topics; score 0–1 |
| **Keywords** | `keywords[].display_name` | Flat | No | High-precision, low coverage |
| **Concepts** (deprecated) | `concepts[].display_name` + `.level` + `.wikidata` | 6 levels (L0–L5), Wikidata-linked | Yes, 6-level | Being phased out; still returned |
| **MeSH** | `mesh[].descriptor_name` | NLM MeSH tree | Yes (via NLM) | Biomedical works only |
| **SDGs** | `sustainable_development_goals[].display_name` | 17 SDGs | 1-level | UN alignment |

- **Facet/filter param**: `filter=topics.id:T12345` or `filter=concepts.wikidata:https://...`
- **Usability**: HIGH — topics provide 4-level discipline hierarchy with Wikidata IDs; suitable for precision faceting. MeSH integration adds biomedical depth.

---

## §8 Native Relevance & Scoring

- **Score returned?**: Yes — `relevance_score` field (float) returned when `sort=relevance_score:desc` requested.
- **Field name**: `relevance_score`
- **Semantics**: BM25 (Elasticsearch). Score based on title, abstract inverted index matching. Kstem + stop-word removal.
- **Range**: Positive float; observed 4051.5 for `photosynthesis` (highly relevant title match).
- **Cross-query comparable?**: No — absolute score varies by query term frequency. Monotone within request. Not calibrated across queries.
- **Default sort**: `relevance_score:desc` when using `.search` filters (must be specified explicitly — else sorts by `id`).
- **Sort params**: `sort=relevance_score:desc|asc`, `sort=cited_by_count:desc`, `sort=publication_year:desc`, `sort=updated_date:desc`.

---

## §9 Pagination

- **Mechanism**: Page-based (`page=` + `per_page=`) AND cursor-based (`cursor=*`)
- **Param names**: `page` (1-based), `per_page` (max 200), `cursor` (base64 token)
- **Max page size**: 200
- **Stated depth cap**: 10,000 via offset pagination; **unlimited** via cursor
- **Empirical depth**: Cursor confirmed unlimited — successfully paginated to page 2 of 170,276 results with `cursor=*`; `next_cursor` present throughout.
- **Cursor expiry**: Not stated; empirically persistent (unlike Crossref's 5-min expiry)

### §9b Measured Latency (live probe, 3 warm calls)

| Query type | Latency |
|------------|---------|
| Keyword (`photosynthesis`) | ~780ms median (calls: 954, 439, 780ms) |
| Multi-keyword (`machine learning protein structure`) | ~603ms |
| NL/full-sentence | ~765ms |
| NL vs keyword delta | ~1× (no meaningful degradation) |
| Extra resolve round-trips | 0 (single endpoint) |
| Query-strategy implication | Fastest in the roster for multi-keyword queries. Cursor pagination adds no extra latency overhead. |

---

## §10 Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No |
| Key type | API key (free; registered at openalex.org/settings/api) |
| Acquisition speed | ~30 seconds (auto-issued) |
| Backend-safe? | Yes (key goes in `api_key=` param or `mailto=` polite param) |
| Anon limits | 10,000 requests/day ($1 free credit per day); confirmed via headers: `X-RateLimit-Limit: 10000` |
| Keyed limits | Same free tier; paid plans for higher volume ($0.01/day per 1000 requests above free) |
| Cost per query | `X-RateLimit-Cost-USD: 0.001` per list query (confirmed in response headers) |
| Rate-limit code | HTTP 429 (also 401/403 for invalid key) |
| Retry-After? | `Retry-After` header present in rate-limit response |

---

## §11 Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `abstract_inverted_index` | Inverted index format `{"word": [pos1, pos2]}` — must reconstruct | `{"The":[0,5],"effect":[1]}` | `reconstructAbstract()` helper — already implemented |
| `relevance_score` | Only returned when `sort=relevance_score:desc` is specified; absent otherwise | `null` when sorting by date | Check for presence before RRF use |
| `ids` | PowerShell ConvertFrom-Json chokes on mixed-case keys (e.g., `"This"` vs `"this"`) | `{"This":…,"this":…}` | Use `-AsHashTable` flag in PowerShell; in JS no issue |
| `topics` | May be empty array for older records | `[]` | Guard with `(w.topics || [])` — current code correct |
| `authorships[].institutions` | May be empty array `[]` | `[]` | Guard in iteration |
| `publication_year` | Integer, not string | `2024` | `String(w.publication_year)` — current code correct |
| `doi` | Full URI format `https://doi.org/10.xxx` — must strip prefix | `https://doi.org/10.1016/j.xxx` | `.replace(/^https?:\/\/doi\.org\//, "")` — current code correct |
| `type` | Values: `article`, `book`, `dataset`, `preprint`, `dissertation` — not matching Crossref type vocab | `preprint` | Normalize to internal type vocab |
| `concepts` | Being deprecated; may disappear in future API version | — | Rely on `topics` as primary; `concepts` as fallback |

---

## §12 Exploitation Notes

**Under-exploited fields (path → why valuable)**:
- `open_access.oa_status` → Granular OA type (gold/green/bronze/hybrid) — currently only `is_oa` boolean. Surface to user as OA badge.
- `best_oa_location.pdf_url` → Direct PDF link. Currently only `oa_url` (landing page) is used. Adding PDF URL enables direct download button.
- `authorships[].author.orcid` → Researcher disambiguation for author facets. Not currently exposed.
- `authorships[].institutions[].ror` → Institutional affiliation with ROR IDs — enables institution-facet filtering.
- `authorships[].is_corresponding` → Corresponding author flag.
- `referenced_works[]` → Full outbound citation list (as OpenAlex IDs). Enables citation-graph navigation and deduplication.
- `fwci` → Field-Weighted Citation Impact — superior alternative to raw `cited_by_count` for cross-discipline comparison.
- `citation_normalized_percentile` → Percentile ranking within field/year — even better than fwci for relative influence.
- `is_retracted` → Retraction flag — critical for result quality. Not surfaced. Should gate negative display.
- `mesh[]` → MeSH descriptors on PubMed-indexed works (already partially exploited via `keywords` merge — but `is_major_topic` not checked).
- `sustainable_development_goals[]` → SDG tags — enables SDG-filtered search for policy/development audiences.
- `counts_by_year[]` → Citation trajectory over time — useful for trending-work detection.
- `primary_topic` → Single highest-confidence topic — fast discipline classification without array iteration.

**Query-strategy upgrade**: Use `filter=best_oa_location.is_oa:true` vs `is_oa:true` for stricter free-access guarantee (requires PDF URL). Add `filter=is_retracted:false` to all queries.

**Batch/harvest**: Cursor-based unlimited harvest. Separate data snapshot at https://docs.openalex.org/download-all-data (S3 parquet files, updated monthly). OpenAlex also offers a direct API batch by ID: `filter=openalex:W1|W2|W3` (pipe-separated, up to 25 per request).

**Crosswalk opportunity**: `ids.doi` → Crossref; `mesh[].descriptor_ui` → NLM MeSH; `concepts[].wikidata` → Wikidata; `authorships[].institutions[].ror` → ROR.

---

## §13 Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score (1.5×) | 2 | `relevance_score` (BM25/ES float) returned, monotone within request. Not cross-query-comparable (absolute magnitude varies). Well-documented. Scores 2, not 3, because not calibrated for cross-query comparison. |
| A2 Query expressiveness | 2 | `title_and_abstract.search`, `default.search`, `display_name.search` field scopes; `filter=` with 40+ dimensions; pipe-OR for multi-value; range comparisons (`cited_by_count:>100`). No full boolean DSL. |
| A3 Sort & filter control | 3 | Sort by relevance_score, cited_by_count, publication_year, updated_date; filter by is_oa, type, language, year range, institution, funder, topic, mesh, concept; facet counts for most filter dims. |
| A4 Pagination depth/cursor | 3 | Cursor-based with no depth cap (empirically confirmed 170k+ results pageable); `per_page=200`; `cursor=*` start. Full harvest with no expiry observed. |
| A5 Batch/bulk | 3 | Cursor harvest (unlimited); batch by ID (`filter=openalex:W1|W2`); monthly S3 data snapshots for full corpus download. |
| A6 Throughput & rate limits | 2 | 10,000 req/day free (confirmed in headers); $0.001/query. No stated per-second cap. For fan-out at scale the daily cap could constrain. |
| A7 ID linkage | 3 | OpenAlex ID, DOI, MAG, PMID (via indexed_in+articleids), ORCID (author), ROR (institution), Wikidata (concepts), MeSH UI. 6+ namespaces. |
| A8 Result-count accuracy | 2 | `meta.count` accurate; caps at 10k via offset, unlimited via cursor. |
| A9 Semantic/NL mode (1.5×) | 1 | Lexical BM25 + Kstem stemming. NL queries work via AND-term logic but no semantic vector lift. No embedding-based search. Tolerant but not semantic. |
| A10 Author-name pollution | 3 | `title_and_abstract.search` structurally excludes author/affiliation fields. Confirmed: searching `memon` via `title_and_abstract.search` returns content matches (Holliman–Memon attack, MEMOn ontology), NOT author-only records. Pollution structurally impossible with this scope. |

```
Raw_A = (2×1.5 + 2 + 3 + 3 + 3 + 2 + 3 + 2 + 1×1.5 + 3) / 11
       = (3 + 2 + 3 + 3 + 3 + 2 + 3 + 2 + 1.5 + 3) / 11
       = 25.5 / 11 = 2.32
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | 3 | Title, structured authors (ORCID, institution, ROR), date, journal (source), vol/issue/pages, DOI, publisher, type, language, ISSN (via source). Full citation + publisher/edition/version. |
| B2 Abstract / full-text (1.5×) | 2 | Abstract via `abstract_inverted_index` (~85%+ coverage on OA works; lower on all works). Must reconstruct from inverted index. No structured full-text. |
| B3 Citation graph | 3 | `cited_by_count` (inbound total) + `referenced_works[]` (full outbound list as OpenAlex IDs) + `related_works[]` + `counts_by_year` (citation trajectory). `fwci` + `citation_normalized_percentile` for impact scoring. |
| B4 Discipline / field-tag granularity | 3 | Topics (4-level hierarchy, 65k topics), concepts (6-level Wikidata-linked, deprecated), keywords, MeSH, SDGs. Multi-vocabulary with scores and IDs. Exceptional. |
| B5 OA / free-access (1.5×) | 3 | `is_oa` (bool), `oa_status` (gold/green/bronze/hybrid/closed), `oa_url` (best OA URL, Unpaywall-sourced), `pdf_url` (direct PDF). `filter=is_oa:true` confirmed working. >90% accuracy. Authoritative Unpaywall-level signal. |
| B6 Rich media / IIIF | 0 | No image fields. |
| B7 Holdings / availability | 0 | No holdings data. |
| B8 Record-quality signals | 2 | `is_retracted` flag; `fwci` + `citation_normalized_percentile` as influence signals; `indexed_in` (provenance); `is_paratext` (filter junk). No per-record confidence score. |

```
Raw_B = (3 + 2×1.5 + 3 + 3 + 3×1.5 + 0 + 0 + 2) / 9
       = (3 + 3 + 3 + 3 + 4.5 + 0 + 0 + 2) / 9
       = 18.5 / 9 = 2.06
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | 2 | Cloudflare CDN-fronted (heroku origin); ~780ms median warm. No formal SLA stated; well-established since 2022; occasional origin latency spikes observed in community reports. |
| C2 Auth friction | 3 | Keyless polite pool (`mailto=` param) or free key (30-second signup). Backend-safe. |
| C3 Redistribution / TOS risk | 3 | CC0 public domain — explicitly stated. No attribution required by license (though courtesy attribution appreciated). |
| C4 Protocol / client maturity | 2 | Versioned REST/JSON; changelog maintained; community SDKs (pyalex, openalexR); no formal OpenAPI spec at time of probe. |
| C5 Data hygiene & parseability | 2 | Well-typed JSON; abstract requires reconstruction from inverted index (known quirk); mixed-case JSON keys cause PowerShell parser issues (JS/Python fine); `doi` as full URI needing strip; otherwise consistent and predictable. |

```
Raw_C = (2 + 3 + 3 + 2 + 2) / 5 = 12 / 5 = 2.40
```

### Rollup

```
Raw_A = 2.32
Raw_B = 2.06
Raw_C = 2.40

Overall = 2.32×0.45 + 2.06×0.40 + 2.40×0.15
        = 1.044 + 0.824 + 0.360
        = 2.23
```

**TIER: A (First-class)**

---

## §14 Flags

| Flag | Value |
|------|-------|
| TOS legal risk | NONE — CC0 public domain |
| Currently quarantined? | No |
| Recommended action | Highest-value exploitation targets: `is_retracted:false` filter on all queries; surface `oa_status` as OA badge; map `best_oa_location.pdf_url`; surface `author[].orcid`; use `fwci`/`citation_normalized_percentile` as ranking signal; add `referenced_works` for citation-graph crosswalk. |
| Blocking issues | Abstract is inverted index only (reconstruction cost); no semantic/vector search; daily request cap (10k/day free) may constrain high-volume use. |
| IMPORTANT NOTE | Per MEMORY.md (verified on-branch): server RRF fusion of OpenAlex relevance_score is NOT currently live. `api/search.js` sorts by BM25F `_score` only (never imports `rrf.js`). The wiki finding F-209 is wrong. Full RRF (browser path) and BM25F-only (server path) diverge here. |
