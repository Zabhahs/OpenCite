---
tags: [adapter, capability, dossier]
adapter_id: OPENCONTEXT
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/OPENCONTEXT.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# OPENCONTEXT — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `OPENCONTEXT` |
| Source files | `src/adapters/extensions/openContext.js` + `api/search/opencontext.js` |
| Official API name | Open Context Search API |
| Provider | Open Context (Alexandria Archive Institute) |
| Base URL | `https://opencontext.org/query/` |
| Protocol | REST-JSON (JSON-LD array; also GeoJSON-LD, N-Triples, RDF/XML, Turtle) |
| Docs URL | https://opencontext.org/about/services |
| TOS / License URL | https://opencontext.org/about/terms |
| Pre-audit tier | — |
| Dossier date | 2026-06-08 |

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard(s) | Dublin Core, schema.org, Open Context API vocabulary (`oc-api:` prefix), GeoJSON-LD |
| Serialization | JSON-LD array (default `.json`), GeoJSON-LD, N-Triples, RDF/XML, Turtle, JSONP |
| Schema/OpenAPI URL | None (custom vocabulary); specs at https://opencontext.org/about/services |
| Schema version | Unversioned; stable REST surface; OAI-PMH service also available |

**Response structure note:** The `/query/.json` endpoint returns a **flat JSON array** of item objects (not a wrapped object with `oc-api:has-results`). This differs from older docs. The `response=metadata` mode returns a separate metadata envelope with `totalResults`, pagination links, and sorting options.

## 3. Complete Field / Tag Inventory

Fields from live probe of `/query/.json?response=uri-meta`:

| Field path | Type | Always? | Meaning | OpenCITE maps to |
|-----------|------|---------|---------|-----------------|
| `label` | string | Yes | Item label/title | `title` |
| `uri` | string | Yes | Item URI (HTTP; may be HTTP not HTTPS) | normalized to `url` |
| `href` | string | Yes | HTTPS URL for display | `url` (canonical) |
| `citation uri` | string | Yes | ARK persistent identifier e.g. `https://n2t.net/ark:/28722/...` | unmapped |
| `project label` | string | ~95% | Project/dataset name | `journal` |
| `project href` | string | ~95% | Project URL | unmapped |
| `context label` | string | ~90% | Full geographic + stratigraphic context path | mapped to `abstract` prefix |
| `context href` | string | ~90% | Context URL | unmapped |
| `latitude` | float/null | ~70% | WGS84 latitude | unmapped |
| `longitude` | float/null | ~70% | WGS84 longitude | unmapped |
| `early bce/ce` | int/null | ~60% | Earliest date (BCE negative) | unmapped |
| `late bce/ce` | int/null | ~60% | Latest date (BCE negative) | unmapped |
| `item category` | string | ~90% | Item type e.g. `"Data Publication"`, `"Image media"`, `"Subjects"` | `type` (mapped) |
| `icon` | string | ~70% | Icon URL for item type | unmapped |
| `snippet` | string | ~80% | Search snippet (highlighted match text) | unmapped |
| `thumbnail` | string | ~80% | Thumbnail image URL | `previewImage` |
| `published` | string | ~85% | ISO publication date | `year` (regex) |
| `updated` | string | ~85% | ISO last-updated date | `year` fallback |

**Fields from `response=metadata` envelope:**

| Field path | Type | Meaning |
|-----------|------|---------|
| `totalResults` | int | Total matching records |
| `startIndex` | int | Current offset |
| `itemsPerPage` | int | Page size |
| `next` / `next-json` | string (URL) | Next page link |
| `last` / `last-json` | string (URL) | Last page link |
| `oc-api:active-sorting` | array | Current sort state |
| `oc-api:has-sorting` | array | Available sort options |
| `oc-api:active-filters` | array | Active filter params |
| `oc-api:has-text-search` | array | Text search state + URL template |
| `oc-api:descriptiveness-min/max` | float | Relevance score range (internal) |

**Individual item records** (via `/{type}/{uuid}.json`) add: full Dublin Core, detailed attributes, linked data, media associations, stratigraphic context hierarchy.

