---
tags: [adapter, capability, dossier]
adapter_id: ENA
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/ENA.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Capability Dossier: ENA (European Nucleotide Archive)

**Dossier date:** 2026-06-08  
**Quarantine status:** QUARANTINED (v0.38) — old adapter used wildcard-in-quotes syntax (HTTP 400)  
**Live status of the API:** ALIVE — correct query syntax confirmed, returns results

---

## 1. Identity

| Field | Value |
|---|---|
| Adapter ID | `ENA` |
| Adapter file (quarantined) | `src/adapters/extensions/ena.js` (removed; preserved in `docs/wiki/99-Archive/_quarantine/adapter-ena.md`) |
| Official API name | ENA Portal API |
| Provider | European Bioinformatics Institute (EBI / EMBL-EBI), EMBL, UK |
| Base URL | `https://www.ebi.ac.uk/ena/portal/api/` |
| Protocol | REST-JSON (keyless) |
| Docs URLs | https://ena-docs.readthedocs.io/en/latest/retrieval/programmatic-access/advanced-search.html · https://www.ebi.ac.uk/ena/portal/api/ (Swagger UI) · https://ena-docs.readthedocs.io/en/latest/retrieval/programmatic-access.html |
| TOS/license URL | https://www.ebi.ac.uk/about/terms-of-use |
| Pre-audit tier | D (quarantined) |
| Dossier date | 2026-06-08 |

---

## 2. Metadata standard & serialization

| Field | Value |
|---|---|
| Standard | Custom ENA/INSDC metadata model (study, sample, experiment, run, analysis) |
| Serialization | JSON (`format=json`) or TSV (`format=tsv`) |
| Schema URL | https://www.ebi.ac.uk/ena/portal/api/returnFields?result=study&format=json (dynamic field list) |
| Schema version | Unversioned; Swagger UI available |

---

## 3. Complete field/tag inventory

**Valid fields for `result=study`** (confirmed live via `/api/returnFields`):

| Field name | Type | Always present | Meaning | OpenCITE current mapping |
|---|---|---|---|---|
| `study_accession` | string | yes | ENA study accession (PRJNA/PRJEB/ERP prefix) | `id` + `journal` |
| `study_title` | string | yes | Study title | `title` |
| `study_description` | string | sometimes | Study description (long-form abstract) | `abstract` |
| `study_name` | string | sometimes | Short study name / alias | NOT mapped |
| `project_name` | string | sometimes | Project name (may differ from title) | NOT mapped |
| `first_public` | string | yes | First public release date (YYYY-MM-DD) | `year` (slice 0:4) |
| `last_updated` | string | sometimes | Last update date | NOT mapped |
| `center_name` | string | yes | Submitting institution/center name | `authors` (proxy) |
| `scientific_name` | string | sometimes | Organism scientific name | `subjects` |
| `tax_id` | string | sometimes | NCBI taxon ID | NOT mapped |
| `tax_division` | string | sometimes | Taxonomic division | NOT mapped |
| `tax_lineage` | string | sometimes | Full taxonomic lineage | NOT mapped |
| `keywords` | string | sometimes | Study keywords | NOT mapped |
| `status` | string | sometimes | Record status ("public") | NOT mapped |
| `geo_accession` | string | sometimes | GEO cross-reference | NOT mapped |
| `secondary_study_accession` | string | sometimes | Secondary accession (SRP/ERP prefix) | NOT mapped |
| `secondary_study_alias` | string | sometimes | Secondary alias | NOT mapped |
| `secondary_study_center_name` | string | sometimes | Secondary center name | NOT mapped |
| `parent_study_accession` | string | sometimes | Parent study (for umbrella projects) | NOT mapped |
| `datahub` | string | sometimes | ENA datahub | NOT mapped |
| `broker_name` | string | sometimes | Brokering service name | NOT mapped |
| `submission_tool` | string | sometimes | Submission tool used | NOT mapped |
| `tag` | string | sometimes | ENA tag | NOT mapped |
| `breed` | string | sometimes | Organism breed (livestock studies) | NOT mapped |
| `cultivar` | string | sometimes | Plant cultivar | NOT mapped |
| `isolate` | string | sometimes | Isolate name (microbial) | NOT mapped |
| `strain` | string | sometimes | Organism strain | NOT mapped |
| `description` | string | sometimes | Short description | NOT mapped |

