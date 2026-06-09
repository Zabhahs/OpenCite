---
tags: [adapter, capability, dossier]
adapter_id: BDH
---

# BDH — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `BDH` |
| Adapter files | `src/adapters/extensions/bdh.js`, `api/search/bdh.js` |
| Server route | `api/search/bdh.js` (Vercel Edge; proxies to datos.bne.es) |
| Official API name | datos.bne.es Linked Data / SPARQL endpoint |
| Provider | Biblioteca Nacional de España (BNE) |
| Base URL (server route uses) | `https://datos.bne.es/api/records` (REST — 404 as of 2026-06) |
| Actual working endpoint | `https://datos.bne.es/sparql` (SPARQL via Virtuoso) |
| Protocol | **REST-JSON (as coded in route) — DEAD. Real protocol: SPARQL 1.1 / Virtuoso OpenLink** |
| Docs URL | https://datos.bne.es (403 from crawler); no public API documentation found |
| TOS / license URL | UNKNOWN — needs research; BNE data portal suggests open data |
| Pre-audit tier | unranked |
| Dossier date | 2026-06-09 |

**CRITICAL FINDING:** The server route `api/search/bdh.js` calls `https://datos.bne.es/api/records?q=...` which returns HTTP 404. The REST endpoint `/api/records` no longer exists. The actual datos.bne.es API is a SPARQL endpoint at `https://datos.bne.es/sparql` using a custom ISBD-LRM-based ontology (`https://datos.bne.es/def/*`). The adapter is currently broken.

## 2. Metadata Standard & Serialisation

| Field | Value |
|-------|-------|
| Standard | BNE ISBD-LRM ontology (custom; `https://datos.bne.es/def/`) + `rdfs:label` + DC Terms (`dct:language`, `dct:relation`) |
| Serialisation | SPARQL results JSON (`application/sparql-results+json`) |
| Named graphs | `http://datos.bne.es/graph/bibliograficos` (records), `http://datos.bne.es/graph/autoridades` (authorities), `http://datos.bne.es/graph/materias` (subjects) |
| Schema URL | No public schema documentation; ontology at `https://datos.bne.es/def/` (individual property URIs) |
| Triple count | ~17.9M triples in bibliograficos graph (live COUNT probe) |
| Backend | Virtuoso Universal Server (OpenLink Software) |

## 3. Complete Field/Tag Inventory

### BNE bibliographic record properties (from live SPARQL probe of record `Mica0000015683`)

| Predicate URI | Type | Meaning | OpenCITE currently maps to |
|--------------|------|---------|---------------------------|
| `rdf:type` | URI | Record type (C1001=book?, C1003=cartographic?, etc.) | not mapped |
| `rdfs:label` | literal | Main title / display label | not used (route uses `rec.title` from dead REST) |
| `dct:language` | URI (`id.loc.gov/vocabulary/languages/spa`) | Language via LoC vocab | not mapped |
| `datos.bne.es/def/id` | literal | Internal BNE ID | not mapped |
| `datos.bne.es/def/P3001` | literal | Publisher/creator corporate name | not mapped |
| `datos.bne.es/def/P3002` | literal | Title proper | not mapped |
| `datos.bne.es/def/P3003` | literal | Place of publication | not mapped |
| `datos.bne.es/def/P3004` | literal | Physical medium / format | not mapped |
| `datos.bne.es/def/P3005` | literal | General material designation | not mapped |
| `datos.bne.es/def/P3006` | literal | Date/year of publication | not mapped |
| `datos.bne.es/def/P3007` | literal | Physical dimensions | not mapped |
| `datos.bne.es/def/P3008` | literal | Statement of responsibility | not mapped |
| `datos.bne.es/def/P3012` | literal | Colour / illustration notes | not mapped |
| `datos.bne.es/def/P3015` | literal | General notes | not mapped |
| `datos.bne.es/def/P3017` | literal | Edition statement | not mapped |
| `datos.bne.es/def/P3026` | literal | Extended publication notes | not mapped |
| `datos.bne.es/def/P3035` | literal | Scale (for cartographic) | not mapped |
| `datos.bne.es/def/P3064` | literal | Material type label | not mapped |
| `datos.bne.es/def/P3066` | URI (image URL) | Digitised image URL (bdh-rd.bne.es/low.raw?id=…) | not mapped ★ |
| `datos.bne.es/def/P3093` | literal | Digital collection name (e.g. "Biblioteca Digital Hispánica") | not mapped |
| `datos.bne.es/def/OP3001` | URI | Link to digitised viewer or related resource | not mapped ★ |
| `datos.bne.es/def/OP3002` | URI | Link to subject record | not mapped |
| `datos.bne.es/def/OP3006` | URI | Link to authority record (subject) | not mapped |
| `dct:relation` | URI | Related record | not mapped |

