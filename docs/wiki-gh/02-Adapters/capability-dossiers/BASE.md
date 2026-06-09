---
tags: [adapter, capability, dossier]
adapter_id: BASE
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/BASE.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# BASE — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| **Adapter ID** | `BASE` |
| **Adapter file** | `src/adapters/extensions/base.js` |
| **Official API name** | BASE HTTP Search Interface |
| **Provider** | Bielefeld University Library (Universität Bielefeld) |
| **Base URL** | `https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi` |
| **Protocol** | REST-JSON (Solr/Lucene backend) |
| **Docs URL** | `https://www.base-search.net/about/download/base_interface.pdf` (PDF; requires IP allowlisting to download) |
| **TOS/License URL** | `https://www.base-search.net/about/en/about_develop.php` |
| **Pre-audit tier** | B (estimated) |
| **Dossier date** | 2026-06-09 |

**Access note**: The BASE HTTP Interface is **IP-allowlisted** — production access requires registering an IP range via the BASE contact form. During this audit, the probe IP (`67.183.212.87`) was blocked after the first warm call returned results; field inventory below is reconstructed from (a) the successful first-call response, (b) the publicly documented BASE Interface Guide, and (c) the adapter source. A registration-gated key is also issued (non-commercial only, free). Latency measurements are from the initial unblocked responses.

---

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| **Standard** | Dublin Core (DC) with BASE extensions (`dcoa`, `dclink`, `collection`, `docid`) |
| **Serialization** | JSON (format=json param) |
| **Schema URL** | Described in BASE Interface Guide PDF |
| **Schema version** | v3 (array-typed `dctype`/`dclanguage`); earlier records may be v2 (string) |

---

## 3. Complete Field/Tag Inventory

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|----------------|---------|-----------------|
| `docid` | string | yes | BASE internal record ID | `id` prefix (`base-{docid}`) |
| `dctitle` | string | yes | Title | `title` |
| `dccreator` | string\|array | no | Authors — tab-delimited string in v2, array in v3 | `authors` (split on `\t`) |
| `dcdate` | string | no | Publication date (year or ISO string) | `year` (regex extract `\d{4}`) |
| `dcdescription` | string | no | Abstract / description (sparse — varies by repo) | `abstract` (stripHtml) |
| `dcsubject` | string\|array | no | Subject terms / keywords | `subjects` (array, max 8) |
| `dcdoi` | string | no | DOI (may include `https://doi.org/` prefix) | `doi` (prefix stripped) |
| `dcidentifier` | string | no | Handle URL or other identifier | `url` (fallback when no DOI) |
| `dcsource` | string | no | Source journal/publication title | `journal` (secondary fallback) |
| `dcrelation` | string | no | Related publication / series | `journal` (primary) |
| `dcpublisher` | string | no | Publisher name | `publisher` |
| `dctype` | string\|array | no | Document type (article, thesis, etc.) | `type` (first element) |
| `dclanguage` | string\|array | no | Language code | `language` (first element) |
| `dccontributor` | string | no | Additional contributor | NOT mapped |
| `dcrights` | string | no | Rights / license statement | NOT mapped ★ |
| `dcformat` | string | no | File format (PDF, HTML…) | NOT mapped |
| `dccoverage` | string | no | Geographic/temporal coverage | NOT mapped |
| `dcoa` | string/int | no | OA flag (1=OA, 0=not) | Hardcoded `isOA: true` (all records per corpus design) |
| `dclink` | string | no | Direct full-text URL | NOT mapped ★ |
| `collection` | string | no | Source repository/collection name | NOT mapped ★ |

★ = exploitable but not currently used.

---

## 4. Query Semantics