**Other result types available** (not `study`): `experiment`, `run`, `analysis`, `sample`, `read_run`, `assembly`, `sequence`, `noncoding`, `wgs_set`, `tsa_set` — each has its own field set.

---

## 4. Query semantics

| Aspect | Detail |
|---|---|
| Free-text search | YES — `field="value"` syntax with quoted phrases; field=value pairs joined by OR/AND/NOT |
| Correct syntax | `study_title="SARS-CoV-2" OR study_description="SARS-CoV-2"` (quoted phrase, no wildcards) |
| Broken syntax (old adapter) | `study_title="*SARS-CoV-2*"` — wildcard INSIDE quotes → HTTP 400 |
| Wildcard syntax | `study_title=*influenza*` (wildcard WITHOUT quotes) → HTTP 400 (also invalid per docs) |
| Plain free-text | `influenza pandemic` (no field prefix) → HTTP 400 |
| Boolean operators | AND, OR, NOT (plus parentheses for grouping) |
| Fielded query | All returnFields can be used in query param; e.g. `tax_id=9606 AND study_description="cancer"` |
| Taxonomy search | `tax_eq(9606)` (exact) or `tax_tree(9606)` (subtree) — powerful for biology queries |
| Author-name pollution | `center_name` field is institution (not researcher); study searches don't index personal authors. Pollution structurally low via `study_title/study_description`. |
| Cross-lingual support | English predominantly; some multilingual descriptions |

---

## 5. OA / free-access

| Aspect | Detail |
|---|---|
| Whole-corpus OA | Effectively yes — ENA is a public nucleotide data repository; all public studies are freely accessible |
| OA flag field | No explicit flag; `status="public"` is the equivalent |
| Best-OA URL | Constructed: `https://www.ebi.ac.uk/ena/browser/view/{study_accession}` |
| OA-only filter | `status="public"` (default; only public records returned by default) |
| Recommended strategy | Treat all results as OA |

---

## 6. Images / thumbnails / IIIF

| Aspect | Detail |
|---|---|
| Has images | No image fields |
| Thumbnail | None |
| IIIF | None |
| Display strategy | Link to ENA browser URL only |

---

## 7. Discipline / subject tags

| Aspect | Detail |
|---|---|
| Vocabulary | NCBI taxonomy (tax_id, scientific_name, tax_lineage) + study keywords |
| Field path | `scientific_name`, `tax_id`, `keywords`, `tax_lineage` |
| Granularity | Taxonomic lineage provides depth; `keywords` is free-form |
| Example values | `scientific_name: "Severe acute respiratory syndrome coronavirus 2"` |
| Facet/filter param | `scientific_name="Homo sapiens"` or `tax_tree(9606)` |
| Usability for faceting | HIGH for biology/genomics (taxonomy is precise); LOW for humanities |

---

## 8. Native relevance & scoring

| Aspect | Detail |
|---|---|
| Score returned | NO — no `_score` field; results ordered by accession/date |
| Score field name | N/A |
| Score semantics | No scoring engine; field equality / phrase matching |
| Cross-query comparable | No |
| Default sort | By accession number (not relevance) |
| Sort params | Not documented for search endpoint |

---

## 9. Pagination

| Aspect | Detail |
|---|---|
| Mechanism | Offset (`limit`, `offset` params) |
| Param names | `limit`, `offset` |
| Max page size | 100,000 (empirically; docs state 100k window) |
| Stated depth cap | 100,000 items per query window |
| Empirical depth | 100k; count endpoint for total |
| Cursor expiry | No cursor |

