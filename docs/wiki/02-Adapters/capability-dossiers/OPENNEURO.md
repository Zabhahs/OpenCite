---
tags: [adapter, capability, dossier]
adapter_id: OPENNEURO
---

# Capability Dossier: OpenNeuro

**Dossier date:** 2026-06-08  
**Quarantine status:** QUARANTINED (v0.38) — old adapter fetched only newest 100 datasets + client-side substring filter = 0 real results  
**Live status of the API:** ALIVE — GraphQL endpoint responds; `datasets()` and `advancedSearch()` work

---

## 1. Identity

| Field | Value |
|---|---|
| Adapter ID | `OPENNEURO` |
| Adapter file (quarantined) | `src/adapters/extensions/openNeuro.js` (removed; preserved in `docs/wiki/99-Archive/_quarantine/adapter-openneuro.md`) |
| Official API name | OpenNeuro GraphQL API |
| Provider | OpenNeuro (Stanford University / OpenNeuro.org), supported by NIMH/NIH |
| Base URL | `https://openneuro.org/crn/graphql` |
| Protocol | GraphQL (POST) — Apollo Server 5.x |
| Docs URLs | https://docs.openneuro.org/user_guide.html · https://docs.openneuro.org/_sources/faq.md.txt · https://elifesciences.org/articles/71774 |
| TOS/license URL | All datasets published under CC0 (public domain dedication) per OpenNeuro policy |
| Pre-audit tier | D (quarantined) |
| Dossier date | 2026-06-08 |

---

## 2. Metadata standard & serialization

| Field | Value |
|---|---|
| Standard | BIDS (Brain Imaging Data Structure) metadata + OpenNeuro custom schema |
| Serialization | GraphQL JSON response |
| Schema URL | Introspectable via `__schema` query at `https://openneuro.org/crn/graphql` |
| Schema version | Apollo Server 5.5.0 (confirmed from stacktrace); GraphQL 16.8.1 |

---

## 3. Complete field/tag inventory

**Dataset node** (confirmed live via GraphQL introspection):

