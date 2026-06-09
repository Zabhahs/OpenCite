---
tags: [adapter, capability, dossier]
adapter_id: MET
---

# Metropolitan Museum of Art — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `MET` |
| Source file | `src/adapters/extensions/met.js` |
| Official API name | The Metropolitan Museum of Art Collection API |
| Provider | The Metropolitan Museum of Art (metmuseum.org) |
| Base URL | `https://collectionapi.metmuseum.org/public/collection/v1` |
| Protocol | REST-JSON (two-step: search → per-object fetch) |
| Docs URL | https://metmuseum.github.io/ |
| TOS/license URL | https://metmuseum.github.io/ (CC0 terms embedded) |
| Pre-audit tier estimate | B |
| Dossier date | 2026-06-09 |

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard | Custom (museum collection record schema) with AAT and Wikidata crosswalks |
| Serialization | JSON |
| Schema URL | https://metmuseum.github.io/ (field list documented inline) |
| Schema version | Unversioned; changelog not published; stable since 2018 |

60+ fields per object record. No OpenAPI schema. The `/search` endpoint returns only `{total, objectIDs[]}`. All metadata is in per-object `/objects/{id}` responses.

## 3. Complete Field / Tag Inventory

### 3a. /search response

| Field | Type | Always present? | Meaning | OpenCITE maps to |
|-------|------|----------------|---------|-----------------|
| `total` | number | yes | Count of matching objectIDs | total display |
| `objectIDs` | number[] | yes | All matching object IDs (no pagination) | ID fan-out |

### 3b. /objects/{id} response (★ requires extra round-trip per hit)

| Field | Type | Always present? | Meaning | OpenCITE maps to |
|-------|------|----------------|---------|-----------------|
| `objectID` | number | yes | Unique object ID | `id` suffix |
| `title` | string | yes | Artwork title | `title` |
| `artistDisplayName` | string | no | Artist name | `authors[0]` |
| `artistDisplayBio` | string | no | Artist bio/dates | unmapped |
| `artistNationality` | string | no | Artist nationality | `subjects[]` |
| `artistBeginDate` | string | no | Artist birth year | unmapped |
| `artistEndDate` | string | no | Artist death year | unmapped |
| `artistGender` | string | no | Artist gender | unmapped |
| `artistRole` | string | no | Role (Artist, Maker, etc.) | unmapped |
| `artistAlphaSort` | string | no | Sort form of name | unmapped |
| `artistWikidata_URL` | string | no | Artist Wikidata URI | unmapped (crosswalk) |
| `artistULAN_URL` | string | no | Artist Getty ULAN URI | unmapped (crosswalk) |
| `objectDate` | string | no | Human-readable date range | `year` |
| `objectBeginDate` | number | no | Start year (integer) | `year` fallback |
| `objectEndDate` | number | no | End year (integer) | unmapped |
| `medium` | string | no | Materials/medium | `abstract[]` component |
| `dimensions` | string | no | Dimensions text | `abstract[]` component |
| `measurements` | array | no | Structured dimensions (type, elementName, value objects) | unmapped (rich) |
| `creditLine` | string | no | Provenance/donor text | `abstract[]` component |
| `department` | string | no | Museum department | `journal` field |
| `classification` | string | no | Object type (Paintings, Prints, etc.) | `subjects[]` |
| `culture` | string | no | Cultural origin | `subjects[]` |
| `period` | string | no | Art period | `subjects[]` |
| `dynasty` | string | no | Dynasty (for Asian/ancient works) | unmapped |
| `reign` | string | no | Reign period | unmapped |
| `portfolio` | string | no | Portfolio name | unmapped |
| `geographyType` | string | no | Geographic context label | unmapped |
| `city` | string | no | City of origin | unmapped |
| `state` | string | no | State/province | unmapped |
| `county` | string | no | County | unmapped |
| `country` | string | no | Country of origin | unmapped |
| `region` | string | no | Region | unmapped |
| `subregion` | string | no | Subregion | unmapped |
| `locale` | string | no | Locale detail | unmapped |
| `locus` | string | no | Archaeological locus | unmapped |
| `excavation` | string | no | Excavation site | unmapped |
| `river` | string | no | River association | unmapped |
| `isPublicDomain` | boolean | yes | CC0 / public domain status | `isOA` |
| `primaryImage` | string | no | Full-res JPEG URL | `previewImage` (fallback) |
| `primaryImageSmall` | string | no | Reduced-res JPEG URL | `previewImage` (preferred) |
| `additionalImages` | string[] | no | Extra image URLs | unmapped (multi-image available!) |
| `constituents` | object[] | no | Structured artist records (id, role, name, ULAN URL, Wikidata URL, gender) | unmapped (rich) |
| `objectName` | string | no | Object type name | unmapped |
| `objectURL` | string | yes | Canonical collection URL | `url` |
| `objectWikidata_URL` | string | no | Wikidata URI for the object | unmapped (crosswalk) |
| `tags` | object[] | no | Tag terms with AAT and Wikidata URLs | unmapped in current code |
| `accessionNumber` | string | yes | Museum accession number | unmapped |
| `accessionYear` | string | no | Accession year | unmapped |
| `isHighlight` | boolean | yes | Featured highlight object | unmapped |
| `isOnView` | boolean | no | Currently on gallery view | unmapped |
| `GalleryNumber` | string | no | Gallery number | unmapped |
| `isTimelineWork` | boolean | no | In timeline exhibition | unmapped |
| `rightsAndReproduction` | string | no | Rights text (usually empty for CC0) | unmapped |
| `linkResource` | string | no | External resource URL | unmapped |
| `metadataDate` | string | no | Record last updated date | unmapped |
| `repository` | string | yes | Always "Metropolitan Museum of Art, New York, NY" | unmapped |

