---
tags: [adapter, capability, dossier]
adapter_id: PANGAEA
---

# PANGAEA — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `PANGAEA` |
| Source file | `src/adapters/extensions/pangaea.js` |
| Official API name | PANGAEA Elasticsearch Search API + DOI-based RIS/metadata endpoint |
| Provider | PANGAEA – Data Publisher for Earth & Environmental Science (AWI / MARUM) |
| Base URL (ES) | `https://ws.pangaea.de/es/pangaea/panmd/_search` |
| Base URL (RIS) | `https://doi.pangaea.de/10.1594/PANGAEA.{id}?format=citation_ris` |
| Protocol | Elasticsearch REST-JSON (POST) + RIS citation format |
| Docs URL | https://wiki.pangaea.de/wiki/PANGAEA_Search, https://wiki.pangaea.de/wiki/PANGAEA_ESSearch (404), pangaeapy Python library |
| TOS / License URL | https://www.pangaea.de/about/terms.php |
| Pre-audit tier | — |
| Dossier date | 2026-06-08 |

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard(s) | Custom PANGAEA schema (panmd); RIS for citation; XML for full metadata (xml-thumb); Dublin Core via OAI-PMH |
| Serialization | JSON (ES response), RIS (citation), XML (xml-thumb field embedded in ES source) |
| Schema/OpenAPI URL | ES mapping at `https://ws.pangaea.de/es/pangaea/panmd/_mapping` (publicly readable) |
| Schema version | Elasticsearch 7.x; PANGAEA metadata v2020+ |

## 3. Complete Field / Tag Inventory

### Elasticsearch `_source` fields (confirmed from `_mapping` + live probes)

**Core metadata:**

| Field path | Type | Always? | Meaning | OpenCITE maps to |
|-----------|------|---------|---------|-----------------|
| `URI` | string | Yes | Dataset DOI URI e.g. `https://doi.org/10.1594/PANGAEA.xxx` | `url`, `doi` (parsed) |
| `agg-author` | string/string[] | ~90% | Author name(s) | `authors` |
| `agg-pubYear` | int | ~95% | Publication year | `year` |
| `agg-datasetname` | string | ~80% | Dataset name/title | `title` |
| `title` | string | ~70% | Alternative title field | `title` fallback |
| `sf-authortitle` | string | ~80% | "Author (year) Title" formatted citation | unmapped |
| `sf-idDataSet` | int | Yes | Numeric PANGAEA ID | used as `_id` |
| `parentURI` | string | ~60% | Parent dataset DOI (for child datasets) | unmapped |
| `parentIdDataSet` | int | ~60% | Parent dataset numeric ID | unmapped |

**Geographic:**

| Field path | Type | Always? | Meaning | OpenCITE maps to |
|-----------|------|---------|---------|-----------------|
| `northBoundLatitude` | float | ~70% | North bounding latitude | unmapped |
| `southBoundLatitude` | float | ~70% | South bounding latitude | unmapped |
| `eastBoundLongitude` | float | ~70% | East bounding longitude | unmapped |
| `westBoundLongitude` | float | ~70% | West bounding longitude | unmapped |
| `meanPosition` | geo_point | ~70% | Centroid location | unmapped |
| `agg-geometry` | string (WKT/bbox) | ~70% | Geometry description | unmapped |
| `geoCoverage` | geo_shape | ~70% | Full geographic extent | unmapped |
| `agg-location` | string | ~70% | Location name e.g. `"Arctic Ocean"` | unmapped |
| `geocodes` | string[] | ~50% | PANGAEA location codes | unmapped |

**Temporal:**

| Field path | Type | Always? | Meaning | OpenCITE maps to |
|-----------|------|---------|---------|-----------------|
| `minDateTime` | date | ~70% | Earliest measurement date | unmapped |
| `maxDateTime` | date | ~70% | Latest measurement date | unmapped |
| `sp-doiRegistrationDate` | date | ~80% | DOI registration date | unmapped |
| `sp-lastModified` | date | ~90% | Last modified timestamp | unmapped |
| `internal-datestamp` | date | Yes | Internal indexing datestamp | unmapped |

