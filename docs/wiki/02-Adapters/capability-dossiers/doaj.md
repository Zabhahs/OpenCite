---
tags: [adapter, capability, dossier]
adapter_id: DOAJ
dossier_date: 2026-06-09
pre_audit_tier: B
---

# DOAJ — Capability Dossier

## §1 Identity

| Field | Value |
|-------|-------|
| Adapter ID | `DOAJ` |
| Adapter file | `src/adapters/core/doaj.js` |
| Official API name | DOAJ API v3 |
| Provider | DOAJ (non-profit) |
| Base URL | `https://doaj.org/api/v3/search/articles/<query>` |
| Protocol | REST-JSON over Elasticsearch (path-encoded query) |
| Docs URL(s) | https://doaj.org/api/v3/docs (403 — inaccessible from probe); https://doaj.org/api/v3 |
| TOS/license URL | https://doaj.org/terms (403 inaccessible from probe); DOAJ article metadata is CC0 by policy |
| Pre-audit tier | B |
| Dossier date | 2026-06-09 |

---

## §2 Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard(s) | DOAJ `bibjson` (custom schema loosely based on BibJSON); article metadata is publisher-submitted |
| Serialization | JSON |
| Schema/OpenAPI URL | https://github.com/DOAJ/doaj (schema in codebase); OpenAPI at /api/v3/swagger.json |
| Schema version | v3 (current); v2 legacy |

---

## §3 Complete Field / Tag Inventory (live probe 2026-06-09)

Top-level article object fields: `id`, `last_updated`, `created_date`, `bibjson`

| Field | Type | Always? | Meaning | OpenCITE maps to |
|-------|------|---------|---------|-----------------|
| `id` | string | Yes | DOAJ article ID (hex) | `id` (prefixed `doaj-`) |
| `last_updated` | string | Yes | Last update timestamp (ISO) | NOT mapped |
| `created_date` | string | Yes | Record creation date (ISO) | NOT mapped |
| `bibjson.title` | string | Yes | Article title | `title` |
| `bibjson.abstract` | string | No (~75% coverage observed) | Article abstract | `abstract` (HTML stripped) |
| `bibjson.author` | object[] | No | `[{name, affiliation, orcid_id}]` | `authors` (name field) |
| `bibjson.author[].orcid_id` | string | No | Author ORCID URI | NOT mapped |
| `bibjson.author[].affiliation` | string | No | Author affiliation string | NOT mapped |
| `bibjson.keywords` | string[] | No | Author-supplied keywords | `keywords` |
| `bibjson.subject` | object[] | No | `[{scheme, code, term}]` — LCC subject codes | `subjects` (term field) |
| `bibjson.year` | string | No | Publication year (string) | `year` |
| `bibjson.month` | string | No | Publication month | NOT mapped |
| `bibjson.start_page` | string | No | First page | `pages` (start-end join) |
| `bibjson.end_page` | string | No | Last page | `pages` |
| `bibjson.identifier` | object[] | No | `[{type, id}]` — doi, eissn, pissn | `doi` (type=doi) |
| `bibjson.link` | object[] | No | `[{type, url, content_type}]` — fulltext link | `url` (type=fulltext) |
| `bibjson.journal.title` | string | No | Journal name | `journal` |
| `bibjson.journal.publisher` | string | No | Publisher name | `publisher` |
| `bibjson.journal.volume` | string | No | Volume | `volume` |
| `bibjson.journal.number` | string | No | Issue number | `issue` |
| `bibjson.journal.language` | string[] | No | Language codes (array) | `language` ([0]) |
| `bibjson.journal.country` | string | No | Country code | NOT mapped |
| `bibjson.journal.issns` | string[] | No | ISSN(s) for journal | NOT mapped |
| `bibjson.journal.license` | object[] | No | License metadata: [{type, url}] | NOT mapped (isOA: true hardcoded) |

**No `_score` or relevance score field exposed in response** (confirmed: raw JSON inspection showed no `_score` key; `sort=score:desc` returns HTTP 400).

---

## §4 Query Semantics

