---
tags: [adapter, capability, dossier]
adapter_id: WIKIDATA
---

# WIKIDATA — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `WIKIDATA` |
| Source file | `src/adapters/extensions/wikidata.js` |
| Official API name | Wikidata MediaWiki Action API (CirrusSearch) + SPARQL Query Service |
| Provider | Wikimedia Foundation |
| Base URL (Action API) | `https://www.wikidata.org/w/api.php` |
| Base URL (SPARQL) | `https://query.wikidata.org/sparql` |
| Base URL (Wikibase REST) | `https://www.wikidata.org/w/rest.php/wikibase/v0/` |
| Protocol | MediaWiki Action API (JSON) + SPARQL 1.1 |
| Docs URL | https://www.wikidata.org/wiki/Wikidata:Data_access, https://www.mediawiki.org/wiki/API:Search |
| TOS / License URL | https://www.wikidata.org/wiki/Wikidata:Licensing (CC0) |
| Pre-audit tier | — |
| Dossier date | 2026-06-08 |

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard(s) | Wikibase data model (JSON); RDF via SPARQL; JSON-LD via Linked Data Interface |
| Serialization | JSON (Action API / REST), SPARQL results JSON/XML/CSV/TSV, RDF/Turtle/N-Triples |
| Schema/OpenAPI URL | https://www.wikidata.org/wiki/Wikidata:Data_model |
| Schema version | Wikibase stable; SPARQL endpoint SchemaVersion versioned implicitly |

**Two query surfaces — scored on the richer (SPARQL):**

- **Surface 1: CirrusSearch (Action API)** — full-text search over entity labels/descriptions/aliases; returns QIDs with snippets + total hits. Requires `wbgetentities` batch for full claims.
- **Surface 2: SPARQL (query.wikidata.org)** — full SPARQL 1.1 + Wikibase extensions (wikibase:label service, GeoSPARQL, full-text search via `wikibase:mwapi`). Most expressive possible query surface; unlimited crosswalk potential.

*OpenCITE currently uses Surface 1 only.*

## 3. Complete Field / Tag Inventory

### From CirrusSearch (`action=query&list=search`)

| Field path | Type | Always? | Meaning | OpenCITE maps to |
|-----------|------|---------|---------|-----------------|
| `query.search[].title` | string | Yes | QID e.g. `Q28018765` | entity lookup key |
| `query.search[].snippet` | string (HTML) | Yes | Label + description snippet | unmapped |
| `query.search[].wordcount` | int | Yes | Token count in description | unmapped |
| `query.search[].timestamp` | string (ISO) | Yes | Last-modified date | unmapped |
| `query.searchinfo.totalhits` | int | Yes | Total matching items | `total` |

### From `wbgetentities` (entity claims — P-properties)

| Property | Field meaning | Always? | OpenCITE maps to |
|----------|--------------|---------|-----------------|
| P1476 | Title (monolingual) | ~85% scholarly items | `title` |
| P577 | Publication date | ~80% | `year` |
| P356 | DOI | ~60% | `doi` |
| P698 | PMID | ~30% | unmapped |
| P818 | arXiv ID | ~15% | unmapped |
| P1433 | Published in (journal QID) | ~70% | `journal` (via label) |
| P50 | Author (item QID) | ~50% | `authors` (via label) |
| P2093 | Author name string | ~70% | `authors` (direct string) |
| P921 | Main subject (QID) | ~50% | `subjects` (via label) |
| P304 | Pages | ~60% | `pages` |
| P478 | Volume | ~55% | `volume` |
| P433 | Issue | ~45% | `issue` |
| P123 | Publisher (QID) | ~40% | `publisher` (via label) |
| P407 | Language of work (QID) | ~60% | `language` (via LANG_MAP) |
| P953 | Full-text URL | ~25% | `url` fallback |
| P2860 | Cites (item QIDs) | ~20% | unmapped (★ citation graph) |
| P3181 | OpenCitations ID | ~10% | unmapped |
| P5875 | ResearchGate ID | ~10% | unmapped |
| P698 | PubMed ID | ~30% | unmapped |
| P6179 | Dimensions Publication ID | ~5% | unmapped |
| P8978 | DBLP ID | ~5% | unmapped |
| `labels.en.value` | English label | ~95% | title fallback |
| `descriptions.en.value` | Short description | ~90% | `abstract` (1-line) |

**★ P2860 (Cites work)** — citation graph edge, unmapped; enables full out-citation list crosswalk.

### SPARQL-exclusive fields (SELECT queries)

- All of the above plus arbitrary joins across the entire Wikidata graph (e.g., P1552 = ORCID of author, P131 = geographic location of institution, P279 = subclass hierarchy for subject taxonomy)

