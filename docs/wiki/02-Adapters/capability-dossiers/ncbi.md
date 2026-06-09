---
tags: [adapter, capability, dossier]
adapter_id: NCBI
dossier_date: 2026-06-09
pre_audit_tier: B
---

# NCBI — Capability Dossier

## §1 Identity

| Field | Value |
|-------|-------|
| Adapter ID | `NCBI` |
| Adapter file | `src/adapters/extensions/ncbi.js` |
| Official API name | NCBI E-utilities (Entrez Programming Utilities) — PubMed database |
| Provider | National Center for Biotechnology Information (NIH/NLM) |
| Base URL(s) | esearch: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` · esummary: `...esummary.fcgi` · efetch: `...efetch.fcgi` |
| Protocol | REST-JSON (esearch/esummary) + REST-XML (efetch for abstracts) |
| Docs URL(s) | https://www.ncbi.nlm.nih.gov/books/NBK25501/ (E-utilities overview) · https://www.ncbi.nlm.nih.gov/books/NBK25499/ (ESearch detail) |
| TOS/license URL | https://www.ncbi.nlm.nih.gov/home/about/policies/ (U.S. government work; largely public domain) |
| Pre-audit tier | B |
| Dossier date | 2026-06-09 |

---

## §2 Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard(s) | PubMed/MEDLINE XML (efetch); NCBI ESummary JSON (flat, proprietary); NLM JATS-like abstract XML |
| Serialization | JSON (esearch/esummary) + XML (efetch abstracts) |
| Schema/OpenAPI URL | No OpenAPI spec; NCBI DocSum schema described at https://www.ncbi.nlm.nih.gov/books/NBK25499/ |
| Schema version | Unversioned; stable since ~2013 |

---

## §3 Complete Field / Tag Inventory (live probe 2026-06-09)

### esummary JSON (primary metadata — all fields enumerated from live probe)

| Field | Type | Always? | Meaning | OpenCITE maps to |
|-------|------|---------|---------|-----------------|
| `uid` | string | Yes | PubMed ID (PMID) | `id` (prefixed `ncbi-`) |
| `title` | string | Yes | Article title | `title` |
| `sorttitle` | string | Yes | Sortable title (lowercase) | NOT mapped |
| `vernaculartitle` | string | No | Non-English title | NOT mapped |
| `authors` | object[] | No | `[{name, authtype, clusterid}]` — name is "Family I" format | `authors` (name field) |
| `lastauthor` | string | No | Last author name | NOT mapped |
| `sortfirstauthor` | string | No | First author sortable name | NOT mapped |
| `source` | string | Yes | Journal abbreviation | NOT mapped (fulljournalname used) |
| `fulljournalname` | string | Yes | Full journal name | `journal` |
| `essn` | string | No | Electronic ISSN | NOT mapped |
| `issn` | string | No | Print ISSN | NOT mapped |
| `volume` | string | No | Volume | `volume` |
| `issue` | string | No | Issue | `issue` |
| `pages` | string | No | Page range (e.g. "30-34") | `pages` |
| `pubdate` | string | Yes | Publication date string (e.g. "2024 Sep") | `year` (regex extract \d{4}) |
| `epubdate` | string | No | Electronic publication date | NOT mapped |
| `nlmuniqueid` | string | Yes | NLM journal ID | NOT mapped |
| `lang` | string[] | Yes | Language code array (e.g. ["eng"]) | NOT mapped |
| `pubtype` | string[] | Yes | Publication types (e.g. ["Journal Article"]) | NOT mapped |
| `recordstatus` | string | Yes | Indexing status (e.g. "PubMed - indexed for MEDLINE") | NOT mapped |
| `pubstatus` | int | Yes | Numeric publication status code | NOT mapped |
| `elocationid` | string | No | DOI or pii (format: "doi: 10.xxx/yyy") | `doi` (prefix stripped) |
| `articleids` | object[] | Yes | `[{idtype, idtypen, value}]` — types: pubmed, doi, pii, pmc, pmcid | `doi` (idtype=doi fallback) |
| `history` | object[] | Yes | History dates: `[{pubstatus, date}]` — entrez, pubmed, medline | NOT mapped |
| `references` | object[] | No | Reference list (often empty in esummary) | NOT mapped |
| `attributes` | string[] | Yes | Article attributes (e.g. ["Has Abstract"]) | NOT mapped |
| `pmcrefcount` | string | No | PMC citation count (often empty) | NOT mapped |
| `doctype` | string | Yes | Document type ("citation") | NOT mapped |
| `booktitle` | string | No | Book title (for book chapters) | NOT mapped |
| `bookname` | string | No | Book name code | NOT mapped |
| `publishername` | string | No | Publisher name (often empty for journal articles) | NOT mapped |
| `publisherlocation` | string | No | Publisher location | NOT mapped |
| `srccontriblist` | array | No | Source contributor list | NOT mapped |
| `srcdate` | string | No | Source date | NOT mapped |

### efetch XML (abstract only — fetched in parallel)

| Field | Type | Meaning | OpenCITE maps to |
|-------|------|---------|-----------------|
| `<AbstractText>` | XML element (one or more) | Abstract text; may have `Label` attr (BACKGROUND, METHODS, etc.) | `abstract` (segments joined) |
| `<DescriptorName>` | XML element | MeSH descriptor term | NOT in current OpenCITE mapping (extracted via MEDLINE format, not efetch abstract XML) |
| `<PMID>` | XML element | PubMed ID (for map key) | Used as join key to abstract map |

### MeSH via MEDLINE format (efetch with rettype=medline)

| Tag | Meaning |
|-----|---------|
| `MH` | MeSH Heading descriptor |
| `OT` | Other term (author keywords) |
| `PT` | Publication type |

**Note**: `meshheadinglist` is NOT returned in esummary JSON (confirmed: field absent from all probed records including MEDLINE-indexed ones). MeSH terms are only accessible via efetch (MEDLINE text or XML format) — requiring an additional fetch step.

---

## §4 Query Semantics

- **Lexical vs semantic**: PubMed text indexing — lexical BM25-like with MEDLINE/MeSH term expansion. MeSH term mapping is the unique semantic enhancement (controlled vocabulary mapping from free text to MeSH concepts).
- **NL tolerance**: Low for long NL sentences. PubMed query language (PQL) is tag-based: `term[field]`. Multi-word terms within a bracket require phrase syntax or AND-joining. Current adapter splits words and ANDs each word in `[Title/Abstract]` — loses phrase semantics but prevents empty results.
- **Multi-keyword default**: AND between terms (via adapter's word-split-and-AND construction).
- **Phrase syntax**: `"machine learning"[Title/Abstract]` — phrase in quotes within brackets.
- **Boolean operators**: AND, OR, NOT supported in PQL syntax. `field[Tag]` syntax.
- **Fielded query params** (PubMed tags):
  - `[Title/Abstract]` — title and abstract (content scope; author pollution impossible)
  - `[Author]` — author name
  - `[MeSH Terms]` — controlled vocabulary
  - `[Journal]` — journal name
  - `[Subheading]` — MeSH subheading
  - `[Text Word]` — all text fields
  - `[tiab]` — shorthand for [Title/Abstract]
- **Author-name pollution control**: `[Title/Abstract]` tag structurally excludes author fields. OpenCITE uses this correctly. Confirmed: `memon[Title/Abstract]` returns only 29 hits (all content mentions), not author-only matches.
- **Cross-lingual**: No. PubMed is primarily English; some multilingual abstracts indexed.

---

## §5 OA / Free-Access

| Field | Value |
|-------|-------|
| Whole-corpus OA? | No (majority non-OA; PMC subset is OA) |
| OA flag field | Not in esummary JSON directly; `articleids` may contain `pmc` type indicating PMC availability |
| Best-OA URL field | PMC URL via `articleids[type=pmc]` value formatted as `https://pmc.ncbi.nlm.nih.gov/articles/<pmcid>` |
| OA-only filter param | PubMed filter: `free full text[sb]` in search term. Confirmed: `photosynthesis[Title/Abstract] AND free full text[sb]` → 26,772 results |
| Sort-by-OA | No |
| Flag coverage % | ~40% of PubMed articles have PMC free fulltext |
| Recommended free-only strategy | Append `AND free full text[sb]` to esearch term (or `AND open access[filter]`) |