**Count endpoint:** `https://www.ebi.ac.uk/ena/portal/api/count?result=study&query=...&format=json` returns `{"count":"N"}` — exact total confirmed.

**9b. Measured latency (live probe, median of 3):**

| Query type | Latency |
|---|---|
| Single-field quoted phrase ("SARS-CoV-2") | 1,033ms |
| Two-field OR ("influenza" OR desc="influenza pandemic") | 1,405ms |
| NL-style phrase ("protein folding mechanisms") | 556ms |
| **Median warm** | ~1–1.5s |

ENA responds fast (~1s) and consistently. Rate limit: 50 req/sec stated maximum; HTTP 429 on excess.

---

## 10. Rate limits & auth

| Aspect | Detail |
|---|---|
| Key required | No |
| Key type | Keyless |
| Acquisition speed | N/A |
| Backend-safe | Yes — no per-user auth |
| Anon limits | 50 requests/second; HTTP 429 on excess |
| Burst | Generous (50/s) |
| Rate limit code | HTTP 429 |
| Retry-After | Not documented |

---

## 11. Dirty-data / parsing hazards

| Field | Hazard | Example | Safe handling |
|---|---|---|---|
| Wrong query syntax | `field="*word*"` (wildcard in quotes) → 400; `free text` (no field) → 400 | `study_title="*influenza*"` | Always use `field="phrase"` or `field=value` syntax |
| `study_type` | NOT a valid returnField (returns 400 if requested) | Was in old adapter | Remove from fields list; use `keywords` instead |
| `study_description` | Often empty string or very long | `""` or 2000+ char | `stripHtml(it.study_description || "").slice(0, 500)` |
| `scientific_name` | Sometimes empty string | `""` | `filter(Boolean)` before use |
| `tax_id` | String not integer | `"2697049"` | Keep as string for URL construction |
| `first_public` | YYYY-MM-DD string | `"2021-01-17"` | `slice(0,4)` for year |
| `center_name` | Institutional name, not PI | `"Texas Dept of State Health Services"` | Map to `authors` as institution proxy; flag it's not an author |
| Response format | Top-level is flat JSON array (not object with `hits` key) | `[{study_accession:...},{...}]` | `Array.isArray(data) ? data : []` |
| `hasMore` | Old adapter used `items.length === pageSize` heuristic | | Use count endpoint: `GET /count?result=study&query=...` |

---

## 12. Exploitation notes

**Revival fix (minimal — 3 changes):**
1. Query rewrite: `study_title="${query}" OR study_description="${query}"` (quoted phrase, no wildcards)
2. Remove `study_type` from fields list (invalid field → 400)
3. Add real total via count endpoint (`/api/count?result=study&query=...`)

**Under-exploited fields:**
- `keywords` — study keywords for subject tagging
- `scientific_name` + `tax_lineage` — taxonomic classification; unique biology signal
- `tax_id` — links to NCBI taxonomy for hierarchy queries
- `geo_accession` — GEO cross-reference (enables GEO enrichment)
- `secondary_study_accession` — dedup / crosswalk signal
- Taxonomy search: `tax_tree(9606)` syntax retrieves all human studies — powerful for "find all studies of organism X"

**Query strategy upgrade:**
- For topic queries: `study_title="${query}" OR study_description="${query}"`
- For organism queries: `tax_tree(TAXON_ID) AND study_description="disease"`
- Results lack native relevance score; RRF with BM25F over title+description would improve ranking

**Batch opportunity:** ENA supports bulk downloads of FASTA/FASTQ/metadata via separate download endpoints; not relevant for citation use.