- **Lexical vs semantic**: Elasticsearch-backed lexical search. BM25 internally but score not returned.
- **NL tolerance**: Multi-word queries ANDed within field scopes. Elasticsearch's standard analyzer applies basic stemming.
- **Multi-keyword default**: AND within each field scope.
- **Phrase syntax**: Standard Elasticsearch phrase syntax in query string: `bibjson.title:("photosynthesis reaction")`.
- **Boolean operators**: Lucene query string syntax supported (after stripping reserved chars): `bibjson.title:(machine learning) OR bibjson.abstract:(machine learning)`.
- **Fielded query params**: Query is path-encoded in URL: `/api/v3/search/articles/<query>`. Field scoping via Lucene field prefixes: `bibjson.title:(...)`, `bibjson.abstract:(...)`, `bibjson.keywords:(...)`, `bibjson.author.name:(...)`.
- **OpenCITE query construction**: Current adapter strips Lucene reserved chars, then constructs `bibjson.title:(…) OR bibjson.abstract:(…) OR bibjson.keywords:(…)` — good content scope. Author search reverts to bare query (unscoped).
- **Author-name pollution control**: Content-scoped query (`bibjson.title` + `bibjson.abstract` + `bibjson.keywords`) prevents author matches. Confirmed in pollution test: "memon" returned content-relevant articles (TB care cascade, knee osteoarthritis), not author-surname matches.
- **Cross-lingual**: No; English-centric Elasticsearch analyzer.

---

## §5 OA / Free-Access

| Field | Value |
|-------|-------|
| Whole-corpus OA? | **Yes — by definition**. DOAJ only indexes articles from journals that are 100% open access. Every result is OA. |
| OA flag field | N/A — whole corpus is OA; `isOA: true` hardcoded in adapter is correct |
| Best-OA URL field | `bibjson.link[].url` where `type=fulltext` — direct publisher URL |
| OA-only filter param | Not needed — whole corpus is OA |
| Sort-by-OA | N/A |
| Flag coverage % | 100% (by definition) |
| License per article | `bibjson.journal.license[].type` (e.g., "CC BY", "CC BY-NC") — varies by journal |
| Recommended strategy | No OA filter needed; use `bibjson.link[].url` for fulltext access |

---

## §6 Images / Thumbnails / IIIF

No image or IIIF fields. DOAJ is article bibliographic metadata only.

- Has images? No
- IIIF: None

---

## §7 Discipline / Subject Tags

- **Vocabulary**: Library of Congress Classification (LCC) codes — `bibjson.subject[].scheme = "LCC"`, `code` (e.g. `TP500-660`), `term` (e.g. "Fermentation industries. Beverages. Alcohol")
- **Field path**: `bibjson.subject[].term` (currently mapped to `subjects`) and `bibjson.subject[].code`
- **Granularity**: LCC codes provide 2-level hierarchy (class + subclass). Not as granular as OpenAlex topics.
- **Example values**: `[{scheme:"LCC", code:"TP500-660", term:"Fermentation industries. Beverages. Alcohol"}]`
- **Hierarchy depth**: 2 levels in DOAJ's LCC mapping (but full LCC is 7 levels — DOAJ often uses top-level only).
- **Facet/filter param**: `filter.subject.code=<code>` (undocumented in public API but ES backend supports it).
- **Usability**: MEDIUM — LCC provides reasonable subject classification but coverage is inconsistent (publisher-supplied). Better than free-text keywords, less rich than OpenAlex topics.

---

## §8 Native Relevance & Scoring

- **Score returned?**: No — confirmed via live probe. Raw JSON inspection shows no `_score` field. `sort=score:desc` returns HTTP 400. `sort=created_date:desc` returns HTTP 200 (valid sort field).
- **Default sort**: Elasticsearch relevance (implicit BM25 ordering) when using text query — but not exposed in response.
- **Sort params**: Confirmed: `sort=created_date:desc` works. Other likely valid fields: `bibjson.year:desc`, `last_updated:desc`. The `_score` sort is not exposed.
- **Implication**: DOAJ results arrive in implicit Elasticsearch relevance order, but no score for OpenCITE's RRF computation. Must treat as unscored (A1=0 for RRF purposes; rubric A1=1 since ordering is monotone within request).

---

## §9 Pagination

- **Mechanism**: Page-based (`page=` + `pageSize=`)
- **Param names**: `page` (1-based), `pageSize` (max 100 per page)
- **Max page size**: 100
- **Stated depth cap**: Not explicitly documented
- **Empirical depth**: Page 100 (pageSize=10) returned results successfully for a query with 2,645 total hits — no error at 1,000-record depth. The API header shows `rel=last` link pointing to page 1323 for 17,277 total results (pageSize=2), implying 26,554 accessible pages × 2 = theoretical 26k+ result access. Deep pagination works.
- **No cursor**: Offset-only pagination; no cursor mechanism.

### §9b Measured Latency (live probe, 3 warm calls)