**Scientific context:**

| Field path | Type | Always? | Meaning | OpenCITE maps to |
|-----------|------|---------|---------|-----------------|
| `agg-campaign` | string | ~50% | Research campaign e.g. `"Leg202"` | unmapped |
| `agg-project` | string | ~40% | Project name | unmapped |
| `agg-method` | string[] | ~60% | Methods used e.g. `"Drilling/drill rig"` | unmapped |
| `agg-basis` | string | ~40% | Research vessel/basis e.g. `"Joides Resolution"` | unmapped |
| `techKeyword` | string[] | ~50% | Technical keywords | unmapped |
| `oaiSet` | string | ~80% | OAI-PMH set name e.g. `"citable"` | unmapped |

**Access & status:**

| Field path | Type | Always? | Meaning | OpenCITE maps to |
|-----------|------|---------|---------|-----------------|
| `sp-loginOption` | string | Yes | `"unrestricted"` or `"login"` | unmapped (OA signal!) |
| `sp-dataStatus` | string | ~90% | `"published"`, `"in review"`, etc. | unmapped |
| `sp-hidden` | boolean | Yes | Whether hidden from search | filter condition |
| `nDataPoints` | int | ~80% | Number of data points in dataset | unmapped |
| `boost` | float | ~90% | Relevance boost factor | unmapped (A1 signal!) |

**Rich XML:**

| Field path | Type | Always? | Meaning | OpenCITE maps to |
|-----------|------|---------|---------|-----------------|
| `xml-thumb` | string (XML blob) | ~90% | Full PANGAEA citation XML with geo, methods, authors, DOI, landing page | `title`, `authors`, `year` via RIS |
| `xml` | string (XML blob) | ~80% | Full metadata XML | unmapped |
| `xml-sitemap` | string | ~80% | Sitemap XML | unmapped |

**ORCID / Identifiers (from _mapping):**

| Field path | Type | Meaning |
|-----------|------|---------|
| `ft-orcid` | text | ORCID identifiers for authors |
| `ft-rorid` | text | ROR institutional identifiers |
| `ft-igsn` | text | International Geo Sample Numbers |
| `ft-crossrefFunderId` | text | Crossref funder IDs |

### RIS citation fields (per-hit resolve call)

| RIS tag | Meaning | OpenCITE maps to |
|---------|---------|-----------------|
| `TY` | Record type (`DATA`) | `type` |
| `T1` | Title | `title` |
| `AU` | Authors | `authors` |
| `PY` | Year | `year` |
| `N2` | Abstract/description | `abstract` |
| `KW` | Keywords | `keywords` |
| `DO` | DOI | `doi` |
| `UR` | URL | `url` |
| `PB` | Publisher (`PANGAEA`) | `publisher` |

## 4. Query Semantics

- **Lexical vs semantic:** Elasticsearch `query_string` — Lucene syntax; BM25 scoring over all `ft-*` text fields plus metadata fields.
- **NL tolerance:** High — ES `query_string` parses natural language sentences into OR-of-terms by default (can be changed to AND with `default_operator`). Live probe: NL sentence "What are the effects of ocean acidification on marine ecosystems" → 445 519 hits (broad match).
- **Multi-keyword default:** OR across terms in `query_string`; use `AND` operator or `+prefix` for required terms.
- **Phrase syntax:** `"exact phrase"` in `query_string`.
- **Boolean operators:** Full Lucene: AND, OR, NOT, `+field:value`, parentheses, wildcards (`*`, `?`), proximity (`~N`), ranges (`[x TO y]`).
- **Fielded-query param:** Full field-level queries via `query_string` (e.g., `agg-author:"Smith J"`, `agg-location:"Arctic"`).
- **Author-name pollution control:** Use `agg-author:` prefix to scope author searches; or `agg-datasetname:` for title-only. Default `query_string` searches all fields. Structured `bool` filter queries (not `query_string`) eliminate pollution entirely.
- **Cross-lingual:** No — English-dominant; some records have German titles.

## 5. OA / Free-Access