| Field path | Type | Always present | Meaning | OpenCITE current mapping |
|---|---|---|---|---|
| `dataset.id` | string (non-null) | yes | Dataset ID (e.g. "ds000001") | `id` |
| `dataset.created` | DateTime (non-null) | yes | Creation timestamp | `year` |
| `dataset.publishDate` | DateTime | sometimes | Public publish date | `year` (better source) |
| `dataset.public` | boolean | sometimes | Whether publicly visible | NOT mapped |
| `dataset.name` | string | sometimes | Display name | `title` (fallback) |
| `dataset.latestSnapshot` | Snapshot (non-null) | yes | Latest published version | (parent of below) |
| `latestSnapshot.tag` | string (non-null) | yes | Version tag (semver-like) | NOT mapped |
| `latestSnapshot.description.Name` | string | yes | BIDS dataset name | `title` |
| `latestSnapshot.description.Authors` | array | sometimes | Author list | `authors` |
| `latestSnapshot.description.DatasetDOI` | string | sometimes | DOI assigned to dataset | `doi` |
| `latestSnapshot.description.Acknowledgements` | string | sometimes | Acknowledgements text | `abstract` (fallback) |
| `latestSnapshot.summary.modalities` | array | yes | Imaging modalities (e.g. ["mri", "eeg"]) | `journal` (repurposed) |
| `latestSnapshot.summary.tasks` | array | sometimes | Task names in study | `subjects` |
| `latestSnapshot.summary.primaryModality` | string | sometimes | Primary modality | NOT mapped |
| `latestSnapshot.summary.subjects` | array | sometimes | Subject IDs | NOT mapped |
| `latestSnapshot.summary.sessions` | array | sometimes | Session labels | NOT mapped |
| `latestSnapshot.summary.size` | BigInt (non-null) | yes | Dataset size in bytes | NOT mapped |
| `latestSnapshot.summary.totalFiles` | Int (non-null) | yes | Total file count | NOT mapped |
| `latestSnapshot.summary.dataProcessed` | boolean | sometimes | Whether data is processed | NOT mapped |
| `latestSnapshot.readme` | string | sometimes | README text (rich description) | NOT mapped (high value!) |
| `latestSnapshot.size` | BigInt | yes | Snapshot size | NOT mapped |
| `dataset.analytics.views` | int | sometimes | View count | NOT mapped |
| `dataset.analytics.downloads` | int | sometimes | Download count | NOT mapped |
| `dataset.metadata.species` | string | sometimes | Species (from Metadata type) | NOT mapped |
| `dataset.metadata.modalities` | array | sometimes | Modalities list | NOT mapped |
| `dataset.metadata.studyDomain` | string | sometimes | Study domain | NOT mapped |
| `dataset.metadata.studyDesign` | string | sometimes | Study design | NOT mapped |
| `dataset.metadata.seniorAuthor` | string | sometimes | Senior author name | NOT mapped |
| `dataset.metadata.associatedPaperDOI` | string | sometimes | DOI of associated paper | NOT mapped (very high value!) |
| `dataset.metadata.dxStatus` | string | sometimes | Diagnosis status | NOT mapped |
| `dataset.metadata.openneuroPaperDOI` | string | sometimes | OpenNeuro paper DOI | NOT mapped |
| `dataset.metadata.tasksCompleted` | array | sometimes | Completed tasks list | NOT mapped |
| `dataset.metadata.ages` | array | sometimes | Age range of subjects | NOT mapped |
| `dataset.metadata.grantFunderName` | string | sometimes | Grant funder | NOT mapped |
| `dataset.metadata.grantIdentifier` | string | sometimes | Grant ID | NOT mapped |
| `latestSnapshot.contributors` | array | sometimes | Contributor list | NOT mapped |
| `latestSnapshot.related` | array | sometimes | Related datasets | NOT mapped |
| `latestSnapshot.issuesStatus` | ValidationIssueStatus | sometimes | BIDS validation status | NOT mapped |

**DatasetSearchInput** (for `advancedSearch` query — confirmed via introspection):
`ageRange`, `authors`, `bidsDatasetType`, `bodyParts`, `brainInitiative`, `dateRange`, `diagnosis`, `keywords`, `modality`, `publicOnly`, `scannerManufacturers`, `scannerManufacturersModelNames`, `sex`, `sortBy`, `species`, `studyDomains`, `studyStructure`, `subjectCountRange`, `tasks`, `tracerNames`, `tracerRadionuclides`, `userId`

---

## 4. Query semantics

| Aspect | Detail |
|---|---|
| Free-text search | PARTIAL — `search(q: "text", first: N)` field exists in schema but returns 0 results in live testing (possible Elasticsearch backend issue or internal indexing); `advancedSearch(query: DatasetSearchInput)` returns 0 results for most structured queries tested (modality filter returned 0) |
| Working query | `datasets(first: N, orderBy: {created: descending})` — retrieves all public datasets in date order, cursor-pageable |
| `advancedSearch` filters | DatasetSearchInput supports: modality, keywords (array), species, ageRange, sex, diagnosis, tasks, dateRange, studyDomains, brainInitiative, etc. — structured multi-facet search |
| `search(q:)` | Text search query — exists in schema, confirmed 0 results for "autism fMRI" (backend may be unindexed or restricted) |
| Boolean operators | GraphQL — field-level structured filters; no free-text boolean |
| Author-name pollution | `advancedSearch(query:{authors:[...]})` exists; default topic query does NOT include authors → pollution structurally impossible for modality/keyword queries |
| Cross-lingual support | English only (BIDS standard) |