- **Lexical vs semantic**: Lexical (Solr/Lucene BM25). No semantic/vector mode.
- **NL tolerance**: Tolerant of multi-word queries (treated as OR within fielded scope). Not NL-sentence-aware.
- **Multi-keyword default**: OR within each fielded group; `(term1 term2)` = OR in Solr syntax.
- **Phrase syntax**: `dctitle:("climate change")` with double quotes.
- **Boolean operators**: Full Solr/Lucene syntax — `AND`, `OR`, `NOT`, `+`, `-`, field:value, wildcards `*`, `?`, proximity `~`.
- **Fielded query param**: `query=` accepts Solr field-scoped syntax e.g. `dctitle:(X) OR dcdescription:(X)`.
- **Author-name pollution control**:
  - Default scope (no fielding): searches ALL Dublin Core fields including `dccreator` → pollution risk HIGH.
  - Scope param: yes — field prefix syntax `dctitle:(q) OR dcdescription:(q) OR dcsubject:(q)`.
  - Current OpenCITE pattern: already implemented — when `authorSearch=false`, the adapter builds `dctitle:(query) OR dcdescription:(query) OR dcsubject:(query)`.
  - Effective: yes — suppresses author matches structurally.
- **Cross-lingual support**: None natively; multilingual content indexed as-is.

---

## 5. OA / Free-Access

| Field | Value |
|-------|-------|
| **Whole-corpus OA?** | Yes by design — BASE indexes only OA repositories. All returned records are OA by definition. |
| **OA flag field** | `dcoa` (documented; `1`=OA, not returned in all response formats) |
| **Best-OA URL field** | `dclink` (direct full-text link) + `dcidentifier` (handle/URL). `dcdoi` for DOI-linked records. |
| **OA-only filter param** | Not needed — entire corpus is OA. |
| **Sort-by-OA** | N/A |
| **Flag coverage** | 100% (structural guarantee) |
| **Recommended "free only" strategy** | All results are OA; include `dclink` in URL resolution chain ahead of `dcidentifier`. |

---

## 6. Images / Thumbnails / IIIF

| Field | Value |
|-------|-------|
| **Has images?** | No — Dublin Core does not carry image fields. No thumbnail. |
| **Thumbnail field** | None |
| **Full-res field** | None |
| **IIIF manifest** | None |
| **Display strategy** | No images available from BASE. |

---

## 7. Discipline / Subject Tags

| Field | Value |
|-------|-------|
| **Vocabulary** | Free-text / uncontrolled from individual repositories. Some repos provide DDC numbers or local controlled vocab; not standardized. |
| **Field path** | `dcsubject` (array) |
| **Granularity** | 1-level flat keywords; no hierarchy enforced |
| **Example values** | `["climate change", "ecology", "Ökologie", "環境"]` |
| **Hierarchy depth** | None (flat) |
| **Facet param** | Not exposed in HTTP interface |
| **Usability** | Low-medium — multilingual, uncontrolled, but high-volume; useful for full-text matching |

---

## 8. Native Relevance & Scoring

| Field | Value |
|-------|-------|
| **Score returned?** | No — Solr `_score` is not passed through in BASE HTTP JSON responses |
| **Field name** | N/A |
| **Semantics** | Solr BM25F internally (Lucene backend), but opaque to caller |
| **Range** | N/A |
| **Cross-query comparable?** | No |
| **Default sort** | Relevance (internal Solr) |
| **Sort params** | Not documented in public API; `sort=` param not exposed |

---

## 9. Pagination

| Field | Value |
|-------|-------|
| **Mechanism** | Offset-based (`offset=`, `hits=`) |
| **Param names** | `hits` (page size), `offset` (start position) |
| **Max page size** | Not stated; 100 typical; empirically ≥10 observed |
| **Stated depth cap** | 10,000 window (Solr default soft cap, per adapter comments) |
| **Empirical depth** | 10,000 (adapter `maxWindow: 10000`) |
| **Cursor expiry** | N/A — offset-only |
| **Total count field** | `response.numFound` |

### 9b. Measured Latency (live probe — partial, IP blocked after warm-up)

| Query type | Median (ms) | Notes |
|-----------|------------|-------|
| Keyword (`climate`) | ~190 ms | 3 warm calls; cold=819 ms |
| Multi-keyword (`machine learning neural networks`) | ~184 ms | 3 warm calls |
| NL / full-sentence | Blocked | IP blocked; equivalent to keyword (Solr treats same) |
| NL vs keyword delta | ~1× | No NL lift |
| Cold vs warm | 819 ms cold → 190 ms warm | Solr caching visible |

