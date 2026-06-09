---
tags: [adapter, capability, dossier]
adapter_id: CROSSREF
dossier_date: 2026-06-09
pre_audit_tier: A
---

# CROSSREF — Capability Dossier

## §1 Identity

| Field | Value |
|-------|-------|
| Adapter ID | `CROSSREF` |
| Adapter file | `src/adapters/core/crossref.js` |
| Official API name | Crossref REST API |
| Provider | Crossref |
| Base URL | `https://api.crossref.org/works` |
| Protocol | REST-JSON |
| Docs URL(s) | https://www.crossref.org/documentation/retrieve-metadata/rest-api/ |
| TOS/license URL | https://www.crossref.org/documentation/retrieve-metadata/rest-api/ ("Almost none of the metadata is subject to copyright, and you may use it for any purpose.") |
| Pre-audit tier | A |
| Dossier date | 2026-06-09 |

---

## §2 Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard(s) | Custom Crossref JSON schema (loosely schema.org-aligned), Crossref Unified Data Model (UDM) |
| Serialization | JSON |
| Schema/OpenAPI URL | https://github.com/CrossRef/rest-api-doc |
| Schema version | v1 (stable; no semver; changelog maintained in GitLab) |

---

## §3 Complete Field / Tag Inventory (live probe 2026-06-09)

Field path (dot-notation) · type · always-present? · meaning · OpenCITE currently maps to

| Field | Type | Always? | Meaning | OpenCITE maps to |
|-------|------|---------|---------|-----------------|
| `DOI` | string | Yes | DOI (without https prefix) | `doi` |
| `title` | string[] | Yes | Title array (use [0]) | `title` (stripped of HTML) |
| `author` | object[] | No | Authors: {given, family, ORCID, authenticated-orcid, sequence, affiliation, role} | `authors` (given+family join) |
| `author[].ORCID` | string | No | ORCID URI for author | NOT mapped |
| `author[].authenticated-orcid` | bool | No | Whether ORCID is authenticated | NOT mapped |
| `author[].affiliation` | object[] | No | Author affiliation(s) | NOT mapped |
| `editor` | object[] | No | Editors (same shape as author) | `editors` |
| `publisher` | string | Yes | Publisher name | `publisher` |
| `container-title` | string[] | No | Journal/book/series title | `journal` ([0]) |
| `type` | string | Yes | Work type (journal-article, book-chapter, …) | `type` |
| `issued` | {date-parts} | Yes | Publication date as [[y,m,d]] | `year` (date-parts[0][0]) |
| `published` | {date-parts} | No | Alternate published date | `year` (fallback) |
| `published-print` | {date-parts} | No | Print publication date | NOT mapped |
| `published-online` | {date-parts} | No | Online publication date | NOT mapped |
| `volume` | string | No | Journal volume | `volume` |
| `issue` | string | No | Journal issue | `issue` |
| `page` | string | No | Page range (e.g. "1-15") | `pages` |
| `abstract` | string | No (≈20% coverage) | Abstract (JATS XML markup present) | `abstract` (HTML stripped) |
| `is-referenced-by-count` | int | Yes (0 if none) | Inbound citation count | `citedBy` |
| `reference-count` | int | Yes | Count of references | NOT mapped |
| `reference` | object[] | No | Reference list entries (DOI, unstructured) | NOT mapped |
| `references-count` | int | Yes | Alias for reference-count | NOT mapped |
| `funder` | object[] | No | Funders: {DOI, name, doi-asserted-by, award[]} | NOT mapped |
| `license` | object[] | No | License: {URL, content-version, start, delay-in-days} | NOT mapped (isOA always false) |
| `ISSN` | string[] | No | ISSN(s) for container | NOT mapped |
| `issn-type` | object[] | No | ISSN with type (print/electronic) | NOT mapped |
| `subject` | string[] | No | Publisher-supplied subject tags (~30% coverage) | `subjects` |
| `URL` | string | Yes | Landing page URL | `url` |
| `language` | string | No | ISO 639-1 language code | `language` |
| `link` | object[] | No | Full-text access links: {URL, content-type, intended-application} | NOT mapped |
| `score` | float | Yes | BM25-based relevance score | NOT mapped (used in adapter internally for RRF input) |
| `indexed` | {date-parts} | Yes | When Crossref indexed this record | NOT mapped |
| `created` | {date-parts} | Yes | When DOI was deposited | NOT mapped |
| `deposited` | {date-parts} | Yes | Last metadata deposit date | NOT mapped |
| `prefix` | string | Yes | DOI prefix | NOT mapped |
| `member` | string | Yes | Crossref member ID | NOT mapped |
| `source` | string | Yes | Source of metadata ("Crossref") | NOT mapped |
| `content-domain` | object | No | Crossmark domain configuration | NOT mapped |
| `relation` | object | No | Related DOIs (is-preprint-of, etc.) | NOT mapped |
| `assertion` | object[] | No | Publisher assertions (peer-review, retraction) | NOT mapped |
| `alternative-id` | string[] | No | Publisher-assigned alternate IDs | NOT mapped |
| `article-number` | string | No | Electronic article number | NOT mapped |
| `short-container-title` | string[] | No | Abbreviated journal title | NOT mapped |
| `update-policy` | string | No | Crossmark update policy URL | NOT mapped |