---

## §6 Images / Thumbnails / IIIF

No image or IIIF fields in E-utilities. Figures exist in PMC full text but not accessible via E-utilities API.

---

## §7 Discipline / Subject Tags

- **Vocabulary**: MeSH (Medical Subject Headings) — NLM's controlled biomedical vocabulary, the gold standard for biomedical indexing.
- **Access via**: efetch in MEDLINE format (`rettype=medline`, `MH` tags) or efetch XML (`<DescriptorName>` elements). NOT available in esummary JSON.
- **Granularity**: MeSH has 16 top-level categories; each descriptor maps to a tree position (e.g., `D12.776.521`). Up to 5 levels deep.
- **Example values**: "Computational Biology", "Databases, Factual", "Photosynthesis", "Machine Learning"
- **Qualifier tags**: MeSH qualifiers provide additional semantic specificity (e.g., "Photosynthesis/drug effects")
- **Hierarchy depth**: 5–7 levels in MeSH tree
- **Usability**: HIGH for biomedical domain — MeSH is the most precise biomedical controlled vocabulary in the roster. However, requires an extra efetch round-trip to access.
- **Current OpenCITE mapping**: `meshheadinglist` is listed in the adapter's esummary parse path but the field is NOT present in esummary JSON responses. The mapping silently returns empty keywords. **This is a bug / mismatch** — MeSH requires efetch MEDLINE format, which the adapter does not currently fetch.

