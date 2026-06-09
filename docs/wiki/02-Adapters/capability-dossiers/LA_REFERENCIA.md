---
tags: [adapter, capability, dossier]
adapter_id: LA_REFERENCIA
---

# LA_REFERENCIA — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| **Adapter ID** | `LA_REFERENCIA` |
| **Adapter file** | `src/adapters/extensions/laReferencia.js` |
| **Official API name** | LA Referencia VuFind v1 Search API |
| **Provider** | LA Referencia (RedCLARA network, Latin American national repositories) |
| **Base URL** | `https://www.lareferencia.info/vufind/api/v1/search` |
| **Protocol** | REST-JSON (VuFind v1 API over Solr backend) |
| **Docs URL** | `https://vufind.org/wiki/development:plugins:rest_api` (VuFind generic; no LA Referencia-specific docs found) |
| **TOS/License URL** | No explicit TOS page found at `lareferencia.info`; institution aggregates OA content from member repositories |
| **Pre-audit tier** | C (estimated) |
| **Dossier date** | 2026-06-09 |

**Live probe**: Fully accessible, no key required. All endpoints reached successfully.

---

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| **Standard** | VuFind internal record format (aggregated Dublin Core / MARC from member repositories) |
| **Serialization** | JSON |
| **Schema URL** | None published |
| **Schema version** | VuFind v1 API |

---

## 3. Complete Field/Tag Inventory

Response structure: `{ resultCount, records[], facets?, status }`. Each record:

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|----------------|---------|-----------------|
| `id` | string | yes | VuFind record ID (e.g. `BR_418eaf5610aa94b76c50d6209b0ff2e5`) | `id` prefix (`laref-{id}`) |
| `title` | string | yes | Title | `title` |
| `authors.primary` | object | no | Primary authors as `{name: {role: [...]}}` dict; name may contain `|||` delimiter | `authors` (key split on `|||`) |
| `authors.secondary` | object/array | no | Secondary authors | NOT mapped ★ |
| `authors.corporate` | array | no | Corporate authors | NOT mapped ★ |
| `publicationDates` | string[] | no | Publication dates array (may contain malformed dates like `"2204"`) | `year` (regex `/\d{4}/`) |
| `formats` | string[] | no | Document type (article, masterThesis, doctoralThesis, bookPart, …) | `type` (first element) |
| `languages` | string[] | no | ISO 639-2 language code (e.g. `"spa"`, `"por"`, `"eng"`) | `language` (first element) |
| `subjects` | array of arrays | no | Subject hierarchy — each element is an array of breadcrumb strings | `subjects` (leaf node extracted, max 8) |
| `urls` | `{url, desc}[]` | no | URLs to full text / record page | `url` (first `url` property) |
| `summary` | string[] | no | Abstract / summary text (present if the upstream record includes one) | NOT mapped ★ |
| `publishers` | string[] | no | Publisher names | `publisher` (first element) |
| `fullRecord` | — | absent | Not returned by LA Referencia endpoint | — |
| `recordLinks` | — | absent | Not returned by LA Referencia endpoint | — |
| `doi` | — | absent | NOT present in VuFind v1 response | `doi: ""` hardcoded |

**Facets** (when `facet[]=X` params added):
- `format` — document type facet with counts
- `language` — language facet with counts
- `institution` — institutional source facet
- `building` — sub-collection facet

---

## 4. Query Semantics

- **Lexical vs semantic**: Lexical (Solr/Lucene backend). No semantic/vector mode.
- **NL tolerance**: Tolerant — NL sentence returns results (Solr treats tokens as OR terms). Tested: `What are the effects of colonialism on Latin American economic development` → 40 results. Quality is coincidental matching, not sentence understanding.
- **Multi-keyword default**: AND within Solr (whitespace = AND in VuFind default). Confirmed: `climate change` → fewer results than `climate` alone when `type=Title`.
- **Phrase syntax**: Undocumented for the VuFind API; likely Solr `"quoted phrase"` in `lookfor` param.
- **Boolean operators**: `AND`/`OR`/`NOT` in `lookfor` — tested `climate AND change` → **403 Forbidden** (server rejects explicit boolean operator syntax). Simple multi-word queries work via default AND tokenization.
- **Fielded query**: `type=` parameter controls search scope: `AllFields`, `Title`, `Author`, `Subject`. `ISN` and `id` return 403.
- **Author-name pollution control**:
  - Default `type=AllFields`: searches all fields including author — pollution present (tested `darwin` → first result is article titled "Darwin" by author "Schaden, Egon").
  - Scope param: `type=Title` suppresses author matches (tested `darwin` as Title → 506 results, topic-relevant).
  - Current OpenCITE: uses `type=AllFields` with no scoping — **author pollution risk present**.
  - Recommended pattern: use `type=Title` for topic queries, or build `lookfor=title:(q) OR description:(q)` if supported.
- **Cross-lingual support**: None. Multi-language content indexed; `type=AllFields` may match Spanish/Portuguese terms but no translation.

---

## 5. OA / Free-Access

