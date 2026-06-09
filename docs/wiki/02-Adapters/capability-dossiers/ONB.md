---
tags: [adapter, capability, dossier]
adapter_id: ONB
---

# ONB — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `ONB` |
| Adapter file | `src/adapters/extensions/onb.js` |
| Server route | None (serverSafe; direct fetch with browser→proxy fallback) |
| Official API name | Österreichische Nationalbibliothek SRU (Ex Libris Alma) |
| Provider | Österreichische Nationalbibliothek (ÖNB) / Austrian National Library |
| Base URL | `https://obv-at-oenb.alma.exlibrisgroup.com/view/sru/43ACC_ONB` |
| Protocol | SRU 1.2 / Dublin Core (Alma DC schema) or MARCXML |
| Docs URL | No dedicated API docs; standard Alma SRU documentation via Ex Libris |
| TOS / license URL | UNKNOWN — needs research; ÖNB general terms at onb.ac.at |
| Pre-audit tier | unranked |
| Dossier date | 2026-06-09 |

## 2. Metadata Standard & Serialisation

| Field | Value |
|-------|-------|
| Standard | Dublin Core (srw_dc schema) or MARCXML (MARC 21 via Alma) |
| Serialisation | XML; `recordSchema=dc` → `<srw_dc:dc>` with `<dc:*>` elements; `recordSchema=marcxml` → `<record xmlns="http://www.loc.gov/MARC21/slim">` |
| Namespace | `http://purl.org/dc/elements/1.1/` (DC); `http://www.loc.gov/MARC21/slim` (MARCXML) |
| Schema URL | http://www.loc.gov/standards/sru/resources/dc-schema.xsd (DC) |
| Schema version | DC Elements 1.1; MARC 21 |
| Notes | Alma platform; index set uses `alma.*` CQL prefix |

## 3. Complete Field/Tag Inventory

### Dublin Core (`recordSchema=dc`)

| Field path (DC element) | Type | Always? | Meaning | OpenCITE maps to |
|------------------------|------|---------|---------|-----------------|
| `dc:title` | string | Yes | Title (may include edition/volume info appended) | `title` |
| `dc:contributor` | string (may repeat) | Frequent | Creator/contributor with dates, GND ID, and role code appended | `authors[]` (after role-strip) |
| `dc:date` | string | Frequent | Publication year | `year` |
| `dc:language` | string (ISO 3-letter or "###" for no linguistic content) | Frequent | Language code | `language` |
| `dc:description` | string (may repeat) | Sparse | Content note / tracklist / abstract | `abstract` (first value) |
| `dc:identifier` | string (may repeat) | Yes | Multiple IDs: `(AT-OBV)AC…`, `AC…`, `(Aleph)…`, `(DE-599)…`, `alma:…` | DOI extraction + url |
| `dc:subject` | string (may repeat) | Sparse | Subject headings (GND or free text) | `subjects[]` |
| `dc:type` | string | Sparse | Document type (rare in DC output; usually absent) | not mapped |
| `dc:format` | string | Sparse | Physical format description | not mapped |
| `dc:publisher` | string | Sparse | Publisher name | not mapped |
| `dc:rights` | string | Sparse | Rights statement | not mapped |
| `dc:source` | string | Sparse | Source of data | not mapped |

**Key observation:** `dc:contributor` carries role codes as suffixes (e.g. "Beethoven, Ludwig <<van>> 1770-1827 (DE-588)118508288 cre"). The `cre` is a MARC relator code meaning "creator". Role codes: `cre`=creator, `prf`=performer, `cnd`=conductor, `ctb`=contributing institution. OpenCITE strips roles with a broad regex — but `<<` `>>` tags around names in authority records are an Alma-specific display convention (non-filtering strings) that may survive the strip.

### MARCXML (`recordSchema=marcxml`) — additional fields accessible