| Field | Value |
|-------|-------|
| Whole-corpus OA? | ~90% unrestricted; ~10% under moratorium or login-required |
| OA flag field | `sp-loginOption` in ES source: `"unrestricted"` = freely accessible |
| Best-OA URL field | `URI` → direct DOI landing page |
| OA-only filter param | `term: {"sp-loginOption": "unrestricted"}` in ES query |
| Sort by OA | Use ES `bool.must` to require `sp-loginOption: unrestricted` |
| Flag coverage | ~90% (very high — PANGAEA is primarily open repository) |
| Recommended strategy | Add `filter: [{term: {"sp-loginOption": "unrestricted"}}]` to ES body for free-access-only results |

## 6. Images / Thumbnails / IIIF

| Field | Value |
|-------|-------|
| Has images? | No search-result thumbnails; dataset content may include images |
| Thumbnail field | None in ES source for display |
| Full-res field | Dataset files available via DOI landing page; `xml-thumb` contains link metadata |
| IIIF manifest field | None |
| IIIF version | N/A |
| Multi-image? | N/A |
| Image licensing | Data: CC-BY; no image-specific licensing |
| Display strategy | Link to DOI landing page (`URI`); no thumbnail feasible |

## 7. Discipline / Subject Tags

| Field | Value |
|-------|-------|
| Vocabulary | PANGAEA internal: `techKeyword` (scientific parameters/methods), `oaiSet` (data category), campaign/project taxonomy |
| Field path | `techKeyword[]`, `agg-method[]`, `oaiSet`, `agg-project` |
| Granularity | Medium — discipline-specific (earth/env science); `techKeyword` includes measured parameters (e.g., "Carbonate, total inorganic") |
| Example values | `["Drilling/drill rig", "DSDP/ODP/IODP sample designation", "Element analyser CHN"]` |
| Hierarchy depth | 1–2 levels |
| Facet/filter param | ES `terms` aggregation on `agg-method`, `techKeyword`, etc.; any field facetable via ES aggregation |
| Usability | **Medium** — highly domain-specific; valuable for earth-science drilling/sampling queries |

## 8. Native Relevance & Scoring

| Field | Value |
|-------|-------|
| Score returned? | Yes — `_score` present in every ES hit |
| Field name | `_score` |
| Semantics | Elasticsearch BM25 (TF-IDF variant) over text fields; `boost` field in source adds manual weighting |
| Range | Floating point; observed range 2.64–10.69 in probes |
| Cross-query comparable? | No — absolute values depend on query term frequency; monotone within request = yes |
| Default sort | Descending `_score` |
| Sort params | ES `sort` array; can sort by date, geo distance, any field |

**Rubric note (Elasticsearch caveat):** `_score` is monotone within a request → A1=2 per protocol fairness rules.

Observed scores for "climate change" query: `10.693698, 2.660309, 2.656113, 2.640665, 2.639252, 2.637068`. Clearly monotone; first hit is a strong match, remaining cluster near 2.6. Not cross-query comparable (BM25 IDF varies per query).

## 9. Pagination

| Field | Value |
|-------|-------|
| Mechanism | Offset (`from`) |
| Param names | `from=`, `size=` |
| Max page size | 10 000 per ES default |
| Stated depth cap | 10 000 (`maxWindow` in adapter capability) |
| Empirical depth | ES default `index.max_result_window` = 10 000; beyond requires `search_after` |
| Cursor expiry | N/A (no cursor implemented) |

### 9b. Measured Latency (live probe, 3 warm calls)