★ `P3066` = image URL (format: `http://bdh-rd.bne.es/low.raw?id=XXXXXXXX&name=00000001.jpg`) — enables thumbnails for digitised items.
★ `OP3001` = multiple links including BDH viewer URL (`http://bdh-rd.bne.es/viewer.vm?id=…`).

### Additional predicates found across the bibliograficos graph (from SPARQL enumerate)
P3040, P3044, P3045, P3047, P3048, P3051, P3052, P3054, P3055, P3056, P3057, P3059, P3060, P3063, P3065, P3073, P3074, P3076, P3077, P3079, P3082, P3083, P3084, P3085, P3094, OP3003, OP3004, OP3007, OP3008, OP3009, OP3010, OP3011, OP4001 — these likely cover: ISSN/ISBN, edition, subjects, authority links, format details. Full ontology mapping not publicly documented.

## 4. Query Semantics

- **Lexical or semantic?** SPARQL FILTER(CONTAINS(LCASE(STR(?label)), "...")) — lexical substring, case-insensitive. No stemming, no semantic mode.
- **NL tolerance:** Very low — CONTAINS with a full NL sentence → timeout (confirmed: 15s timeout exceeded for multi-word NL query against `rdfs:label`).
- **Multi-keyword default:** SPARQL CONTAINS on single string; multi-word queries only match if all words appear in sequence in the label (substring, not tokenised AND).
- **Phrase syntax:** SPARQL CONTAINS is substring match — effectively phrase-only.
- **Boolean operators:** Full SPARQL 1.1 — AND/OR/NOT, FILTER, UNION, OPTIONAL, property paths.
- **Author-name pollution control:** SPARQL allows scoping to P3002 (title) vs P3008 (statement of responsibility); structurally possible but not implemented. A10 = 1 (scoping param technically available but undocumented/complex).
- **Text search:** Virtuoso has FTS extension (`bif:contains`) but not confirmed as accessible on this public endpoint; CONTAINS is slow for label-scan.
- **Cross-lingual:** No.
- **Named graph requirement:** Must specify `GRAPH <http://datos.bne.es/graph/bibliograficos>` — queries without graph context return empty results (confirmed by probe).
- **Sort:** `ORDER BY` in SPARQL — available but no ranking.
- **Pagination:** `LIMIT/OFFSET` in SPARQL.

## 5. OA / Free-Access

- **Whole-corpus OA?** Partial — BDH (Biblioteca Digital Hispánica) items are digitised and free to view; other catalogue items are physical holdings.
- **OA flag field:** `datos.bne.es/def/P3093` = "Biblioteca Digital Hispánica" identifies items in the digital collection; `OP3001` contains viewer URL.
- **Best-OA URL:** `OP3001` contains `bdh-rd.bne.es/viewer.vm?id=…` for digital items.
- **OA-only filter param:** Filter `?s <datos.bne.es/def/P3093> "Biblioteca Digital Hispánica"` — possible in SPARQL.
- **Flag coverage:** P3093 present for BDH items; ~400,000 estimated BDH items out of ~17M triples total.
- **Recommended "free only" strategy:** `FILTER EXISTS { ?s <https://datos.bne.es/def/P3093> ?col }`.

## 6. Images / Thumbnails / IIIF

- **Has images?** Yes — BDH digitised items have image URLs.
- **Thumbnail field:** `datos.bne.es/def/P3066` → `http://bdh-rd.bne.es/low.raw?id=XXXXXXXX&name=00000001.jpg`
- **Full-res:** Higher-res variants accessible by modifying URL params.
- **IIIF manifest:** Not confirmed in SPARQL data; BDH viewer may have IIIF support but not exposed via SPARQL.
- **Multi-image:** Multi-page items accessible via viewer but not as IIIF sequence via SPARQL.
- **Display strategy:** Extract P3066 for thumbnail; build viewer URL from OP3001.

## 7. Discipline / Subject Tags

- **Vocabulary:** BNE subject authority (`datos.bne.es/graph/materias`); linked via `OP3006` to authority URIs.
- **Field path:** `OP3006` → URI in `graph/autoridades`; `rdfs:label` of that URI is the heading.
- **Granularity:** Requires 2-hop SPARQL to get full subject label.
- **Facet/filter param:** `FILTER(CONTAINS(STR(?subject_uri), "term"))` or join to materias graph.
- **Usability:** Low — subject access requires extra SPARQL hop; label not in-record; complex for real-time use.

