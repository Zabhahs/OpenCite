---
tags: [adapter, capability, dossier]
adapter_id: GALLICA
---

# GALLICA — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `GALLICA` |
| Adapter file | `src/adapters/extensions/gallica.js` |
| Server route | `api/search/gallica.js` |
| Official API name | Gallica SRU Search API |
| Provider | Bibliothèque nationale de France (BnF) |
| Base URL | `https://gallica.bnf.fr/SRU` |
| Protocol | SRU 1.2 / Dublin Core (OAI-DC) |
| Docs URL | https://api.bnf.fr/fr/api-gallica-de-recherche |
| TOS / license URL | https://gallica.bnf.fr/edit/und/conditions-dutilisation-des-contenus-de-gallica |
| Pre-audit tier | unranked |
| Dossier date | 2026-06-09 |

## 2. Metadata Standard & Serialisation

| Field | Value |
|-------|-------|
| Standard | Dublin Core (OAI-DC 1.1), `oai_dc` namespace |
| Serialisation | XML; SRU `recordSchema=dc` → `<oai_dc:dc>` elements |
| Namespace | `http://purl.org/dc/elements/1.1/` |
| Schema URL | http://www.openarchives.org/OAI/2.0/OAIdc.xsd |
| Schema version | DC Elements 1.1 |
| Non-standard extras | `<srw:extraRecordData>` carries Gallica-specific fields (thumbnail, highres, medres, nqamoyen, provenance, typedoc) not in the DC schema |

## 3. Complete Field/Tag Inventory

### Dublin Core fields in `<oai_dc:dc>`

| Field path (DC element) | Type | Always present? | Meaning | OpenCITE currently maps to |
|------------------------|------|-----------------|---------|---------------------------|
| `dc:title` | string (may repeat for alternative titles) | Yes | Main title | `title` |
| `dc:creator` | string (may repeat; includes dates + role in parens) | Sparse | Primary author/creator | `authors[]` |
| `dc:contributor` | string (may repeat; role appended) | Sparse | Secondary contributor (translator, illustrator, etc.) | not mapped |
| `dc:publisher` | string | Sparse | Publisher name and city | not mapped |
| `dc:date` | string (often "YYYY-YYYY" range or "YYYY") | Frequent | Publication date range | `year` (first 4-digit match) |
| `dc:description` | string (may repeat) | Frequent | Physical description, notes, table of contents note | `abstract` (first value only) |
| `dc:format` | string (may repeat) | Frequent | Physical extent, MIME type, page count | not mapped |
| `dc:identifier` | string (may repeat: ARK + NUMM- ID) | Yes | ARK URI + local NUMM/NUMP/ISSN identifiers | `url` (ARK), `id` (ARK slug) |
| `dc:language` | string (ISO 639-2) | Frequent | Language code, e.g. "fre", "eng" | `language` |
| `dc:subject` | string (may repeat) | Sparse | Subject headings (free text, sometimes Rameau) | `subjects[]` |
| `dc:type` | string (may repeat; French + English variants) | Frequent | Document type: "text", "monographie imprimée", "printed monograph", "periodiques", etc. | `type` |
| `dc:relation` | string (may repeat) | Frequent | Related notice URLs in catalogue.bnf.fr | not mapped |
| `dc:rights` | string (may repeat) | Frequent | "domaine public" / "public domain" or rights statement | not mapped (isOA hardcoded `true`) |
| `dc:source` | string | Frequent | Physical holding location (BnF department + call number) | not mapped |

### Non-DC extra fields in `<srw:extraRecordData>`

| Field | Type | Meaning | OpenCITE currently maps to |
|-------|------|---------|---------------------------|
| `thumbnail` | URI | Low-res thumbnail (`{ark}.thumbnail`) | `previewImage` |
| `lowres` | URI | Low-resolution image | not mapped |
| `medres` | URI | Medium-resolution image | not mapped |
| `highres` | URI | High-resolution image URI | not mapped |
| `nqamoyen` | float (0-100) | Average OCR quality score for the document | not mapped ★ |
| `provenance` | string | Source institution (e.g. "Gallica", "BnF-partenaires") | not mapped |
| `typedoc` | string | Type code: "monographies", "periodiques", "manuscrits", "cartes", "images", etc. | not mapped |
| `uri` | string | BnF ARK local identifier | not mapped |
| `link` | URI | Full Gallica viewer URL | not mapped |
| `epubFile` | URI | EPUB download URI (when available) | not mapped |
| `infoSupModifiable` | string | Modifiable supplementary info | not mapped |

★ `nqamoyen` (OCR quality) is a uniquely valuable signal for estimating abstract/full-text usefulness and is entirely unexploited.

## 4. Query Semantics

