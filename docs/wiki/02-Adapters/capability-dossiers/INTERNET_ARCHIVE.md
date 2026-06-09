---
tags: [adapter, capability, dossier]
adapter_id: INTERNET_ARCHIVE
---

# Internet Archive — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `IA` |
| Source file | `src/adapters/extensions/internetArchive.js` |
| Official API name | Internet Archive Advanced Search + Full-Text Search (FTS) |
| Provider | Internet Archive (archive.org) |
| Metadata base URL | `https://archive.org/advancedsearch.php` |
| FTS base URL | `https://be-api.us.archive.org/ia-pub-fts-api/` |
| Protocol | REST-JSON (Lucene-backed Solr) |
| Docs URL | https://archive.org/advancedsearch.php (interactive form), https://archive.org/developers/ |
| TOS/license URL | https://archive.org/about/terms.php |
| Pre-audit tier estimate | B |
| Dossier date | 2026-06-09 |

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard | Dublin Core (custom IA extension) |
| Serialization | JSON (advancedsearch `output=json`), also XML/CSV/RSS |
| Schema URL | No formal OpenAPI; field list documented at `advancedsearch.php` UI |
| Schema version | Unversioned; stable since ~2008 |

Both endpoints are REST-JSON. The metadata endpoint exposes Solr field notation (e.g., `title:term`, range queries). The FTS endpoint (`ia-pub-fts-api`) is an Elasticsearch index over OCR'd page text with a different field schema than the metadata endpoint.

## 3. Complete Field / Tag Inventory

### 3a. advancedsearch.php metadata fields (fl[])

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|-----------------|---------|-----------------|
| `identifier` | string | yes | Unique IA item ID | `id` prefix, `url`, `previewImage` |
| `title` | string\|array | yes | Item title | `title` |
| `creator` | string\|array | no | Author(s) | `authors` |
| `date` | string | no | ISO date or partial | `year` (regex extract) |
| `year` | string | no | 4-digit year | `year` (preferred over `date`) |
| `description` | string\|array | no | Abstract/description text | `abstract` (first element) |
| `mediatype` | string | yes | `texts`, `audio`, `video`, `image`, etc. | filter: only `texts` |
| `collection` | string\|array | no | Collection IDs | `type` inference, `subjects` |
| `subject` | string\|array | no | Subject terms | `subjects`, `keywords` |
| `language` | string\|array | no | Language code or name | `language` |
| `downloads` | number | no | Total download count | `citedBy` (display-only, NOT a citation count — see §11) |
| `publisher` | string\|array | no | Publisher name | `publisher` |
| `volume` | string | no | Volume number | `volume` |
| `isbn` | string\|array | no | ISBN | `isbn` |
| `licenseurl` | string | no | License URL | feeds `isOA` (always `true` regardless — see §5) |
| `avg_rating` | number | no | Community star rating (0–5) | unmapped |
| `num_reviews` | number | no | Number of community reviews | unmapped |
| `format` | string\|array | no | File formats (PDF, DjVu, etc.) | unmapped |

### 3b. FTS endpoint fields (fields object per hit)

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|-----------------|---------|-----------------|
| `identifier` | array | yes | IA item ID | `id`, `url` |
| `meta_title` | array | no | Title | `title` |
| `meta_creator` | array | no | Creator | `authors` |
| `meta_year` | array | no | Year | `year` |
| `meta_date` | array | no | Date | `year` fallback |
| `meta_publisher` | array | no | Publisher | `publisher` |
| `meta_collection` | array | no | Collections | `type` inference |
| `meta_subjectSorter` | array | no | Subject terms | `subjects`, `keywords` |
| `meta_languageSorter` | array | no | Language | `language` |
| `meta_downloads` | array | no | Download count | `citedBy` (display-only) |
| `meta_titleSorter` | array | no | Sort-normalized title | unmapped |
| `meta_creatorSorter` | array | no | Sort-normalized creator | unmapped |
| `meta_mediatype` | array | yes | Media type | filter check |
| `filename` | array | no | OCR file name | unmapped |
| `page_num` | array | yes | Page number of match (may be `[null]`) | `pages` |
| `file_basename` | array | no | Base filename | unmapped |
| `created_on` | array | no | Ingest date | unmapped |
| `highlight.text` | array | no | `{{{match}}}` snippets from OCR page | `abstract` (cleaned) |
| `_score` | number | yes | **BM25 FTS relevance score (Elasticsearch)** | not mapped — available for RRF |
| `_index` | string | yes | ES index name | unmapped |
| `_id` | string | yes | ES document ID | unmapped |