**Note:** The old adapter's approach (fetch 100 newest + client filter) was completely wrong. The correct approach is `datasets()` with cursor pagination + optional `advancedSearch()` filters. The `search(q:)` endpoint may be functional for some queries — needs further investigation in a revival sprint.

---

## 5. OA / free-access

| Aspect | Detail |
|---|---|
| Whole-corpus OA | YES — all published datasets are CC0 (public domain) |
| OA flag field | `dataset.public = true` |
| Best-OA URL | `https://openneuro.org/datasets/{dataset.id}` |
| OA-only filter | `datasets(filterBy: {public: true})` (implied default for public API) |
| Flag coverage | 100% — CC0 is mandatory for publication on OpenNeuro |
| License quote | "All newly published datasets are released under CC0... datasets must become publicly available under CC0 upon publishing or after a grace period of 36 months" |

---

## 6. Images / thumbnails / IIIF

| Aspect | Detail |
|---|---|
| Has images | No thumbnail/image fields in GraphQL schema |
| Thumbnail | None |
| IIIF | None |
| Display strategy | Link to `https://openneuro.org/datasets/{id}` page |

---

## 7. Discipline / subject tags

| Aspect | Detail |
|---|---|
| Vocabulary | BIDS modality taxonomy + custom OpenNeuro tags |
| Field path | `latestSnapshot.summary.modalities` (array: "mri", "eeg", "meg", "pet", etc.) |
| Granularity | Modality (top-level) + tasks (paradigm names) + diagnosis + species |
| Example values | `modalities: ["mri"]`, `tasks: ["rest", "fingerfootlips"]` |
| Facet/filter param | `advancedSearch(query: {modality: "MRI", tasks: ["rest"]})` |
| Usability for faceting | HIGH for neuroimaging (modality is precise + standardized) |

---

## 8. Native relevance & scoring

| Aspect | Detail |
|---|---|
| Score returned | NO — no score field; datasets ordered by creation date by default |
| Score field name | N/A |
| Sort options | `orderBy: {created: descending/ascending}` available on `datasets()` |
| Cross-query comparable | No |
| Default sort | Created date (descending) |

**Proxy signals for ranking:**
- `analytics.views` and `analytics.downloads` confirmed present — could proxy relevance/popularity
- `metadata.associatedPaperDOI` — datasets with linked publications are likely higher quality

---

## 9. Pagination

| Aspect | Detail |
|---|---|
| Mechanism | Cursor (Relay-style `edges/pageInfo`) |
| Params | `first: N`, `after: cursor` |
| Max page size | Not stated; 100 reasonable |
| Depth cap | None confirmed — cursor pagination allows full corpus traversal |
| Cursor expiry | Unknown |

**9b. Measured latency (live probe):**

| Query type | Latency |
|---|---|
| GraphQL schema introspection | 390ms |
| `datasets(first:3)` | 140ms |
| `advancedSearch(query:{modality:"MRI"}, first:5)` | 363–666ms |
| **Median warm** | ~350ms |

OpenNeuro GraphQL is fast (~350ms). No rate limit headers observed.

---

## 10. Rate limits & auth

| Aspect | Detail |
|---|---|
| Key required | No — public API, keyless |
| Key type | N/A |
| Acquisition speed | N/A |
| Backend-safe | Yes — no per-user auth for public dataset queries |
| Rate limits | Not documented; no rate-limit headers observed in probes |
| Rate limit code | Unknown |

---

## 11. Dirty-data / parsing hazards