- **Lexical or semantic?** Lexical + full-text OCR indexing. No semantic/vector mode.
- **NL tolerance:** Moderate — `gallica all` performs AND across all OCR'd text, so a sentence query will find pages containing all terms (very low recall for full NL sentences — confirmed by live probe: NL 5-word sentence returns 132 records vs. 7,625 for 3 keywords).
- **Multi-keyword default:** AND (all terms must appear).
- **Phrase syntax:** Wrap in quotes: `gallica all "exact phrase"`.
- **Boolean operators:** `and`, `or`, `not` + proximity `prox`.
- **Fielded query params:** CQL field prefix on `query=` parameter. Key indexes:
  - `gallica all` — cross-field OCR+metadata catch-all (used by OpenCITE)
  - `dc.title all`, `dc.creator all`, `dc.publisher all`, `dc.date`, `dc.type`, `dc.language`, `dc.subject`
  - `text` — OCR text only; `metadata` — metadata only
  - `ocrquality` — numeric comparison (`>=`, `<=`)
  - `access` — `"fayes"` (public domain) or `"fano"` (restricted)
  - `dewey` — Dewey classification
  - `isbn`, `issn`
- **Author-name pollution control:** `dc.title all "term" NOT dc.creator all "term"` works and was confirmed live (returns 6,751 vs. larger polluted set). Reliable field-scoping available but not used by OpenCITE → A10 = 2.
- **Sort:** `sortKeys=dc.date/sort.descending`, `dc.creator/sort.ascending`, `dc.title/sort.ascending`, `ocr.quality/sort.descending`, `indexationdate/sort.descending`.
- **Cross-lingual:** No. Separate indexes for non-French collections but no translation/semantic cross-lingual.

## 5. OA / Free-Access

- **Whole-corpus OA?** No — mixed. ~50-60% is in the public domain; remainder is restricted.
- **OA flag field:** `dc:rights` contains "domaine public" / "public domain" for free items. Also `dc:rights` values like "droits réservés".
- **Best-OA URL:** `dc:identifier` ARK URI always resolves to the Gallica viewer (free to read for public domain items).
- **OA-only filter param:** `access all "fayes"` in the CQL query.
- **Sort by OA:** Not directly; can combine `access all "fayes" AND ...`.
- **Flag coverage:** `dc:rights` present in ~80% of records; reliable for public domain.
- **Recommended "free only" strategy:** Append `AND access all "fayes"` to CQL query. OpenCITE currently hardcodes `isOA: true` for all results — incorrect for ~40% of the corpus.

## 6. Images / Thumbnails / IIIF

- **Has images?** Yes — all digitized items have thumbnails and multi-resolution images.
- **Thumbnail field:** `srw:extraRecordData > thumbnail` (URI pattern: `{ark}.thumbnail`)
- **Full-res field:** `srw:extraRecordData > highres` (URI pattern: `{ark}.highres`)
- **IIIF manifest:** Gallica supports IIIF v2 via `https://gallica.bnf.fr/iiif/ark:/12148/{ark}/manifest.json` but this is not in the SRU response — requires separate resolve call.
- **IIIF version:** v2.1
- **Multi-image:** Yes (multi-page documents have full image sequences in IIIF).
- **Image licensing:** Public domain items: free reuse. Restricted items: viewer only.
- **Display strategy:** Use `thumbnail` field from `extraRecordData` directly; build IIIF manifest URL from ARK for full-page viewer.

## 7. Discipline / Subject Tags