---

## §4 Query Semantics

- **Lexical vs semantic**: Purely lexical; BM25F-based term matching. No semantic lift.
- **NL tolerance**: Tolerant to multi-word phrases; treats them as AND-joined terms. Stop words removed. Stemming applied (basic).
- **Multi-keyword default**: AND across terms within the queried field.
- **Phrase syntax**: Wrap in double quotes: `query.bibliographic="photosynthesis reaction center"`.
- **Boolean operators**: Not exposed directly in the `query.*` params. Can be combined with `filter=` for AND-style field restrictions.
- **Fielded query params**: `query` (all fields), `query.title` (deprecated), `query.bibliographic` (title+author+journal+year), `query.author`, `query.affiliation`, `query.editor`, `query.publisher`, `query.container-title`, `query.event-name`, `query.description`.
- **Author-name pollution control**: `query.bibliographic` includes author field — author-only matches can pollute topic queries. OpenCITE applies a post-fetch `hasContentMatch` filter to drop results where the term appears only in author/journal fields. A cleaner upstream approach does not exist; Crossref has no title-only or abstract-only search scope.
- **Cross-lingual**: No; English-centric. Non-English records are indexed but no stemming or transliteration for other languages.

---

## §5 OA / Free-Access

| Field | Value |
|-------|-------|
| Whole-corpus OA? | No (≈55% OA by some counts, but mixed) |
| OA flag field | `license[].URL` (decode CC/OA license type) — no boolean OA flag |
| Best-OA URL field | `link[].URL` where `intended-application=text-mining` or `full-text` — requires logic |
| OA-only filter param | `filter=has-license:true` or `filter=license=<url>` — no single `is-oa:true` |
| Sort-by-OA | No |
| Flag coverage % | Unreliable; `license` present on ~50% of records |
| Recommended free-only strategy | Filter `has-license:true` + check `license[].URL` for CC patterns. Not reliable as a sole OA gate. |

---

## §6 Images / Thumbnails / IIIF

No image fields. Crossref is bibliographic metadata only.

- Has images? No
- Thumbnail field: None
- IIIF: None
- Display strategy: N/A

---

## §7 Discipline / Subject Tags

- **Vocabulary**: Publisher-supplied free-text keywords in `subject[]` — no controlled vocabulary (no LCSH, MeSH, DDC).
- **Field path**: `subject` (top-level array of strings)
- **Granularity**: Single-level free-text; highly inconsistent across publishers.
- **Example values**: `["Biochemistry", "Plant Science"]`
- **Hierarchy depth**: None — flat list.
- **Facet/filter param**: `facet=subject-name:10` returns facet counts.
- **Usability**: LOW — sparse (~30% coverage), no controlled vocabulary, inconsistent across publishers, not suitable for reliable faceting.

