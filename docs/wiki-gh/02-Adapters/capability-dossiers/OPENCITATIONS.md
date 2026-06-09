---
tags: [adapter, capability, dossier, revival-candidate]
adapter_id: OPENCITATIONS
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/OPENCITATIONS.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# OPENCITATIONS — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | OPENCITATIONS |
| Official API name | OpenCitations Index REST API v2 |
| Provider | OpenCitations (University of Bologna, Italy) |
| Base URL | `https://api.opencitations.net/index/v2` |
| Protocol | REST-JSON (RAMOSE framework) |
| Docs URL | https://opencitations.net/index/api/v2 (redirects to https://api.opencitations.net/index/v2) |
| TOS URL | https://opencitations.net/about (CC0 data; CC-BY site text) |
| Pre-audit tier | unranked (not yet integrated) |
| Dossier date | 2026-06-09 |

**Integration role assessment:** ENRICHMENT layer only. This is a DOI-keyed citation graph lookup service. There is no free-text search — all endpoints require a DOI or OCI (Open Citation Identifier) as input. Value is in injecting citation counts and full reference/citing lists into cards that already have a DOI.

**Coverage note:** As of July 2024, the OpenCitations Index stores **2.01 billion unique citation links** between 91.38 million bibliographic resources, sourced primarily from Crossref (1.6B citations), OpenAlex, NIH, JALC, and others.

---

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard | Custom OpenCitations schema (OCI-based); aligns with SPAR Ontologies (CiTO) |
| Serialization | JSON (default) or CSV |
| Schema URL | https://api.opencitations.net/index/v2 |
| Schema version | v2 (stable) |

---

## 3. Complete Field/Tag Inventory

Live probe: `GET https://api.opencitations.net/index/v2/citations/doi:10.1038/nature12373`
Live probe: `GET https://api.opencitations.net/index/v2/citation-count/doi:10.1038/nature12373` → `{"count": "1514"}`
Live probe: `GET https://api.opencitations.net/index/v2/references/doi:10.1038/nature12373` → 30 references returned

### Citation/Reference record fields

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|----------------|---------|-----------------|
| `oci` | string | yes | Open Citation Identifier (e.g. `06803059652-06120344846`) | internal key |
| `citing` | string | yes | Citing entity: space-separated `omid:br/...` + `doi:...` + `openalex:...` + `pmid:...` | `citingDoi` (parse `doi:` prefix) |
| `cited` | string | yes | Cited entity: same multi-ID format | `citedDoi` (parse `doi:` prefix) |
| `creation` | string | yes | ISO date of the citing publication | `citingDate` |
| `timespan` | string | yes | ISO 8601 duration between citing and cited publications (e.g. `P7Y7M11D`) | `citationLag` |
| `journal_sc` | string | yes | Journal self-citation: `"yes"` or `"no"` | `isJournalSelfCite` |
| `author_sc` | string | yes | Author self-citation: `"yes"` or `"no"` | `isAuthorSelfCite` |

### Count-only endpoint fields

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|----------------|---------|-----------------|
| `count` | string | yes | Integer-as-string (e.g. `"1514"`) | `citedByCount` (parseInt) |

---

## 4. Query Semantics

**Lookup only — no free-text search.** All endpoints are keyed by persistent identifier:

```
GET /citation-count/{id}          → integer count of incoming citations
GET /reference-count/{id}         → integer count of outgoing references  
GET /citations/{id}               → full list of citing records
GET /references/{id}              → full list of cited records (what this paper cites)
GET /citation/{oci}               → single citation by OCI
GET /venue-citation-count/{issn}  → all citations to a journal
```

**ID format:** `doi:10.xxxx/xxxx` — prefix with `doi:`. Also accepts `omid:`, `pmid:`, `pmcid:`, `openalex:`, `orcid:`.

**Filter/sort params (available on `/citations/` and `/references/`):**
- `require=<field>` — only return rows where this field is non-empty
- `filter=<field>:<op><value>` — conditional: `filter=creation:>2020-01-01`
- `sort=asc(creation)` or `sort=desc(creation)` — sort by field
- `format=csv` or `format=json` — output format
- `json=array` or `json=dict` — JSON transform

**Author-name pollution:** Not applicable (lookup-only by DOI).

---

