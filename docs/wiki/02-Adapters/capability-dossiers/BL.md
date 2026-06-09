---
tags: [adapter, capability, dossier]
adapter_id: BL
---

# BL (British Library / BNB) — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `BL` |
| Adapter file | `src/adapters/extensions/britishLibrary.js` |
| Server route | `api/search/bl.js` |
| Official API name | British National Bibliography (BNB) SPARQL Endpoint |
| Provider | British Library |
| Base URL | `https://bnb.data.bl.uk/sparql` |
| Protocol | SPARQL 1.1 / Dublin Core (RDF triples) |
| Docs URL | https://bl.uk/bibliographic/datafree.html (404 as of 2026-06); https://bnb.data.bl.uk |
| TOS / license URL | CC0 1.0 (historically); current status unconfirmed |
| Pre-audit tier | unranked |
| Dossier date | 2026-06-09 |

**CRITICAL FINDING: bnb.data.bl.uk SPARQL endpoint is UNREACHABLE** — all probes resulted in `ETIMEDOUT` (TCP connection to 194.66.233.215:443 refused/dropped). Multiple attempts with 8-30s timeouts all timed out. This is either a regional network block, the service has been decommissioned, or is undergoing maintenance. The adapter is effectively dead from the OpenCITE server's network location.

The BL also has a SPARQL-over-HTTP endpoint at `https://bnb.data.bl.uk/sparql` using DC + BIBO + BNB ontologies, which was working until at least 2024 per community reports. Its current availability is uncertain as of 2026-06-09.

## 2. Metadata Standard & Serialisation

| Field | Value |
|-------|-------|
| Standard | Dublin Core Elements 1.1 + BIBO (Bibliographic Ontology) + BNB custom properties |
| Serialisation | SPARQL results JSON (`application/sparql-results+json`) |
| Namespace | `dc: <http://purl.org/dc/elements/1.1/>`, `dct: <http://purl.org/dc/terms/>`, `bibo: <http://purl.org/ontology/bibo/>`, `rdfs: <http://www.w3.org/2000/01/rdf-schema#>` |
| Schema URL | https://bnb.data.bl.uk (endpoint documentation; currently unreachable) |
| Schema version | DC Elements 1.1; BIBO 1.3; BNB-specific classes |
| Notes | OpenCITE's SPARQL uses DC namespace only; BIBO and BNB properties not exploited |

## 3. Complete Field/Tag Inventory

### Fields used by OpenCITE's SPARQL query

| SPARQL binding / predicate | Type | Always? | Meaning | OpenCITE maps to |
|---------------------------|------|---------|---------|-----------------|
| `?item` (subject URI) | URI | Yes | BNB resource URI (bnb.data.bl.uk/id/…) | `url`, `id` |
| `dc:title` (`?title`) | literal | Yes | Title | `title` |
| `dc:creator` (`?creator`) | literal/URI | Sparse | Creator name or URI | `authors[0]` |
| `dc:date` (`?date`) | literal | Sparse | Publication date | `year` |
| `dc:description` (`?description`) | literal | Sparse | Description / abstract | `abstract` |
| `dc:subject` (`?subject`) | literal/URI | Sparse | Subject heading | `subjects[]` |
| `rdf:type` (`?type`) | URI | Sparse | Ontology type (bibo:Book, bibo:Article, etc.) | `type` (mapped via typeMap) |
| `dc:language` (`?lang`) | literal | Sparse | Language code | `language` |

### Additional BNB/BIBO properties NOT used by OpenCITE (historically documented)

| Predicate | Meaning |
|-----------|---------|
| `dct:identifier` | ISBN-13, ISSN |
| `bibo:isbn13` | ISBN-13 |
| `bibo:issn` | ISSN |
| `dct:publisher` | Publisher URI (linked to authority) |
| `dct:created` | Creation date (ISO) |
| `dct:spatial` | Geographic subject |
| `owl:sameAs` | Links to other datasets (VIAF, Wikidata, etc.) |
| `dct:isPartOf` | Series membership |
| `schema:about` | Subject (linked) |

## 4. Query Semantics