---

## §8 Native Relevance & Scoring

- **Score returned?**: Yes — `score` field (float) on every result item.
- **Field name**: `score`
- **Semantics**: BM25F (documented by Crossref as "relevance score based on title, abstract, author names, funder names, publication date, journal name, and other metadata fields"). Confirmed in live probe (score=14.9382715 for photosynthesis keyword query).
- **Range**: Positive float; no stated max. Observed: 1.5–20+ in practice.
- **Cross-query comparable?**: No — score magnitude varies with query term frequency in corpus. Monotone within a single request, useful for RRF within-batch ranking.
- **Default sort**: Relevance (score desc) when a query param is present; by `deposited` date otherwise.
- **Sort params**: `sort=` accepts: `score`, `created`, `issued`, `indexed`, `is-referenced-by-count`, `relevance`, `published`, `published-print`, `published-online`, `updated`, `references-count`, `deposited`. `order=asc|desc`.

---

## §9 Pagination

- **Mechanism**: Offset (`offset=` + `rows=`)
- **Param names**: `offset` (0-based), `rows` (page size, max 1000 per page)
- **Max page size**: 1000
- **Stated depth cap**: 10,000 (API enforces offset ≤ 10,000)
- **Empirical depth**: Consistent with 10,000 cap
- **Cursor support**: Yes — `cursor=*` to start, `next-cursor` in response for subsequent pages. Cursors **expire after 5 minutes**.

### §9b Measured Latency (live probe, 3 warm calls)

| Query type | Latency |
|------------|---------|
| Keyword (`photosynthesis`) | ~1,000ms median (calls: 1000, 1520, 957ms) |
| Multi-keyword (`machine learning protein structure`) | ~2,217ms cold |
| NL/full-sentence | ~2,295ms cold |
| NL vs keyword delta | ~2× slower |
| Extra resolve round-trips | 0 (single endpoint) |
| Query-strategy implication | Use `query.bibliographic` for multi-word; single-word `query=` is marginally faster. Avoid NL-length queries — performance degrades. |

---

## §10 Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No |
| Key type | Email address in `mailto=` param (polite pool) |
| Acquisition speed | Immediate (just add `mailto=` param) |
| Backend-safe? | Yes |
| Anon limits | 10 req/s (x-rate-limit-limit: 10 per 1s), 3 concurrent (x-concurrency-limit: 3) — confirmed via response headers |
| Polite pool | Confirmed via `x-api-pool: polite` response header — same rate but preferred queue |
| Burst | 10 req/s |
| Quota | No stated daily quota |
| Rate-limit code | HTTP 429 |
| Retry-After? | Not observed in headers |

---

## §11 Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `abstract` | JATS XML markup (`<jats:p>`, `<jats:italic>`, `<sub>`, `<sup>`) | `<jats:p>The use of chlorophyll fluorescence...</jats:p>` | Strip XML tags before display; current `stripHtml()` handles this |
| `title` | Array (always); may contain HTML markup or Unicode superscripts | `["g-C<sub>3</sub>N<sub>4</sub>"]` | Use `title[0]`; strip HTML |
| `author` | May be absent (book records, proceedings); `given`/`family` may be null | `{sequence: "first"}` (no name) | Guard `[a.given, a.family].filter(Boolean).join(" ")` — current code correct |
| `issued.date-parts` | Array of array; inner may be `[null]` or `[year]` or `[year,month,day]` | `[[null]]`, `[[2024]]` | Guard `dateParts[0] && typeof dateParts[0][0] === 'number'` |
| `container-title` | Array; may be empty `[]` | `[]` | Use `Array.isArray(it['container-title']) ? it['container-title'][0] : ''` — current code correct |
| `score` | Not returned when using `filter=` without `query=`; absent on sorted-by-date queries | missing field | Guard `typeof item.score === 'number'` before using for RRF |
| `reference` | Present but individual entries may lack DOI (unstructured string only) | `{unstructured: "Smith et al..."}` | Check for `DOI` key before crosswalk |
| `subject` | `string \| string[]` polymorphism; sometimes a single string | `"Biochemistry"` | `[].concat(item.subject).filter(Boolean)` |
| `ISSN` | May be absent or contain duplicate/invalid ISSNs | `["1234-5678","1234-5678"]` | Deduplicate; validate format |