| Field | Hazard | Example | Safe handling |
|---|---|---|---|
| `description.Authors` | May be null or empty array | `null` or `[]` | `desc.Authors || []` |
| `description.DatasetDOI` | May be null or empty string | `""` or `null` | `desc.DatasetDOI || ""` |
| `description.Acknowledgements` | Long multi-paragraph string; used as abstract fallback | 500+ chars | `slice(0, 500)` |
| `summary.modalities` | Array; sometimes `["mri"]` (lowercase) | `["mri", "eeg"]` | `.join(", ")` for display |
| `dataset.created` | ISO DateTime string | `"2016-01-21T..."` | `String(ds.created).match(/\d{4}/)?.[0]` |
| `search(q:)` | Returns 0 results (confirmed for "autism fMRI") | `{edges: []}` | Fallback to `datasets()` if search returns empty |
| `advancedSearch` with wrong input type | `query` expects DatasetSearchInput object, not string | `Error: Expected DatasetSearchInput!` | Always pass object: `{modality: "MRI"}` |
| `latestSnapshot.readme` | May be null | `null` | `snap.readme || ""` |
| `metadata.associatedPaperDOI` | May be null; separate query needed | `null` | Optional enrichment field |

---

## 12. Exploitation notes

**Revival fix (significant but achievable):**

The old adapter was fundamentally broken — fetching 100 newest datasets and client-filtering is not search. A correct revival requires:

1. **Primary search path:** `datasets(first: N, after: cursor)` returns all public datasets in date order. For topic queries, iterate cursor-paginated results and score locally with BM25F against `description.Name + readme + summary.tasks`.
2. **Structured search path:** `advancedSearch(query: {keywords: [...], modality: "MRI"})` for structured queries — investigate why it returned 0 in live tests (schema has `keywords: LIST` input field).
3. **Text search path:** `search(q: "query text", first: N)` — investigate why it returned 0; may be disabled or require different query format.
4. **Rich description:** Fetch `latestSnapshot.readme` as the abstract — far more informative than `Acknowledgements`.
5. **Associated paper DOI:** `dataset.metadata.associatedPaperDOI` is a high-value crosswalk to link neuroimaging datasets to their companion publications.

**Under-exploited fields:**
- `metadata.associatedPaperDOI` — crosswalk to PubMed/Crossref for the companion paper (extremely valuable)
- `latestSnapshot.readme` — structured markdown description (best abstract source)
- `analytics.views` + `analytics.downloads` — popularity proxy for ranking
- `metadata.studyDomain` + `metadata.studyDesign` — study type classification
- `dataset.metadata.ages` — participant age range
- `dataset.metadata.grantFunderName` + `grantIdentifier` — funding provenance

**Batch/harvest opportunity:** Full corpus cursor pagination with no depth cap means the entire ~1000+ dataset corpus can be harvested in a single pagination sweep (~10 requests at 100/page) for local indexing.

**Corpus size:** ~1000+ public BIDS datasets (confirmed from `datasets(first:3)` returning results; total count not confirmed via introspection but OpenNeuro.org reports ~4000+ datasets as of 2024).

---

## 13. Scores

**Note:** Scored on TRUE current API capability (using `datasets()` pagination + `advancedSearch()` + `search()`), NOT the broken old adapter.

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|---|---|---|
| A1 Native relevance score (×1.5) | 0 | No score field; date-order only |
| A2 Query expressiveness | 2 | `advancedSearch` offers structured multi-facet (modality, keywords, species, sex, ageRange, tasks etc.); text `search(q:)` exists but 0 results in probes |
| A3 Sort & filter control | 2 | `orderBy` (date); `advancedSearch` structured filters (modality, tasks, diagnosis, etc.) |
| A4 Pagination depth | 3 | Cursor/Relay pagination; no depth cap documented; full corpus traversable |
| A5 Batch / bulk | 2 | Cursor pagination enables full harvest (~4000 datasets) |
| A6 Throughput & rate limits | 2 | ~350ms median; no stated rate limits; reliable |
| A7 ID linkage | 2 | DatasetDOI + metadata.associatedPaperDOI (links to companion paper) |
| A8 Result-count accuracy | 1 | No total count field confirmed; `pageInfo.hasNextPage` only |
| A9 Semantic/NL mode (×1.5) | 1 | `search(q:)` exists (text) but 0 results empirically; `advancedSearch` is structured, not NL |
| A10 Author pollution control | 3 | Authors in separate `DatasetSearchInput.authors` field; default topic/modality queries don't search author names → structurally impossible |