---

## §8 Native Relevance & Scoring

- **Score returned?**: No — esearch returns IDs sorted by relevance but no numeric score. esummary has no score field.
- **Sort via esearch**: `sort=relevance` (default), `sort=pub_date`, `sort=Author`, `sort=JournalName`.
- **Default sort**: `relevance` — PubMed's internal BM25-like ranking (query-title/abstract matching + citation impact + recency composite). Well-regarded in the biomedical community.
- **Cross-query comparable?**: No score available.
- **Implication**: For RRF, treat as position-based scoring (1/(k+rank)) with no explicit score. The implicit relevance ordering from PubMed is high quality for biomedical queries.

---

## §9 Pagination

- **Mechanism**: Offset — `retstart=` (0-based) + `retmax=` (page size)
- **Param names**: `retstart`, `retmax`
- **Max page size**: 10,000 per esearch call (but 500 is practical for esummary); rate limit of 3 req/s without key applies per call
- **Stated depth cap**: `retmax` up to 10,000; no total depth cap stated for the full result set
- **Empirical depth**: Total results can be in hundreds of thousands (photosynthesis[TA] = 49,750); all theoretically accessible via offset
- **usehistory**: `usehistory=y` + WebEnv/query_key for efficient multi-step queries (esearch→esummary without re-running search)

### §9b Measured Latency (live probe, 3 warm calls)

| Query type | Latency |
|------------|---------|
| esearch keyword | ~271ms median (calls: 201, 369, 271ms) |
| esearch multi-keyword | ~220ms cold |
| esearch NL | ~210ms cold |
| esummary (separate call) | ~200–400ms additional |
| efetch abstract XML (separate call) | ~500–800ms additional |
| **Total per search** | ~700–1,400ms (3 calls: esearch + esummary + efetch in parallel) |
| Query-strategy implication | esearch alone is very fast (~270ms). Total latency is 3× single-API due to 3-step protocol. esummary + efetch run in parallel (current adapter does this correctly). Rate limit at 3 req/s without key is the binding constraint. |