## 4. Query Semantics

- **Lexical vs semantic:** CirrusSearch = lexical (Elasticsearch/CirrusSearch BM25); SPARQL = structural (no ranking).
- **NL tolerance:** Poor on CirrusSearch — "What are the environmental impacts of deforestation haswbstatement:P31=Q13442814" → 0 hits. NL sentences parse as broken query strings. Multi-keyword "deep learning haswbstatement:P31=Q13442814" → 57 901 hits (good).
- **Multi-keyword default:** AND across fields in CirrusSearch.
- **Phrase syntax:** `"exact phrase"` in CirrusSearch `srsearch`.
- **Boolean operators:** CirrusSearch supports Lucene syntax: AND, OR, NOT, `haswbstatement:P=Q`, `inlabel:`, `incaption:`, `insource:`.
- **Fielded query:** `srsearch=term haswbstatement:P31=Q13442814` constrains to scholarly articles only. SPARQL uses full FILTER/WHERE clause patterns.
- **Author-name pollution:** CirrusSearch `haswbstatement:P31=Q13442814` filter restricts to scholarly articles (instance-of = scholarly article), so author entities (Q5 = human) are excluded. Probe: "albert einstein haswbstatement:P31=Q13442814" → 320 hits, all scholarly article snippets. **Pollution structurally impossible** when using P31=Q13442814 constraint.
- **Cross-lingual:** Entity labels searchable in 50+ languages via `srsearch`; `languages=en` in `wbgetentities` scopes return labels.

## 5. OA / Free-Access

| Field | Value |
|-------|-------|
| Whole-corpus OA? | Wikidata itself is CC0; the *works described* vary |
| OA flag field | P953 (full-text URL) as weak proxy; no explicit OA status property standard |
| Best-OA URL field | P953 (`full work available at URL`) — present in ~25% of scholarly items |
| OA-only filter param | SPARQL: `FILTER EXISTS { ?item wdt:P953 ?url }` |
| Sort by OA | SPARQL: order by presence of P953 |
| Flag coverage | ~25% have P953; not a reliable OA signal — many CC papers lack P953 |
| Recommended strategy | SPARQL query: `?item wdt:P953 ?url` to retrieve open-access subset; supplement with DOI → Unpaywall |

## 6. Images / Thumbnails / IIIF

| Field | Value |
|-------|-------|
| Has images? | P18 (image on Wikimedia Commons); P154 (logo); P3383 (film poster) etc. |
| Thumbnail field | P18 → Wikimedia Commons file API: `https://commons.wikimedia.org/wiki/Special:FilePath/{filename}?width=200` |
| Full-res field | P18 → Commons API full-res |
| IIIF manifest field | None standard for Wikidata scholarly articles |
| IIIF version | N/A for scholarly articles; Wikimedia Commons supports IIIF for images |
| Multi-image? | Multiple image properties (P18, P154, P10, P51…) |
| Image licensing | CC0 or CC-BY-SA per Commons file |
| Display strategy | Scholarly articles rarely have images; cover art possible via SPARQL join |

## 7. Discipline / Subject Tags

| Field | Value |
|-------|-------|
| Vocabulary | Wikidata items as concepts (P921 = main subject); maps to any ontology via QID |
| Field path | `claims.P921[].mainsnak.datavalue.value.id` (QID) → label via `wbgetentities` |
| Granularity | Very high — any Wikidata item can be a subject; QIDs crosswalk to LCSH, MeSH, VIAF, etc. |
| Example values | `Q197536` (deep learning), `Q84263196` (COVID-19 pandemic) |
| Hierarchy depth | Unlimited — P279 (subclass of) chain; P31 (instance of) for typing |
| Facet/filter param | SPARQL: filter by subject QID; CirrusSearch: `haswbstatement:P921=Qxxx` |
| Usability | **Very high** — QIDs are universal crosswalk keys; each subject traceable to ~10 external vocabs |

## 8. Native Relevance & Scoring

| Field | Value |
|-------|-------|
| Score returned? | CirrusSearch: No — `list=search` does not expose score in JSON. SPARQL: No (structural) |
| Field name | N/A (CirrusSearch result order is relevance-ranked but score not returned) |
| Semantics | CirrusSearch: Elasticsearch BM25 over labels+descriptions+aliases |
| Range | N/A |
| Cross-query comparable? | No |
| Default sort | CirrusSearch: relevance; SPARQL: unordered unless ORDER BY |
| Sort params | CirrusSearch: no sort param; SPARQL: `ORDER BY` any variable |

*Protocol caveat: SPARQL = A1=0 by default; CirrusSearch = A1=0 (score not returned in response). Rubric: A1=0 for this API.*

## 9. Pagination