## 8. Native Relevance & Scoring

- **Score returned?** No — SPARQL SELECT returns no score (no CirrusSearch text-search extension confirmed).
- **SPARQL caveat applies:** A2 = 3 (full SPARQL expressiveness); A1 = 0 (no score).
- **Default sort:** SPARQL result order is undefined; add `ORDER BY ?label` for determinism.

## 9. Pagination

- **Mechanism:** SPARQL LIMIT / OFFSET
- **Max page size:** No formal cap; Virtuoso may enforce timeout-based limits.
- **Stated depth cap:** None documented.
- **Empirical depth:** Not tested beyond LIMIT 5; CONTAINS-scan on 17M triples → timeout risk for deep offsets.
- **Cursor expiry:** N/A (stateless)

### 9b. Measured Latency (live probe, median of 3 warm calls)

| Query type | Latency |
|-----------|---------|
| LIMIT 1 trivial | 1,125 ms |
| CONTAINS keyword (LIMIT 5) | 369 ms (warm median; BDH_WARM1: 1001, BDH_WARM2: 369, BDH_WARM3: 363) |
| NL full sentence CONTAINS | TIMEOUT (>15s) |
| Cold vs warm | +600ms cold |
| Extra resolve round-trips | +1 hop for subjects; +1 hop for author labels |

**Query-strategy implication:** Short keyword CONTAINS on `rdfs:label` is fast (~370ms warm); NL/multi-word CONTAINS times out. Use short 1-2 word queries. Consider Virtuoso FTS (`bif:contains`) if accessible.

## 10. Rate Limits & Auth

- **Key required?** No (public SPARQL endpoint)
- **Backend-safe?** Yes (edge route calls datos.bne.es SPARQL; no per-user auth)
- **Limits:** Not documented; Virtuoso public endpoints typically throttle long-running queries.
- **REST endpoint (`/api/records`):** DEAD — HTTP 404. Route must be rewritten to use SPARQL.
- **CORS:** datos.bne.es has CORS headers? Not tested; edge route bypasses CORS.

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|--------------|
| `rdfs:label` | May contain square-bracket-qualified title: "[Atlas de la Mer Baltique]" | "[Atlas de la Mer Baltique]" | Strip leading/trailing `[]` for display |
| Date (`P3006`) | Free-text with diacritics: "[1980]", "↑1979", "1886-1945" | "↑1979" (arrow = circa) | Regex `\d{4}` first match |
| Language (`dct:language`) | URI, not string: `http://id.loc.gov/vocabulary/languages/spa` | | Extract last path segment (`spa`) |
| Image URL (`P3066`) | HTTP not HTTPS | `http://bdh-rd.bne.es/low.raw?...` | Upgrade to HTTPS |
| SPARQL binding | `"type": "uri"` vs `"type": "literal"` polymorphism | language is URI; label is literal | Check binding type before extracting `.value` |
| Named graph | Queries without GRAPH clause return VirtRDF system triples | `{ ?s ?p ?o } LIMIT 3` → returns VirtRDF | Always specify named graph |
| REST 404 | Current route hits `/api/records` which is dead | HTTP 404 | Route must be rewritten to SPARQL |

## 12. Exploitation Notes

- **CRITICAL — Route is broken:** `api/search/bdh.js` uses `https://datos.bne.es/api/records` which returns 404. Must be rewritten to use `https://datos.bne.es/sparql` with GRAPH-scoped CONTAINS query on `rdfs:label`.

- **Under-exploited fields:**
  - `P3066` (image URL): provides free thumbnail access for digitised items — not mapped at all.
  - `OP3001` (viewer URL): direct BDH digital viewer link.
  - `P3093` ("Biblioteca Digital Hispánica") flag: enables OA-only filtering.
  - `P3002` (title proper): more reliable than `rdfs:label` for title extraction (label may include provenance).
  - `P3006` (date): available but not extracted in current broken route.
  - SPARQL expressiveness (A2=3): can filter by type, date range, digital collection — powerful when route is fixed.