## 5. OA / Free-Access

Not applicable. OpenCitations provides citation graph data, not OA status or full-text access. The API itself is free (no key required for basic use), and all data is CC0. No OA-filter parameters exist because no article metadata is returned.

---

## 6. Images / Thumbnails / IIIF

Not applicable. No image data.

---

## 7. Discipline / Subject Tags

Not provided. OpenCitations returns citation network data only — no subject classifications.

---

## 8. Native Relevance & Scoring

Not applicable — lookup-only API. No relevance score. The `count` field provides citation impact signal (B3), which OpenCITE can use as a ranking boost.

---

## 9. Pagination

**Not documented with standard paging params.** For large citation lists (>1000 records), the API returns all records in a single response or may truncate. For bulk needs, use the full dataset dumps at https://download.opencitations.net.

**9b. Measured Latency (live probe, 3 warm calls, 2026-06-09):**

| Query type | Latency ms (×3) | Median |
|-----------|----------------|--------|
| citation-count DOI lookup | 2032, 892, 783 | 892 ms |
| references DOI lookup | 1176, 784, 973 | 973 ms |
| Cold first call (citation-count) | ~1834 ms | — |

**Notes:** Cold first call ~1.8 s; warm median ~900 ms for citation-count. References lookup (30 records) ~970 ms warm. At these latencies, parallel async enrichment is fine; synchronous blocking is borderline. Consider caching citation counts in Supabase with a weekly TTL.

---

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No — keyless for basic use |
| Key type | Optional "OpenCitations Access Token" via `Authorization` header for increased rate limit |
| Acquisition | Free registration at opencitations.net for token |
| Backend-safe? | Yes — token in header, or keyless |
| Anon limits | 180 requests/minute per IP |
| Keyed limits | Higher (not documented precisely) |
| Bulk alternative | Full dataset dumps at https://download.opencitations.net (CSV/N-Triple/Scholix) |
| Rate-limit code | HTTP 429 |
| Retry-After? | Not documented |

---

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `count` | Integer returned as string | `"count": "1514"` | Always `parseInt(r.count, 10)` |
| `citing` / `cited` | Multi-identifier string space-separated | `"omid:br/... doi:10.xxx openalex:W... pmid:..."` | Parse with regex `/doi:(\S+)/` to extract DOI; not all records have all ID types |
| `citing` / `cited` | Some records lack DOI (only omid) | `"omid:br/0605655327 doi:10.35848/..."` vs `"omid:br/062..."` only | Handle absent DOI gracefully |
| `journal_sc` / `author_sc` | String `"yes"`/`"no"` not boolean | `"journal_sc": "no"` | Convert to boolean: `=== "yes"` |
| `timespan` | ISO 8601 duration string, not milliseconds | `"P7Y7M11D"` | Parse with a duration library or extract years/months/days with regex |
| `creation` | ISO date string (YYYY-MM-DD) | `"2021-03-11"` | `new Date(r.creation).getFullYear()` for year |
| Large citation lists | `/citations/` can return thousands of records in one call | Paper with 1514 citations → large payload | Use `citation-count` for display; only call full list when user requests citation network |

---

## 12. Exploitation Notes

**Integration Opportunity: ENRICHMENT (not search)**

OpenCitations provides the open citation graph with 2B+ citation links under CC0 — zero legal friction. Primary use cases:

1. **B3 Citation count enrichment**: After search results are retrieved with DOIs, call `citation-count/{doi}` to inject `citedByCount`. At ~900 ms warm latency, run as parallel async enrichment. Cache in Supabase with 7-day TTL (citation counts change slowly).

2. **Reference list enrichment**: `references/{doi}` returns all papers cited by a given paper — enables "What does this cite?" sidebar feature. 30 references for nature12373 returned in <1 s.

3. **Self-citation filter**: `journal_sc` and `author_sc` flags enable filtering self-citations from counts — a quality signal for ranking (genuine impact vs. self-promotion).

4. **Citation lag signal**: `timespan` field gives the delay between citing and cited publication — can identify "hot" recently-cited old papers.

5. **Multi-ID crosswalk**: `citing`/`cited` fields contain openalex IDs, PMIDs, and OMID alongside DOI — free crosswalk for ID normalisation across sources.