## 4. Query Semantics

- **Lexical vs semantic:** Lexical full-text over item labels, descriptions, and project metadata. No semantic/vector mode.
- **NL tolerance:** Very low. "What pottery types were used in ancient Rome" → 0 results. Multi-keyword "bronze age burial" → some results (scored positively). Single-term and short two-word phrases work best.
- **Multi-keyword default:** Appears to be OR; multi-term reduces precision. "bronze age Mediterranean burial practices" (5 words) → 0 results; "bronze age burial" → results.
- **Phrase syntax:** Not documented; unclear if quoted phrase search is supported.
- **Boolean operators:** Not documented.
- **Fielded-query param:** `q=` only for text; `prop=` for property-based filtering; `bbox=` for geo; `allevent-start=`/`allevent-stop=` for date range; `type=` for item type.
- **Author-name pollution control:** Not applicable — no author field in standard record; records are archaeological data items, not publications.
- **Cross-lingual:** No — English-dominant corpus.

## 5. OA / Free-Access

| Field | Value |
|-------|-------|
| Whole-corpus OA? | Near-total — Open Context is an open-access data publisher |
| OA flag field | Implicit — all published items are open; license per-dataset (CC-BY or CC0) |
| Best-OA URL field | `href` or `citation uri` (ARK persistent ID) |
| OA-only filter param | None needed — corpus is effectively 100% OA |
| Sort by OA | N/A |
| Flag coverage | ~100% |
| Recommended strategy | `isOA: true` for all; use `href` as primary URL, `citation uri` as persistent identifier |

## 6. Images / Thumbnails / IIIF

| Field | Value |
|-------|-------|
| Has images? | Yes — thumbnails present for ~80% of records in probe |
| Thumbnail field | `thumbnail` (string URL) |
| Full-res field | Available via individual record's media associations |
| IIIF manifest field | Not surfaced in search results; some projects may have IIIF |
| IIIF version | Not confirmed in search API |
| Multi-image? | Yes — media items have multiple images; search result has one thumbnail |
| Image licensing | CC-BY or CC0 per project |
| Display strategy | Use `thumbnail` directly; present in ~80% of probed results |

## 7. Discipline / Subject Tags

| Field | Value |
|-------|-------|
| Vocabulary | Archaeological taxonomy: stratigraphic context, material type, chronological period, geographic region — encoded as `prop=` filter slugs |
| Field path | `context label` (context path as text), `item category` (type), `project label` |
| Granularity | Medium — context paths encode geographic + stratigraphic hierarchy (Europe/Italy/Poggio Civitate/…) |
| Example values | `"Europe/Italy/Poggio Civitate/Tesoro/Tesoro 18 Northern Extension/1972"`, `"Data Publication"`, `"Image media"` |
| Hierarchy depth | Deep (4–8 levels) in context paths |
| Facet/filter param | `prop={slug}` for attribute filtering; `type=` for item type; `bbox=` for geographic facet |
| Usability | **High within archaeology** — rich spatial and temporal context; not mappable to standard academic taxonomies |

## 8. Native Relevance & Scoring

| Field | Value |
|-------|-------|
| Score returned? | No — not in item array |
| Field name | `oc-api:descriptiveness-min/max` in metadata envelope (range, not per-item) |
| Semantics | Solr/Lucene internal; descriptiveness score measures record completeness |
| Range | Varies (e.g., 17.235–17 578 per probe) |
| Cross-query comparable? | No |
| Default sort | Relevance (internal) |
| Sort params | `sort=item--asc/desc` (item type/label sort); `sort=published--desc` |

## 9. Pagination

| Field | Value |
|-------|-------|
| Mechanism | Offset (`start=`) |
| Param names | `rows=` (page size, max 1 000), `start=` (offset) |
| Max page size | 1 000 per docs |
| Stated depth cap | None documented |
| Empirical depth | Probe at `start=200000` for "pottery" (200 889 results) → 3 items returned. Deep paging works |
| Cursor expiry | N/A |

### 9b. Measured Latency (live probe, 3 warm calls)