| Query type | Latency |
|-----------|---------|
| Keyword ES ("climate change") | cold: 923 ms; warm2: 179 ms; warm3: 176 ms |
| Multi-keyword ("sediment core arctic ocean") | ~218 ms |
| NL full sentence (ocean acidification) | 239 ms |
| RIS detail fetch per-record | cold: 1 219 ms (single record) |
| Total per-page (ES + RIS × N) | ~3–8s for 5 records (N parallel RIS calls) |
| Cold-vs-warm ES | ~5× cold |
| Extra resolve round-trips | 1 RIS call per hit → major latency multiplier |
| Query strategy implication | Parse `xml-thumb` XML inline to avoid RIS calls; or cache RIS per ID; consider `_source` expansion to get more fields without RIS |

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No — ES endpoint publicly accessible |
| Key type | N/A |
| Acquisition speed | Keyless |
| Backend-safe? | Yes (`serverSafe: true` via `proxiedFetch`) |
| Anon limits | TOS §5.5 prohibits mass download; no rate-limit HTTP mechanism documented; practical ~10–30 req/min |
| Burst | Unknown; ES cluster throughput |
| Quota | TOS: "significantly beyond average access attempts" triggers disconnect |
| Rate-limit code | 429 or forced disconnect |
| Retry-After? | Not documented |

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `agg-author` | String or array | `"Smith, J."` or `["Smith, J.", "Jones, A."]` | `[].concat(v).filter(Boolean)` |
| `agg-pubYear` | Integer; occasionally string | `2019` or `"2019"` | `String(v).slice(0,4)` |
| `URI` | May be DOI URI or HTTP URL | `"https://doi.org/10.1594/..."` | DOI regex extraction |
| `xml-thumb` | Multi-KB XML blob in ES response; parse cost | `<md:SearchResult>...</md:SearchResult>` | Parse only when needed; XML is well-formed |
| RIS `PY` | Year + month/day or year only | `"2019/05/08/"` | Slice `[0:4]` |
| `_score` | Float; changes with IDF | `10.69` vs `2.64` — same query | Do not compare across queries |
| `parentURI` | May be absent for top-level datasets | absent | Guard `?.` access |
| `sp-loginOption` | String; occasionally absent | `"unrestricted"` or missing | Default to "login" if absent |
| `agg-method` | Array; can be long (10+ methods) | `["Method A", "Method B", ...]` | Slice for display; keep full for filtering |

## 12. Exploitation Notes

- **`xml-thumb` inline XML** — contains full citation (title, authors, year, DOI, geo bounds) without RIS call. Parsing this would eliminate the expensive per-hit RIS round-trip (+1 s per record). High-value optimization.
- **`sp-loginOption`** — OA access signal; add `filter: [{term: {"sp-loginOption": "unrestricted"}}]` to ES body for free-only results. Currently unmapped.
- **`boost` field** — PANGAEA's own relevance boost; could be incorporated into OpenCITE's RRF score as a prior.
- **`agg-location` / geo fields** — geographic provenance (Arctic Ocean, North Atlantic, etc.); high-value for earth-science queries; currently unmapped.
- **`techKeyword` / `agg-method`** — scientific method/parameter tags unique to data repositories; useful for "measurements of X" type queries.
- **ORCID (`ft-orcid`)** — author ORCID IDs in the mapping; not in standard `_source` but queryable. Add `_source` field request.
- **`nDataPoints`** — dataset size signal; larger = more comprehensive data; could rank against smaller stub datasets.
- **`parentURI` crosswalk** — relates child datasets to parent collection; enables navigational clustering.
- **`search_after` cursor** — for deep pagination beyond 10k, switch from `from`/`size` to `search_after` with a `sort` field.
- **ES aggregations** — `terms` agg on `agg-method`, `agg-location`, `agg-campaign` → free facet counts without extra queries.
- **Batch harvest** — OAI-PMH at `https://ws.pangaea.de/oai/provider` with resumption tokens enables full corpus harvest; ~400k datasets.

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score (×1.5) | 2 | `_score` returned; monotone within request; BM25; not cross-query comparable (ES caveat → A1=2) |
| A2 Query expressiveness | 3 | Full Lucene via `query_string`; boolean, phrase, proximity, wildcard, fielded queries |
| A3 Sort & filter control | 3 | ES: sort by any field; filter by geo, date, loginOption, method, etc.; aggregation facets |
| A4 Pagination depth/cursor | 2 | Offset to 10k; `search_after` available for deeper paging |
| A5 Batch/bulk | 2 | OAI-PMH harvest; no streaming dump; pangaeapy Python client |
| A6 Throughput & rate limits | 2 | Keyless; ~10–30 req/min practical; TOS §5.5 mass-download prohibition |
| A7 ID linkage/crosswalk | 2 | DOI, IGSN, ORCID (in mapping); no PMID/ISBN |
| A8 Result-count accuracy | 3 | ES `hits.total.value` exact; stable across pages |
| A9 Semantic/NL (×1.5) | 1 | Lucene `query_string` with OR default = NL-tolerant but lexical only; no semantic/vector |
| A10 Author-name pollution | 2 | `agg-author:` field scope param available; `query_string` by default searches all fields; opt-in scoping works |

