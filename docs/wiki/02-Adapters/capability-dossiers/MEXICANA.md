---
tags: [adapter, capability, dossier]
adapter_id: MEXICANA
---

# MEXICANA — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `MEXICANA` |
| Adapter file | `src/adapters/extensions/mexicana.js` |
| Server route | `api/search/mexicana.js` |
| Official API name | Mexicana OAI-PMH Repository |
| Provider | Secretaría de Cultura (Mexican Ministry of Culture) |
| Base URL | `https://mexicana.cultura.gob.mx/oai` |
| Protocol | OAI-PMH 2.0 / Dublin Core (oai_dc) |
| Docs URL | https://mexicana.cultura.gob.mx (cert expired; HTTP redirects to HTTPS; 404 on HTTP) |
| TOS / license URL | UNKNOWN — needs research; Mexican government open data |
| Pre-audit tier | unranked |
| Dossier date | 2026-06-09 |

**FINDING: Endpoint has SSL certificate issues.** Live probe: HTTPS returns cert-expired error; HTTP redirects or times out. The Vercel edge route will fail on cert validation. The adapter was designed to handle this (ignoring expired cert is done by some proxies/clouds), but direct Node.js probes confirm the cert is expired as of 2026-06-09. The Vercel Edge runtime may or may not accept expired certificates depending on its TLS configuration.

## 2. Metadata Standard & Serialisation

| Field | Value |
|-------|-------|
| Standard | Dublin Core (oai_dc) via OAI-PMH |
| Serialisation | XML; OAI-PMH `<ListRecords>` response with `<oai_dc:dc>` elements |
| Namespace | `http://www.openarchives.org/OAI/2.0/oai_dc/` + `http://purl.org/dc/elements/1.1/` |
| Schema URL | http://www.openarchives.org/OAI/2.0/oai_dc.xsd |
| Schema version | Dublin Core Elements 1.1 via OAI-PMH 2.0 |
| Notes | OAI-PMH = harvest protocol, not search. ListRecords fetches all records; client-side filtering on keyword. |

## 3. Complete Field/Tag Inventory

### Dublin Core fields in `<oai_dc:dc>` (from OAI-PMH ListRecords)

| DC element | Type | Always? | Meaning | OpenCITE maps to |
|-----------|------|---------|---------|-----------------|
| `dc:title` | string | Yes | Item title | `title` + client-side filter |
| `dc:creator` | string (may repeat) | Sparse | Creator/author | `authors[]` |
| `dc:subject` | string (may repeat) | Frequent | Subject keywords | `subjects[]` + client-side filter |
| `dc:description` | string (may repeat) | Moderate | Description / abstract | `abstract` + client-side filter |
| `dc:publisher` | string | Sparse | Institution / publisher | `publisher` |
| `dc:contributor` | string | Sparse | Additional contributor | not mapped |
| `dc:date` | string | Frequent | Date of record/item | `year` |
| `dc:type` | string | Sparse | Document type | `type` |
| `dc:format` | string | Sparse | Format / MIME type | not mapped |
| `dc:identifier` | string | Yes | URL or local identifier | `url` |
| `dc:source` | string | Sparse | Source institution | not mapped |
| `dc:language` | string | Sparse | Language code | `language` |
| `dc:relation` | string | Sparse | Related items | not mapped |
| `dc:coverage` | string | Sparse | Temporal/geographic coverage | not mapped |
| `dc:rights` | string | Sparse | Rights statement | not mapped |

### OAI-PMH envelope fields (not DC)

| Element | Meaning | OpenCITE maps to |
|---------|---------|-----------------|
| `<header><identifier>` | OAI-PMH item identifier | not mapped (records parsed from `<record>` blocks) |
| `<header><datestamp>` | Last modification date | not mapped |
| `<header><setSpec>` | Set membership | not mapped |
| `<resumptionToken>` | Pagination cursor | `nextPageToken` (v0.38 fix: correctly mapped) |
| `<resumptionToken completeListSize>` | Total record count | not mapped (no totalCount) |

## 4. Query Semantics

- **Lexical or semantic?** Neither — OAI-PMH ListRecords does not support keyword search. The server route fetches a batch of ~50 records and client-side filters on `title.includes(q) || desc.includes(q) || subj.includes(q)`.
- **NL tolerance:** N/A — client-side `includes()` is literal substring. NL queries reduce recall to near-zero.
- **Multi-keyword default:** Single lowercase `includes()` on each field; effectively substring AND in the concatenated field.
- **Author-name pollution control:** Client-side filter checks title, description, AND subject — not creator. Subjects and description may match author names incidentally. No fielded scope parameter.
- **Sort:** None — order is OAI-PMH harvest order (typically by record ID / ingestion date).
- **Cross-lingual:** No.

**Protocol caveat:** OAI-PMH = A1=0 (no score), A2=0 (no fielded search by spec), A5=3 (ListRecords is the bulk harvest mechanism).