## 4. Query Semantics

- **Lexical vs semantic**: Fully lexical (Solr BM25F for metadata, ES BM25 for FTS). No semantic/vector search.
- **NL tolerance**: The Lucene query parser handles natural language queries by tokenizing; results are AND/OR of tokens. NL sentence queries work but are purely lexical.
- **Multi-keyword default**: Default operator must be explicit; current OpenCITE wraps in `(title:(term) OR description:(term) OR subject:(term))` per-field boolean.
- **Phrase syntax**: `"exact phrase"` within field scopes works (Lucene phrase query).
- **Boolean operators**: Full AND, OR, NOT, grouping with `()`, range `[a TO b]`, fuzzy `term~`, field-prefix `field:term`.
- **Fielded query param**: Yes — `title:term`, `creator:term`, `subject:term`, `description:term`, `collection:term`, etc. in the `q=` param.
- **Author-name pollution control**: The bare query spans creator/text fields, causing author-name pollution. OpenCITE scopes to `(title:(q) OR description:(q) OR subject:(q))` on topic queries; `authorSearch` setting reverts to all-field mode. This is **reliable** — the scoped form structurally excludes `creator` field from matching. Recommended: always scope topic queries to `title`, `description`, `subject` fields.
- **Cross-lingual support**: No — strictly lexical; no language-independent semantics.

## 5. OA / Free-Access

| Property | Value |
|----------|-------|
| Whole-corpus OA? | **Yes** — IA only hosts publicly accessible content; all items are freely available |
| OA flag field | `licenseurl` (present on some items with explicit CC/public domain URLs) |
| Best-OA URL | `https://archive.org/details/{identifier}` (always the free-access URL) |
| OA-only filter param | Not needed — corpus is entirely OA by policy |
| Sort-by-OA | N/A |
| Flag coverage % | 100% (structural guarantee, not a flag) |
| Recommended strategy | `isOA: true` hardcoded in adapter; no filter needed |

Note: `licenseurl` is present on a minority of items. IA does not impose copyright — it hosts items believed to be in the public domain or with permissive licenses. However, individual item rights remain with the original rights holder.

## 6. Images / Thumbnails / IIIF

| Property | Value |
|----------|-------|
| Has images? | Yes — thumbnail service |
| Thumbnail field | Constructed: `https://archive.org/services/img/{identifier}` |
| Full-res field | None via advancedsearch; item page has full download links |
| IIIF manifest field | None — IA does not serve IIIF manifests for texts |
| IIIF version | N/A |
| Multi-image? | Via item detail page only; not in advancedsearch response |
| Image licensing | Varies per item (public domain, CC, etc.) |
| Display strategy | `previewImage` = `/services/img/{identifier}` returns JPEG thumbnail; reliable for `texts` mediatype |

## 7. Discipline / Subject Tags

| Property | Value |
|----------|-------|
| Vocabulary | Free-text subject tags (no controlled vocab); some items use LOC or other vocab informally |
| Field path | `subject` (metadata), `meta_subjectSorter` (FTS) |
| Granularity | Low-medium — highly variable quality; some items have rich tagging, many have none |
| Example values | `["machine learning", "artificial intelligence"]`, `["Climate change", "Environmental science"]` |
| Hierarchy depth | 1 (flat) |
| Facet/filter param | `subject:term` in Lucene query |
| Usability for faceting | **Medium** — coverage is variable (some items have none); not from a controlled vocab |

Additionally, `collection` field provides a de-facto category signal; OpenCITE uses it for `type` inference (see `COLLECTION_TYPE_MAP` in adapter).

## 8. Native Relevance & Scoring