---

## §12 Exploitation Notes

**Under-exploited fields (path → why valuable)**:
- `reference[]` → Full reference list with DOIs available on ~60% of records. Enables forward/backward citation graph. Currently mapped to `citedBy` count only (the `is-referenced-by-count` field), but the outbound reference list itself is ignored. **High value**: citation-graph crosswalk, deduplication key.
- `funder[].DOI` + `funder[].name` → Funder metadata usable for filtering by grant source; valuable for research-funder facet.
- `license[].URL` → Decode CC vs non-CC to provide an OA signal (currently `isOA: false` hardcoded). Parse `license[].URL` for `creativecommons.org` to set `isOA: true`.
- `author[].ORCID` → Researcher disambiguation; currently not surfaced. Use to enrich author crosswalk.
- `link[].URL` where `intended-application=text-mining` → Direct full-text access URLs for OA works. Not mapped at all.
- `relation` → Preprint-article pairs (`is-preprint-of`, `is-version-of`) — deduplication signal.
- `assertion` → Peer-review metadata; retraction flags.
- `published-print` + `published-online` → Better date precision than `issued` for some records.

**Query-strategy upgrade**: Replace single-word `query=` with `query.bibliographic=` consistently (already done for multi-word in adapter). Consider adding `filter=has-abstract:true` as optional mode to improve abstract coverage at the cost of recall.

**Batch/harvest**: Cursor-based harvest supported. Annual public data file available at https://www.crossref.org/documentation/retrieve-metadata/rest-api/snapshot-download/ — faster for bulk ingestion than API.

**Crosswalk opportunity**: `author[].ORCID` → ORCID; `funder[].DOI` → Funder Registry; `ISSN` → DOAJ journal whitelist; `DOI` → OpenAlex, Unpaywall, NCBI.

---

## §13 Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score (1.5×) | 2 | `score` (BM25F float) returned, monotone within request, confirmed live. Not cross-query-comparable (not calibrated absolute). |
| A2 Query expressiveness | 2 | Multi-field scope (`query.bibliographic`, `query.author`, `query.affiliation`, etc.) + phrase with quotes + field-scoped OR via filter combinations. No full boolean DSL. |
| A3 Sort & filter control | 3 | 12 sort fields; `filter=` supports 40+ filter params (date, type, has-abstract, has-orcid, has-funder, license, ISSN, member, etc.); facet counts returned for type-name, license. |
| A4 Pagination depth/cursor | 2 | Offset to 10k; cursor (`cursor=*`) for unlimited depth, expires 5 min. Cursor counts as 2 (offset/cursor + cap > 10k via cursor). |
| A5 Batch/bulk | 3 | Annual public data file + cursor-based full harvest + `DOI` individual lookup. OAI-PMH not offered but data dumps serve same function. |
| A6 Throughput & rate limits | 2 | 10 req/s polite pool (confirmed); 3 concurrent. Adequate for fan-out. Not 600+. |
| A7 ID linkage | 2 | DOI (primary), ISSN, ORCID (on authors), funder DOI, member ID. 4 ID namespaces present but PMID/arXiv not on work records. |
| A8 Result-count accuracy | 2 | `total-results` accurate for small sets; caps behavior at 10k window. |
| A9 Semantic/NL mode (1.5×) | 1 | Lexical + stemming (basic). BM25F with stop-word removal. NL tolerant in that multi-word queries work but no semantic lift. No vector search. |
| A10 Author-name pollution | 2 | `query.bibliographic` is author-inclusive; reliable `query.author` param for explicit author scope. OpenCITE applies `hasContentMatch` post-filter for topic queries — effective but adds latency. |