- **Vocabulary:** Rameau (Répertoire d'autorité-matière encyclopédique et alphabétique unifié) + free text. Not always controlled.
- **Field path:** `dc:subject` (may repeat)
- **Granularity:** Typically 1-2 level: "Économie politique -- Jusqu'à 1800". Occasionally LCSH-equivalent.
- **Example values:** "Économie politique -- Jusqu'à 1800", "Révolution française (1789-1799)", "Botanique"
- **Hierarchy depth:** Up to 2 levels via `--` separator in single string
- **Facet/filter param:** `dc.subject all "term"` in CQL
- **Usability:** Medium — present in ~50% of records, inconsistently controlled, but facetable via `dc.subject` index.

## 8. Native Relevance & Scoring

- **Score returned?** No — SRU returns records in fixed order (no `<score>` element in DC or `extraRecordData`).
- **Field name:** N/A
- **Semantics:** N/A
- **Range:** N/A
- **Cross-query comparable?** N/A
- **Default sort:** Implicit relevance by Gallica's internal engine (unclear algorithm); records matching more indexed fields appear first.
- **Sort params:** See §4. OCR quality sort available (`ocr.quality/sort.descending`) which is a proxy for text-richness, not relevance.

**Protocol caveat:** SRU = no relevance score by spec → A1 = 0.

## 9. Pagination

- **Mechanism:** Offset-based (startRecord / maximumRecords)
- **Param names:** `startRecord` (1-based), `maximumRecords` (max 50)
- **Max page size:** 50 records
- **Stated depth cap:** None documented
- **Empirical depth:** `numberOfRecords` returned for "histoire" query = 44,219+; deep pagination tested at startRecord=100 — works fine. Likely unlimited.
- **Cursor expiry:** N/A (stateless offset)

### 9b. Measured Latency (live probe, median of 3 warm calls)

| Query type | Latency |
|-----------|---------|
| Keyword (1 word + filter) | 1,400 ms |
| Multi-keyword (3 words) | ~1,200 ms |
| NL full sentence (7 words) | ~1,300 ms |
| NL-vs-keyword delta | ~1× (no semantic overhead; OCR index is flat) |
| Cold vs warm | +600ms cold |
| Extra resolve round-trips | None for basic DC; +1 for IIIF manifest |

**Query-strategy implication:** ~1.4s median is acceptable; use `gallica all` for broad discovery; use `dc.title all` + `AND access all "fayes"` for OA-only title search.

## 10. Rate Limits & Auth

- **Key required?** No
- **Key type:** N/A
- **Acquisition speed:** N/A (keyless)
- **Backend-safe?** Yes — the Vercel edge route `api/search/gallica.js` calls the API server-side; CORS not an issue.
- **Anon limits:** Not documented; empirically tolerant of reasonable request rates.
- **Burst:** Not documented.
- **Quota:** Not documented.
- **Rate-limit code:** Unknown (no 429 observed in testing).
- **Retry-After:** Not observed.

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|--------------|
| `dc:creator` | Includes dates and role suffixes: "Steuart, James (1712-1780). Auteur du texte" | "Prouvé, Victor (1858-1943). Fonction indéterminée" | Strip parenthetical dates + role suffix before display |
| `dc:contributor` | Same as creator; role appended | "Sénovert, Étienne François de (1753-1831). Traducteur" | Strip role suffix |
| `dc:date` | Range format "YYYY-YYYY" or single "YYYY"; also "YYYY-YYYY" for serial runs | "1789-1790", "1941-1941" | Match first `\d{4}` — already done in route |
| `dc:description` | Multi-value; first value may be a table-of-contents note, not an abstract | "Titre original : An inquiry..." / "Ouvrages avant 1800" | Join all values as abstract; warn user it's a desc field not true abstract |
| `dc:type` | Multi-value (French + English duplicates) | "text", "monographie imprimée", "printed monograph" | Take first value; normalise to OpenCITE type vocabulary |
| `dc:identifier` | Multi-value; ARK + NUMM/NUMP/ISSN | `["https://gallica.bnf.fr/ark:/12148/...", "NUMM-111340"]` | Prefer `https://gallica.bnf.fr/ark:` prefix |
| `dc:language` | ISO 639-2 three-letter codes | "fre", "eng" | Map to ISO 639-1 if needed |
| `nqamoyen` | Float embedded as escaped HTML entity in `extraResponseData` | `&lt;nqamoyen&gt;83.04&lt;/nqamoyen&gt;` | Decode HTML entities before regex; use DOMParser approach in route |
| `dc:rights` | Multilingual; "domaine public" + "public domain" both appear | see above | Check for "public domain" OR "domaine public" for `isOA=true` |

## 12. Exploitation Notes

- **Under-exploited fields:**
  - `nqamoyen` (OCR quality, 0-100): use as a proxy for abstract-richness. Records with `nqamoyen < 30` have unreliable OCR; filter them for abstract display.
  - `typedoc` (`periodiques`, `manuscrits`, `cartes`, `images`, `monographies`): enables content-type faceting.
  - `dc:rights` / `access` index: OpenCITE hardcodes `isOA: true` for all Gallica results — incorrect. Should filter with `access all "fayes"` or parse `dc:rights` to set `isOA`.
  - `highres` / IIIF manifest: rich image viewer experience — reconstruct manifest URL from ARK and use IIIF viewer.
  - `dc:contributor` (translators, illustrators): currently discarded; valuable for cultural heritage context.
  - `dc:source` (holding location): enables library-of-origin provenance display.

- **Query-strategy upgrade:** Replace `gallica all "query"` with `(dc.title all "query" OR text all "query") AND access all "fayes"` for OA-only title + full-text search. For author-pollution control: append `NOT dc.creator all "query"`.

- **Batch/harvest opportunity:** No OAI-PMH on Gallica itself (unlike BnF catalogue); bulk download not available via SRU. Harvest via IIIF Collections API or BnF data dump if needed.

- **Crosswalk opportunity:** `dc:relation` field contains `catalogue.bnf.fr/ark:` links — can crosswalk to BNF_API adapter for richer UNIMARC metadata.

- **Downstream enrichment:** `nqamoyen` ≥ 70 → reliable OCR text → can feed full-text search or snippet extraction.

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score | **0** | SRU spec: no score element; `nqamoyen` is OCR quality not relevance |
| A2 Query expressiveness | **2** | Multi-field CQL, AND/OR/NOT, phrase, proximity, comparison ops documented |
| A3 Sort & filter control | **2** | Sort by date/creator/title/OCR; filter by `access`, `dc.type`, `dc.date`, `dc.language` ≥ 4 dims |
| A4 Pagination depth | **2** | Offset, max 50/page; empirically unlimited depth; no cursor |
| A5 Batch/bulk | **1** | No OAI-PMH; SRU paging only; no harvest mode |
| A6 Throughput & rate limits | **2** | No stated cap; keyless; reasonably tolerant; 8s edge timeout used |
| A7 ID linkage | **1** | ARK + NUMM/ISSN; no DOI/ORCID/QID crosswalk |
| A8 Result-count accuracy | **2** | `numberOfRecords` accurate for moderate sets; SRU `numberOfRecordsDecollapser` hints at deduplication |
| A9 Semantic/NL mode | **0** | Lexical exact-match OCR full-text; NL sentence → near-zero recall confirmed |
| A10 Author-name pollution | **2** | `dc.title all` vs `dc.creator all` scoping works reliably; confirmed by live probe |

Raw_A = (0×1.5 + 2 + 2 + 2 + 1 + 2 + 1 + 2 + 0×1.5 + 2) / 11 = **14 / 11 = 1.27**

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | **2** | Title, authors, date, type, language, ARK URL; no journal/vol/issue/pages (heritage items); no ORCID/DOI |
| B2 Abstract/full-text | **1** | `dc:description` present ~60% but is physical desc + notes, not a true abstract; full-text OCR accessible via `text` index but not returned in DC record |
| B3 Citation graph | **0** | None |
| B4 Discipline/subject tags | **2** | Rameau controlled vocab (≥2-level), facetable via `dc.subject` index; ~50% coverage |
| B5 OA/free-access | **2** | `dc:rights` + `access` filter present; ~80% reliable; OA URL populated (ARK); OA-only filter available; not CC0 — rights mixed |
| B6 Rich media/IIIF | **3** | Thumbnail + highres in SRU extraRecordData; IIIF v2 manifest buildable from ARK; multi-image for all multi-page items; all public-domain items freely viewable |
| B7 Holdings/availability | **1** | `dc:source` names institution + call number; single institution; no real-time availability |
| B8 Record-quality signals | **1** | `nqamoyen` (OCR quality 0-100) is unique and valuable; no dedup cluster or retraction watch |

Raw_B = (2 + 1×1.5 + 0 + 2 + 2×1.5 + 3 + 1 + 1) / 9 = (2 + 1.5 + 0 + 2 + 3 + 3 + 1 + 1) / 9 = **13.5 / 9 = 1.50**

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | **1** | ~1.4s median; occasional Gallica maintenance; no published SLA; 500 error on explain endpoint observed |
| C2 Auth friction | **3** | Keyless; no per-user auth; backend-safe edge route exists |
| C3 Redistribution/TOS risk | **1** | Mixed corpus: ~50-60% public domain (free reuse) + ~40% rights-reserved; aggregation of metadata only LOW risk; display of content requires rights check — MEDIUM overall for content display |
| C4 Protocol/client maturity | **2** | SRU 1.2 documented; CQL indexes documented at api.bnf.fr; no OpenAPI/versioning |
| C5 Data hygiene | **2** | Mostly consistent DC; known hazards: date ranges, multilingual type duplication, HTML-entity-wrapped extraRecordData; role suffixes in author field |

Raw_C = (1 + 3 + 1 + 2 + 2) / 5 = **9 / 5 = 1.80**

### Rollup

```
Overall = 1.27 × 0.45 + 1.50 × 0.40 + 1.80 × 0.15
        = 0.572 + 0.600 + 0.270
        = 1.44
```

**TIER = C (Peripheral)**

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | LOW for metadata display; MEDIUM for content display (40% rights-reserved items) |
| Currently quarantined? | No (but NOT serverSafe — browser-proxied edge route) |
| Recommended action | Fix `isOA` bug (hardcoded `true` → parse `dc:rights`); add `access all "fayes"` filter; exploit `nqamoyen` for quality gating; exploit `typedoc` for faceting |
| Blocking issues | (1) isOA false-positive: all results marked OA when ~40% are restricted. (2) DOMParser availability in Vercel Edge V8 is fragile — route has a catch but should use regex parser like bnfApi.js for resilience. |