| Property | Value |
|----------|-------|
| Metadata endpoint score? | **No** — `advancedsearch.php` does not return a Solr score. Current sort is `downloads desc` (popularity bias, documented D1/D2 defect). |
| FTS endpoint score? | **Yes** — `_score` (BM25 Elasticsearch) returned on every FTS hit. Live probe confirmed: `_score=9.67` for "climate change" query. Cross-query comparable within the same index. |
| FTS score field | `hits.hits[]._score` |
| FTS score semantics | BM25; absolute values comparable within FTS index; not calibrated across metadata+FTS merge |
| FTS score range | Observed: 7–15 for topical queries |
| Cross-query comparable? | FTS: yes (BM25 absolute); metadata: no score available |
| Default sort (metadata) | `downloads desc` — confirmed problematic (D1/D2: download count ≠ citations) |
| Sort params | `sort=downloads+desc`, `sort=date+desc`, `sort=identifier`, `sort=avg_rating+desc`, etc. |
| A1 implication | Metadata: 0 (no score); FTS: 2 (BM25 score present, usable for RRF, not cross-query calibrated with metadata) |

## 9. Pagination

| Property | Value |
|----------|-------|
| Mechanism | Metadata: page-based (`page=N`, `rows=N`); FTS: offset-based (`from=N`, `size=N`) |
| Param names | Metadata: `page`, `rows`; FTS: `from`, `size` |
| Max page size | Metadata: ~10000 (empirically); FTS: 100 (practical); stated max: none documented |
| Stated depth cap | Metadata: `maxWindow: 10000` in adapter (matches IA Solr deep-page limit) |
| Empirical depth | Metadata: numFound=36k+ observed; pageable to ~10k start; FTS total=717k+ observed |
| Cursor expiry | None — stateless pagination |

### 9b. Measured Latency (live probe, warm)

| Query type | Metadata endpoint | FTS endpoint |
|-----------|------------------|-------------|
| Keyword (1 term) | **319 ms** | **2213 ms** |
| Multi-keyword | ~285 ms | — |
| NL sentence | ~290 ms | — |
| NL vs keyword delta | ~1.0× (no NL penalty) | — |

**FTS is 7× slower than metadata** (2.2 s median). The adapter runs both concurrently (`Promise.all`), so total wall time ≈ max(metadata, FTS) ≈ 2.2 s. FTS latency is the bottleneck. No extra resolve round-trips for metadata results; FTS hits are self-contained.

## 10. Rate Limits & Auth

| Property | Value |
|----------|-------|
| Key required? | No (keyless) |
| Auth type | None |
| Acquisition speed | N/A |
| Backend-safe? | Yes (`serverSafe: true`) |
| Rate limits | No documented limit; IA applies server-side throttling; observed no 429s in probe |
| Burst | Undocumented |
| Quota | None published |
| Rate-limit code | HTTP 429 (undocumented threshold) |
| Retry-After? | Unknown |

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `title` | `string\|array` polymorphism | `["Title A","Title B"]` or `"Title"` | `Array.isArray(d.title) ? d.title[0] : d.title` |
| `creator` | `string\|array` polymorphism | single string or `["Auth A","Auth B"]` | `toArray(d.creator)` |
| `subject` | `string\|array` polymorphism | single string or array | `toArray(d.subject)` |
| `description` | `string\|array` polymorphism | array of paragraphs | `Array.isArray(d.description) ? d.description[0] : d.description` |
| `publisher` | `string\|array` polymorphism | single or array | `toArray(d.publisher)[0]` |
| `isbn` | `string\|array` polymorphism | single or array | `toArray(d.isbn)[0]` |
| `downloads` | May be numeric string or number; may be absent | `"52"` or `52` or absent | `parseInt(d.downloads, 10) \|\| 0` |
| `downloads` | **NOT a citation count** — maps to citedBy display field | `downloads=52` means 52 file downloads, not 52 citations | `rankFields.citedBy: false` in capability config; document in UI |
| `date` | Free text ("Spring 2019"), ISO datetime, or partial year | `"2023-05-04T00:00:00Z"` | `String(d.year \|\| d.date).match(/\d{4}/)?.[0]` |
| `language` | Language name string or ISO code | `"eng"` or `"English"` | normalize to first value; accept either form |
| `description` | May contain HTML entities or plain text | `"Artificial intelligence and machine learning "` | `stripHtml()` + entity decode |
| FTS `page_num` | Always returned as array; value may be `[null]` | `[null]` | `toArray(f.page_num)[0]` with null check |
| FTS `highlight.text` | `{{{ }}}` brackets wrapping match spans; extra whitespace from OCR | `{{{machine learning}}} model used` | `cleanSnippet()`: strip `{{{` `}}}`, collapse whitespace |

