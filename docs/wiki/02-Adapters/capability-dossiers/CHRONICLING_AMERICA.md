---
tags: [adapter, capability, dossier]
adapter_id: CHRONICLING_AMERICA
---

# Capability Dossier: Chronicling America

**Dossier date:** 2026-06-08  
**Pre-audit tier (implied):** B  
**Live status:** ALIVE

---

## 1. Identity

| Field | Value |
|---|---|
| Adapter ID | `CHRONICLING_AMERICA` |
| Adapter file | `src/adapters/extensions/chroniclingAmerica.js` |
| Official API name | loc.gov JSON/YAML API (Chronicling America collection) |
| Provider | Library of Congress (LOC), USA |
| Base URL | `https://www.loc.gov/collections/chronicling-america/` |
| Protocol | REST-JSON (keyless) |
| Docs URLs | https://www.loc.gov/chroniclingamerica/about/api/ (redirects 308 to https://www.loc.gov/chroniclingamerica/about/api/) · https://www.loc.gov/apis/json-and-yaml/ · https://libraryofcongress.github.io/data-exploration/loc.gov%20JSON%20API/Chronicling_America/README.html |
| TOS/license URL | https://www.loc.gov/legal/ (US government works; public domain) |
| Pre-audit tier | B |
| Dossier date | 2026-06-08 |

---

## 2. Metadata standard & serialization

| Field | Value |
|---|---|
| Standard | Custom LOC JSON (derived from MODS/Dublin Core for newspapers) |
| Serialization | JSON (`fo=json`) |
| Schema URL | https://www.loc.gov/apis/json-and-yaml/responses/ |
| Schema version | Unversioned (stable in practice) |

---

## 3. Complete field/tag inventory

**Top-level result object fields** (confirmed live, `dl=page` mode):

| Field path | Type | Always present | Meaning | OpenCITE currently maps to |
|---|---|---|---|---|
| `id` | string | yes | LOC item URL path | `id` (suffix extracted) |
| `title` | string\|array | yes | Newspaper page title (image title string) | `title` (with stripHtml) |
| `date` | string | yes | ISO date (YYYY-MM-DD) | `year` (first 4 chars) |
| `url` | string | yes | Direct item URL | `url` |
| `partof_title` | string | yes | Newspaper title + date range | `journal` (via `partof[0].title`) |
| `location` | string\|array | yes | City/state of publication | `publisher` |
| `location_state` | string | yes | State of publication | NOT mapped |
| `location_city` | string | yes | City of publication | NOT mapped |
| `location_country` | string | yes | Country (always "united states") | NOT mapped |
| `location_county` | string | yes | County | NOT mapped |
| `language` | string\|array | yes | Language (usually "english") | `language` |
| `subject` | array | yes | LCSH subject headings | `subjects` |
| `subject_ethnicity` | string | sometimes | Ethnic community tag | NOT mapped |
| `description` | string\|array | sometimes | OCR excerpt / description text | `abstract` (truncated 500 chars) |
| `image_url` | array | yes | IIIF tile service URLs (pct:25, pct:50, pct:100) | `previewImage` (first) |
| `number_lccn` | string | yes | Library of Congress Call Number | NOT mapped |
| `number_page` | string | yes | Page number within issue | NOT mapped |
| `number_reel` | string | yes | Microfilm reel number | NOT mapped |
| `number_edition` | string | sometimes | Edition number | NOT mapped |
| `partof_collection` | string | yes | Collection name ("chronicling america") | NOT mapped |
| `partof_division` | string | yes | LOC division | NOT mapped |
| `online_format` | array | yes | Format tags (image, online text, pdf) | NOT mapped |
| `original_format` | string | sometimes | "newspaper" | NOT mapped |
| `digitized` | boolean | yes | Whether digitized | NOT mapped |
| `access_restricted` | boolean | yes | Access restriction flag | NOT mapped |
| `resources` | array | sometimes | Related resource URLs | NOT mapped |
| `word_coordinates_url` | string | sometimes | Coordinate JSON for OCR text | NOT mapped |
| `publication_frequency` | string | sometimes | Publication frequency | NOT mapped |
| `mime_type` | string | sometimes | MIME type | NOT mapped |
| `batch` | string | yes | Ingest batch ID | NOT mapped |
| `site` | string | yes | LOC site identifier | NOT mapped |
| `type` | string | sometimes | Item type | NOT mapped |