**Under-exploited fields:**
- `journal_sc` / `author_sc`: Use to weight citation counts (penalise high self-citation rates)
- Full `citations[]` list: Enable co-citation network visualisation (papers frequently cited together)
- `oci` field: Stable cross-session identifier for citation edges in a graph DB

**Batch strategy:** For a search result set of N papers with DOIs, fire N parallel `citation-count` requests. At 180 req/min anon limit, a 20-result page costs <2 calls/s — well within limits. For nightly enrichment of the full catalog, use the dump.

---

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score | 0 | No score; lookup-only |
| A2 Query expressiveness | 0 | DOI lookup only; no search |
| A3 Sort & filter control | 1 | Filter + sort params exist on `/citations/` and `/references/` endpoints, but no search-level faceting |
| A4 Pagination depth / cursor | 0 | No pagination on lookup results; dump for bulk |
| A5 Batch / bulk endpoint | 2 | Full dataset dump available at download.opencitations.net; no batch HTTP endpoint |
| A6 Throughput & rate limits | 1 | 180 req/min anon; token upgrades this; ~3 req/s |
| A7 ID linkage / crosswalk | 2 | citing/cited fields carry DOI + OpenAlex ID + PMID + OMID — 3-4 namespaces |
| A8 Result-count accuracy | 1 | `citation-count` is exact integer; full citation list may truncate for very large sets |
| A9 Semantic / NL query mode | 0 | No search at all |
| A10 Author-name pollution control | 0 | N/A (no search) |

```
Raw_A = (0×1.5 + 0 + 1 + 0 + 2 + 1 + 2 + 1 + 0×1.5 + 0) / 11 = 7/11 = 0.64
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | 0 | No bibliographic metadata — only citation graph edges (OCI, citing, cited, dates) |
| B2 Abstract / full-text access | 0 | No abstract or full text |
| B3 Citation graph | 3 | Full in/out citation lists with DOIs; 2B+ citation links; self-citation flags; creation dates; OCI stable identifiers |
| B4 Discipline / field-tag granularity | 0 | No subject tags |
| B5 OA / free-access guarantee | 0 | No OA signal |
| B6 Rich media / IIIF | 0 | No images |
| B7 Holdings / availability | 0 | No holdings |
| B8 Record-quality signals | 2 | OCI as stable identifier; self-citation flags (journal_sc, author_sc); timespan; provenance tracked in dumps |

```
Raw_B = (0 + 0×1.5 + 3 + 0 + 0×1.5 + 0 + 0 + 2) / 9 = 5/9 = 0.56
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | 2 | ~900 ms warm median; keyless public API; hosted by University of Bologna; no published SLA |
| C2 Auth friction | 3 | Keyless; optional token for higher limits; backend-safe |
| C3 Redistribution / TOS risk | 3 | Data CC0 (public domain); zero legal risk; no attribution required |
| C4 Protocol / client maturity | 2 | RAMOSE REST v2; documented; stable; no OpenAPI spec or SDK |
| C5 Data hygiene & parseability | 2 | Consistent schema; known quirks (count as string; multi-ID citing/cited); predictable edge cases |

```
Raw_C = (2 + 3 + 3 + 2 + 2) / 5 = 12/5 = 2.40
```

### Rollup

```
Raw_A = 0.64
Raw_B = 0.56
Raw_C = 2.40

Overall = 0.64 × 0.45 + 0.56 × 0.40 + 2.40 × 0.15
        = 0.29 + 0.22 + 0.36
        = 0.87
```

**TIER = D** (0.87 < 1.0)

> **Important caveat:** Same structural issue as Unpaywall — the D-tier reflects zero search capability, not poor data quality. For citation-count enrichment specifically (B3), this is one of the best open sources available globally. The 2B+ CC0 citation links under 180 req/min free limit make this an easy integration win. Do NOT deprioritise — integrate as enrichment for B3.

---

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | NONE — CC0 data; no attribution required; completely open |
| Currently quarantined? | No (not yet integrated) |
| Recommended action | **INTEGRATE as ENRICHMENT** — fire `citation-count` for all DOI-bearing search results; cache 7 days; inject into card display and ranking boost |
| Blocking issues | None. Latency ~900 ms warm — ensure async parallel enrichment, not synchronous blocking. |