```
Raw_A = (0×1.5 + 2 + 2 + 3 + 2 + 2 + 2 + 1 + 1×1.5 + 3) / 11
      = (0 + 2 + 2 + 3 + 2 + 2 + 2 + 1 + 1.5 + 3) / 11
      = 18.5 / 11
      = 1.68
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|---|---|---|
| B1 Core bibliographic completeness | 2 | Dataset name + authors + DOI + date + modalities; no journal/volume/issue (not applicable to datasets) |
| B2 Abstract/full-text (×1.5) | 1 | `readme` field is the best abstract source but requires explicit request; `Acknowledgements` is poor proxy; <40% have structured abstracts |
| B3 Citation graph | 0 | No citation data |
| B4 Discipline/field-tag granularity | 2 | BIDS modalities (standardized), tasks, species, diagnosis, studyDomain — domain-specific but precise |
| B5 OA/free-access (×1.5) | 3 | 100% CC0; all public datasets open; dataset DOI always constructable |
| B6 Rich media / IIIF | 0 | No images/thumbnails |
| B7 Holdings / availability | 1 | `dataset.public` flag + OpenNeuro URL |
| B8 Record-quality signals | 2 | `issuesStatus` (BIDS validation) + `analytics` (views/downloads) + `metadata.dataProcessed` |

```
Raw_B = (2 + 1×1.5 + 0 + 2 + 3×1.5 + 0 + 1 + 2) / 9
      = (2 + 1.5 + 0 + 2 + 4.5 + 0 + 1 + 2) / 9
      = 13.0 / 9
      = 1.44
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|---|---|---|
| C1 Reliability & responsiveness | 2 | ~350ms; Apollo Server backed; Stanford/NIH infrastructure; no SLA but stable |
| C2 Auth friction | 3 | Keyless; no per-user auth for public queries |
| C3 Redistribution/TOS risk | 3 | CC0 public domain; "metadata indexers may combine OpenNeuro metadata" explicitly permitted → NONE |
| C4 Protocol/client maturity | 3 | GraphQL + Apollo Server; introspectable schema; versioned (Apollo Server 5.x); `__schema` introspection works |
| C5 Data hygiene | 2 | Well-typed GraphQL; null fields predictable; BIDS-standardized structure; `search(q:)` returning 0 is a known issue |

```
Raw_C = (2 + 3 + 3 + 3 + 2) / 5 = 13 / 5 = 2.60
```

### Rollup

```
Overall = 1.68 × 0.45 + 1.44 × 0.40 + 2.60 × 0.15
        = 0.756 + 0.576 + 0.390
        = 1.72
```

**TIER = B** (Complementary; 1.5–1.9)

---

## 14. Flags

| Flag | Value |
|---|---|
| TOS legal risk | NONE — CC0; redistribution explicitly permitted; OpenNeuro docs explicitly welcome metadata indexers |
| Currently quarantined | YES — removed in v0.38 |
| Recommended action | **REVIVE** — API is alive, fast (~350ms), CC0, unique neuroimaging corpus (~4000 BIDS datasets). Quarantine reason was a completely broken implementation (fetch 100 + client filter). Revival requires: (1) use `datasets(first:N, after:cursor)` for paginated retrieval, (2) local BM25F scoring over description.Name + readme + tasks, (3) fetch `readme` as abstract, (4) expose `metadata.associatedPaperDOI` as a companion-paper crosswalk. Investigate `search(q:)` returning 0 — may need POST body format adjustment. Estimated effort: 2–3 hours. |
| Blocking issues | `search(q:)` returned 0 results in live testing — root cause unclear (backend indexing issue or query format). Fallback: `datasets()` cursor pagination + local text scoring works but is O(corpus) not O(results). Acceptable given small corpus (~4000). |