**Facets returned** (from `facets` key, usable as filter params with `fa=field:value`):
`digitized`, `object-type`, `original-format`, `partof_title`, `dates`, `location_country`, `location_state`, `location_county`, `location_city`, `subject_ethnicity`, `language`, `subject`, `number_page`, `partof_collection`, `online-format`, `contributor`, `partof_division`, `access-restricted`, `batch`

**Date range filter:** `dates=YYYY/YYYY` param supported (confirmed from facet URLs in response).

---

## 4. Query semantics

| Aspect | Detail |
|---|---|
| Lexical vs semantic | Lexical full-text OCR search only; no semantic lift |
| NL tolerance | Multi-word queries tokenized and searched across OCR text; NL sentences work (returns results for "women suffrage voting", "jazz music new orleans") but order/stopwords not handled specially |
| Multi-keyword default | Implicitly AND; multi-word queries find pages containing all terms in OCR |
| Phrase syntax | Unknown — not documented; standard quoted phrases may work |
| Boolean operators | Not documented as supported in `q=` param |
| Fielded-query param | `fa=field:value` for post-query filtering (state, language, date, subject, title, collection etc.) |
| Author-name pollution | No authors on newspaper pages; pollution structurally impossible. Default query is OCR full-text search |
| Cross-lingual support | English-only OCR primarily; some Spanish/French newspapers present |

---

## 5. OA / free-access

| Aspect | Detail |
|---|---|
| Whole-corpus OA | Yes — all Chronicling America pages are free/open |
| OA flag field | No explicit flag; corpus is entirely public domain US govt / historical newspapers |
| Best-OA URL | `url` field (direct page URL) |
| OA-only filter | Not needed — 100% free |
| Flag coverage | 100% by definition |
| Recommended strategy | All results are OA; no filter needed |

**TOS:** LOC content is US government-produced or in the public domain. No redistribution restrictions on metadata. Explicit "no key required, public access" API.

---

## 6. Images / thumbnails / IIIF

| Aspect | Detail |
|---|---|
| Has images | Yes — IIIF tile service |
| Thumbnail field | `image_url[0]` (pct:25 resolution) |
| Full-res field | `image_url[-1]` (pct:100 resolution) |
| IIIF manifest | IIIF Image API URLs via `tile.loc.gov/image-services/iiif/service:...` |
| IIIF version | IIIF Image API (inferred from URL pattern) |
| Multi-image | Yes — array with multiple resolutions (pct:25, pct:50, pct:100) |
| Image licensing | Public domain |
| Display strategy | Use `image_url[0]` as thumbnail; full IIIF manifest available at item URL |

---

## 7. Discipline / subject tags

| Aspect | Detail |
|---|---|
| Vocabulary | LCSH (Library of Congress Subject Headings) + geographic/ethnicity tags |
| Field path | `subject` (array of LCSH strings) |
| Granularity | Geographic (state/city/county), topical, ethnic community (`subject_ethnicity`) |
| Example values | `["united states", "new york county", "newspapers", "african american"]` |
| Hierarchy depth | Flat strings (no hierarchical notation in response) |
| Facet/filter param | `fa=subject:value`, `fa=subject_ethnicity:value`, `fa=location_state:value` |
| Usability for faceting | HIGH — geographic facets are very precise; subject facets available but LCSH newspapers terms (geographic dominates) |

---

## 8. Native relevance & scoring

| Aspect | Detail |
|---|---|
| Score returned | NO — no score field in response |
| Score field name | N/A |
| Score semantics | Unknown internal ranking (likely BM25 over OCR text index) |
| Cross-query comparable | No |
| Default sort | Relevance (undocumented) |
| Sort params | Not documented; no explicit `sort=` param observed |

---

## 9. Pagination

