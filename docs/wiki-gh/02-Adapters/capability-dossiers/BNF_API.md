---
tags: [adapter, capability, dossier]
adapter_id: BNF_API
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/BNF_API.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# BNF_API — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `BNF_API` |
| Adapter file | `src/adapters/extensions/bnfApi.js` |
| Server route | None (serverSafe; direct fetch with browser→proxy fallback) |
| Official API name | BnF Catalogue Général SRU API |
| Provider | Bibliothèque nationale de France (BnF) |
| Base URL | `https://catalogue.bnf.fr/api/SRU` |
| Protocol | SRU 1.2 / UNIMARC (unimarcxchange / marcxchange-v2) |
| Docs URL | https://api.bnf.fr/fr/api-sru-catalogue-general |
| TOS / license URL | Licence ouverte de l'État (Open License / Etalab) |
| Pre-audit tier | unranked |
| Dossier date | 2026-06-09 |

## 2. Metadata Standard & Serialisation

| Field | Value |
|-------|-------|
| Standard | UNIMARC Bibliographic (via MarcXchange v2) |
| Serialisation | XML; `recordSchema=unimarcxchange` → `<mxc:record format="UNIMARC" type="Bibliographic">` |
| Namespace | `info:lc/xmlns/marcxchange-v2`; BnF InterXMarc extensions at `http://catalogue.bnf.fr/namespaces/InterXMarc` |
| Schema URL | http://catalogue.bnf.fr/api/SRU?version=1.2&operation=explain |
| Schema version | UNIMARC Bibliographic 7th ed. (2007+); MarcXchange v2 |
| Alternative schema | `dublincore` (simplified; fewer fields than UNIMARC) |

## 3. Complete Field/Tag Inventory

### Key UNIMARC Bibliographic Fields

| UNIMARC tag / subfield | Type | Always? | Meaning | OpenCITE maps to |
|------------------------|------|---------|---------|-----------------|
| 001 (controlfield) | string | Yes | BnF internal record ID (FRBNF…) | not mapped |
| 003 (controlfield) | URI | Yes | Persistent ARK identifier (catalogue.bnf.fr/ark:…) | `identifier`, `url` |
| 010 $a | string | Frequent | ISBN (may be old/new format) | not mapped |
| 020 $a | string | Frequent | Country code (ISO) | not mapped |
| 100 $a | string | Yes | General processing data (includes publication date encoded at positions 9-12) | not mapped directly |
| 101 $a | string | Frequent | Language of text (ISO 639-2/B) | `language` |
| 102 $a | string | Frequent | Country of publication | not mapped |
| 200 $a | string | Yes | Title proper | `title` |
| 200 $e | string | Sparse | Subtitle / other title info | not mapped |
| 200 $h | string | Sparse | Volume number | not mapped |
| 200 $i | string | Sparse | Volume designation or date | not mapped |
| 210 $a | string | Frequent | Place of publication | not mapped |
| 210 $c | string | Frequent | Publisher name | `publisher` (hardcoded "BnF") |
| 210 $d | string | Frequent | Date of publication (raw text, e.g. "1987", "[1986?]") | `year` (regex match) |
| 215 $a | string | Sparse | Physical description (extent, illustrations) | not mapped |
| 225 $a $v | string | Sparse | Series title + volume number | not mapped |
| 300 $a | string | Sparse | General notes | not mapped |
| 310 $a | string | Sparse | Publication frequency (for serials) | not mapped |
| 500 $a $i $j | strings | Sparse | Uniform title (for musical works etc.) | not mapped |
| 600 $a $3 | string | Sparse | Subject — personal name | `subjects[]` |
| 606 $a $x $y $z | string | Moderate | Topical subject (Rameau; $a=term, $x=subdivision, $y=geo, $z=form) | `subjects[]` ($a only) |
| 607 $a | string | Sparse | Geographic subject | `subjects[]` |
| 608 $a | string | Sparse | Form/genre heading | not mapped |
| 700 $a $b | strings | Moderate | Personal author (family $a, given $b) | `authors[]` (joined) |
| 701 $a $b $4 | string | Sparse | Additional personal author ($4=role code) | not mapped |
| 710 $a | string | Sparse | Corporate author | `authors[]` (fallback) |
| 711 $a | string | Sparse | Additional corporate author | not mapped |
| 856 $u | URI | Sparse | Electronic access URL (OA/digitised links) | not mapped ★ |

