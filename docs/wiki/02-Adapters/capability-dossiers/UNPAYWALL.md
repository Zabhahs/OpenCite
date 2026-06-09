---
tags: [adapter, capability, dossier, revival-candidate]
adapter_id: UNPAYWALL
---

# UNPAYWALL — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | UNPAYWALL |
| Official API name | Unpaywall REST API v2 |
| Provider | Our Research (nonprofit) |
| Base URL | `https://api.unpaywall.org/v2/{doi}?email={email}` |
| Protocol | REST-JSON |
| Docs URL | https://unpaywall.org/products/api |
| TOS URL | https://unpaywall.org/legal/terms-of-service |
| Pre-audit tier | unranked (not yet integrated) |
| Dossier date | 2026-06-09 |

**Integration role assessment:** ENRICHMENT layer only. This is a DOI-keyed lookup service — there is no free-text search endpoint. Primary value is guaranteed OA best-URL injection for records already retrieved from other sources (OpenAlex, Crossref, EPMC, etc.).

---

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard | Custom Unpaywall schema (not DC/MARC/schema.org) |
| Serialization | JSON |
| Schema URL | https://unpaywall.org/data-format |
| Schema version | data_standard: 2 (field in response) |

---

## 3. Complete Field/Tag Inventory

Live probe: `GET https://api.unpaywall.org/v2/10.1038/nature12373?email=<your-email>`

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|----------------|---------|-----------------|
| `doi` | string | yes | Normalised lowercase DOI | `doi` |
| `doi_url` | string | yes | `https://doi.org/{doi}` | `url` |
| `title` | string | yes | Article title | `title` |
| `genre` | string | yes | Work type: `journal-article`, `book-section`, etc. | `type` |
| `is_oa` | boolean | yes | Top-level OA status | `isOA` |
| `oa_status` | string | yes | `gold`, `green`, `hybrid`, `bronze`, `closed` | `oaStatus` |
| `published_date` | string/null | sometimes | ISO date of publication | `year` |
| `year` | integer | yes | Publication year | `year` |
| `publisher` | string/null | sometimes | Publisher name | `publisher` |
| `journal_name` | string/null | sometimes | Journal name | `source` |
| `journal_issn_l` | string/null | sometimes | Linking ISSN | `issn` |
| `journal_issns` | string/null | sometimes | Comma-separated ISSNs | internal |
| `journal_is_oa` | boolean | yes | Whole journal is OA? | internal |
| `journal_is_in_doaj` | boolean | yes | Journal indexed in DOAJ? | internal |
| `has_repository_copy` | boolean | yes | Any repo copy exists? | `hasRepositoryCopy` |
| `data_standard` | integer | yes | Schema version (2) | internal |
| `updated` | string | yes | Last updated timestamp | internal |
| `is_paratext` | boolean | yes | Editorial/supplementary item? | internal |
| `best_oa_location` | object/null | if OA | Single best OA location (see sub-fields) | `pdfUrl` / `landingUrl` |
| `best_oa_location.url` | string | if OA | Best free URL (PDF or landing) | `pdfUrl` |
| `best_oa_location.url_for_pdf` | string/null | if OA+PDF | Direct PDF URL | `pdfUrl` |
| `best_oa_location.url_for_landing_page` | string | if OA | Landing page URL | `url` |
| `best_oa_location.host_type` | string | if OA | `publisher` or `repository` | `hostType` |
| `best_oa_location.version` | string | if OA | `publishedVersion`, `acceptedVersion`, `submittedVersion` | `version` |
| `best_oa_location.license` | string/null | sometimes | License identifier (e.g. `cc-by`) | `license` |
| `best_oa_location.oa_date` | string/null | sometimes | Date OA access became available | internal |
| `best_oa_location.pmh_id` | string/null | sometimes | OAI-PMH record ID | internal |
| `best_oa_location.endpoint_id` | string/null | sometimes | Internal Unpaywall endpoint ID | internal |
| `best_oa_location.repository_institution` | string/null | sometimes | Institution hosting the repo | `institution` |
| `best_oa_location.evidence` | string | yes (deprecated) | Evidence type (deprecated field, value = "deprecated") | skip |
| `best_oa_location.updated` | string | yes (deprecated) | (deprecated field) | skip |
| `best_oa_location.is_best` | boolean | yes | Always true for best_oa_location | skip |
| `first_oa_location` | object/null | if OA | Chronologically first OA location (same sub-schema) | — |
| `oa_locations` | array | yes | All OA locations (array of location objects, same sub-schema) | enrichment |
| `oa_locations_embargoed` | array | yes | Embargoed future OA locations | internal |
| `z_authors` | array | sometimes | Author objects | `authors` |
| `z_authors[].raw_author_name` | string | yes | Raw author name string | `author.name` |
| `z_authors[].author_position` | string | yes | `first`, `middle`, `last` | internal |
| `z_authors[].is_corresponding` | boolean | yes | Corresponding author flag | internal |
| `z_authors[].raw_affiliation_strings` | array | sometimes | Raw affiliation strings | `author.affiliation` |