## 12. Exploitation Notes

### Under-exploited fields

| Field path | Why valuable |
|-----------|-------------|
| `avg_rating` + `num_reviews` | Community quality signal; unmapped. Could surface high-quality community-curated items. Low coverage but present on a subset. |
| `licenseurl` | Enables reliable CC-BY/CC0 sub-filter for downstream reuse pipelines; currently `isOA: true` hardcoded. |
| `format` | Enables PDF-only or DjVu filter; not currently requested in `fl[]`. |
| FTS `_score` | BM25 score available but not forwarded into OpenCITE's RRF pipeline. Surfacing this would allow the FTS signal to contribute to cross-adapter ranking. |
| FTS `page_num` | Page-level deep-link (`?q=term`) already wired; the page number could power pagination within long books. |

### Query-strategy upgrades

1. **Remove `sort=downloads+desc` from metadata query** — use default Solr relevance sort (no `sort=` param) to get BM25 ordering. The downloads sort is confirmed D1/D2 defect.
2. **Forward FTS `_score` into RRF** — add a `_score` field to FTS `mapFtsHit()` and normalize it before merging with metadata results.
3. **Hybrid mode**: run metadata search with relevance sort (BM25) + FTS as secondary signal, fuse via RRF.
4. **NL sentence queries**: Lucene handles them gracefully (tokenizes into OR/AND of terms); no special treatment needed.

### Batch/harvest opportunity

- `advancedsearch.php` supports `start` offset deep pagination; not currently used for harvest.
- OAI-PMH available for full collection harvest (not used by this adapter).

### Crosswalk opportunity

- `identifier` → `https://archive.org/details/{identifier}` is a stable permalink.
- No DOI, PMID, or ORCID in metadata search. Enrichment via Crossref/OpenAlex by title+author possible for scholarly items.

### Downstream enrichment

- FTS snippet (`highlight.text`) is the unique value-add: it surfaces the exact page passage, enabling citation-context extraction. No other adapter provides page-level text snippets.

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score *(1.5×)* | **1** | FTS endpoint returns `_score` (BM25, usable for RRF); metadata endpoint has no score (sort=downloads). Score not forwarded into OpenCITE pipeline. Partial credit: score exists but is not exploited and only on the secondary endpoint. |
| A2 Query expressiveness | **3** | Full Lucene DSL: field-scoped, boolean AND/OR/NOT, phrase, range, fuzzy, grouping. Documented and stable. |
| A3 Sort & filter control | **2** | 100+ sort fields; mediatype filter; collection/subject/language filters in query. No facet counts returned (Solr facet.field not in advancedsearch output). |
| A4 Pagination depth / cursor | **2** | Page-offset; depth cap ~10k start (Solr deep-page limit); FTS offset to 717k+. No cursor/scroll. |
| A5 Batch / bulk endpoint | **3** | OAI-PMH full harvest + delta/resumption available (not used); advancedsearch can paginate full corpus. |
| A6 Throughput & rate limits | **2** | No documented cap; empirically fast; no API key needed. Undocumented throttle threshold. |
| A7 ID linkage / crosswalk | **1** | `identifier` (IA-native), `isbn` present on books. No DOI, PMID, arXiv. |
| A8 Result-count accuracy | **2** | `numFound` is accurate for small sets; Solr estimated count for large (common behavior). FTS `total.value` is ES estimated. |
| A9 Semantic / NL query *(1.5×)* | **1** | Lexical BM25 only. NL sentences are tokenized — works but no semantic lift. FTS adds full-text OCR coverage which improves NL recall for book-internal terms. |
| A10 Author-name pollution control | **2** | Reliable field-scope param (`title:`, `description:`, `subject:`) suppresses author matches when used. OpenCITE implements this. |

