---
tags: [adapter, capability, dossier]
adapter_id: LC_DATASETS
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/LC_DATASETS.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Capability Dossier: Library of Congress (loc.gov general search)

**Dossier date:** 2026-06-08  
**Pre-audit tier (implied):** B  
**Live status:** ALIVE

---

## 1. Identity

| Field | Value |
|---|---|
| Adapter ID | `LC_DATASETS` |
| Adapter file | `src/adapters/extensions/lcDatasets.js` |
| Official API name | loc.gov JSON/YAML API (general search) |
| Provider | Library of Congress (LOC), USA |
| Base URL | `https://loc.gov/search/` (redirects to `https://www.loc.gov/search/`) |
| Protocol | REST-JSON (keyless) |
| Docs URLs | https://www.loc.gov/apis/json-and-yaml/ · https://www.loc.gov/apis/json-and-yaml/requests/ · https://www.loc.gov/apis/json-and-yaml/responses/ · https://www.loc.gov/apis/json-and-yaml/working-within-limits/ |
| TOS/license URL | https://www.loc.gov/legal/ (US government works; public domain) |
| Pre-audit tier | B |
| Dossier date | 2026-06-08 |

---

## 2. Metadata standard & serialization

| Field | Value |
|---|---|
| Standard | Custom LOC JSON (heterogeneous — items, collections, research-center pages, manuscripts, photos, maps, audio, video, etc.) |
| Serialization | JSON (`fo=json`) |
| Schema URL | https://www.loc.gov/apis/json-and-yaml/responses/ |
| Schema version | Unversioned (stable in practice) |

---

## 3. Complete field/tag inventory

**Top-level result object fields** (confirmed live with `fa=online-format:image` filter for richer records):

| Field path | Type | Always present | Meaning | OpenCITE currently maps to |
|---|---|---|---|---|
| `id` | string | yes | LOC item URL | `id` (used as url prefix) |
| `title` | string | yes | Item title | `title` |
| `url` | string | yes | Item canonical URL | `url` |
| `type` | string\|array | sometimes | Item type ("text", "image", "audio", "research center", etc.) | `type` (maps to 'textual'/'primary-source') |
| `date` | string | sometimes | Publication/creation date (year or full date) | `year` (regex extract) |
| `description` | array | sometimes | Description text | `abstract` (first element) |
| `subject` | array | sometimes | LCSH subject headings (strings) | `subjects` |
| `creator` | array | sometimes | Creator/contributor names | `authors` |
| `language` | array | sometimes | Language | `language` (first element) |
| `image_url` | array | sometimes | IIIF tile service URLs | `previewImage` (first element) |
| `partof` | array | sometimes | Parent collection/series name | `journal` (first element) |
| `item` | object | sometimes | Rich item-level sub-object (call_number, contributors, created_published, digital_id, date) | NOT fully mapped |
| `item.call_number` | array | sometimes | LOC call number | NOT mapped |
| `item.contributors` | array | sometimes | Holding collection name | NOT mapped |
| `item.created_published` | array | sometimes | Creation/publication statement | NOT mapped |
| `item.digital_id` | array | sometimes | Digital ID URL (IIIF or other) | NOT mapped |
| `number_lccn` | string | sometimes | LCCN identifier | NOT mapped |
| `number` | array | sometimes | Various control numbers | NOT mapped |
| `location` | array | sometimes | Geographic location | NOT mapped |
| `contributor` | array | sometimes | Contributing institution | NOT mapped |
| `original_format` | string | sometimes | Physical format | NOT mapped |
| `online_format` | array | sometimes | Digital format tags | NOT mapped |
| `digitized` | boolean | sometimes | Digitization status | NOT mapped |
| `access_restricted` | boolean | sometimes | Access restriction | NOT mapped |
| `mime_type` | string | sometimes | MIME type | NOT mapped |
| `aka` | array | sometimes | Alternate titles/names | NOT mapped |
| `hassegments` | boolean | sometimes | Whether item has segments | NOT mapped |
| `shelf_id` | string | sometimes | Physical shelf location | NOT mapped |
| `resources` | array | sometimes | Associated resource URLs | NOT mapped |
| `site` | array | sometimes | LOC sub-site | NOT mapped |
| `index` | integer | yes | Result position in page | NOT mapped |
| `timestamp` | string | yes | Record timestamp | NOT mapped |
| `group` | array | sometimes | Item grouping | NOT mapped |