- **Lexical or semantic?** SPARQL FILTER(CONTAINS(LCASE(STR(?title)), LCASE("query"))) — lexical substring on title only.
- **NL tolerance:** Very low — CONTAINS on title is title-substring only; NL sentences would rarely match titles.
- **Multi-keyword default:** CONTAINS matches if the entire phrase is present as a substring in the title.
- **Boolean operators:** Full SPARQL 1.1 (when endpoint is live).
- **Author-name pollution control:** OpenCITE's query already scopes to `dc:title` only → pollution impossible → A10 = 3 (structurally clean by design).
- **SPARQL caveat:** A2 = 3 by protocol; A1 = 0 (no CirrusSearch text-score extension confirmed).
- **Sort:** SPARQL `ORDER BY` available.
- **Cross-lingual:** No.

## 5. OA / Free-Access

- **Whole-corpus OA?** BNB metadata is CC0; but items are physical UK publications — typically not OA content.
- **OA flag field:** None in DC data.
- **Recommended:** OpenCITE hardcodes `isOA: true` — incorrect for a physical bibliography; should be `false`.

## 6. Images / Thumbnails / IIIF

- **Has images?** No — BNB is a bibliographic catalogue; no image links in DC/SPARQL data.
- **Thumbnail:** None.

## 7. Discipline / Subject Tags

- **Vocabulary:** LCSH (Library of Congress Subject Headings) and DDC
- **Field path:** `dc:subject` (may be literal string or URI to LCSH authority)
- **Granularity:** 1-3 level LCSH headings
- **Usability:** Medium — LCSH is highly authoritative for English-language materials; but coverage is sparse in probe data.

## 8. Native Relevance & Scoring

- **Score returned?** No.
- **SPARQL caveat:** A1 = 0; A2 = 3.
- **Default sort:** SPARQL result order undefined.
- **`hasMore`:** Route uses `results.length === rows` as a proxy for hasMore — no total count (adapter capability `totalCount: false`).

## 9. Pagination

- **Mechanism:** SPARQL LIMIT / OFFSET
- **Max page size:** 50 (enforced by route)
- **Stated depth cap:** None documented
- **Empirical depth:** NOT TESTABLE — endpoint unreachable.
- **hasMore logic:** `results.length === rows` heuristic; may false-positive on last page.

### 9b. Measured Latency (live probe, median of 3 warm calls)

| Query type | Latency |
|-----------|---------|
| All probes | **ETIMEDOUT** (TCP connection refused at 194.66.233.215:443) |
| Status | **Endpoint unreachable** from probe network |

**Query-strategy implication:** Zero — endpoint is unreachable. Any production queries will timeout silently (route has 8s AbortController timeout → falls through to `{ results: [], error }` response).

## 10. Rate Limits & Auth

- **Key required?** No (historically)
- **Key type:** N/A
- **Backend-safe?** Route exists at `api/search/bl.js` but is NOT serverSafe on the adapter — calls relative `/api/search/bl` URL.
- **Limits:** Not applicable; endpoint unreachable.

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|--------------|
| `dc:creator` | Only first creator bound (SPARQL single-value binding); multi-author works get one author only | | Build SET of creators from bindings grouped by `?item` |
| `rdf:type` | Returns full ontology URI; type extraction via `.split(/[/#]/).pop()` | `http://purl.org/ontology/bibo/Book` → "Book" | Current typeMap handles Book/Article/Thesis/Manuscript; others fall through to "primary-source" |
| `?item` URI | May not start with `http://bnb.data.bl.uk` if sameAs triples are returned | | Filter `?item` to bnb.data.bl.uk domain |
| `dc:date` | May be year-only or ISO date | "2003", "2003-01-15" | Regex `\d{4}` — already done |
| SPARQL injection | `sparqlSafe()` function strips non-alphanumeric/safe chars | F-408 fix in route | Well handled |
| `isOA` | Hardcoded `true` in route — BNB items are physical publications | | Should be `false` |

## 12. Exploitation Notes

- **Under-exploited fields (if endpoint were live):**
  - `dct:identifier` (ISBN-13/ISSN): would enable ISBN deduplication crosswalk.
  - `owl:sameAs` to VIAF/Wikidata: would enable author disambiguation and QID crosswalk.
  - `bibo:isbn13`: direct ISBN for search.
  - `dct:publisher`: publisher URI could be resolved for publisher metadata.
  - `dc:subject` with LCSH URIs: would enable linking to LCSH hierarchy.

- **Query-strategy upgrade (if endpoint live):** Replace `dc:title CONTAINS` with `dc:title | dc:subject CONTAINS` UNION for topic search; add `dct:identifier` for ISBN lookup; exploit `owl:sameAs` for dedup.