---

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|---|---|---|
| A1 Native relevance score (×1.5) | 0 | No score; accession-order by default |
| A2 Query expressiveness | 2 | Multi-field field="phrase" + AND/OR/NOT; taxonomy tree search; no nested boolean |
| A3 Sort & filter control | 1 | Field-level filtering only; no facet counts; no sort by relevance |
| A4 Pagination depth | 2 | Offset, 100k cap; count endpoint |
| A5 Batch / bulk | 1 | Single result type per query; no bulk metadata harvest for our use |
| A6 Throughput & rate limits | 2 | ~1s median; 50 req/sec limit; generous |
| A7 ID linkage | 2 | ENA accession + NCBI taxon ID + GEO cross-ref; no DOI for studies |
| A8 Result-count accuracy | 3 | Exact count endpoint available and confirmed |
| A9 Semantic/NL mode (×1.5) | 1 | Lexical phrase matching only; NL-tolerant (phrases work) |
| A10 Author pollution control | 2 | `center_name` = institution not personal author; study_title/description fields are topic-scoped; no personal author field to pollute |

```
Raw_A = (0×1.5 + 2 + 1 + 2 + 1 + 2 + 2 + 3 + 1×1.5 + 2) / 11
      = (0 + 2 + 1 + 2 + 1 + 2 + 2 + 3 + 1.5 + 2) / 11
      = 16.5 / 11
      = 1.50
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|---|---|---|
| B1 Core bibliographic completeness | 1 | Title + institution + date + accession; NO personal authors, NO DOI, NO abstract consistently |
| B2 Abstract/full-text (×1.5) | 1 | `study_description` present but sparse/empty for many studies; <40% rich abstracts |
| B3 Citation graph | 0 | None |
| B4 Discipline/field-tag granularity | 2 | NCBI taxonomy (precise, hierarchical via tax_tree); keywords field; study_type deprecated |
| B5 OA/free-access (×1.5) | 2 | All public records accessible; no explicit OA flag but public=OA; URL always constructable |
| B6 Rich media / IIIF | 0 | No images |
| B7 Holdings / availability | 1 | ENA browser URL; `status` field |
| B8 Record-quality signals | 1 | `status="public"` + accession format as quality signal |

```
Raw_B = (1 + 1×1.5 + 0 + 2 + 2×1.5 + 0 + 1 + 1) / 9
      = (1 + 1.5 + 0 + 2 + 3 + 0 + 1 + 1) / 9
      = 9.5 / 9
      = 1.06
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|---|---|---|
| C1 Reliability & responsiveness | 2 | ~1s median; EMBL-EBI is a stable infrastructure; no SLA stated but track record is good |
| C2 Auth friction | 3 | Keyless; backend-safe |
| C3 Redistribution/TOS risk | 2 | EMBL-EBI: "no additional restrictions beyond original data owners"; scientific data; community attribution expected → LOW |
| C4 Protocol/client maturity | 2 | REST JSON documented + Swagger; `returnFields` endpoint for discovery; no OpenAPI formally |
| C5 Data hygiene | 2 | Well-structured but `study_type` is invalid returnField (old trap); `study_description` inconsistently populated; otherwise clean |

```
Raw_C = (2 + 3 + 2 + 2 + 2) / 5 = 11 / 5 = 2.20
```

### Rollup

```
Overall = 1.50 × 0.45 + 1.06 × 0.40 + 2.20 × 0.15
        = 0.675 + 0.424 + 0.330
        = 1.43
```

**TIER = C** (Peripheral; 1.0–1.4 → 1.43 is at threshold; assign **C**)

---

## 14. Flags

| Flag | Value |
|---|---|
| TOS legal risk | LOW — EMBL-EBI open data; scientific attribution expected; no redistribution block |
| Currently quarantined | YES — removed in v0.38 |
| Recommended action | **REVIVE** — The API is healthy and fast (~1s). The quarantine reason was a trivial query syntax bug (wildcard-in-quotes → 400). Fix requires 3 lines: rewrite query string, remove invalid `study_type` field, add count endpoint. Content is niche (genomic studies) but unique corpus not covered elsewhere. Revive as TIER C adapter with `serverSafe:true`, but ensure it only fires for biology/genomics queries or when the user has genomics interest. |
| Blocking issues | None — purely a syntax fix. Estimated effort: 30 minutes. |