**Pagination object:** `pagination.total`, `pagination.pages` (sometimes null), `pagination.results` (count on page)

---

## 4. Query semantics

| Aspect | Detail |
|---|---|
| Lexical vs semantic | Lexical full-text search across LOC catalog metadata + OCR |
| NL tolerance | Multi-word queries work across heterogeneous collections; NL sentences return results but ranking is not NL-aware |
| Multi-keyword default | Implicit AND across terms |
| Phrase syntax | Not documented; standard phrase search may work via quoted `q=` param |
| Boolean operators | Not documented for `q=`; `fa=field:value` for facet AND filtering |
| Fielded-query param | `fa=field:value` for facet filtering; `fa=online-format:image`, `fa=original-format:manuscript`, `fa=subject:value` etc. |
| Author-name pollution | Queries search across all metadata including creator field; no topic-scope param. Author pollution possible. |
| Cross-lingual support | English-dominant; multilingual items present (Spanish, French, other) |

**Critical note:** Without facet filtering, results mix research-center pages, collection-level pages, finding aids, and item-level records. Use `fa=online-format:image` or `fa=online-format:online+text` to get item records.

---

## 5. OA / free-access

| Aspect | Detail |
|---|---|
| Whole-corpus OA | Mostly — LOC collections are largely public domain or free to access |
| OA flag field | `access_restricted` boolean (false = accessible) |
| Best-OA URL | `url` field |
| OA-only filter | `fa=access-restricted:false` |
| Flag coverage | >95% items freely accessible |
| Recommended strategy | `fa=access-restricted:false` to exclude any restricted items |

---

## 6. Images / thumbnails / IIIF

| Aspect | Detail |
|---|---|
| Has images | Yes — IIIF tile service for digitized visual items |
| Thumbnail field | `image_url[0]` (pct:25 resolution) |
| Full-res field | `image_url[-1]` (pct:100 resolution) |
| IIIF manifest field | `item.digital_id` array (contains IIIF service URLs) |
| IIIF version | IIIF Image API via `tile.loc.gov/image-services/iiif/service:...` |
| Multi-image | Yes — multiple resolutions in `image_url` array |
| Image licensing | Public domain (US govt / historical) |
| Display strategy | `image_url[0]` for thumbnail; `item.digital_id[0]` for IIIF manifest |

---

## 7. Discipline / subject tags

| Aspect | Detail |
|---|---|
| Vocabulary | LCSH (Library of Congress Subject Headings) |
| Field path | `subject` (array of LCSH strings) |
| Granularity | 2-level (topical + geographic subdivision); flat in response |
| Example values | `["cooking, english", "washington (d.c.)", "early works to 1800", "manuscripts, english"]` |
| Hierarchy depth | Flat strings in response (LCSH hierarchy not preserved) |
| Facet/filter param | `fa=subject:value` |
| Usability for faceting | MED — LCSH is authoritative but flat in this API; no hierarchy traversal |

---

## 8. Native relevance & scoring

| Aspect | Detail |
|---|---|
| Score returned | NO |
| Score field name | N/A |
| Score semantics | Internal ranking (undocumented) |
| Cross-query comparable | No |
| Default sort | Relevance (undocumented engine) |
| Sort params | Not documented |

---

## 9. Pagination