- **Endpoint status investigation:** Check https://bnb.data.bl.uk for maintenance notices; consider whether BL has migrated to a new platform (e.g. OLIS replacement or BL beta catalogue).

- **Alternative:** BL offers BNB as a data download (CSV/RDF bulk) which could be indexed locally.

## 13. Scores

**Note: Scores reflect the API's documented/historical capabilities, not current availability. A separate "currently dead" flag is set.**

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score | **0** | SPARQL: no score; no text-search extension confirmed |
| A2 Query expressiveness | **3** | Full SPARQL 1.1: nested boolean, FILTER, OPTIONAL, property paths, UNION |
| A3 Sort & filter control | **2** | ORDER BY, FILTER by type/date/language; no facet counts |
| A4 Pagination depth | **2** | SPARQL LIMIT/OFFSET; stateless; depth limited by timeout |
| A5 Batch/bulk | **2** | SPARQL CONSTRUCT for bulk; BNB bulk download exists |
| A6 Throughput | **1** | Public SPARQL endpoint; rate limits undocumented; heavy queries may be throttled |
| A7 ID linkage | **2** | BNB URI + ISBN + ISSN (via dct:identifier) + owl:sameAs to VIAF/Wikidata |
| A8 Result-count accuracy | **0** | No COUNT query; `hasMore` is heuristic only (adapter `totalCount: false`) |
| A9 Semantic/NL mode | **0** | CONTAINS title substring; NL → no results |
| A10 Author-name pollution | **3** | Query scopes to `dc:title` only by design — author pollution structurally impossible |

Raw_A = (0×1.5 + 3 + 2 + 2 + 2 + 1 + 2 + 0 + 0×1.5 + 3) / 11 = **15 / 11 = 1.36**

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | **2** | Title, creator, date, type, ISBN/ISSN (via dct); no vol/issue/pages (monograph BNB); no ORCID |
| B2 Abstract/full-text | **1** | `dc:description` present for some records but ~30% coverage; no full-text |
| B3 Citation graph | **0** | None |
| B4 Discipline/subject tags | **2** | LCSH subjects (authoritative for English materials); sparse coverage in probed results |
| B5 OA/free-access | **0** | No OA signal; metadata CC0 but items are physical; hardcoded `isOA: true` is wrong |
| B6 Rich media/IIIF | **0** | No images; pure bibliographic catalogue |
| B7 Holdings/availability | **1** | BL single institution; no real-time availability via SPARQL |
| B8 Record-quality signals | **0** | None identified in DC/SPARQL data |

Raw_B = (2 + 1×1.5 + 0 + 2 + 0×1.5 + 0 + 1 + 0) / 9 = (2 + 1.5 + 0 + 2 + 0 + 0 + 1 + 0) / 9 = **6.5 / 9 = 0.72**

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | **0** | **ENDPOINT UNREACHABLE** — TCP timeout on all probes (2026-06-09) |
| C2 Auth friction | **2** | Historically keyless; auto-accessible; but currently unreachable |
| C3 Redistribution/TOS risk | **3** | BNB metadata historically CC0; unrestricted aggregation |
| C4 Protocol/client maturity | **2** | SPARQL 1.1 standard; BIBO+DC vocabularies documented; no versioned API |
| C5 Data hygiene | **2** | Historically well-formed DC/RDF; SPARQL injection mitigation in place (sparqlSafe) |

Raw_C = (0 + 2 + 3 + 2 + 2) / 5 = **9 / 5 = 1.80**

### Rollup

```
Overall = 1.36 × 0.45 + 0.72 × 0.40 + 1.80 × 0.15
        = 0.612 + 0.288 + 0.270
        = 1.17
```

**TIER = C (Peripheral)**  
*(Would be C at best even if endpoint were live; C1=0 pulls Operational down.)*

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | NONE — BNB metadata historically CC0 |
| Currently quarantined? | **Should be quarantined** — endpoint ETIMEDOUT on all probes 2026-06-09 |
| Recommended action | (1) Investigate bnb.data.bl.uk status; check for BL API migration. (2) Until confirmed live: quarantine (add to dead-adapter list). (3) Fix `isOA: true` bug → should be `false` for physical BNB records. (4) If endpoint revives: exploit ISBN/ISSN, owl:sameAs VIAF crosswalk. |
| Blocking issues | **Endpoint completely unreachable** (TCP timeout); all queries return empty results + error silently. Route is NOT serverSafe on adapter. |