```
Raw_A = (2×1.5 + 2 + 3 + 2 + 3 + 2 + 2 + 2 + 1×1.5 + 2) / 11
       = (3 + 2 + 3 + 2 + 3 + 2 + 2 + 2 + 1.5 + 2) / 11
       = 22.5 / 11 = 2.05
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | 3 | Title, structured authors (given/family/ORCID), date (y/m/d parts), journal, vol/issue/pages, DOI, publisher, type, language, ISSN/ISBN. Full citation set. |
| B2 Abstract / full-text (1.5×) | 1 | Abstract present on ~20% of records (publisher-dependent deposit); JATS XML format. Coverage too low for rank-signal use. |
| B3 Citation graph | 2 | `is-referenced-by-count` (inbound) + `reference[]` list (outbound, with DOIs on most). No co-citation. |
| B4 Discipline / field-tag granularity | 1 | `subject[]` is publisher free-text, single-level, ~30% coverage. No controlled vocabulary. |
| B5 OA / free-access (1.5×) | 1 | `license[].URL` present on ~50% of records; CC detection requires URL parsing; no authoritative `is_oa` flag; no best-OA URL field; unreliable for OA-only filtering. |
| B6 Rich media / IIIF | 0 | No image fields whatsoever. |
| B7 Holdings / availability | 0 | No holdings data. |
| B8 Record-quality signals | 1 | `score` (BM25F, not a quality signal), `assertion[]` (peer review status, retraction — present on small subset), `is-referenced-by-count` as proxy for influence. No confidence/completeness score. |

```
Raw_B = (3 + 1×1.5 + 2 + 1 + 1×1.5 + 0 + 0 + 1) / 9
       = (3 + 1.5 + 2 + 1 + 1.5 + 0 + 0 + 1) / 9
       = 10 / 9 = 1.11
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | 2 | ~99% uptime (well-established, 2013+); 1–2s median (measured ~1,000ms warm). No multi-region CDN. Status page at status.crossref.org. |
| C2 Auth friction | 3 | Keyless; polite pool activated by `mailto=` param. No registration required. Backend-safe. |
| C3 Redistribution / TOS risk | 3 | Explicit statement: "Almost none of the metadata is subject to copyright, and you may use it for any purpose." Abstracts may carry publisher copyright — LOW risk overall. |
| C4 Protocol / client maturity | 2 | Versioned REST/JSON; changelog maintained on GitHub (CrossRef/rest-api-doc); multiple community SDKs (rcrossref, habanero, polite). No OpenAPI spec. |
| C5 Data hygiene & parseability | 2 | Well-typed JSON; JATS XML in abstract field (known quirk, documented); `title`/`container-title` always arrays; date as nested array-of-array is unusual but consistent; nulls consistent. |

```
Raw_C = (2 + 3 + 3 + 2 + 2) / 5 = 12 / 5 = 2.40
```

### Rollup

```
Raw_A = 2.05
Raw_B = 1.11
Raw_C = 2.40

Overall = 2.05×0.45 + 1.11×0.40 + 2.40×0.15
        = 0.9225 + 0.4440 + 0.3600
        = 1.73
```

**TIER: B (Complementary)**

---

## §14 Flags

| Flag | Value |
|------|-------|
| TOS legal risk | LOW — "almost none of the metadata is subject to copyright, and you may use it for any purpose." Abstract copyright may vary per publisher. |
| Currently quarantined? | No |
| Recommended action | Exploit `license[].URL` to derive `isOA`; map `reference[]` for citation-graph crosswalk; surface `author[].ORCID`; improve abstract coverage by adding `filter=has-abstract:true` mode. |
| Blocking issues | Abstract coverage (~20%) limits B2 score. No authoritative OA flag. No semantic search. Score not cross-query-comparable. |