```
Raw_A = (1×1.5 + 3 + 2 + 2 + 3 + 2 + 1 + 2 + 1×1.5 + 2) / 11
      = (1.5 + 3 + 2 + 2 + 3 + 2 + 1 + 2 + 1.5 + 2) / 11
      = 20.0 / 11
      = 1.82
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | **1** | Title + creator + date always present on scholarly items. Source (journal/volume/issue) not in metadata schema — IA is not a bibliographic database; items lack structured citation fields for journal articles. |
| B2 Abstract / full-text *(1.5×)* | **2** | `description` field functions as abstract (~60–80% presence on scholarly items); FTS provides page-level OCR snippets (unique). No structured full-text XML. |
| B3 Citation graph | **0** | No citation data. `downloads` is NOT citations (confirmed defect). |
| B4 Discipline / subject tags | **1** | Free-text `subject` tags; no controlled vocab. Coverage variable; no hierarchy. |
| B5 OA / free-access *(1.5×)* | **3** | Entire corpus is freely accessible by IA policy. `licenseurl` available for some items. No filtering needed — corpus is structurally OA. |
| B6 Rich media / IIIF / thumbnails | **1** | Thumbnail URL constructable from identifier (`/services/img/{id}`). No IIIF manifest. No full-res field in search results. |
| B7 Holdings / availability | **0** | No holdings metadata; IA is the holding institution for all items. |
| B8 Record-quality signals | **0** | No confidence/completeness score. `avg_rating`/`num_reviews` exist but unmapped; low coverage. |

```
Raw_B = (1 + 2×1.5 + 0 + 1 + 3×1.5 + 1 + 0 + 0) / 9
      = (1 + 3 + 0 + 1 + 4.5 + 1 + 0 + 0) / 9
      = 10.5 / 9
      = 1.17
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | **2** | Metadata endpoint ~320ms median (excellent); FTS endpoint ~2.2s median (slow). IA has had historical outages; no formal SLA. Overall ~98–99% uptime by community observation. |
| C2 Auth friction | **3** | Fully keyless; no registration; no per-user auth. |
| C3 Redistribution / TOS risk | **2** | IA asserts no copyright over database metadata. Individual item rights vary; IA hosts items believed public domain/CC. Display+aggregation of metadata is standard practice. LOW TOS risk. |
| C4 Protocol / client maturity | **2** | Versioned? No. But API has been stable for 15+ years. Lucene query syntax documented. No OpenAPI schema. |
| C5 Data hygiene & parseability | **1** | String\|array polymorphism throughout (title, creator, subject, publisher, isbn). Date formats vary widely. HTML entities in descriptions. `downloads` semantics ambiguous. Known quirks well-cataloged. |

```
Raw_C = (2 + 3 + 2 + 2 + 1) / 5
      = 10 / 5
      = 2.00
```

### Rollup

```
Overall = Raw_A × 0.45 + Raw_B × 0.40 + Raw_C × 0.15
        = 1.82 × 0.45 + 1.17 × 0.40 + 2.00 × 0.15
        = 0.819 + 0.468 + 0.300
        = 1.59
```

**TIER B — Complementary**

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | **LOW** — IA asserts no copyright over metadata. Items are public domain / CC / permissive. Display + aggregation is the intended use case. |
| Currently quarantined? | No |
| Recommended action | Keep active. Fix D1/D2: remove `sort=downloads+desc` from metadata query; forward FTS `_score` into RRF pipeline. FTS endpoint is the unique value-add and its BM25 score is the only true relevance signal. |
| Blocking issues | FTS latency (2.2s median) inflates page load time. Consider making FTS parallel-optional or timeout-bounded. `downloads` → `citedBy` mapping is documented but still displayed to users — consider labeling as "popularity" not "citations". |