> Note: `z_authors` is not present on all records and the field is considered "unofficial" (the `z_` prefix signals experimental). Treat as optional enrichment only.

---

## 4. Query Semantics

**Lookup only — no free-text search.** The API accepts exactly one DOI per request:

```
GET https://api.unpaywall.org/v2/{doi}?email={your_email}
```

- `doi`: URL-encoded DOI string (e.g. `10.1038/nature12373`)
- `email`: Required. Must be a real, working email. Using placeholder addresses (e.g. `test@example.com`) returns HTTP 422. Rate limit tier tied to email identity.
- No search, no boolean, no field scoping, no author filtering. **Author-name pollution: not applicable** (lookup-only, returns exactly one record by DOI).

**Batch endpoint:** No official batch HTTP endpoint. For bulk enrichment, Unpaywall recommends downloading a full data snapshot (CC-BY licensed, updated quarterly, ~100 GB compressed) from `https://unpaywall.org/products/snapshot`.

---

## 5. OA / Free-Access

| Field | Value |
|-------|-------|
| Whole-corpus OA? | No — covers all scholarly DOIs, OA and closed |
| OA flag field | `is_oa` (boolean) |
| OA status granularity | `oa_status`: `gold`, `green`, `hybrid`, `bronze`, `closed` |
| Best-OA URL field | `best_oa_location.url_for_pdf` (PDF) and `best_oa_location.url_for_landing_page` |
| OA-only filter param | None — lookup by DOI only; filter on `is_oa == true` client-side |
| Flag coverage | ~95%+ accuracy; considered authoritative in the field |
| Recommended strategy | Call per-DOI enrichment AFTER other sources return a DOI; inject `best_oa_location.url` into the result card as free-access link |

---

## 6. Images / Thumbnails / IIIF

Not applicable. Unpaywall does not provide images, thumbnails, or IIIF manifests.

---

## 7. Discipline / Subject Tags

Not provided. Unpaywall returns no subject classifications, MeSH terms, or controlled vocabulary tags.

---

## 8. Native Relevance & Scoring

Not applicable — lookup-only API. No relevance score, no ranking. Returns exactly one record per DOI.

---

## 9. Pagination

**Not applicable** — single-record DOI lookup. No pagination needed or provided.

**9b. Measured Latency (live probe, 3 warm calls, 2026-06-09):**

| Query type | Latency ms (×3) | Median |
|-----------|----------------|--------|
| DOI lookup (keyword: N/A) | 361, 272, 262 | 272 ms |
| Multi-DOI (N/A — no batch) | — | — |
| NL query (N/A — no search) | — | — |

**Notes:** Sub-300 ms median for DOI lookup. Excellent for synchronous per-record enrichment. Cold calls are ~100–200 ms slower. No extra resolve round-trips needed.