| Aspect | Detail |
|---|---|
| Mechanism | Offset-page (`sp=` param = page number, `c=` = page size) |
| Param names | `sp` (page), `c` (count/page size) |
| Max page size | Not documented; `c=100` assumed safe |
| Stated depth cap | 100,000 items (deep paging past 100k not supported) |
| Empirical depth | 100k limit (confirmed by LOC docs) |
| Cursor expiry | No cursor — pure page offset |

**9b. Measured latency (live probe, median of 3 warm calls):**

| Query type | Latency |
|---|---|
| Keyword (yellow fever) | 16,146ms (first call — cold) |
| Multi-keyword (influenza pandemic) | 8,490ms |
| NL sentence (jazz music new orleans) | 13,731ms |
| NL (women suffrage voting) | 13,731ms |
| Multi-kw warm (railroad accident) | 12,048ms |
| **Median warm** | ~12–14s |

**LOC API is extremely slow** — 8–16s per request. Rate limits aggressive: `fa=` deep-page risk 429 near 100k. Documented: "10 bulk OCR requests per 10 minutes" for bulk downloads; general search limit undocumented but CAPTCHA/429 reported at moderate traffic. Implication: **disable parallel warm-up probes; single throttled request per user query; never use in a latency-sensitive path.**

---

## 10. Rate limits & auth

| Aspect | Detail |
|---|---|
| Key required | No |
| Key type | Keyless — public API |
| Acquisition speed | N/A |
| Backend-safe | Yes (no per-user auth) |
| Anon limits | Undocumented exact rate; 429/CAPTCHA risk at sustained load; bulk OCR = 10 req/10 min |
| Burst | Low — do not burst |
| Rate limit code | HTTP 429 or HTML CAPTCHA page |
| Retry-After | Unknown |

---

## 11. Dirty-data / parsing hazards

| Field | Hazard | Example | Safe handling |
|---|---|---|---|
| `title` | String or array | `["Image 3 of New-York tribune ..."]` | `[].concat(it.title)[0]` |
| `description` | String or array | `["text1", "text2"]` | `[].concat(it.description).join(" ")` |
| `language` | String or array | `"english"` or `["english"]` | `[].concat(it.language)[0]` |
| `subject` | Array of strings or objects | `["new york county", "newspapers"]` | `[].concat(it.subject).map(s => typeof s === 'string' ? s : s.subject)` |
| `partof` | Mixed array (strings or objects) | `[{title:"..."}]` or `["string"]` | `it.partof?.[0]?.title ?? it.partof?.[0] ?? ""` |
| `image_url` | Array | Always array | `it.image_url?.[0] ?? ""` |
| `date` | YYYY-MM-DD string | `"1905-11-20"` | `it.date?.slice(0,4)` |
| HTML in title | OCR artifact `<br>`, entities | Rare but possible | `stripHtml()` already applied |
| Results: research center pages | LC search returns non-page results | "Prints and Photographs Reading Room" | Use `dl=page` param to restrict to newspaper pages only |

**Critical hazard:** Without `dl=page` parameter, `loc.gov/search/` returns heterogeneous result types (research center pages, collection pages, items). Always include `dl=page` for Chronicling America page results.

---

## 12. Exploitation notes

**Under-exploited fields:**
- `location_state` + `location_city` — geographic provenance for faceting (high value for historical research context)
- `subject_ethnicity` — ethnic community press identifier (unique signal not available elsewhere)
- `number_lccn` — LCCN crosswalk to WorldCat/catalog for newspaper title-level dedup
- `number_page` — page position within issue
- `word_coordinates_url` — coordinate data for OCR text; could enable keyword highlighting
- `partof_title` — newspaper title + date range; enables collection-level grouping

**Query strategy upgrade:**
- Add `dl=page` to ensure only full-text searchable newspaper pages are returned
- Add `fa=online-format:online+text` to filter for OCR-searchable pages only
- Date range filtering via `dates=YYYY/YYYY` is exploitable for temporal scoping
- Geographic filtering via `fa=location_state:texas` adds unique provenance dimension

**Batch/harvest:** Deep pagination to 100k items possible; OAI-PMH harvest not available via this endpoint but the raw OCR batches are downloadable via separate bulk endpoints.

**Crosswalk opportunity:** `number_lccn` links to WorldCat via LCCN; `url` links to IIIF resources.