## 5. OA / Free-Access

- **Whole-corpus OA?** Mexican Ministry of Culture collections — primarily freely accessible heritage items. `isOA` hardcoded `true` in route.
- **OA flag field:** `dc:rights` may contain rights statement; not parsed.
- **Best-OA URL:** `dc:identifier` contains direct URL when it starts with `http`.
- **Filter param:** Not available (harvest-only protocol).
- **Assessment:** `isOA: true` is reasonably correct for Mexicana's heritage focus, but `dc:rights` should be parsed for accuracy.

## 6. Images / Thumbnails / IIIF

- **Has images?** Likely — Mexican heritage collections include photographs, artworks, manuscripts.
- **Thumbnail field:** None in standard OAI-DC. May appear in `dc:identifier` or `dc:relation` for image items.
- **IIIF:** Not confirmed; repository may have IIIF support but not exposed via OAI-PMH.
- **Display strategy:** Extract any `http` value from `dc:identifier` as item URL; no thumbnail.

## 7. Discipline / Subject Tags

- **Vocabulary:** Free-text keywords (no controlled vocabulary confirmed in OAI-DC)
- **Field path:** `dc:subject` (may repeat)
- **Granularity:** 1 level; free text
- **Facet/filter param:** None (client-side only)
- **Usability:** Low — used only for client-side filtering; no structured subject search.

## 8. Native Relevance & Scoring

- **Score returned?** No — OAI-PMH has no concept of relevance scoring.
- **Effective search quality:** Client-side `includes()` — zero ranking beyond harvest order.
- **Protocol caveat:** A1 = 0, A2 = 0 by OAI-PMH spec.

## 9. Pagination

- **Mechanism:** OAI-PMH resumptionToken (cursor-based)
- **Param names:** `resumptionToken` in OAI-PMH; `opts.pageToken` in adapter; `token` in route.
- **Page size:** Fixed by OAI-PMH server (typically 100-500 records per batch); route filters down to `rows` (max 50) from the batch.
- **Stated depth cap:** None — OAI-PMH can harvest full corpus with resumption tokens.
- **Empirical depth:** Not testable (cert expired).
- **Cursor expiry:** OAI-PMH resumption tokens may expire after a defined interval (typically hours).

### 9b. Measured Latency (live probe, median of 3 warm calls)

| Query type | Latency |
|-----------|---------|
| All probes | **FAILED** — SSL cert expired (HTTPS); HTTP 404 or timeout |
| Status | **Endpoint unreachable** via direct Node.js probes |

**Query-strategy implication:** Cannot measure. Historically OAI-PMH ListRecords is slow (~2-5s per batch of 100 records). "Search" quality depends entirely on which batch is fetched — entirely random relative to query relevance.

## 10. Rate Limits & Auth

- **Key required?** No
- **Auth:** None (OAI-PMH is public)
- **Backend-safe?** NOT serverSafe on adapter (calls relative `/api/search/mexicana` URL).
- **SSL status:** Certificate expired as of 2026-06-09. Vercel Edge runtime behaviour with expired cert unknown.
- **Rate limits:** OAI-PMH — typically polite harvesting expected; no rate limit documented.

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|--------------|
| `dc:identifier` | May not start with `http`; may be local opaque identifier | "oai:mexicana:12345" | Check `startsWith('http')` — already done |
| `dc:date` | Various formats: "2020", "2020-01-01", "siglo XVIII" | "siglo XVIII" | Regex `\d{4}` — may miss or fail for non-year strings |
| Client-side filter | `rawRecords.filter()` on full batch — if batch has 0 keyword matches, returns empty set with hasMore=true (misleading) | | Current implementation correct per batch; user sees "no results" despite hasMore |
| `extractAll(xml, tag)` | Regex strips XML tags from inner content via `.replace(/<[^>]+>/g, '')` — may merge adjacent elements | Multi-line DC content with nested tags | Adequate for OAI-DC which is simple; hazardous for complex markup |
| Resumption token | Token validated with `/^[\w%=+/\-.@:*]+$/` — F-409 fix. However token may be URL-encoded already; double-encoding risk? | | `encodeURIComponent(token)` applied after validation; safe. |
| `dc:description` | May contain HTML markup (institutional systems often include `<br>`, `&nbsp;`) | `<br>Texto en español` | Strip markup — `extractAll` strips via regex; HTML entities not decoded |
| SSL cert expired | Node.js rejects expired cert by default | CERT_HAS_EXPIRED error | Vercel Edge may have different TLS handling; needs verification |

## 12. Exploitation Notes

- **OAI-PMH is fundamentally wrong for keyword search:** The protocol is designed for bulk harvest, not interactive search. "Searching" via client-side filter on random batches gives random results with no connection to relevance. The effective recall for a specific query is `(matching records in current batch) / (matching records in full corpus)` ≈ very low unless corpus is small.