## 4. Query Semantics

- **Lexical vs semantic**: Fully lexical. `/search?q=` performs full-text keyword search across multiple object fields (title, artist name, classification, tags, culture, etc.).
- **NL tolerance**: Natural language queries are accepted; results come from keyword matching against all fields. No NL understanding.
- **Multi-keyword**: Implicit AND among tokens (Met API behavior); no explicit boolean syntax documented.
- **Search params**: `q`, `isHighlight`, `title` (title-only search), `tags`, `departmentId`, `isOnView`, `artistOrCulture` (enable/disable artist+culture field search), `medium`, `hasImages`, `geoLocation`, `dateBegin`, `dateEnd`.
- **Author-name pollution control**: `artistOrCulture` param defaults to searching artist/culture fields. OpenCITE explicitly sets `artistOrCulture=true` — **this is inverted from what it should be for topic queries**: the parameter ADDS artist+culture to the search scope. There is no param to EXCLUDE artist fields. Author-name pollution is **structurally unavoidable** for topic queries that happen to match an artist name (e.g., "monet" finds 168 results mostly by the artist Monet). The `artistOrCulture=true` flag in the adapter actually increases pollution risk.
- **Cross-lingual**: No.
- **No score returned**: Search returns only objectIDs; relevance ordering of IDs is opaque/undocumented. No BM25 score accessible.

## 5. OA / Free-Access

| Property | Value |
|----------|-------|
| Whole-corpus OA? | Partial — 470k+ of ~500k objects are CC0 (`isPublicDomain=true`) |
| OA flag field | `isPublicDomain` (boolean, per-object) |
| Best-OA URL | `objectURL` (always free to view on metmuseum.org) |
| OA-only filter param | `isPublicDomain=true` on `/search` endpoint |
| Sort-by-OA | No |
| Flag coverage % | ~94% (470k/500k) CC0; remaining are copyrighted works on display |
| Recommended strategy | Filter `hasImages=true` (current); add `isPublicDomain=true` for contexts requiring CC0 image reuse. All objects are viewable regardless of `isPublicDomain` status. |

Note: `isPublicDomain=false` objects are typically 20th century works still in copyright. Images for these objects are blank (`primaryImage=""`).

## 6. Images / Thumbnails / IIIF

| Property | Value |
|----------|-------|
| Has images? | Yes — JPEG images for CC0 objects |
| Thumbnail field | `primaryImageSmall` (reduced-res JPEG URL, typically 300-600px wide) |
| Full-res field | `primaryImage` (full-res JPEG, typically 3000+px) |
| IIIF manifest field | None — Met does not serve IIIF manifests |
| IIIF version | N/A |
| Multi-image? | Yes — `additionalImages[]` array (current adapter unmaps this) |
| Image licensing | CC0 for `isPublicDomain=true` objects; blank for others |
| Display strategy | `previewImage = primaryImageSmall \|\| primaryImage` (current adapter); `primaryImageSmall` is CDN-served and fast. Non-CC0 objects return empty strings — filter with `hasImages=true` in search. |