★ Field 856 $u contains electronic access URLs including Gallica links for digitised items — entirely unexploited, enables `isOA` determination.

## 4. Query Semantics

- **Lexical or semantic?** Lexical only (BM25/inverted index over UNIMARC fields). No semantic mode.
- **NL tolerance:** Low — multi-word `bib.anywhere` search uses AND logic; NL sentences return few results.
- **Multi-keyword default:** AND (phrase within `"..."` required for adjacency).
- **Phrase syntax:** `bib.anywhere="exact phrase"` (equality/adjacency via `=`).
- **Boolean operators:** `AND`, `OR`, `NOT` between CQL predicates.
- **Fielded query params (from SRU explain):**
  - `bib.anywhere` — all fields (Z39.50 index 1016)
  - `bib.author` — personal + corporate authors (supports `startswith`)
  - `bib.title` — title fields (supports `startswith`)
  - `bib.subject` — Rameau subject headings
  - `bib.doctype` — document type
  - `bib.recordtype` — bib vs authority
  - `bib.persistentid` — ARK permanent identifier
  - `bib.recordid` — BnF internal record ID
  - `bib.isbn` — ISBN lookup
  - `bib.ean` — EAN barcode
  - `bib.ismn` — music number
  - `bib.isrc` — recording code
  - `bib.comref` — commercial reference
  - `bib.publisher` — publisher name
  - `bib.publicationdate` — date with range support (`within`)
  - `bib.digitized` — digitized flag (tested: `bib.digitized="true"` returns 0 — index may be defunct/renamed)
  - `bib.set` — set/collection code
  - `bib.otherid` — other identifiers
  - `aut.type`, `aut.persistentid`, `aut.recordid`, `aut.isni`, `aut.status` — authority records
- **Author-name pollution control:** `bib.title="term"` scopes to title fields only; combined with `bib.anywhere` → reliable topic-only search. Confirmed: `bib.title="histoire" AND bib.author="michelet"` returns 445 records correctly scoped.
- **Sort:** No `sortKeys` parameter documented for catalogue.bnf.fr SRU (unlike Gallica). Order is undefined/default.
- **Cross-lingual:** No.

## 5. OA / Free-Access

- **Whole-corpus OA?** No — the BnF catalogue covers all holdings (physical + digital). Most are physical/non-OA.
- **OA flag field:** UNIMARC 856 $u contains electronic access URLs (including Gallica ARK links for digitised items). Not currently parsed.
- **Best-OA URL:** 856 $u where $z = "accès en ligne" or similar.
- **OA-only filter param:** No dedicated OA filter in SRU; `bib.digitized="true"` tested and returned 0 records (may be defunct).
- **Sort by OA:** Not available.
- **Flag coverage:** 856 present in sparse subset; unreliable as an OA signal.
- **Recommended "free only" strategy:** Cannot reliably filter; OpenCITE correctly hardcodes `isOA: false` (v0.38 fix). For OA catalogue records, crosswalk ARK to Gallica adapter.

## 6. Images / Thumbnails / IIIF

- **Has images?** No image fields in catalogue SRU response.
- **Thumbnail field:** None in SRU output.
- **Full-res:** None.
- **IIIF manifest:** Not available from catalogue SRU (would require crosswalk to Gallica for digitised items via dc:relation ARK).
- **Display strategy:** Show catalogue record only; link via 003/ARK to catalogue.bnf.fr viewer.

## 7. Discipline / Subject Tags

- **Vocabulary:** Rameau (full controlled vocabulary, poly-hierarchical, National authority file)
- **Field path:** UNIMARC 606 $a (topical), 600 $a (personal name subject), 607 $a (geographic)
- **Granularity:** 3-4 level via subdivision subfields ($x $y $z $v) — richer than Gallica DC subjects
- **Example values:** "Révolution française (1789-1799)", "Économie politique", "Paris (France) -- Histoire"
- **Hierarchy depth:** Up to 4 subdivisions in a single field
- **Facet/filter param:** `bib.subject="term"` in CQL
- **Usability:** High — Rameau is one of France's primary library subject vocabularies; ~60% coverage in catalogue; searchable; multi-level; mapped to AAT/Wikidata in some records.

## 8. Native Relevance & Scoring

- **Score returned?** No — SRU protocol: no score element.
- **Default sort:** Unknown/undefined (BnF catalogue does not document default result ordering).
- **Sort params:** None documented (no `sortKeys` support confirmed in SRU explain).