| Field | Value |
|-------|-------|
| Mechanism | Offset (CirrusSearch: `sroffset`); SPARQL: `LIMIT`/`OFFSET` or cursor workarounds |
| Param names | `srlimit=` (max 500 per call), `sroffset=` |
| Max page size | 500 per CirrusSearch call |
| Stated depth cap | 10 000 (maxWindow confirmed in adapter capability) |
| Empirical depth | 10 000 offset cap for CirrusSearch; SPARQL has no inherent cap but public endpoint times out on large result sets |
| Cursor expiry | N/A |

### 9b. Measured Latency (live probe, 3 warm calls)

| Query type | Latency |
|-----------|---------|
| Keyword CirrusSearch ("deep learning") | cold: 536 ms; warm2: 283 ms; warm3: 240 ms |
| `wbgetentities` batch (5 QIDs + claims) | 222 ms |
| SPARQL (simple 3-result query) | 652 ms |
| NL sentence | 0 results (query ineffective) |
| Cold-vs-warm CirrusSearch | ~2× |
| Extra resolve round-trips | 2–3 (CirrusSearch → wbgetentities → refLabels) |
| Total per-page latency | ~1 000–1 500 ms (3 sequential network calls) |
| Query strategy implication | Batch QIDs maximally; avoid P50 author item lookups when P2093 string present; SPARQL good for bulk harvest only |

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No |
| Key type | N/A (bot account optional for higher limits) |
| Acquisition speed | Keyless |
| Backend-safe? | Yes |
| Anon limits | Global Wikimedia rate limit; ~1–5 req/s practical for anonymous; 429 with Retry-After |
| SPARQL limits | 60s timeout per query; ~1 complex query/s practical |
| Burst | Undocumented; Wikimedia load-balances globally |
| Rate-limit code | 429 |
| Retry-After? | Yes (429 response includes Retry-After) |

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| P577 (date) | `time` string with leading `+` and precision | `"+2015-05-28T00:00:00Z"` | Regex `\d{4}` extraction |
| P2093 (author string) | Name order varies (FIRSTNAME LASTNAME vs LASTNAME, F.) | `"Yann LeCun"` vs `"LeCun, Y."` | Store raw; normalize in display layer |
| P50 (author item) | QID requires extra label lookup; can be 20+ authors | `Q3571662` → `"Yann LeCun"` | Batch in refIds set; slice to 5 |
| Entity descriptions | One-line; not a real abstract | `"scientific article published in Nature 2015"` | Set as `abstract`; flag as terse |
| Language QID (P407) | LANG_MAP must cover all IDs | `Q9027 → "sv"` | Keep LANG_MAP exhaustive; fallback `""` |
| Missing entities | `ent.missing === ""` for not-found QIDs | `{"missing": ""}` | Filter `ent.missing` before mapping |
| P921 subjects | Up to 50 subjects per article | Large array | Slice to 5 for display; preserve all for indexing |
| P1476 (monolingual title) | Object: `{"text":"...", "language":"en"}` | | Extract `.text` |

## 12. Exploitation Notes

- **P2860 (Cites work)** — citation graph edges; OpenCITE currently does not map these. A SPARQL query can retrieve full out-citation lists for any QID, enabling OpenCITE's own citation graph from Wikidata data.
- **P698/P818/P3181** — PMID, arXiv ID, OpenCitations ID: unmapped. Adding these as `ids` array unlocks crosswalk to PubMed, arXiv, and OCI graph without additional API calls.
- **SPARQL harvest** — `CONSTRUCT` queries or dumps at `dumps.wikimedia.org` enable offline full-corpus processing. Wikidata has ~30M scholarly article items; a nightly delta via `P577 ORDER BY TIMEDELTA` is feasible.
- **QID as universal crosswalk** — every QID can be resolved to Freebase, VIAF, GRID, ROR, ORCID properties. This makes Wikidata the most powerful disambiguation/crosswalk layer available for free.
- **SPARQL subject hierarchy** — `wdt:P279*/wdt:P921 wd:Q123` retrieves all articles in a subject tree (including sub-topics). No other free API enables this.
- **Full-text URL (P953)** — unmapped; link to the actual open-access version of ~25% of items.
- **NL query strategy** — avoid NL; use multi-keyword + `haswbstatement:P31=Q13442814` for article-type gating.
- **Author disambiguation** — P50 QID → ORCID via `wdt:P496` is the cleanest author disambiguation available anywhere.

## 13. Scores