★ Both image fields require the per-object `/objects/{id}` resolve call; not available in search response.

## 7. Discipline / Subject Tags

| Property | Value |
|----------|-------|
| Vocabulary | Getty AAT (for `tags[].AAT_URL`) + Wikidata (for `tags[].Wikidata_URL`) |
| Field paths | `tags[]{term, AAT_URL, Wikidata_URL}`, `classification`, `culture`, `period`, `department` |
| Granularity | Medium — `tags` are subject keywords linked to Getty AAT and Wikidata; `classification` is top-level type; `department` is museum organization |
| Example tags | `{term:"Gardens", AAT_URL:"...aat/300008090", Wikidata_URL:"...Q1107656"}` |
| Hierarchy depth | 1 (flat tag list); AAT hierarchy not exposed in response |
| Facet/filter param | `departmentId` filter; `medium`, `geoLocation`, `dateBegin`/`dateEnd` for search filtering |
| Usability for faceting | **Medium** — `tags` with AAT IDs are excellent for semantic faceting but are **currently unmapped in OpenCITE**; `classification` and `culture` are mapped to `subjects[]` |

## 8. Native Relevance & Scoring

| Property | Value |
|----------|-------|
| Score returned? | **No** — `/search` returns ordered objectIDs; ordering is opaque |
| Score field | None |
| Semantics | Unknown internal ranking; appears keyword-BM25 but not documented |
| Range | N/A |
| Cross-query comparable? | No |
| Default sort | Opaque relevance ordering of objectIDs in search response |
| Sort params | None documented for `/search`; objects endpoint has no sort |

The adapter performs client-side relevance re-scoring: `terms.some(t => haystack.includes(t))` filter after fetching a 3× oversample slice. This is a coarse keyword-presence filter, not a ranking signal.

## 9. Pagination

| Property | Value |
|----------|-------|
| Mechanism | **None on `/search`** — returns ALL matching objectIDs at once (up to total count) |
| Param names | None for search; `objectIDs` are paginated client-side |
| Max page size | N/A — full list returned |
| Stated depth cap | None |
| Empirical depth | "portrait" query returned 687 objectIDs; large queries return thousands |

### 9b. Measured Latency (live probe, warm)

| Query type | /search | /objects/{id} | Full page (search + N resolves) |
|-----------|---------|--------------|--------------------------------|
| Keyword (1 term) | 155–648 ms | 438–593 ms | search + N×resolve in parallel |
| Multi-keyword | 406–629 ms | same | ~600–900 ms for 5 resolves |
| NL sentence | 366–847 ms | same | ~800ms–1.4s |

**Two-step fan-out is the bottleneck.** For a page of 10 results: 1 search call + 30 resolve calls (3× oversample) = 31 concurrent HTTP requests. With browser parallelism limits, effective wall time = search_time + ~2-3 waves of object resolves (~600ms–1.5s total). This is **the highest per-page request count of all five adapters**.

## 10. Rate Limits & Auth

| Property | Value |
|----------|-------|
| Key required? | No |
| Auth type | None |
| Acquisition speed | N/A |
| Backend-safe? | Yes (`serverSafe: true`) |
| Rate limits | "Please limit request rate to 80 requests per second" (documented) |
| Burst | 80 req/s documented; Imperva CDN detected in headers |
| Quota | None published |
| Rate-limit code | Undocumented (likely HTTP 429 or 503) |
| Retry-After? | Unknown |

Note: The per-page fan-out of 30+ concurrent object resolve calls could approach the 80 req/s limit under load from multiple users.

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `primaryImage` | Empty string (not null) for non-CC0 or un-digitized objects | `""` | `primaryImageSmall \|\| primaryImage \|\| ""` — both empty is expected |
| `additionalImages` | Empty array vs absent | `[]` | `(j.additionalImages \|\| [])` |
| `tags` | `null` vs absent vs empty array | `null` | `(j.tags \|\| []).map(t => t.term)` |
| `objectDate` | Free-text range: "1867", "ca. 1600–1650", "Neolithic period" | `"1867"` | `parseYear()` regex `\d{4}` extracts first year |
| `objectBeginDate` | Integer negative for BCE dates | `-500` | Handle negative years for ancient works |
| `artistDisplayName` | Empty string (not null) for anonymous works | `""` | `it.artistDisplayName ? [...] : []` |
| `culture` | Free text; sometimes empty string | `""` or `"French, Paris"` | `filter(Boolean)` on subjects construction |
| `measurements` | Nested object array with `elementMeasurements` sub-objects | complex | Don't parse — use `dimensions` string instead |
| `constituents` | Array of objects; `null` values possible | `null` | `(j.constituents \|\| [])` |
| `isPublicDomain` | `false` for in-copyright works (blank images) | `false` | `it.isPublicDomain === true` strict check |