| Query type | Latency |
|-----------|---------|
| Keyword ("pottery") | cold: 779 ms; warm2: 172 ms; warm3: 286 ms |
| Multi-keyword ("bronze age burial") | 419 ms |
| NL full sentence | ~200 ms (0 results) |
| Metadata endpoint | 479 ms |
| Deep page (start=200000) | 1 647 ms |
| Cold-vs-warm | ~4–5× cold penalty |
| Extra resolve round-trips | None for basic results; +1 if item detail needed |
| Query strategy implication | Keep queries to 1–3 terms; geo/date filters improve precision; warm cache reduces latency dramatically |

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No |
| Key type | N/A |
| Acquisition speed | Keyless |
| Backend-safe? | No — adapter comment: "NOT serverSafe — `search` calls RELATIVE URL /api/search/opencontext (browser-only)" |
| Anon limits | No formal rate limits; bot protection via User-Agent check |
| Burst | Unknown |
| Quota | None documented |
| Rate-limit code | 403 (if UA blocked) |
| Retry-After? | No |

**Note:** The server-side Vercel edge function (`api/search/opencontext.js`) proxies the request with an allowed UA header, making it effectively backend-safe via the proxy.

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `uri` | HTTP not HTTPS | `"http://opencontext.org/..."` | Replace `http://opencontext.org` with `https://opencontext.org` (adapter already does this) |
| `latitude`/`longitude` | null when geo data absent | `null` | Guard before map rendering |
| `early bce/ce` / `late bce/ce` | Negative integers for BCE dates | `-4800` | Display "4800 BCE"; never use as year sort without special handling |
| `published` / `updated` | ISO date string or absent | `"2022-03-15"` | Regex `\d{4}` to extract year |
| `item category` | Multi-word string with spaces and capitals | `"Data Publication"` | Use as-is for display; map to type enum carefully |
| `thumbnail` | Can be empty string `""` | `""` | Treat empty string as absent |
| `snippet` | HTML markup with `<em>` highlight tags | `"<em>pottery</em> vessel"` | Strip HTML for plain text; keep for highlighted display |
| `label` | Can be very long (context path embedded) | `"JN II (1972-05-01):1-134; Tesoro 18..."` | Truncate at 120 chars for display |
| Total results | Two different field paths | `totalResults` vs `oai:totalResults` | Check both; adapter already does |

## 12. Exploitation Notes

- **`citation uri` (ARK)** — persistent identifier unmapped; superior to `href` for citation permanence. Add as `persistentId` field.
- **`latitude`/`longitude`** — geographic coordinates unmapped; enables map-based UX and geo-faceted filtering. High-value for archaeological context.
- **`early bce/ce` / `late bce/ce`** — temporal coverage unmapped; unique to this source; enables timeline display and chronological filtering.
- **`snippet`** — highlighted match excerpt unmapped; directly usable as a search result preview instead of the constructed `abstract` string.
- **`context label`** — full provenance path (geographic + stratigraphic hierarchy) is the richer metadata; currently truncated to "Context: X · Type: Y" in abstract. Map as a structured provenance object.
- **`prop=` filter** — allows attribute-based faceting (e.g., material type, period); not currently used. Could drive faceted navigation for archaeological queries.
- **`bbox=` geo filter** — enables map-bounded search; currently unused.
- **`type=` filter** — item type filter (subjects, media, projects, etc.) not used; could improve result quality.
- **OAI-PMH** — `https://opencontext.org/oai/` supports harvest; low volume corpus (~200k); feasible for full index.
- **Individual item JSON-LD** — full metadata via `/{type}/{uuid}.json` includes linked attributes, full context hierarchy, all media, and Dublin Core fields. Single extra call per record.
- **Query upgrade** — Use `bbox=` for region-specific queries; `allevent-start/stop=` for period filtering; these dramatically improve recall for targeted archaeological searches.

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score (×1.5) | 0 | No per-item score in response; only descriptiveness range in metadata envelope |
| A2 Query expressiveness | 2 | `q=`, `prop=`, `bbox=`, `allevent-start/stop=`, `type=`; no boolean within `q=` |
| A3 Sort & filter control | 2 | Geo filter, date range, type filter, sort by item/date; no citation/score sort |
| A4 Pagination depth/cursor | 2 | Offset to 200k+ empirically; `rows=` up to 1000; no cursor |
| A5 Batch/bulk | 2 | OAI-PMH harvest; ~200k corpus; no streaming dump |
| A6 Throughput & rate limits | 2 | Keyless; no stated limit; warm latency <300ms; cold ~800ms |
| A7 ID linkage/crosswalk | 1 | ARK citation URI; internal UUID; no DOI/PMID/ISBN crosswalk |
| A8 Result-count accuracy | 2 | `totalResults` accurate; stable offset paging |
| A9 Semantic/NL (×1.5) | 0 | Strict lexical; NL/multi-word → 0 results; no NL tolerance |
| A10 Author-name pollution | 3 | No author field; archaeological items only; pollution structurally impossible |