*Scored on the **richer surface** (SPARQL) while documenting CirrusSearch. Because OpenCITE uses CirrusSearch + wbgetentities, scores reflect what is achievable with full SPARQL exploitation where it meaningfully differs.*

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score (×1.5) | 0 | Neither CirrusSearch nor SPARQL returns a numeric score in the response |
| A2 Query expressiveness | 3 | SPARQL: full boolean + property paths + GeoSPARQL + text search extensions |
| A3 Sort & filter control | 3 | SPARQL: ORDER BY any variable, FILTER on any property, date/type/geo/subject facets unlimited |
| A4 Pagination depth/cursor | 2 | CirrusSearch: 10k cap; SPARQL: offset unlimited but slow; dumps = A5 |
| A5 Batch/bulk | 3 | Wikidata dumps (full + delta); SPARQL CONSTRUCT; wbgetentities batch 50 |
| A6 Throughput & rate limits | 2 | ~1–5 req/s keyless; SPARQL 60s timeout; adequate for fan-out |
| A7 ID linkage/crosswalk | 3 | DOI, PMID, arXiv, ORCID, QID, VIAF, Freebase, OpenCitations — 8+ ID namespaces |
| A8 Result-count accuracy | 2 | CirrusSearch `totalhits` accurate for small sets; SPARQL COUNT(*) exact |
| A9 Semantic/NL (×1.5) | 1 | Lexical BM25 via CirrusSearch; no semantic mode; NL sentences fail; stemming/fuzzy via ~ operator |
| A10 Author-name pollution | 3 | `haswbstatement:P31=Q13442814` structurally restricts to scholarly articles; author entities excluded |

```
Raw_A = (0×1.5 + 3 + 3 + 2 + 3 + 2 + 3 + 2 + 1×1.5 + 3) / 11
       = (0 + 3 + 3 + 2 + 3 + 2 + 3 + 2 + 1.5 + 3) / 11
       = 22.5 / 11 = 2.045
```

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | 3 | Title, structured authors (P50+P2093), date, journal, vol/issue/pages, DOI, publisher, language, ISBN/ISSN via P236/P957 |
| B2 Abstract/full-text (×1.5) | 1 | Descriptions are 1-line terse; no full abstract; P953 open-access URL for ~25%; B2=1 |
| B3 Citation graph | 2 | P2860 (cites) in ~20% of items — count + list; no cited-by aggregate |
| B4 Discipline/field tags | 3 | P921 subjects = QIDs crosswalkable to MeSH, LCSH, OpenAlex concepts, DDC; hierarchy via P279 |
| B5 OA guarantee (×1.5) | 1 | P953 present ~25%; no explicit OA status field; no OA-only filter param built in |
| B6 Rich media/IIIF | 0 | Scholarly articles lack images; P18 rarely populated for articles |
| B7 Holdings/availability | 1 | P953 full-text URL; no library holdings/call number |
| B8 Record-quality signals | 2 | P6541 (statement supported by), timestamp of last edit, confidence implicit via P813 (retrieved date) |

```
Raw_B = (3 + 1×1.5 + 2 + 3 + 1×1.5 + 0 + 1 + 2) / 9
       = (3 + 1.5 + 2 + 3 + 1.5 + 0 + 1 + 2) / 9
       = 14 / 9 = 1.556
```

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | 2 | CirrusSearch: 240–530ms warm; SPARQL: 400–650ms; Wikimedia CDN; occasional SPARQL timeouts; ~99% uptime |
| C2 Auth friction | 3 | Keyless; backend-safe; no per-user auth |
| C3 TOS risk | 3 | CC0 — no rights reserved; explicit "no attribution required" — TOS risk: NONE |
| C4 Protocol/client maturity | 2 | MediaWiki Action API stable; Wikibase REST API in beta; SPARQL endpoint stable; no OpenAPI for Action API |
| C5 Data hygiene | 2 | Well-typed JSON; known quirks (P577 time string, P1476 monolingual object, missing entities); documented data model |

```
Raw_C = (2 + 3 + 3 + 2 + 2) / 5 = 12 / 5 = 2.40
```

### Rollup

```
Overall = 2.045 × 0.45 + 1.556 × 0.40 + 2.40 × 0.15
        = 0.920 + 0.622 + 0.360
        = 1.90
```

**TIER = B** (1.5–1.9 band — Complementary)

*Note: Score is held down by A1=0 (no native score), B2=1 (terse descriptions ≠ abstract), and B5=1 (weak OA signal). The SPARQL surface and QID crosswalk capability are world-class; a full SPARQL integration would push this to Tier A.*

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | NONE — CC0 |
| Currently quarantined? | No |
| Recommended action | Add P2860 citations; map PMID/arXiv IDs; upgrade to SPARQL for subject-tree queries and bulk harvest; cache QID→label map to reduce round-trips |
| Blocking issues | 3-step latency chain (search → entities → refLabels) adds ~1 000ms; mitigate with larger page sizes and label caching |