- **Query-strategy upgrade:** Replace dead REST with:
  ```sparql
  SELECT ?s ?label ?date ?img ?viewer WHERE {
    GRAPH <http://datos.bne.es/graph/bibliograficos> {
      ?s rdfs:label ?label .
      FILTER(CONTAINS(LCASE(STR(?label)), LCASE("QUERY")))
      OPTIONAL { ?s <https://datos.bne.es/def/P3006> ?date }
      OPTIONAL { ?s <https://datos.bne.es/def/P3066> ?img }
      OPTIONAL { ?s <https://datos.bne.es/def/OP3001> ?viewer }
    }
  } LIMIT 20 OFFSET 0
  ```

- **Batch/harvest:** SPARQL CONSTRUCT available for bulk export; no OAI-PMH.

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score | **0** | SPARQL: no score; no CirrusSearch extension confirmed |
| A2 Query expressiveness | **3** | Full SPARQL 1.1: nested boolean, property paths, UNION, FILTER, OPTIONAL, named graphs |
| A3 Sort & filter control | **2** | ORDER BY, FILTER by type/date/collection/language; no facet counts |
| A4 Pagination depth | **2** | SPARQL LIMIT/OFFSET; stateless; depth limited by query timeout risk |
| A5 Batch/bulk | **2** | SPARQL CONSTRUCT for bulk; SELECT for harvest; no resumption token but OFFSET-based |
| A6 Throughput | **1** | NL/long queries timeout; public Virtuoso endpoint; rate limits undocumented |
| A7 ID linkage | **1** | BNE internal IDs, language via LoC URI; no DOI/ORCID/ISBN directly in core record |
| A8 Result-count accuracy | **1** | COUNT(*) works but large CONTAINS-scan results may be slow; no paged total |
| A9 Semantic/NL mode | **0** | CONTAINS substring; NL sentence → timeout |
| A10 Author-name pollution | **1** | SPARQL can scope to P3002 (title) vs P3008 (statement of responsibility) but complex; not documented |

Raw_A = (0×1.5 + 3 + 2 + 2 + 2 + 1 + 1 + 1 + 0×1.5 + 1) / 11 = **13 / 11 = 1.18**

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | **2** | Title (P3002/rdfs:label), publisher (P3001), date (P3006), language (dct:language), place (P3003); no structured author in probed records; no DOI |
| B2 Abstract/full-text | **0** | No abstract field identified in SPARQL data |
| B3 Citation graph | **0** | None |
| B4 Discipline/subject tags | **1** | Subject authority linked via OP3006 URI; requires 2-hop; label not in-record |
| B5 OA/free-access | **2** | P3093 flag + OP3001 viewer URL + P3066 image for BDH items; reliable for digitised subset; filter available |
| B6 Rich media/IIIF | **2** | P3066 image URL + OP3001 viewer link for digitised items; no IIIF manifest confirmed |
| B7 Holdings/availability | **1** | Single institution; viewer link; no call number |
| B8 Record-quality signals | **0** | None identified |

Raw_B = (2 + 0×1.5 + 0 + 1 + 2×1.5 + 2 + 1 + 0) / 9 = (2 + 0 + 0 + 1 + 3 + 2 + 1 + 0) / 9 = **9 / 9 = 1.00**

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | **1** | ~370ms warm for short queries; NL timeout; REST endpoint dead (route broken) |
| C2 Auth friction | **3** | Keyless public SPARQL; edge route handles |
| C3 Redistribution/TOS risk | **2** | UNKNOWN TOS; BNE Linked Data typically CC-BY or public domain; datos.bne.es is "open data" portal |
| C4 Protocol/client maturity | **1** | SPARQL endpoint live but undocumented; no public API docs; REST endpoint dead; custom undocumented ontology |
| C5 Data hygiene | **2** | SPARQL bindings consistent; known URI vs literal polymorphism; date free-text; label bracket hazards |

Raw_C = (1 + 3 + 2 + 1 + 2) / 5 = **9 / 5 = 1.80**

### Rollup

```
Overall = 1.18 × 0.45 + 1.00 × 0.40 + 1.80 × 0.15
        = 0.531 + 0.400 + 0.270
        = 1.20
```

**TIER = C (Peripheral)**

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | LOW (datos.bne.es is an open data portal; likely CC-BY or public domain) |
| Currently quarantined? | No — but **BROKEN**: REST endpoint returns HTTP 404. All requests return empty results silently. |
| Recommended action | URGENT: Rewrite `api/search/bdh.js` to use SPARQL endpoint with rdfs:label CONTAINS query on bibliograficos graph; add P3066 image and P3093 OA flag extraction |
| Blocking issues | **Route is completely broken** — `/api/records` returns 404. Zero results returned for all queries. Fix = rewrite to SPARQL. |