---

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|---|---|---|
| A1 Native relevance score (×1.5) | 0 | No score field returned |
| A2 Query expressiveness | 1 | Free-text only via `q=`; facet filtering via `fa=` (boolean NOT supported in `q=`) |
| A3 Sort & filter control | 2 | Rich faceting (19+ dims: state, city, language, ethnicity, date, collection, format…) + date range; no score sort |
| A4 Pagination depth | 2 | Offset pagination; 100k cap (not cursor) |
| A5 Batch / bulk | 1 | No bulk endpoint via this path; separate bulk OCR downloads exist |
| A6 Throughput & rate limits | 0 | ~8–16s median; rate-limited; 429 risk; effectively <10 req/min |
| A7 ID linkage | 1 | LCCN only (no DOI, no ORCID, no arXiv) |
| A8 Result-count accuracy | 2 | Accurate total count returned; stable |
| A9 Semantic/NL mode (×1.5) | 1 | Lexical OCR full-text; NL-tolerant but no semantic lift |
| A10 Author pollution control | 3 | No authors on newspaper pages; structurally impossible |

```
Raw_A = (0×1.5 + 1 + 2 + 2 + 1 + 0 + 1 + 2 + 1×1.5 + 3) / 11
      = (0 + 1 + 2 + 2 + 1 + 0 + 1 + 2 + 1.5 + 3) / 11
      = 13.5 / 11
      = 1.23
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|---|---|---|
| B1 Core bibliographic completeness | 1 | Title + date + newspaper name; NO authors (newspapers), NO DOI, NO structured journal citation |
| B2 Abstract/full-text (×1.5) | 1 | OCR snippet/description available but sparse and not structured; truncated; not full abstract |
| B3 Citation graph | 0 | None |
| B4 Discipline/field-tag granularity | 2 | LCSH subject headings + geographic + ethnic community tags; flat but facetable |
| B5 OA/free-access (×1.5) | 3 | 100% public domain; all results free; no filter needed |
| B6 Rich media / IIIF | 3 | IIIF tile service + multiple resolutions; viewer-embeddable |
| B7 Holdings / availability | 1 | Library/batch identifier, state/city provenance |
| B8 Record-quality signals | 1 | `digitized` flag, `access_restricted` flag, `batch` ID |

```
Raw_B = (1 + 1×1.5 + 0 + 2 + 3×1.5 + 3 + 1 + 1) / 9
      = (1 + 1.5 + 0 + 2 + 4.5 + 3 + 1 + 1) / 9
      = 14.0 / 9
      = 1.56
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|---|---|---|
| C1 Reliability & responsiveness | 1 | 8–16s median latency; LOC infrastructure variable; no SLA; 429/CAPTCHA under load |
| C2 Auth friction | 3 | Keyless; no per-user auth; backend-safe |
| C3 Redistribution/TOS risk | 3 | US government works + historical public domain; no restrictions → NONE |
| C4 Protocol/client maturity | 2 | Versioned REST JSON; documented at loc.gov/apis; no OpenAPI/changelog |
| C5 Data hygiene | 2 | Mostly consistent; known string/array polymorphism on title/language/description; no markup bleed in most fields |

```
Raw_C = (1 + 3 + 3 + 2 + 2) / 5 = 11 / 5 = 2.20
```

### Rollup

```
Overall = 1.23 × 0.45 + 1.56 × 0.40 + 2.20 × 0.15
        = 0.554 + 0.624 + 0.330
        = 1.51
```

**TIER = B** (Complementary; 1.5–1.9)

---

## 14. Flags

| Flag | Value |
|---|---|
| TOS legal risk | NONE — US government + public domain historical newspapers |
| Currently quarantined | No — live adapter |
| Recommended action | KEEP with one critical fix: add `dl=page` to all queries to avoid heterogeneous result types. Low-maintenance adapter. Consider `fa=online-format:online+text` filter. Geographic faceting is exploitable for unique provenance signal. |
| Blocking issues | Severe latency (8–16s) precludes use in latency-sensitive fan-out; must be backgrounded or paginated lazily. Rate limit risk at sustained load. |