---

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No API key; email address required in every request |
| Key type | `?email=` query parameter (identifies caller, not an auth token) |
| Acquisition | Instantaneous — just include a valid email; no registration |
| Backend-safe? | Yes — email is in the query string, no per-user OAuth |
| Anon limits | HTTP 422 if no valid email |
| Identified limits | 100,000 requests/day (documented); no per-minute cap stated |
| Burst | Not documented; empirically responsive |
| Rate-limit code | HTTP 422 for missing/invalid email; HTTP 429 for quota exceeded |
| Retry-After? | Not documented |

**Large-scale:** For bulk needs (>100k/day), use the quarterly database snapshot download. Per-query API not designed for millions of daily lookups.

---

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `z_authors` | Field absent on ~30-40% of records | `{}` has no `z_authors` key | Check with `hasOwnProperty` or optional chaining |
| `best_oa_location` | Null when `is_oa == false` | `"best_oa_location": null` | Always null-check before accessing sub-fields |
| `best_oa_location.url_for_pdf` | Null even when location exists (landing page only) | HTML-only article | Fall back to `url_for_landing_page` |
| `best_oa_location.evidence` | String "deprecated" since 2023 API update | `"evidence": "deprecated"` | Ignore field; do not display |
| `best_oa_location.updated` | String "deprecated" since 2023 API update | `"updated": "deprecated"` | Ignore field; do not display |
| `published_date` | Null for many records even when year is present | `"published_date": null, "year": 2013` | Always use `year` as fallback |
| `journal_issns` | Comma-separated string, not array | `"0028-0836,1476-4687"` | Split on `,` to get array |
| `oa_status` | "bronze" has nuanced meaning (free-to-read but not formally OA licensed) | bronze = no license | Surface carefully in UI; `is_oa: true` but may not be permanently free |
| `z_authors[].raw_affiliation_strings` | Array of raw strings, not structured | `["Dept Physics, Harvard..."]` | Store as raw; do not try to parse institution from string |

---

## 12. Exploitation Notes

**Integration Opportunity: ENRICHMENT (not search)**

Unpaywall should NOT be queried as a primary search source — it has no search endpoint. Its role is:

1. **OA URL injection**: After any search adapter returns a result with a DOI, call Unpaywall to inject `best_oa_location.url` as the definitive free-access link. This is the highest-value use case — it solves the "user can't access this paper" problem definitively.
2. **OA status enrichment**: Inject `oa_status` (gold/green/hybrid/bronze) for display in result cards and filtering. Unpaywall is the authoritative source for this signal — more accurate than OpenAlex's OA flag for recent changes.
3. **Repository copy flag**: `has_repository_copy` enables a "preprint available" indicator even when the DOI is for a paywalled published version.
4. **License field**: `best_oa_location.license` (e.g. `cc-by`) enables downstream LLM/text-mining permission checks.

**Batch strategy**: At query time, collect all DOIs from the search fan-out results, then fire parallel Unpaywall lookups (100k/day budget is ample for a search engine). Since latency is ~270 ms median, this can run in parallel with the search fan-out without adding meaningful wall-clock time.

**Under-exploited fields**:
- `oa_locations` (full array, not just best): enables showing multiple access paths (preprint + PMC + published)
- `version` field: distinguish publishedVersion vs submittedVersion for UI trust indicators
- `journal_is_in_doaj`: available for DOAJ badge display without a separate API call
- `z_authors[].raw_affiliation_strings`: free affiliation data not available from all other sources

**Snapshot download opportunity**: The quarterly snapshot is CC-BY and ~100 GB compressed. Ingesting this into Supabase would enable server-side OA enrichment with zero API latency — worth doing at scale.

---

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score | 0 | No score; lookup-only, no ranking concept |
| A2 Query expressiveness | 0 | DOI lookup only; no search, no fields, no boolean |
| A3 Sort & filter control | 0 | No sort/filter on lookup API |
| A4 Pagination depth / cursor | 0 | Single record per request; no pagination |
| A5 Batch / bulk endpoint | 2 | Snapshot download (full corpus dump) available; no batch HTTP endpoint |
| A6 Throughput & rate limits | 2 | 100k req/day identified; ~370/hr; key-free (email only) |
| A7 ID linkage / crosswalk | 1 | DOI input; links to PMH_ID, OpenAlex implied; no explicit ORCID/PMID |
| A8 Result-count accuracy | 0 | Single record; N/A |
| A9 Semantic / NL query mode | 0 | No search of any kind |
| A10 Author-name pollution control | 0 | N/A (no search), but conceptually pollution-free |