**Rate limit hit during probing**: IP-level rate limit (3 req/s) was exceeded during rapid back-to-back probe calls — confirming the 3 req/s constraint is actively enforced.

---

## §10 Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No (but strongly recommended) |
| Key type | NCBI API key (free; registered at https://www.ncbi.nlm.nih.gov/account/) |
| Acquisition speed | Minutes (free registration) |
| Backend-safe? | Yes (`api_key=` param, not per-user OAuth) |
| Anon limits | **3 requests/second** (enforced — confirmed hit during probe: `"error": "API rate limit exceeded"`) |
| Keyed limits | **10 requests/second** |
| Quota | No stated daily quota |
| Rate-limit code | HTTP 429 with JSON body `{"error":"API rate limit exceeded","api-key":"<ip>","count":"4","limit":"3"}` |
| Retry-After? | Not in headers; body includes count vs limit |

---

## §11 Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `elocationid` | Format: `"doi: 10.xxx/yyy"` (with prefix) | `"doi: 10.1016/j.neures.2024.04.004"` | `.replace(/^doi:\s*/i, "")` — current code correct |
| `pubdate` | Free-text string (year + month abbrev + day mixed) | `"2024 Sep"`, `"2023 Mar-Apr"`, `"Spring 2019"` | Regex `\d{4}` extract — current code correct |
| `abstract` | JATS-style XML in efetch: may contain `<i>`, `<sup>`, `<b>` markup; numeric entities `&#x3bc;` | `"<i>P. falciparum</i>"`, `"&#x3bc;mol"` | Custom `decodeEntities()` + strip tags — current code handles this well |
| `abstract` | Multi-section abstracts (BACKGROUND/METHODS/RESULTS/CONCLUSION `Label` attrs) — all joined | Multiple `<AbstractText Label="METHODS">` | Join all segments with space — current code joins correctly |
| `authors[].name` | Format is "Family I" (last name + initials) not "Given Family" | `"Smith JA"` | Map directly; no join needed — but differs from OpenAlex "Given Family" format |
| `meshheadinglist` | NOT present in esummary JSON — adapter currently tries to map it but silently returns empty | `undefined` on all esummary records | **Bug**: must use efetch MEDLINE format to get MeSH. Current mapping is dead code. |
| `lang[]` | Three-letter codes (ISO 639-2B), not ISO 639-1 | `["eng"]` not `"en"` | Normalize: `{eng:"en",fre:"fr",ger:"de",spa:"es"}` lookup |
| `pubtype[]` | May be empty array; types: "Journal Article", "Review", "Clinical Trial" | `[]` | Guard `(it.pubtype \|\| [])` |
| `articleids[]` | May have `pmcid` entry formatted as `"pmc-id: PMC1234567;"` (with trailing semicolon) | `"pmc-id: PMC4424410;"` | Strip `pmc-id:` prefix and trailing semicolon |
| `volume` / `issue` | May be empty string or absent for ahead-of-print | `""` | Guard `it.volume \|\| ""` — current code correct |

---

## §12 Exploitation Notes

**Under-exploited fields (path → why valuable)**:
- **MeSH terms via efetch MEDLINE** — The adapter's `meshheadinglist` mapping is dead code (field not in esummary JSON). Adding a MEDLINE efetch step (or parsing existing efetch XML for `<DescriptorName>`) would provide gold-standard biomedical subject tags. **High value**: the only MeSH source in the roster (OpenAlex also provides MeSH but OpenCITE's NCBI adapter could be the primary biomedical facet source).
- `articleids[type=pmc]` → PMC ID — enables direct link to free full text at `https://pmc.ncbi.nlm.nih.gov/articles/<pmcid>`. Currently `url` falls back to DOI only.
- `pubtype[]` → Publication type (Review, Clinical Trial, Meta-Analysis, etc.) — enables type filtering for biomedical searches (e.g., "show me only Systematic Reviews").
- `attributes["Has Abstract"]` → Can use as pre-filter indicator before efetch.
- `history[{pubstatus:"medline"}].date` → MEDLINE indexing date — data quality signal.
- `lang[]` → Language code — enables language facet.