| Field | Value |
|-------|-------|
| **Whole-corpus OA?** | Yes — LA Referencia aggregates only OA repositories from Latin American national networks |
| **OA flag field** | None in API response; structural guarantee |
| **Best-OA URL field** | `urls[0].url` — direct link to record/fulltext |
| **OA-only filter param** | Not needed |
| **Sort-by-OA** | N/A |
| **Flag coverage** | 100% (structural) |
| **Recommended strategy** | All records OA; use `urls[0].url` for access link; no filtering needed |

---

## 6. Images / Thumbnails / IIIF

| Field | Value |
|-------|-------|
| **Has images?** | No |
| **Thumbnail field** | None |
| **IIIF manifest** | None |
| **Display strategy** | No images available |

---

## 7. Discipline / Subject Tags

| Field | Value |
|-------|-------|
| **Vocabulary** | Uncontrolled / mixed — aggregated from member repositories; may include LCSH, local Spanish/Portuguese vocab |
| **Field path** | `subjects` (array of arrays; breadcrumb hierarchy) |
| **Granularity** | 1–3 levels; leaf extracted in adapter |
| **Example values** | `[["Environmental education"], ["Climate change"], ["Educación ambiental"]]` |
| **Hierarchy depth** | Up to 3 levels (breadcrumb array per term) |
| **Facet param** | `facet[]=format`, `facet[]=language`, `facet[]=institution` (NOT `facet[]=subject` — subject facet not available) |
| **Usability** | Low-medium — multilingual, uncontrolled; strong for Iberian/Latin American content |

---

## 8. Native Relevance & Scoring

| Field | Value |
|-------|-------|
| **Score returned?** | No — VuFind v1 API does not expose relevance scores |
| **Field name** | N/A |
| **Semantics** | Solr BM25 internally (opaque) |
| **Range** | N/A |
| **Cross-query comparable?** | No |
| **Default sort** | Relevance (Solr internal) |
| **Sort params** | `sort=year` works (returns results; may produce malformed dates: `"2204"` seen in probe) |

---

## 9. Pagination

| Field | Value |
|-------|-------|
| **Mechanism** | Page-based (`page=`, `limit=`) |
| **Param names** | `page` (1-based), `limit` (page size) |
| **Max page size** | Not documented; 20 tested, no rejection |
| **Stated depth cap** | None found |
| **Empirical depth** | `page=100` with `limit=5` returned 5 results for `resultCount=220453` — no apparent cap |
| **Cursor expiry** | N/A |
| **Total count** | `resultCount` |

### 9b. Measured Latency (live probe, 3 warm calls)

| Query type | Median (ms) | Notes |
|-----------|------------|-------|
| Keyword (`history`) | 202 ms | Cold=928 ms |
| Multi-keyword (`medieval society europe`) | 80 ms | Very fast warm — Solr cache |
| NL full-sentence | 1,147 ms | Slower; long query string overhead |
| NL vs keyword delta | ~5.7× | Significant overhead for long queries |
| Cold vs warm | ~5× slower cold | Solr caching clear |

**Query strategy implication**: Keep queries short (2–3 terms) for sub-200 ms response. NL sentences cause ~1s latency spikes.

---

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| **Key required?** | No — fully open |
| **Key type** | None |
| **Acquisition speed** | Instant (keyless) |
| **Backend-safe?** | Yes (`serverSafe: true`) |
| **Anon limits** | Undocumented; no rate-limit errors observed in probe |
| **Keyed limits** | N/A |
| **Rate-limit code** | 403 returned for specific invalid `type=` values (ISN, id) and explicit boolean operators — not rate limiting |
| **Retry-After** | Not present |

---

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|--------------|
| `authors.primary` | Object (not array); key contains `\|\|\|` role delimiter | `"González Gaudiano, Edgar J.|||author"` | `key.split("|||")[0].trim()` (handled) |
| `publicationDates` | Malformed/future dates | `["2204"]` seen in live probe | Regex `/\d{4}/` + range check (year ≤ currentYear+2) |
| `subjects` | Array of arrays; leaf may contain `::` delimiter | `[["Cambio climático::subtema"]]` | Take last `::` segment; handled in adapter |
| `summary` | Empty array `[]` common; may have HTML | `[]` or `["<p>text</p>"]` | Not mapped; stripHtml if added |
| `doi` | **Absent** — no DOI in VuFind v1 API response | `doi: ""` hardcoded | No fix; consider OAI-PMH for DOI enrichment |
| `urls` | May have multiple entries; `desc` often = URL itself | `[{url: "https://...", desc: "https://..."}]` | Use `urls[0].url`; desc provides no extra info |
| `languages` | ISO 639-2 (`"spa"`) not ISO 639-1 (`"es"`) | `"spa"` | Map 639-2 → 639-1 for display |

---

## 12. Exploitation Notes