```
Raw_A = (0×1.5 + 2 + 2 + 2 + 2 + 2 + 1 + 2 + 0×1.5 + 3) / 11
       = (0 + 2 + 2 + 2 + 2 + 2 + 1 + 2 + 0 + 3) / 11
       = 16 / 11 = 1.455
```

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | 1 | Label + project + date; no structured authors, DOI, journal |
| B2 Abstract/full-text (×1.5) | 0 | No abstract; snippet is match excerpt only; context label is provenance not description |
| B3 Citation graph | 0 | None |
| B4 Discipline/field tags | 2 | Context path = rich geographic+stratigraphic hierarchy; `prop=` controlled vocabulary; not standard academic taxonomy |
| B5 OA guarantee (×1.5) | 3 | Entire corpus is open-access by definition; CC0/CC-BY per dataset |
| B6 Rich media/IIIF | 2 | Thumbnail present ~80%; consistent URL field; no IIIF in search results |
| B7 Holdings/availability | 1 | Project href + ARK URI; no library holdings |
| B8 Record-quality signals | 1 | Descriptiveness score (range only); `updated` timestamp |

```
Raw_B = (1 + 0×1.5 + 0 + 2 + 3×1.5 + 2 + 1 + 1) / 9
       = (1 + 0 + 0 + 2 + 4.5 + 2 + 1 + 1) / 9
       = 11.5 / 9 = 1.278
```

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | 2 | Warm <300ms; cold ~800ms; generally reliable; no SLA |
| C2 Auth friction | 3 | Keyless; no auth |
| C3 TOS risk | 2 | CC-BY or CC0 per dataset; mandatory attribution with URI citation; "properly cite data creators" → LOW-MEDIUM |
| C4 Protocol/client maturity | 2 | Stable REST; JSON-LD; versioned OAI-PMH; no OpenAPI; docs at /about/services |
| C5 Data hygiene | 2 | Consistent array format; known quirks (HTTP URIs, null geo coords, BCE negative ints); documented |

```
Raw_C = (2 + 3 + 2 + 2 + 2) / 5 = 11 / 5 = 2.20
```

### Rollup

```
Overall = 1.455 × 0.45 + 1.278 × 0.40 + 2.20 × 0.15
        = 0.655 + 0.511 + 0.330
        = 1.50
```

**TIER = B** (1.5–1.9 band — Complementary)

*Note: Scores are limited by absent abstract (B2=0) and no native relevance score (A1=0). Open Context is the unique source for georeferenced archaeological primary data (~200k records). Its geographic+temporal filtering capability (geo/date filters) is a genuine differentiator not available in any other adapter in the roster.*

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | LOW–MEDIUM — CC-BY dominant; attribution with URI required; no commercial-use bar |
| Currently quarantined? | No (NOT `serverSafe` in adapter — proxied via Vercel edge function) |
| Recommended action | Map `latitude`/`longitude`, `citation uri`, `snippet`, temporal dates; use `bbox=` + `type=` filters; add ARK as persistent ID |
| Blocking issues | NL query failure (returns 0) — use single-term geographic/material keywords; edge function proxy adds latency |