**Query-strategy upgrade**: Add `AND free full text[sb]` as optional OA mode. Use `usehistory=y` + WebEnv to pass esearch results directly to esummary without repeating the query. Add NCBI API key to env variables for 10 req/s throughput.

**Batch/harvest**: PubMed Baseline + Updates FTP available at `ftp://ftp.ncbi.nlm.nih.gov/pubmed/baseline/` (annual dump of all MEDLINE records in XML). E-utilities are for interactive search; FTP for bulk.

**Crosswalk opportunity**: `articleids[type=doi]` → Crossref/OpenAlex; `articleids[type=pmc]` → PMC full text; MeSH terms → OpenAlex mesh field (for cross-API deduplication by MeSH).

---

## §13 Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score (1.5×) | 1 | No numeric score returned. Results are sorted by PubMed's internal relevance ranking (confirmed: `sort=relevance` default). Ordering is monotone within request. Cannot use for RRF without proxy score from position. |
| A2 Query expressiveness | 2 | PubMed Query Language (PQL): field tags `[Title/Abstract]`, `[Author]`, `[MeSH Terms]`, boolean AND/OR/NOT, phrase quotes, date filters, publication type filters. Powerful but not full boolean DSL. |
| A3 Sort & filter control | 2 | `sort=relevance/pub_date/Author/JournalName`; date filter (`mindate`, `maxdate`); publication type filter; free-full-text filter (`free full text[sb]`); MeSH filter. Multiple facets but no facet count returns. |
| A4 Pagination depth/cursor | 2 | Offset (`retstart`/`retmax`) to full corpus depth; `usehistory` for efficient multi-step. No cursor mechanism. Max `retmax=10000` per call. |
| A5 Batch/bulk | 2 | `usehistory` for efficient esearch→esummary pipeline; up to 10,000 IDs per esearch; PubMed baseline FTP for full harvest. No cursor-based unlimited API harvest. |
| A6 Throughput & rate limits | 1 | 3 req/s anon (actively enforced — hit during probe); 10 req/s with key. Multiply by 3 calls per search = effective 1 search/s anon, 3.3 searches/s keyed. Severe constraint for fan-out. |
| A7 ID linkage | 3 | PMID (primary), DOI, PMC ID, pii, NLM journal ID, ISSN (print+electronic). 5 ID namespaces. |
| A8 Result-count accuracy | 2 | `count` field accurate; accessible by offset pagination. |
| A9 Semantic/NL mode (1.5×) | 1 | Lexical PubMed query language + MeSH automatic term mapping (ATM) — unique semantic enhancement. ATM maps query terms to MeSH concepts for broader retrieval. However, this is MeSH-vocabulary expansion, not vector semantics. NL sentences work via AND-of-words logic. |
| A10 Author-name pollution | 3 | `[Title/Abstract]` tag structurally excludes author fields. Confirmed: `memon[Title/Abstract]` → 29 results, all content mentions. Pollution structurally impossible. |