| MARC21 tag | Meaning |
|-----------|---------|
| 001 | Control number |
| 020 $a | ISBN |
| 082/083 | Dewey classification |
| 100/110/111 $a | Main entry (author, corporate, meeting) |
| 245 $a $b | Title + subtitle |
| 260/264 $b $c | Publisher + date |
| 300 $a | Physical description |
| 336-338 | Content/media/carrier type |
| 490/830 | Series |
| 500+ | Notes |
| 600/610/650/651 | Subject entries (GND) |
| 856 $u | URL to online resource |

MARCXML provides significantly richer data (ISBN, GND subject codes, series, subtitle) but OpenCITE uses DC schema only.

## 4. Query Semantics

- **Lexical or semantic?** Lexical (Alma's Solr backend). No semantic mode.
- **NL tolerance:** Very low — `alma.all_for_ui="multi word query"` confirmed returning 0 results for 8-word queries while the same keywords individually return results. Alma tokenises but does not stem well for NL.
- **Multi-keyword default:** AND within the query value.
- **Phrase syntax:** Exact phrase via `=` relation (not `all`).
- **Boolean operators:** Standard CQL AND/OR/NOT between field predicates.
- **Fielded query params (from SRU explain — selected key indexes):**
  - `alma.all_for_ui` — catch-all keyword search (used by OpenCITE)
  - `alma.creator` — personal/corporate creator
  - `alma.title` — title field
  - `alma.subject` — subject headings
  - `alma.isbn` — ISBN
  - `alma.issn` / `alma.cluster_issn` — ISSN
  - `alma.authority_id` — GND/authority ID
  - `alma.authority_vocabulary` — vocabulary name
  - `alma.bib_level` — bibliographic level (monograph, serial, etc.)
  - `alma.carrier_type_code` / `alma.carrier_type_term` — carrier type
  - `alma.ai_contribution` — "processed with Alma AI tools" flag (novel!)
  - `alma.ai_cz` — "enriched with AI metadata by CZ" flag
  - `alma.classification_part` — call number/DDC
  - `alma.language` — language code
  - `alma.publication_year` — year
- **Author-name pollution control:** `alma.creator="name" NOT alma.title="name"` tested and confirmed working (returns Beethoven-authored works, excludes works titled "Beethoven"). Reliable field scoping → A10 = 2.
- **Sort:** No sort parameter documented or confirmed for Alma SRU.
- **Cross-lingual:** No.
- **Notable Alma-specific:** `alma.ai_contribution` / `alma.ai_cz` — Alma uses AI to enrich catalogue records; searchable but output not reflected in DC schema.

## 5. OA / Free-Access

- **Whole-corpus OA?** No — ÖNB catalogue is primarily physical holdings; digitised items are a subset.
- **OA flag field:** None in DC output; `dc:identifier` may contain `alma:` URIs; no explicit OA flag.
- **Best-OA URL:** `dc:identifier` values occasionally include HTTPS URLs to digitised items; must distinguish from internal Alma URIs.
- **OA-only filter param:** None identified via SRU.
- **Recommended "free only" strategy:** OpenCITE correctly hardcodes `isOA: false` for ONB. Cannot reliably determine OA status from DC output.

## 6. Images / Thumbnails / IIIF

- **Has images?** Sparse — ÖNB has a digital portal (ANNO) but image links are not included in SRU DC output.
- **Thumbnail field:** None in DC response.
- **IIIF:** ÖNB's ANNO newspaper archive has IIIF; ONB catalogue SRU does not expose it.
- **Display strategy:** Link via `dc:identifier` Alma URI to ÖNB catalogue viewer; IIIF not available via this endpoint.

## 7. Discipline / Subject Tags

- **Vocabulary:** GND (Gemeinsame Normdatei — German unified authority file) + RVK (Regensburger Verbundklassifikation) in MARCXML
- **Field path:** `dc:subject` (sparse in DC schema); MARCXML 600/610/650/651 for full GND headings
- **Granularity:** GND headings are 2-4 level; DC output flattens them
- **Example values:** (from probe) — subject tag sparse in DC for tested records
- **Facet/filter param:** `alma.subject="term"` in CQL
- **Usability:** Medium — GND is authoritative for German-language materials; DC schema flattens structure; MARCXML required for full hierarchical subjects.

## 8. Native Relevance & Scoring

- **Score returned?** No — SRU protocol: no score element.
- **Default sort:** Alma internal relevance (Solr BM25); not exposed in SRU.
- **Sort params:** None documented.
- **`extraResponseData`:** Returns `<xb:exact>true</xb:exact>` and `<xb:responseDate>` only — no score.

**Protocol caveat:** SRU = no relevance score → A1 = 0.

## 9. Pagination

- **Mechanism:** Offset-based (startRecord / maximumRecords)
- **Param names:** `startRecord` (1-based), `maximumRecords`
- **Max page size:** Not stated; empirically supports 50
- **Stated depth cap:** None
- **Empirical depth:** `numberOfRecords` up to 129,427 for "history" (MARCXML); offset-based should work deeply.
- **Cursor expiry:** N/A

### 9b. Measured Latency (live probe, median of 3 warm calls)

| Query type | Latency |
|-----------|---------|
| Keyword (1 word) | ~2,300 ms |
| Multi-keyword + field scope | ~3,300 ms |
| NL full sentence (8 words) | 1,507 ms (returns 0 results — no work done) |
| Median (warm, 3 calls) | 2,298 ms |
| Cold vs warm | +300ms cold |
| Extra resolve round-trips | None |

**Query-strategy implication:** ~2.3s is slower than BnF/Gallica; multi-field queries slower. NL query returns 0 — confirms `alma.all_for_ui` AND semantics very strict. Use single-term or short phrase queries. Consider MARCXML schema for richer field extraction.

## 10. Rate Limits & Auth

- **Key required?** No
- **Key type:** N/A
- **Backend-safe?** Yes — `serverSafe: true`
- **Auth:** None observed; Alma cloud SRU is public.
- **Limits:** Not documented; Ex Libris cloud infrastructure typically tolerant of reasonable load.
- **CORS:** Blocked for browser direct fetch (same pattern as BNF_API); server direct-fetch correct.

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|--------------|
| `dc:contributor` | Role code appended: "Name (dates) (GND-ID) RELATOR" | "Beethoven, Ludwig <<van>> 1770-1827 (DE-588)118508288 cre" | Strip from first `(` or role code — current regex is incomplete; `<<` `>>` markers also present |
| `dc:language` | "###" for non-linguistic content (scores, maps, visual) | "###" | Treat as null/instrumental |
| `dc:identifier` | Multiple opaque ID formats | "(AT-OBV)AC08167464", "AC08167464", "(Aleph)008124253ACC01", "(DE-599)OBVAC08167464", "alma:43ACC_ONB/bibs/990027895760603338" | None start with http → `url` will be empty; no ARK link in DC schema |
| `dc:date` | May be absent or just a year | "2009", absent | Already guarded with regex match |
| `dc:description` | Tracklist / performance notes, not a real abstract | "Piano Sonata in E-Major D 459 / F. Schubert Piano Concerto..." | Not a text abstract; display as "notes" not "abstract" |
| MARCXML 100 $a | NR indicator encodes name-type; dates may be absent | | Parse indicator 1 for name format |
| Multiple `dc:contributor` entries | Some are institutions with opaque ID strings | "Österreichischer Rundfunk Symphonieorchester (DE-588)1087277-2 ctb" | Filter by role code: keep `cre`, `aut`, `prf`; filter `ctb`, `pbl` |

## 12. Exploitation Notes

- **Under-exploited fields:**
  - `recordSchema=marcxml`: MARC 21 output from Alma includes ISBN, GND subjects (with IDs), DDC, series, subtitle, full publisher data — not used at all. Switching schema would triple metadata richness.
  - `dc:identifier` (Alma URI): buildable canonical URL via `https://obv-at-oenb.alma.exlibrisgroup.com/permalink/43ACC_ONB/...` — not currently extracted.
  - GND IDs in `dc:contributor`: "(DE-588)XXXXXXX" — enables precise author identity lookup and VIAF crosswalk.
  - `alma.ai_contribution` / `alma.ai_cz` index: Alma AI-enriched records may have enhanced subject metadata — novel capability worth investigating.

- **Query-strategy upgrade:** Use `alma.title="query"` for topic search to avoid author-name pollution; combine with `alma.subject="term"` for precision. Switch to MARCXML schema for richer extraction.

- **Batch/harvest opportunity:** Alma SRU supports only offset pagination; no OAI-PMH on this endpoint. ÖNB offers data dumps separately.

- **Crosswalk opportunity:** GND IDs in contributor field → crosswalk to VIAF, Wikidata (QID via GND P227 property).

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score | **0** | SRU: no score exposed; Alma Solr score internal only |
| A2 Query expressiveness | **2** | Multi-field CQL with rich Alma index set; AND/OR/NOT; phrase; range for dates/year |
| A3 Sort & filter control | **1** | No sort param; filter by language/bib_level/carrier_type/year possible via CQL |
| A4 Pagination depth | **2** | Offset-based; empirically deep; no cap stated |
| A5 Batch/bulk | **1** | SRU offset only; no harvest mode |
| A6 Throughput | **2** | No stated cap; keyless; cloud Alma should handle moderate load |
| A7 ID linkage | **1** | AT-OBV internal IDs, GND IDs in contributor; no DOI, no ORCID in DC output |
| A8 Result-count accuracy | **2** | `numberOfRecords` accurate |
| A9 Semantic/NL mode | **0** | Lexical only; NL sentences return 0 results |
| A10 Author-name pollution | **2** | `alma.creator` vs `alma.title` scoping confirmed working |

Raw_A = (0×1.5 + 2 + 1 + 2 + 1 + 2 + 1 + 2 + 0×1.5 + 2) / 11 = **13 / 11 = 1.18**

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | **2** | Title, authors, date, language in DC; publisher/edition only in MARCXML; no DOI/ORCID in DC |
| B2 Abstract/full-text | **1** | `dc:description` present but is physical/tracklist notes ~30% coverage; not a true abstract |
| B3 Citation graph | **0** | None |
| B4 Discipline/subject tags | **2** | GND subjects in DC (sparse); full GND hierarchy in MARCXML; DDC classification in MARCXML |
| B5 OA/free-access | **0** | No OA signal in DC; no filter param; correctly hardcoded `isOA: false` |
| B6 Rich media/IIIF | **0** | No image fields; ANNO digital archive not exposed via catalogue SRU |
| B7 Holdings/availability | **1** | Single institution; no call number in DC; no real-time availability |
| B8 Record-quality signals | **0** | No confidence/dedup signal in DC or MARCXML output |

Raw_B = (2 + 1×1.5 + 0 + 2 + 0×1.5 + 0 + 1 + 0) / 9 = (2 + 1.5 + 0 + 2 + 0 + 0 + 1 + 0) / 9 = **6.5 / 9 = 0.72**

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | **1** | ~2.3s median; no SLA; cloud Alma generally stable; CORS requires proxy |
| C2 Auth friction | **3** | Keyless; backend-safe |
| C3 Redistribution/TOS risk | **2** | UNKNOWN TOS — typical national library (display+attribution OK; CC-BY likely); assume LOW-MEDIUM until confirmed |
| C4 Protocol/client maturity | **2** | Standard Alma SRU; explain endpoint works; no dedicated ÖNB API docs |
| C5 Data hygiene | **2** | Mostly consistent DC; known role-code hazards in contributor; "###" language; multiple ID formats |

Raw_C = (1 + 3 + 2 + 2 + 2) / 5 = **10 / 5 = 2.00**

### Rollup

```
Overall = 1.18 × 0.45 + 0.72 × 0.40 + 2.00 × 0.15
        = 0.531 + 0.288 + 0.300
        = 1.12
```

**TIER = C (Peripheral)**

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | LOW-MEDIUM (TOS unconfirmed; standard national library terms expected) |
| Currently quarantined? | No |
| Recommended action | Switch to MARCXML schema for title/publisher/ISBN/GND subject richness; extract GND IDs from dc:contributor; confirm TOS |
| Blocking issues | No abstract field; NL query returns 0 (strict AND); author parsing hazard with role codes and GND ID suffixes |