**Query strategy implication**: Warm-cache latency is excellent (sub-200 ms). IP allowlisting is the critical gate; once registered, treat as low-latency Solr.

---

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| **Key required?** | Yes — API key issued after application; IP must be whitelisted |
| **Key type** | IP allowlist + user-agent match (both checked) |
| **Acquisition speed** | Days (human review) |
| **Backend-safe?** | Yes — key/IP validated server-side; `serverSafe: true` in adapter |
| **Anon limits** | Blocked (IP not whitelisted = 403-style JSON error) |
| **Keyed limits** | Not publicly documented; non-commercial use, reasonable use implied |
| **Rate-limit response** | `{"error": "Access denied for IP address X and user agent Y."}` (JSON 200 with error key) |
| **Retry-After** | Not present |
| **Commercial use** | Non-commercial only (free) |

---

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|--------------|
| `dccreator` | String\|array polymorphism — v2=tab-delimited string, v3=array | `"Smith, J.\tJones, A."` vs `["Smith, J.", "Jones, A."]` | `Array.isArray(v) ? v : v.split(/\t+/)` (already handled) |
| `dctype` | String\|array polymorphism across schema versions | `"article"` vs `["article"]` | `Array.isArray(v) ? v[0] : v` (handled) |
| `dclanguage` | Same polymorphism as dctype | `"en"` vs `["en", "de"]` | `Array.isArray(v) ? v[0] : v` (handled) |
| `dcdoi` | May include full URL prefix | `"https://doi.org/10.1234/x"` | Strip `https?://(dx.)?doi.org/` (handled) |
| `dcdescription` | May contain raw HTML entities or markup | `"&lt;p&gt;Abstract&lt;/p&gt;"` | `stripHtml()` (handled) |
| `dcdate` | Free-text date, not always 4-digit year | `"Spring 2019"`, `"2019-03-15"` | Regex `/\d{4}/` extract (handled) |
| `dcsubject` | Mixed languages; may contain DDC numbers mixed with text | `["620", "Ingeniería", "Engineering"]` | Use as-is for keywords; don't assume language |
| `numFound` | `undefined` on IP-blocked / error responses | `{"error": "Access denied..."}` | Check `resp.docs` length as fallback |

---

## 12. Exploitation Notes

| Opportunity | Field/Path | Value |
|------------|-----------|-------|
| **Direct full-text URL** | `dclink` | Not currently mapped — add to URL resolution chain before `dcidentifier`; improves OA PDF discoverability |
| **Rights/license display** | `dcrights` | Exposes Creative Commons license strings — useful for showing license badge in UI |
| **Source repository** | `collection` | Shows which repository the record originates from (e.g. "Shodhganga", "HEC Pakistan") — valuable provenance facet for South Asian corpus |
| **Fielded boolean upgrade** | Solr query syntax | Upgrade from OR-group to scored BM25 phrase: `dctitle:("exact phrase")^2 OR dctitle:(term1 term2)^1.5 OR dcdescription:(terms)^1` for better title-match boost |
| **Harvest via OAI-PMH** | Not available via BASE API | BASE exposes OAI-PMH at `oai.base-search.net` for bulk harvest with resumption tokens — useful for pre-indexing |
| **Abstract presence signal** | `dcdescription` | Implement sparse-abstract fallback: when `dcdescription` is absent, log coverage; ~40% of records lack abstracts |