| Aspect | Detail |
|---|---|
| Mechanism | Offset-page (`sp=` page number, `c=` count per page) |
| Param names | `sp` (page), `c` (count) |
| Max page size | Undocumented; `c=100` assumed safe |
| Stated depth cap | 100,000 items |
| Empirical depth | 100k confirmed |
| Cursor expiry | No cursor — pure offset |

**9b. Measured latency (live probe, median of 3 warm calls):**

| Query type | Latency |
|---|---|
| Keyword (photography) | 1,533ms |
| Multi-keyword (slavery abolition) | 2,532ms |
| NL sentence (history of the civil rights movement in america) | 4,184ms |
| **Median warm** | ~2–3s |

LC_DATASETS is significantly faster than CHRONICLING_AMERICA (~2s vs ~12s). First request may be slower. Rate limits same as LOC platform (429/CAPTCHA under load).

---

## 10. Rate limits & auth

| Aspect | Detail |
|---|---|
| Key required | No |
| Key type | Keyless |
| Acquisition speed | N/A |
| Backend-safe | Yes (no per-user auth); current adapter uses direct `fetch` (not `proxiedFetch`) — minor inconsistency |
| Anon limits | Undocumented exact; same LOC platform rate limits apply; 429 or CAPTCHA under sustained load |
| Rate limit code | HTTP 429 or HTML CAPTCHA |
| Retry-After | Unknown |

---

## 11. Dirty-data / parsing hazards

| Field | Hazard | Example | Safe handling |
|---|---|---|---|
| `type` | String or array | `"research center"` or `["text"]` | `[].concat(it.type)[0]` |
| `subject` | Array of strings or objects | `[{subject:"cooking, english"}, "washington"]` | `[].concat(it.subject).map(s => typeof s === 'string' ? s : s.subject)` |
| `creator` | String or array | `["Author Name"]` | `[].concat(it.creator)` |
| `partof` | String or object array | `["collection title"]` or `[{title:"..."}]` | `it.partof?.[0]?.title ?? it.partof?.[0] ?? ""` |
| `description` | Array | `["text description"]` | `it.description?.[0]` |
| `date` | Various | `"1700"`, `"1905-11-20"`, `null` | `String(it.date||"").match(/\d{4}/)?.[0]` |
| Non-item results | Research-center pages lack most fields | `{title:"Prints and Photographs Reading Room", type:"research center"}` | Filter by `fa=online-format:image` or similar; check for `item` sub-object presence |
| `image_url` | Array, sometimes absent | `["https://tile.loc.gov/..."]` | `it.image_url?.[0] ?? ""` |
| HTML in description | Rare markup bleed | `<p>text</p>` | `stripHtml()` already applied |

---

## 12. Exploitation notes

**Under-exploited fields:**
- `item.call_number` — LOC call number; unique classification crosswalk signal
- `item.contributors` — holding collection name; provenance
- `item.digital_id` — full IIIF manifest URL
- `number_lccn` — LCCN for WorldCat crosswalk
- `fa=online-format` filter — currently unused; would eliminate junk result types
- `fa=original-format:manuscript` — surface rare manuscript content unique to LOC
- `fa=access-restricted:false` — ensure only publicly accessible items

**Query strategy upgrade:**
- Always add `fa=online-format:image` OR `fa=online-format:online+text` to get substantive item records
- Separate adapter queries for different content types (manuscripts vs. photos vs. texts) could improve relevance
- Date range filtering via `dates=YYYY/YYYY` available

**Crosswalk opportunity:**
- LCCN → WorldCat; `item.digital_id` → IIIF manifest viewer