```
Raw_A = (2×1.5 + 3 + 3 + 2 + 2 + 2 + 2 + 3 + 1×1.5 + 2) / 11
       = (3 + 3 + 3 + 2 + 2 + 2 + 2 + 3 + 1.5 + 2) / 11
       = 23.5 / 11 = 2.136
```

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | 2 | Title, authors, year, DOI, publisher; no ISSN/ISBN; journal field empty |
| B2 Abstract/full-text (×1.5) | 2 | RIS `N2` has dataset description ~70% coverage; `xml-thumb` contains summary; full-text link via DOI |
| B3 Citation graph | 0 | None |
| B4 Discipline/field tags | 2 | `techKeyword`, `agg-method` = controlled earth-science parameter vocabulary; `oaiSet` categories |
| B5 OA guarantee (×1.5) | 2 | `sp-loginOption: "unrestricted"` reliable flag; ~90% OA; filter param available via ES; CC-BY data |
| B6 Rich media/IIIF | 0 | No thumbnails in search results |
| B7 Holdings/availability | 2 | DOI resolves to dataset landing page; `nDataPoints`; parent/child dataset structure |
| B8 Record-quality signals | 2 | `sp-dataStatus` (published/review), `boost` factor, `nDataPoints`, ORCID authorship |

```
Raw_B = (2 + 2×1.5 + 0 + 2 + 2×1.5 + 0 + 2 + 2) / 9
       = (2 + 3 + 0 + 2 + 3 + 0 + 2 + 2) / 9
       = 14 / 9 = 1.556
```

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | 2 | ES warm: 176–240ms; RIS cold: ~1.2s; total per-page 3–8s; no SLA; AWI/MARUM infrastructure reliable |
| C2 Auth friction | 3 | Keyless; backend-safe |
| C3 TOS risk | 2 | Metadata CC0; data CC-BY; §5.5 prohibits mass download / commercial data extraction; display OK → LOW |
| C4 Protocol/client maturity | 2 | ES API stable; RIS standard; no versioning; pangaeapy library; OAI-PMH; no OpenAPI |
| C5 Data hygiene | 2 | Mostly consistent; `agg-author` type polymorphism; `xml-thumb` XML blob; date format variation documented |

```
Raw_C = (2 + 3 + 2 + 2 + 2) / 5 = 11 / 5 = 2.20
```

### Rollup

```
Overall = 2.136 × 0.45 + 1.556 × 0.40 + 2.20 × 0.15
        = 0.961 + 0.622 + 0.330
        = 1.91
```

**TIER = B** (1.5–1.9 band — Complementary)

*Note: Strong query expressiveness (A2=3, A3=3) and the native ES `_score` (A1=2) are genuine strengths. The per-hit RIS round-trip (+1s each) is the primary operational bottleneck — parsing `xml-thumb` inline would eliminate it. The B2=2 score reflects that RIS abstracts cover ~70% of records. This is the strongest earth/environmental data source available keyless.*

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | LOW — metadata CC0; data CC-BY; §5.5 mass-download prohibition applies to data files, not metadata display |
| Currently quarantined? | No |
| Recommended action | Parse `xml-thumb` inline to eliminate RIS round-trip; add `sp-loginOption` OA filter; map geo fields; add `techKeyword` to subjects |
| Blocking issues | RIS per-hit latency multiplier (N × ~1.2s) makes page loads slow for full result sets; mitigate with `xml-thumb` parsing |