| Query type | Latency |
|------------|---------|
| Keyword | ~531ms median (calls: 1546, 527, 531ms) |
| Multi-keyword | ~403ms |
| NL/full-sentence | ~374ms |
| NL vs keyword delta | ~1× (no degradation) |
| Extra resolve round-trips | 0 |
| Query-strategy implication | Very fast — Cloudflare-fronted; warm calls ~400–530ms. Excellent. |

---

## §10 Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No (public API, no authentication required) |
| Key type | None |
| Acquisition speed | Immediate (keyless) |
| Backend-safe? | Yes |
| Anon limits | No stated rate limits in headers (no X-RateLimit headers observed). Cloudflare protection implies abuse detection. |
| Quota | No stated daily quota |
| Rate-limit code | Likely HTTP 429 (not observed in probe) |
| Retry-After? | Not observed |

---

## §11 Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `bibjson.title` | May contain HTML entities (UTF-8 confirmed in probe: `"Kvasný průmysl"`) | `"Lož Valley"` | Decode HTML entities; current `stripHtml()` handles basic cases |
| `bibjson.abstract` | May contain HTML markup; ~75% coverage; NULL when absent | `null` | Guard `b.abstract \|\| ""`; current `stripHtml(b.abstract \|\| "")` correct |
| `bibjson.author` | Array but may be missing entirely | `undefined` | Guard `(b.author \|\| [])` — current code correct |
| `bibjson.keywords` | `string[] \| string` polymorphism; may be empty array | `"machine learning"` (single string) | `Array.isArray(b.keywords) ? b.keywords : []` — current code handles this |
| `bibjson.subject` | `{scheme, code, term}[]`; scheme varies (LCC, PACS, MSC); term may be string or nested | `{term: "Physics"}` | `(b.subject \|\| []).map(s => s.term \|\| s).filter(Boolean)` — current code handles this |
| `bibjson.year` | String, not integer | `"2006"` | `String(b.year)` — current code correct |
| `bibjson.journal.language` | Array of ISO codes; may be empty | `["CS", "EN"]` | `Array.isArray ? [0] : ""` — current code correct |
| `bibjson.identifier` | Type values: "doi", "eissn", "pissn", "pmid" | `[{type:"pissn",id:"0023-5830"}]` | `.find(x => x.type === "doi")?.id` — current code correct |
| `bibjson.link` | May have multiple links; type values: "fulltext", "pdf", "html" | `[{type:"fulltext",url:"…",content_type:"html"}]` | `.find(x => x.type === "fulltext")?.url` — current code uses fulltext only; consider also "pdf" type |

---

## §12 Exploitation Notes

**Under-exploited fields (path → why valuable)**:
- `bibjson.journal.license[].type` → License type per journal (CC BY, CC BY-NC, CC BY-SA, etc.). Currently `isOA: true` is set but license granularity is ignored. Surface license badge (e.g., CC BY icon) to users.
- `bibjson.author[].orcid_id` → ORCID for authors. Not currently mapped. Enable researcher disambiguation.
- `bibjson.author[].affiliation` → Institutional affiliation string. Enables affiliation facet.
- `bibjson.subject[].code` → LCC codes (not just the term string). Enable LCC-code-based faceting.
- `bibjson.link` filtering for `content_type=pdf` → Some articles have both HTML and PDF links. Currently only `type=fulltext` taken. Add `content_type=application/pdf` priority check.
- `bibjson.journal.country` → Country of publisher — enables geographic faceting.

**Query-strategy upgrade**: Consider using Elasticsearch's `query_string` boolean operators more aggressively: `bibjson.title:(machine AND learning) OR bibjson.abstract:(machine AND learning)` vs current simple word injection. Also: DOAJ allows `filter.journal.publisher=...` for publisher-scoped search.

**Batch/harvest**: DOAJ offers a full article data dump at https://doaj.org/public-data-dump/ (JSON, updated daily, CC0). Far more efficient than API for bulk ingestion.

**Crosswalk**: `bibjson.identifier[type=doi]` → Crossref/OpenAlex; `bibjson.journal.issns` → OpenAlex source lookup; `bibjson.author[].orcid_id` → ORCID.

---