## 12. Exploitation Notes

### Under-exploited fields

| Field path | Why valuable |
|-----------|-------------|
| `tags[]{term, AAT_URL, Wikidata_URL}` | Linked-vocabulary subject terms with Getty AAT and Wikidata IDs. Enables semantic faceting and crosswalk to Wikidata entity graph. Currently unmapped. |
| `additionalImages[]` | Multi-image support; 2–10 extra photos per object available. Could power an image carousel. |
| `constituents[]{constituentID, ULAN_URL, Wikidata_URL}` | Structured artist records with ULAN and Wikidata crosswalks. Enables artist disambiguation and link-out. |
| `objectWikidata_URL` | Direct Wikidata entity link per artwork. Enables enrichment via Wikidata (e.g., current location, exhibition history). |
| `artistULAN_URL` + `artistWikidata_URL` | Artist authority crosswalks. |
| `isHighlight` | "Highlight" artworks are Met-curated as most important. Boolean filter could power a "highlights only" mode. |
| `isOnView` | Real-time gallery availability. Filter `isOnView=true` for in-person visitor UX. |
| `GalleryNumber` | Physical gallery location. |
| `dateBegin`/`dateEnd` | Period filters for temporal browsing. |

### Query-strategy upgrade

1. **Fix `artistOrCulture=true`** — this adds artist/culture to search scope, increasing author-name pollution. For topic queries, omit `artistOrCulture` or set it to `false` to search title+tags only. For artist-name queries, use `artistOrCulture=true`. The current adapter always sets `true`.
2. **Map `tags[]`** — add AAT/Wikidata tag terms to `subjects[]` for richer faceting. Currently only `classification`, `culture`, `period`, `artistNationality` are mapped.
3. **Reduce 3× oversample** — the 3× oversample (fetch `pageSize * 3` objects) to compensate for client-side relevance filter wastes ~2× resolve calls. A better approach: trust the Met's relevance order and reduce oversample to 1.5× or remove the client-side filter.
4. **Add `departmentId` filter** — enables discipline-scoped queries without post-filtering.
5. **Add `isPublicDomain=true` filter** — for image-reuse contexts, this eliminates objects with blank images.

### Batch/harvest opportunity

`/objects` endpoint returns all valid object IDs (useful for bulk ingestion). Combined with delta by `metadataDate`.

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score *(1.5×)* | **0** | No score returned anywhere. objectID order in search response is opaque. Client-side keyword presence filter is not a score. |
| A2 Query expressiveness | **2** | Multi-field keyword search with field filters (`title=`, `tags=`, `medium=`, `geoLocation=`, `dateBegin/End`, `departmentId`). No boolean OR/NOT syntax; AND-implicit only. |
| A3 Sort & filter control | **2** | Multiple filters (isHighlight, hasImages, isOnView, isPublicDomain, department, date range, geoLocation, medium). No sort control, no facet counts. |
| A4 Pagination depth / cursor | **1** | Search returns all objectIDs at once (up to ~687 in probe; thousands possible). Client paginates the ID list. No cursor needed but fan-out is unbounded. |
| A5 Batch / bulk endpoint | **2** | `/objects` returns all valid IDs (batch ID lookup). Per-object fetch is the bottleneck; no bulk metadata dump. |
| A6 Throughput & rate limits | **2** | 80 req/s documented; CDN (Imperva) backed; keyless. Fan-out pattern may approach limit. |
| A7 ID linkage / crosswalk | **2** | `objectWikidata_URL`, `artistWikidata_URL`, `artistULAN_URL`, `accessionNumber`. No DOI/PMID — not scholarly metadata. |
| A8 Result-count accuracy | **2** | `total` returned accurately; full objectIDs list returned. |
| A9 Semantic / NL query *(1.5×)* | **1** | Lexical keyword search; NL sentences tokenized and matched. No semantic lift. |
| A10 Author-name pollution control | **0** | `artistOrCulture=true` adds artist field to scope. No param to exclude artist fields. All queries inherently search across all metadata including artist name. Structurally unavoidable. |