```
Raw_A = (0×1.5 + 0 + 0 + 0 + 2 + 2 + 1 + 0 + 0×1.5 + 0) / 11 = 5/11 = 0.45
```

> For a pure enrichment/lookup API, search dimensions (A1/A2/A3/A4/A8/A9/A10) are structurally 0. This is expected and does not reflect poor quality — it reflects different role.

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | 1 | Title + year + publisher + journal — no structured authors in core schema (z_authors is optional/unofficial) |
| B2 Abstract / full-text access | 0 | No abstract; provides best-OA-URL (link to full text) but not the text itself |
| B3 Citation graph | 0 | No citation data |
| B4 Discipline / field-tag granularity | 0 | No subject tags |
| B5 OA / free-access guarantee | 3 | Authoritative OA status; best-OA URL always populated when OA; `oa_status` granularity; gold/green/hybrid/bronze taxonomy; considered the industry standard |
| B6 Rich media / IIIF | 0 | No images |
| B7 Holdings / availability | 1 | `oa_locations[]` gives repository institution list, but no structured holdings/ILL |
| B8 Record-quality signals | 2 | `data_standard` version + `journal_is_in_doaj` + `is_paratext` flag + per-location `version` + `oa_date`; reasonable provenance |

```
Raw_B = (1 + 0×1.5 + 0 + 0 + 3×1.5 + 0 + 1 + 2) / 9 = (1 + 0 + 0 + 0 + 4.5 + 0 + 1 + 2) / 9 = 8.5/9 = 0.94
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | 2 | Well-maintained by Our Research; 272 ms median; no SLA published but >99% track record in practice |
| C2 Auth friction | 3 | Keyless (email param only); backend-safe; auto-"issued" (no registration); used in production by Ex Libris, thousands of integrators |
| C3 Redistribution / TOS risk | 2 | TOS allows display and programmatic use; attribution encouraged; metadata is CC-BY; some restrictions on bulk redistribution without contact → LOW risk |
| C4 Protocol / client maturity | 2 | Versioned REST (v2); documented schema (data-format page); stable since 2018; no OpenAPI spec |
| C5 Data hygiene & parseability | 2 | Mostly clean JSON; known deprecated fields; `z_authors` optional; `journal_issns` as comma-string; `published_date` nullable |

```
Raw_C = (2 + 3 + 2 + 2 + 2) / 5 = 11/5 = 2.20
```

### Rollup

```
Raw_A = 0.45
Raw_B = 0.94
Raw_C = 2.20

Overall = 0.45 × 0.45 + 0.94 × 0.40 + 2.20 × 0.15
        = 0.20 + 0.38 + 0.33
        = 0.91
```

**TIER = D** (0.91 < 1.0)

> **Important caveat:** The D-tier is entirely an artefact of the search-oriented scoring model. Unpaywall is a pure enrichment service — it has no search engine, so A1/A2/A3/A4/A8/A9/A10 are structurally zero. Its B5 score is 3 (maximum) and its operational profile is excellent. As an enrichment layer it is S-tier for its specific role. Do NOT deprioritise or quarantine — integrate as enrichment ASAP.

---

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | LOW — display + programmatic use explicitly allowed; attribution encouraged but not legally mandated for API use; bulk redistribution requires contact |
| Currently quarantined? | No (not yet integrated) |
| Recommended action | **INTEGRATE as ENRICHMENT immediately** — highest-value DOI enrichment available; <300 ms lookup; 100k/day free; no key friction |
| Blocking issues | None. Requires real email in query param (backend env var `UNPAYWALL_EMAIL=<owner-email>`). |