```
Raw_A = (1×1.5 + 2 + 2 + 2 + 2 + 1 + 3 + 2 + 1×1.5 + 3) / 11
       = (1.5 + 2 + 2 + 2 + 2 + 1 + 3 + 2 + 1.5 + 3) / 11
       = 20 / 11 = 1.82
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | 2 | Title, authors (name format only, no given/family split), date (free-text), journal (full name), vol/issue/pages, DOI, ISSN. Missing: publisher name, structured author ORCID (not in esummary). Score 2: full citation but not structured author fields. |
| B2 Abstract / full-text (1.5×) | 2 | Abstracts via efetch XML (~80% of indexed MEDLINE records have abstracts). Requires extra round-trip but currently implemented. Multi-section abstracts concatenated. |
| B3 Citation graph | 0 | No citation data in E-utilities. `pmcrefcount` field present but consistently empty in probed records. |
| B4 Discipline / field-tag granularity | 3 | MeSH (5-level controlled vocabulary, 30,000+ descriptors) — gold standard for biomedical classification. Requires efetch MEDLINE round-trip. `pubtype[]` provides work-type classification. |
| B5 OA / free-access (1.5×) | 1 | No OA boolean flag in esummary. PMC ID presence implies free full text (~40% of records). `free full text[sb]` filter available in esearch. `articleids[type=pmc]` enables PMC URL construction. Limited OA signal. |
| B6 Rich media / IIIF | 0 | No image fields in E-utilities. |
| B7 Holdings / availability | 0 | No holdings data. |
| B8 Record-quality signals | 2 | `recordstatus` ("PubMed - indexed for MEDLINE" vs preliminary); `pubtype[]` (review vs primary study); `attributes["Has Abstract"]`; MEDLINE indexing implies editorial quality control. |

```
Raw_B = (2 + 2×1.5 + 0 + 3 + 1×1.5 + 0 + 0 + 2) / 9
       = (2 + 3 + 0 + 3 + 1.5 + 0 + 0 + 2) / 9
       = 11.5 / 9 = 1.28
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | 2 | NCBI is well-established government infrastructure (~99%+ uptime); 271ms esearch median. Total 3-call latency ~700–1400ms. Occasional planned maintenance. |
| C2 Auth friction | 2 | Free key (minutes to register at ncbi.nlm.nih.gov/account); keyless works at 3 req/s. Key raises to 10 req/s. Backend-safe. |
| C3 Redistribution / TOS risk | 3 | U.S. government work; MEDLINE/PubMed metadata is public domain. NLM terms allow unrestricted use for research and commercial purposes. |
| C4 Protocol / client maturity | 2 | E-utilities stable since ~2010; JSON mode (retmode=json) well-documented; multi-step protocol documented in detail; Biopython/Entrez wrappers available. No OpenAPI. |
| C5 Data hygiene & parseability | 2 | `pubdate` free-text is the primary quirk; XML entities in abstract require custom decoding (well-handled in current adapter); `elocationid` doi-prefix issue handled; `authors[].name` format inconsistent with other adapters ("Family I" vs "Given Family"). |

```
Raw_C = (2 + 2 + 3 + 2 + 2) / 5 = 11 / 5 = 2.20
```

### Rollup

```
Raw_A = 1.82
Raw_B = 1.28
Raw_C = 2.20

Overall = 1.82×0.45 + 1.28×0.40 + 2.20×0.15
        = 0.819 + 0.512 + 0.330
        = 1.66
```

**TIER: B (Complementary)**

---

## §14 Flags

| Flag | Value |
|------|-------|
| TOS legal risk | NONE — U.S. government public domain work |
| Currently quarantined? | No |
| Recommended action | (1) Fix dead `meshheadinglist` mapping — use efetch MEDLINE format to extract MeSH terms; (2) Add NCBI API key to Vercel env for 10 req/s; (3) Map `articleids[type=pmc]` for PMC free-fulltext URL; (4) Surface `pubtype[]` for review/clinical-trial badges; (5) Add `AND free full text[sb]` as OA mode. |
| Blocking issues | 3 req/s rate limit (binding constraint for fan-out); no numeric relevance score for RRF; 3-step API protocol adds latency and rate-limit surface. |
| Unique value | Only adapter in roster with gold-standard biomedical MeSH vocabulary; PubMed's 37M records = definitive biomedical coverage; publication-type classification (reviews, clinical trials) unique to NCBI. |