**Protocol caveat:** SRU = no relevance score → A1 = 0.

## 9. Pagination

- **Mechanism:** Offset-based (startRecord / maximumRecords)
- **Param names:** `startRecord` (1-based), `maximumRecords`
- **Max page size:** Not stated; tested with 20-50; no documented cap (unlike Gallica's 50 limit)
- **Stated depth cap:** None documented
- **Empirical depth:** `numberOfRecords` up to 2,399,609 for "histoire france"; tested startRecord=100 — works fine; functionally unlimited.
- **Cursor expiry:** N/A (stateless offset)

### 9b. Measured Latency (live probe, median of 3 warm calls)

| Query type | Latency |
|-----------|---------|
| Keyword (1 word) | ~1,500 ms |
| Multi-keyword (3 words) | ~1,460 ms (WARM1: 1687, WARM2: 1459, WARM3: 1426) |
| NL full sentence | ~3,300 ms (cold); ~1,500 ms warm |
| ISBN lookup | ~2,100 ms |
| Cold vs warm | +200-400ms cold |
| Extra resolve round-trips | None for basic fields |

**Query-strategy implication:** ~1.5s median is acceptable for non-critical path; use `bib.title` + `bib.subject` in combination for precision; avoid `bib.anywhere` for NL queries (AND logic → low recall).

## 10. Rate Limits & Auth

- **Key required?** No
- **Key type:** N/A
- **Acquisition speed:** N/A (keyless)
- **Backend-safe?** Yes — `serverSafe: true`; server fetches directly; browser uses proxy fallback.
- **Anon limits:** Not documented; empirically stable.
- **Rate-limit code:** Not observed.
- **CORS:** Blocked for direct browser fetch (v0.38 T7 fix); proxy route handles this.

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|--------------|
| UNIMARC 210 $d | Free-text date: "[1986?]", "cop. 1987", "19uu", "ca. 1900" | "[1986?]" | Regex `\d{4}` first match — already done |
| UNIMARC 700 $a $b | Family/given name split across subfields | "Michelet" (700$a), "Jules" (700$b) | Join with ", " — already done |
| UNIMARC 606 $a-$z | Multi-subfield subject; only $a extracted; full Rameau heading loses hierarchy | "Économie politique" (loses $x subdivision) | Extract all subfields joined by " -- " for full heading |
| UNIMARC 003 (controlfield) | URI; note `<controlfield>` not `<datafield>`; no subfield codes | `http://catalogue.bnf.fr/ark:/12148/cb34969957b` | Use `unimarcOne(rec, '003')` (no code arg) — already done |
| UNIMARC 010 $a | ISBN may be old 10-digit or new 13-digit (EAN); may include hyphens | "2-222-04087-6" | Strip hyphens; accept both formats |
| `<mxc:leader>` | Encodes record type, bib level, etc. in fixed positions — not parsed | `"     cam  22        450 "` | Position 6 = record type; pos 7 = bib level — not currently used |
| Multiple `dc:language` | 101 $a gives ISO 639-2/B ("fre") not 639-1 ("fr") | "fre" | Map 639-2/B → 639-1 if UI needs it |
| HTML entities in XML | Occasional `&amp;` in title/publisher subfields | `"L'&#233;dition"` | Already handled by XML parser; regex parser must decode entities |

## 12. Exploitation Notes

- **Under-exploited fields:**
  - UNIMARC 856 $u (electronic access URL): parsing this would enable `isOA=true` for digitised items and provide direct access links — high value.
  - UNIMARC 606 $a+$x+$y+$z: full Rameau subject string with subdivisions. Currently only $a extracted → loses geographic/temporal context.
  - UNIMARC 215 $a (physical description): can infer document type/format.
  - UNIMARC 010 $a (ISBN): enables ISBN-based deduplication and crosswalk to other adapters.
  - UNIMARC 700/701 $4 (role code): identifies authors vs. editors vs. translators.
  - `bib.isbn` / `bib.author` field indexes: enable precision lookup (not just keyword search).

- **Query-strategy upgrade:** Use `bib.title="query"` instead of `bib.anywhere` to eliminate author-name pollution by default. Combine `bib.title OR bib.subject` for topic queries.

- **Batch/harvest opportunity:** No OAI-PMH on catalogue.bnf.fr. Monthly BnF data dumps available separately (not via SRU). No resumption token.

- **Crosswalk opportunity:** 003 ARK → Gallica adapter (for digitised items) + authority records via `bib.author2bib` / `aut.persistentid` for VIAF crosswalk.

- **Downstream enrichment:** Rameau subjects (606) → map to Wikidata QIDs for semantic enrichment; ISNI in authority records (via `aut.isni`) → resolve to ORCID/VIAF.

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score | **0** | SRU: no score; no `nqamoyen` equivalent |
| A2 Query expressiveness | **2** | Multi-field CQL, AND/OR/NOT, phrase, field-specific indexes (title/author/subject/isbn/date), `startswith` relation |
| A3 Sort & filter control | **1** | Limited: date filter via `bib.publicationdate within "Y1 Y2"`; record-type filter; no sort param confirmed |
| A4 Pagination depth | **2** | Offset, functionally unlimited depth (2.4M records tested); max page size undocumented but works at 50+ |
| A5 Batch/bulk | **1** | SRU offset paging only; no OAI-PMH; no ISBN batch |
| A6 Throughput | **2** | No stated cap; keyless; stable at ~60 req/min empirically |
| A7 ID linkage | **2** | ARK + ISBN + ISNI in authority; limited DOI; no ORCID directly |
| A8 Result-count accuracy | **2** | `numberOfRecords` accurate (stable 2.4M+ confirmed across pages) |
| A9 Semantic/NL mode | **0** | Lexical AND only; NL sentence → very low recall |
| A10 Author-name pollution | **2** | `bib.title` / `bib.subject` scoping reliable; confirmed by live probe |

Raw_A = (0×1.5 + 2 + 1 + 2 + 1 + 2 + 2 + 2 + 0×1.5 + 2) / 11 = **14 / 11 = 1.27**

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | **3** | Title, authors, publisher, place, date, language, ISBN, series — full UNIMARC with structured subfields |
| B2 Abstract/full-text | **0** | No abstract field in UNIMARC bibliographic; `300 $a` (notes) is sparse and non-standard |
| B3 Citation graph | **0** | None |
| B4 Discipline/subject tags | **3** | Full Rameau controlled vocabulary (4-level with subdivisions), personal/topical/geographic subjects, searchable, ~60% coverage |
| B5 OA/free-access | **1** | 856 $u present for digitised items but sparse and not parsed; no reliable OA filter; `bib.digitized` index appears defunct |
| B6 Rich media/IIIF | **0** | No image fields in catalogue SRU; IIIF only via Gallica crosswalk |
| B7 Holdings/availability | **1** | Physical holding implied by presence in catalogue; no structured call number in DC/basic UNIMARC output |
| B8 Record-quality signals | **1** | UNIMARC 039 $o (source agency code) gives record provenance; leader pos 5 (record status); no dedup confidence |

Raw_B = (3 + 0×1.5 + 0 + 3 + 1×1.5 + 0 + 1 + 1) / 9 = (3 + 0 + 0 + 3 + 1.5 + 0 + 1 + 1) / 9 = **9.5 / 9 = 1.06**

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | **1** | ~1.5s median; no published SLA; occasional slowdowns; CORS requires proxy |
| C2 Auth friction | **3** | Keyless; backend-safe; proxy for browser |
| C3 Redistribution/TOS risk | **3** | Licence ouverte de l'État (= CC-BY equivalent); explicit unrestricted aggregation permitted |
| C4 Protocol/client maturity | **2** | SRU 1.2 documented at api.bnf.fr; explain endpoint works; no versioning/OpenAPI |
| C5 Data hygiene | **2** | UNIMARC is well-typed; known hazards: date free-text, subfield code structure; no markup bleed; consistent nulls |

Raw_C = (1 + 3 + 3 + 2 + 2) / 5 = **11 / 5 = 2.20**

### Rollup

```
Overall = 1.27 × 0.45 + 1.06 × 0.40 + 2.20 × 0.15
        = 0.572 + 0.424 + 0.330
        = 1.33
```

**TIER = C (Peripheral)**

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | NONE — Licence ouverte de l'État (Open License) |
| Currently quarantined? | No (serverSafe; direct fetch with proxy fallback) |
| Recommended action | Parse UNIMARC 856 $u for `isOA` and access URLs; extract full 606 subject chain; add `bib.title` scoping to reduce author-name pollution |
| Blocking issues | No abstract field — limits BM25F abstract scoring contribution. CORS requires proxy for browser; server direct-fetch is correct. |