- **Correct use of Mexicana:** Either (a) full harvest mode — import all ~700K records into OpenCITE's own index for proper BM25F search, or (b) accept that MEXICANA returns a sample of vaguely relevant records with no ranking guarantee.

- **Under-exploited fields:**
  - `dc:coverage` (temporal/geographic coverage): relevant for cultural heritage filtering.
  - `dc:rights`: should be parsed for `isOA`.
  - OAI-PMH `completeListSize` attribute on `<resumptionToken>`: exposes total corpus size.
  - `dc:type`: available but not reliably populated.
  - `dc:identifier` (multiple): first may be local ID; second may be a URL — need to try all values.

- **Endpoint SSL fix:** Mexican gov site cert has expired; the Vercel Edge runtime may accept it (some runtimes disable cert validation for outbound requests), but this should be tracked.

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score | **0** | OAI-PMH: no score by protocol |
| A2 Query expressiveness | **0** | OAI-PMH ListRecords: no keyword search parameter by spec |
| A3 Sort & filter control | **0** | No sort or filter; harvest-only |
| A4 Pagination depth | **2** | OAI-PMH resumption token = cursor; can traverse full corpus; no depth cap |
| A5 Batch/bulk | **3** | ListRecords = full harvest mechanism; resumption token pagination; delta via `from`/`until` date params |
| A6 Throughput | **1** | OAI-PMH is batch-oriented; slow per call; polite harvesting expected; no stated limit |
| A7 ID linkage | **1** | OAI-PMH identifier; `dc:identifier` URL; no DOI/ORCID/ISBN |
| A8 Result-count accuracy | **0** | No result count for keyword search; `total` = number of matches in current batch only |
| A9 Semantic/NL mode | **0** | OAI-PMH: N/A; client-side `includes()` is lexical substring |
| A10 Author-name pollution | **1** | Client-side filter checks title + description + subject but NOT creator; partial scope |

Raw_A = (0×1.5 + 0 + 0 + 2 + 3 + 1 + 1 + 0 + 0×1.5 + 1) / 11 = **8 / 11 = 0.73**

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | **1** | Title + partial creator/date/publisher in DC; no structured citations; no ORCID/DOI |
| B2 Abstract/full-text | **2** | `dc:description` present ~60%+ for cultural heritage items; used for client-side filter |
| B3 Citation graph | **0** | None |
| B4 Discipline/subject tags | **1** | `dc:subject` present as free-text keywords; no controlled vocabulary |
| B5 OA/free-access | **2** | Ministry of Culture = publicly accessible heritage; `isOA: true` reasonable; `dc:rights` not parsed |
| B6 Rich media/IIIF | **1** | Likely thumbnails in identifier field for image items; no IIIF confirmed; non-standard |
| B7 Holdings/availability | **1** | Single national institution; no call number or availability |
| B8 Record-quality signals | **0** | None |

Raw_B = (1 + 2×1.5 + 0 + 1 + 2×1.5 + 1 + 1 + 0) / 9 = (1 + 3 + 0 + 1 + 3 + 1 + 1 + 0) / 9 = **10 / 9 = 1.11**

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | **0** | **SSL cert expired** — endpoint unreachable via TLS; HTTP redirects also fail; no SLA |
| C2 Auth friction | **3** | Keyless; OAI-PMH is public |
| C3 Redistribution/TOS risk | **2** | Mexican government cultural data; typically open; no explicit CC license confirmed |
| C4 Protocol/client maturity | **2** | OAI-PMH 2.0 is a mature, well-documented standard; implementation is standard-compliant |
| C5 Data hygiene | **1** | Typical OAI-DC quality: inconsistent dates, possible HTML in description, sparse creator fields; client-side filter may silently fail |

Raw_C = (0 + 3 + 2 + 2 + 1) / 5 = **8 / 5 = 1.60**

### Rollup

```
Overall = 0.73 × 0.45 + 1.11 × 0.40 + 1.60 × 0.15
        = 0.329 + 0.444 + 0.240
        = 1.01
```

**TIER = C (Peripheral)** (borderline C/D)

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | LOW (Mexican government cultural heritage; likely open data) |
| Currently quarantined? | No — but **SSL cert expired**: Vercel Edge behaviour with expired cert unverified; may produce silent failures |
| Recommended action | (1) Verify if Vercel Edge runtime accepts expired certs for outbound requests. (2) Consider moving to full-harvest mode for this adapter (import to local index). (3) Fix `dc:rights` parsing for `isOA`. (4) Consider quarantine if cert not renewed. |
| Blocking issues | SSL cert expired — endpoint unreachable in standard TLS environments. Adapter architecture (OAI-PMH harvest + client-side filter) is fundamentally unsuitable for keyword search; returns random-sample results with no relevance ranking. |