```
Raw_A = (0×1.5 + 2 + 2 + 1 + 2 + 2 + 2 + 2 + 1×1.5 + 0) / 11
      = (0 + 2 + 2 + 1 + 2 + 2 + 2 + 2 + 1.5 + 0) / 11
      = 14.5 / 11
      = 1.32
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | **1** | Title + artist + date structured. No journal/publisher/ISBN — these are artworks not publications. Vol/issue/pages are inapplicable. |
| B2 Abstract / full-text *(1.5×)* | **1** | `abstract` in OpenCITE is constructed from `medium + dimensions + creditLine` — not a real abstract. No description text. Sparse signal. |
| B3 Citation graph | **0** | No citation data. Museum artworks are not in the citation graph. |
| B4 Discipline / subject tags | **2** | `tags[]` with Getty AAT + Wikidata URLs; `classification`, `culture`, `period`, `department`. Named controlled vocab (AAT), 2-level (type + subject). Facetable via `departmentId`/`medium` filters. |
| B5 OA / free-access *(1.5×)* | **3** | `isPublicDomain` boolean reliable (CC0 declared); 470k+ CC0 objects; `isPublicDomain=true` filter param works; all OA objects have image URLs. Effectively authoritative CC0 flag. |
| B6 Rich media / IIIF / thumbnails | **2** | `primaryImageSmall` (reliable thumbnail) + `primaryImage` (full-res) + `additionalImages[]` (multi-image). No IIIF manifest. Consistent field names, CDN-served. |
| B7 Holdings / availability | **1** | `GalleryNumber`, `isOnView`, `repository` (always MMA). Single institution. |
| B8 Record-quality signals | **1** | `isHighlight` (curated highlight flag), `metadataDate` (record update date). No completeness score. |

```
Raw_B = (1 + 1×1.5 + 0 + 2 + 3×1.5 + 2 + 1 + 1) / 9
      = (1 + 1.5 + 0 + 2 + 4.5 + 2 + 1 + 1) / 9
      = 13 / 9
      = 1.44
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | **2** | Search ~270ms median; object resolve ~530ms. CDN-backed. No formal SLA but high uptime observed. 2-step fan-out makes effective latency higher. |
| C2 Auth friction | **3** | Fully keyless. |
| C3 Redistribution / TOS risk | **3** | CC0 declared for 470k+ artworks and their metadata. Explicit "unrestricted commercial and noncommercial use." No attribution legally required. NONE TOS risk. |
| C4 Protocol / client maturity | **2** | Documented REST endpoints; field list on GitHub; no OpenAPI schema; unversioned but stable since 2018. |
| C5 Data hygiene & parseability | **2** | Mostly consistent; `objectDate` free-text is the main hazard. Empty strings (not null) for absent fields. `measurements` complex nested structure. Known quirks manageable. |

```
Raw_C = (2 + 3 + 3 + 2 + 2) / 5
      = 12 / 5
      = 2.40
```

### Rollup

```
Overall = Raw_A × 0.45 + Raw_B × 0.40 + Raw_C × 0.15
        = 1.32 × 0.45 + 1.44 × 0.40 + 2.40 × 0.15
        = 0.594 + 0.576 + 0.360
        = 1.53
```

**TIER B — Complementary**

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | **NONE** — CC0 declared. Unrestricted commercial + noncommercial use explicit. |
| Currently quarantined? | No |
| Recommended action | Keep active. Fix author-pollution: set `artistOrCulture=false` for topic queries, `true` only for artist-name mode. Map `tags[]` with AAT/Wikidata IDs for richer faceting. Reduce 3× oversample. Consider adding `additionalImages` mapping for multi-image support. |
| Blocking issues | Two-step fan-out generates 30+ HTTP requests per page (3× oversample × pageSize). At 80 req/s limit, this is safe for single-user but may throttle under concurrent load. Monitor for 429s. No score means ranking is blind from this source. |