| Opportunity | Field/Path | Value |
|------------|-----------|-------|
| **Abstract access** | `summary` | Currently NOT mapped — contains actual abstract text for many records. High-value for BM25F scoring. Add `field[]=summary` (already in FIELDS const) and map to `abstract` |
| **Author pollution fix** | `type=Title` search | Switch from `type=AllFields` to `type=Title` for topic queries, matching the scholarly-adapter pattern. Reduces noise from author-name matches |
| **DOI enrichment** | OAI-PMH | LA Referencia OAI-PMH not found at `vufind/OAI/Server` (404); check if OAI is exposed at another path — DOI recovery could enable Unpaywall linkage |
| **Facet-driven filtering** | `facet[]=format&facet[]=language` | Expose format (article/thesis/bookPart) and language facets to UI; suppressing `masterThesis`/`doctoralThesis` reduces noise for scholarly queries |
| **Secondary authors** | `authors.secondary` | Corporate and secondary authors available but not mapped; could increase author-match recall |
| **Language-scoped queries** | `filter[]=language:"eng"` | Language filter with `filter[]` param — 403 in probe (may need URL encoding: `filter%5B%5D=language%3A%22eng%22`) — needs further testing |

---

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score (×1.5) | **0** | No score returned in VuFind v1 API |
| A2 Query expressiveness | **2** | Field scoping via `type=` (Title/Author/Subject/AllFields); boolean via multi-word (AND implicit); explicit AND/OR rejected with 403 |
| A3 Sort & filter control | **2** | `sort=year` works; `facet[]=format/language/institution` returns facet counts; filter param blocks |
| A4 Pagination depth/cursor | **2** | Page-based, no observed depth cap, `resultCount` returned |
| A5 Batch/bulk | **1** | Single search endpoint only; no batch ID lookup or OAI-PMH confirmed |
| A6 Throughput & rate limits | **2** | Keyless; no rate-limit observed; sub-200 ms warm |
| A7 ID linkage | **1** | Only URLs (no DOI, no ORCID, no arXiv ID) |
| A8 Result-count accuracy | **2** | `resultCount` returned and stable; malformed dates exist but counts are accurate |
| A9 Semantic/NL mode (×1.5) | **1** | Lexical Solr only; NL query works but Solr tokenization, not semantic understanding |
| A10 Author-name pollution | **1** | `type=Title` param exists and works; but default `AllFields` pollutes; not automatic — requires adapter change |

```
Raw_A = (0×1.5 + 2 + 2 + 2 + 1 + 2 + 1 + 2 + 1×1.5 + 1) / 11
      = (0 + 2 + 2 + 2 + 1 + 2 + 1 + 2 + 1.5 + 1) / 11
      = 14.5 / 11
      = 1.32
```

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | **1** | Title + authors + date + URL; no DOI, no structured journal, no volume/issue/pages |
| B2 Abstract / full-text (×1.5) | **1** | `summary` field present but NOT currently mapped; coverage ~50% of records (Latin American repositories vary widely) |
| B3 Citation graph | **0** | None |
| B4 Discipline / subject tags | **1** | Subject breadcrumbs present; multilingual uncontrolled; facet available for format/language not subject |
| B5 OA / free-access (×1.5) | **2** | Whole corpus OA; `urls[0].url` for access; no OA flag field or best-OA URL distinction |
| B6 Rich media / IIIF | **0** | None |
| B7 Holdings / availability | **0** | None |
| B8 Record-quality signals | **1** | `id` encodes source institution prefix (e.g. `BR_`, `MX_`); no confidence score |

```
Raw_B = (1 + 1×1.5 + 0 + 1 + 2×1.5 + 0 + 0 + 1) / 9
      = (1 + 1.5 + 0 + 1 + 3 + 0 + 0 + 1) / 9
      = 7.5 / 9
      = 0.83
```

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | **2** | Appears stable; sub-200 ms warm; no outage data available |
| C2 Auth friction | **3** | Fully keyless; instant access |
| C3 Redistribution / TOS risk | **2** | Aggregates OA repositories; no explicit API TOS found; underlying records have varying licenses (member repos) — LOW risk for display |
| C4 Protocol / client maturity | **1** | VuFind v1 API; no dedicated docs for LA Referencia instance; some params return 403 unexpectedly |
| C5 Data hygiene | **1** | Malformed dates (e.g. `"2204"`); `authors.primary` object structure unusual; `summary` useful but inconsistent |

```
Raw_C = (2 + 3 + 2 + 1 + 1) / 5 = 9 / 5 = 1.80
```

### Rollup

```
Overall = 1.32 × 0.45 + 0.83 × 0.40 + 1.80 × 0.15
        = 0.594 + 0.332 + 0.270
        = 1.20
```

**TIER: C** (1.0–1.4 band)

---

## 14. Flags

| Field | Value |
|-------|-------|
| **TOS legal risk** | LOW — OA aggregator; underlying records from member OA repositories; no redistribution restriction found |
| **Currently quarantined?** | No |
| **Recommended action** | (1) Map `summary` → `abstract` (immediate win); (2) switch from `AllFields` to `type=Title` for topic queries to fix author pollution; (3) test `filter[]` URL-encoding for format/language gating; (4) investigate DOI recovery path |
| **Blocking issues** | No DOI in API response limits Unpaywall enrichment and dedup; explicit boolean operators return 403 |