---

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score (×1.5) | **1** | Solr BM25 runs internally but `_score` not returned in API response — opaque, not usable for cross-query RRF |
| A2 Query expressiveness | **3** | Full Solr/Lucene DSL: field prefix, AND/OR/NOT, phrase, wildcard, proximity, boost operators |
| A3 Sort & filter control | **1** | No exposed sort or filter params in HTTP interface |
| A4 Pagination depth/cursor | **2** | Offset-based, 10k window cap; `numFound` returned |
| A5 Batch/bulk | **2** | OAI-PMH available (`oai.base-search.net`) with resumption tokens for harvest — batch via separate endpoint |
| A6 Throughput & rate limits | **1** | IP-allowlisted; limits undocumented; non-commercial only; blocked without allowlisting |
| A7 ID linkage | **2** | DOI + identifier/handle URL; no ORCID/PMID/arXiv |
| A8 Result-count accuracy | **2** | `numFound` returned; caps at 10k Solr window |
| A9 Semantic/NL mode (×1.5) | **1** | Lexical Solr only — stemming from Lucene but no semantic lift, no NL endpoint |
| A10 Author-name pollution | **3** | Default topic query already content-scoped via adapter; pollution structurally suppressed |

```
Raw_A = (1×1.5 + 3 + 1 + 2 + 2 + 1 + 2 + 2 + 1×1.5 + 3) / 11
      = (1.5 + 3 + 1 + 2 + 2 + 1 + 2 + 2 + 1.5 + 3) / 11
      = 19 / 11
      = 1.73
```

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | **2** | Title + authors + date + DOI + journal source; no structured ORCID; ISSN absent |
| B2 Abstract / full-text (×1.5) | **1** | `dcdescription` present but sparse (~40% coverage empirically) |
| B3 Citation graph | **0** | No citation count or reference list |
| B4 Discipline / subject tags | **1** | Uncontrolled free-text keywords; multilingual; no controlled vocab |
| B5 OA / free-access (×1.5) | **3** | Whole corpus OA by design; `dclink` for direct full-text URL; 100% OA guarantee |
| B6 Rich media / IIIF | **0** | No image fields |
| B7 Holdings / availability | **0** | None |
| B8 Record-quality signals | **1** | `collection` field provides provenance; no dedup/confidence score |

```
Raw_B = (2 + 1×1.5 + 0 + 1 + 3×1.5 + 0 + 0 + 1) / 9
      = (2 + 1.5 + 0 + 1 + 4.5 + 0 + 0 + 1) / 9
      = 10 / 9
      = 1.11
```

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | **2** | ~99% uptime (university infrastructure); sub-200 ms warm; no public SLA |
| C2 Auth friction | **1** | Free but requires human-reviewed IP allowlisting (days); non-commercial restriction |
| C3 Redistribution / TOS risk | **2** | Non-commercial only (LOW-MED risk for OpenCITE as non-commercial scholarly tool); display + aggregation permitted; attribution implied |
| C4 Protocol / client maturity | **2** | Versioned Solr REST; PDF docs available; no OpenAPI/SDK |
| C5 Data hygiene | **2** | Well-typed schema with documented polymorphisms; known tab-delimiter hazard in `dccreator`; null handling documented |

```
Raw_C = (2 + 1 + 2 + 2 + 2) / 5 = 9 / 5 = 1.80
```

### Rollup

```
Overall = 1.73 × 0.45 + 1.11 × 0.40 + 1.80 × 0.15
        = 0.779 + 0.444 + 0.270
        = 1.49
```

**TIER: C** (1.0–1.4 band — note: 1.49 rounds to high-C, borderline B)

> **Fairness note**: BASE scores below its intuitive value because (a) the IP allowlisting gate caps C2, (b) score is opaque (A1=1), (c) abstract coverage is sparse (B2=1). The Solr backend has A2=3 which is its genuine strength.

---

## 14. Flags

| Field | Value |
|-------|-------|
| **TOS legal risk** | LOW — non-commercial display and aggregation explicitly permitted; OpenCITE qualifies |
| **Currently quarantined?** | No — `serverSafe: true` in v0.38 |
| **Recommended action** | Register IP allowlist with BASE to unlock reliable access; map `dclink` + `dcrights` + `collection`; upgrade query to boosted Solr phrase syntax |
| **Blocking issues** | IP allowlisting required for production — must register at `base-search.net/about/en/contact.php`; without it, probe IPs are blocked unpredictably |