---

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|---|---|---|
| A1 Native relevance score (×1.5) | 0 | No score returned |
| A2 Query expressiveness | 1 | `q=` free-text only; `fa=` facet filtering (no in-query boolean) |
| A3 Sort & filter control | 2 | Rich `fa=` facet filters (20+ dims); no score sort |
| A4 Pagination depth | 2 | Offset-page; 100k cap |
| A5 Batch / bulk | 1 | No bulk; individual page requests only |
| A6 Throughput & rate limits | 1 | ~2–3s median; 429 under load; no stated cap |
| A7 ID linkage | 1 | LCCN only; no DOI/ORCID |
| A8 Result-count accuracy | 2 | Accurate total returned |
| A9 Semantic/NL mode (×1.5) | 1 | Lexical; NL tolerant but no semantic lift |
| A10 Author pollution control | 1 | `creator` field searched; no scoping param documented; pollution possible |

```
Raw_A = (0×1.5 + 1 + 2 + 2 + 1 + 1 + 1 + 2 + 1×1.5 + 1) / 11
      = (0 + 1 + 2 + 2 + 1 + 1 + 1 + 2 + 1.5 + 1) / 11
      = 12.5 / 11
      = 1.14
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|---|---|---|
| B1 Core bibliographic completeness | 2 | Title + creator + date + subject + language; LCCN; missing DOI/ORCID/volume/issue for most records |
| B2 Abstract/full-text (×1.5) | 1 | `description[0]` present for some records; coverage sparse (<40%); not structured abstract |
| B3 Citation graph | 0 | None |
| B4 Discipline/field-tag granularity | 2 | LCSH subject headings, facetable; flat but authoritative |
| B5 OA/free-access (×1.5) | 2 | `access_restricted` flag present + filter param; US govt works largely PD; some items restricted |
| B6 Rich media / IIIF | 3 | IIIF tile service + multiple resolutions; `item.digital_id` manifest; viewer-embeddable |
| B7 Holdings / availability | 2 | `item.call_number` + contributing institution + shelf_id |
| B8 Record-quality signals | 1 | `digitized` + `access_restricted` flags |

```
Raw_B = (2 + 1×1.5 + 0 + 2 + 2×1.5 + 3 + 2 + 1) / 9
      = (2 + 1.5 + 0 + 2 + 3 + 3 + 2 + 1) / 9
      = 14.5 / 9
      = 1.61
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|---|---|---|
| C1 Reliability & responsiveness | 2 | ~2–3s warm median; LOC infrastructure generally stable; 429 risk under load |
| C2 Auth friction | 3 | Keyless; no per-user auth |
| C3 Redistribution/TOS risk | 3 | US govt + public domain; no restrictions → NONE |
| C4 Protocol/client maturity | 2 | Documented REST JSON; no OpenAPI; versioning undocumented |
| C5 Data hygiene | 1 | Heterogeneous result types (research-center pages, items, collections mixed); field presence highly variable; `type` polymorphism |

```
Raw_C = (2 + 3 + 3 + 2 + 1) / 5 = 11 / 5 = 2.20
```

### Rollup

```
Overall = 1.14 × 0.45 + 1.61 × 0.40 + 2.20 × 0.15
        = 0.513 + 0.644 + 0.330
        = 1.49
```

**TIER = C** (Peripheral; 1.0–1.4 → borderline C/B at 1.49; rounds to B-entry)

Conservatively scoring at **TIER C** (1.49 is in band 1.5–1.9 only if we round up; raw is 1.49 which is in 1.0–1.4 territory at the threshold). Assigned **TIER C** due to heterogeneous result quality hazard and lack of score signal.

---

## 14. Flags

| Flag | Value |
|---|---|
| TOS legal risk | NONE — US government + public domain |
| Currently quarantined | No — live adapter |
| Recommended action | KEEP with fixes: (1) add `fa=online-format:image` or `fa=online-format:online+text` to filter out research-center/collection-level junk; (2) switch to `proxiedFetch` for consistency; (3) extract `item.call_number` for holdings signal. Coverage is unique (manuscripts, maps, photos, rare books) but metadata quality requires careful filtering. |
| Blocking issues | Heterogeneous result types without `fa=` filter produce near-useless results (research-center pages, collection-level stubs). This is a current adapter bug. |