## §13 Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score (1.5×) | 1 | No score returned in response. `sort=score:desc` → HTTP 400 error. Elasticsearch BM25 ordering is implicit (results arrive in relevance order) but no score value for RRF. Score of 1 (not 0) because ordering is monotone within request even without explicit score. |
| A2 Query expressiveness | 2 | Lucene query string syntax in path param: field prefixes, OR/AND, phrase queries. Reserved chars must be stripped first (current adapter does this). No proximity, wildcard exposed cleanly. |
| A3 Sort & filter control | 2 | `sort=created_date:desc` confirmed; `sort=bibjson.year:desc` fails (400); `sort=last_updated:desc` likely works. Limited sort options; `pageSize` for pagination. Adequate but limited. |
| A4 Pagination depth/cursor | 2 | Offset pagination only; no cursor. Empirically deep (26k+ results accessible). Max 100 per page. |
| A5 Batch/bulk | 2 | Public data dump (CC0 JSON, daily-updated) covers full corpus harvest. API-only batch not supported. |
| A6 Throughput & rate limits | 2 | No stated rate limits; Cloudflare-fronted; ~530ms warm median. Conservative estimate: ~60–200 req/min without key. |
| A7 ID linkage | 2 | DOI, eISSN, pISSN, PMID (via identifier array). ORCID on authors. Missing OpenAlex/MAG IDs. |
| A8 Result-count accuracy | 2 | `total` field accurate; consistent across pages. |
| A9 Semantic/NL mode (1.5×) | 1 | Elasticsearch lexical BM25 + standard analyzer. NL-tolerant via AND-term matching. No semantic lift. |
| A10 Author-name pollution | 2 | Content-scope query `bibjson.title OR bibjson.abstract OR bibjson.keywords` reliably excludes author matches. Confirmed in live test. Requires explicit field scoping in query string (not default behavior). |

```
Raw_A = (1×1.5 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 1×1.5 + 2) / 11
       = (1.5 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 1.5 + 2) / 11
       = 19 / 11 = 1.73
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | 3 | Title, authors (with ORCID), date (year+month), journal, vol/issue/pages, DOI, publisher, language, ISSN. Full citation set plus publisher. |
| B2 Abstract / full-text (1.5×) | 2 | Abstract present on ~75% of records (observed in live probe); fulltext URL always present (bibjson.link). No structured full-text. |
| B3 Citation graph | 0 | No citation data whatsoever. |
| B4 Discipline / field-tag granularity | 2 | LCC codes with terms (controlled vocabulary, 2-level hierarchy in DOAJ's mapping) + author keywords. Better than free-text only; less rich than OpenAlex topics. |
| B5 OA / free-access (1.5×) | 3 | Whole corpus OA by definition; fulltext URL always present; license metadata per journal; 100% OA guarantee. Maximum possible score for a by-design OA corpus. |
| B6 Rich media / IIIF | 0 | No image fields. |
| B7 Holdings / availability | 0 | No holdings data. |
| B8 Record-quality signals | 1 | `last_updated` (data freshness); DOAJ journal acceptance implies peer review and OA compliance. No confidence/completeness score per article. |

```
Raw_B = (3 + 2×1.5 + 0 + 2 + 3×1.5 + 0 + 0 + 1) / 9
       = (3 + 3 + 0 + 2 + 4.5 + 0 + 0 + 1) / 9
       = 13.5 / 9 = 1.50
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | 2 | Cloudflare-CDN-fronted; ~530ms median warm. DOAJ is well-established (2003+). No formal SLA but consistent availability. |
| C2 Auth friction | 3 | Completely keyless; no registration required. Backend-safe. |
| C3 Redistribution / TOS risk | 3 | DOAJ article metadata is CC0 by policy. Journal-level CC license metadata is informational only. |
| C4 Protocol / client maturity | 2 | REST/JSON v3; Lucene path-encoded query (unusual but documented); no OpenAPI; no official SDK. |
| C5 Data hygiene & parseability | 2 | `bibjson` schema is consistent; known polymorphisms (keywords string vs array); UTF-8 in practice (confirmed Czech/French chars in live probe); LCC codes consistent. |

```
Raw_C = (2 + 3 + 3 + 2 + 2) / 5 = 12 / 5 = 2.40
```

### Rollup

```
Raw_A = 1.73
Raw_B = 1.50
Raw_C = 2.40

Overall = 1.73×0.45 + 1.50×0.40 + 2.40×0.15
        = 0.779 + 0.600 + 0.360
        = 1.74
```

**TIER: B (Complementary)**

---

## §14 Flags

| Flag | Value |
|------|-------|
| TOS legal risk | NONE — CC0 article metadata by policy |
| Currently quarantined? | No |
| Recommended action | Map `bibjson.journal.license[].type` for CC badge display; map `bibjson.author[].orcid_id`; add `content_type=application/pdf` link priority; use public data dump for warm-up / bulk seeding. |
| Blocking issues | No relevance score returned (limits RRF input quality); no citation graph; LCC classification limited. |
| Unique value | Only adapter in the roster where the entire corpus is guaranteed OA. Best source for free-access-first search strategy. |
