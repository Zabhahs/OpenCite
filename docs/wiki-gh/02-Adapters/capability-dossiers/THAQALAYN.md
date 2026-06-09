---
tags: [adapter, capability, dossier]
adapter_id: THAQALAYN
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/THAQALAYN.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# THAQALAYN — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `THAQALAYN` |
| Source file | `src/adapters/extensions/thaqalayn.js` |
| Official API name | Thaqalayn API v2 |
| Provider | Thaqalayn Foundation (thaqalayn.net) |
| Base URL | `https://www.thaqalayn-api.net/api/v2` |
| Protocol | REST-JSON |
| Docs URL | https://thaqalayn-api.net (Swagger UI referenced on homepage) |
| TOS / License URL | https://thaqalayn.net/about ("educational and academic purposes only"; no formal license stated) |
| Pre-audit tier | — |
| Dossier date | 2026-06-08 |

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard(s) | Custom JSON; no standard bibliographic schema (hadith-specific corpus) |
| Serialization | JSON |
| Schema/OpenAPI URL | Swagger UI linked from thaqalayn-api.net homepage (URL not resolved in probe) |
| Schema version | v2 (current); v1 legacy endpoint `/api/allbooks` still active |

## 3. Complete Field / Tag Inventory

Live probe of `/api/v2/query?q=prayer` confirmed the following fields per hadith record:

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|-----------------|---------|-----------------|
| `id` | int | Yes | Hadith numeric ID | `id` (prefixed `thaq-`) |
| `bookId` | string | Yes | Book slug e.g. `"Al-Kafi-Volume-4-Kulayni"` | unmapped |
| `book` | string | Yes | Book display name e.g. `"Al-Kāfi"` | `title` (partial) |
| `category` | string | Yes | Category/book-section title e.g. `"The Book of Haj"` | `journal` (as chapter group) |
| `categoryId` | string | Yes | Category numeric ID | unmapped |
| `chapter` | string | Yes | Chapter name | unmapped |
| `chapterInCategoryId` | int | Yes | Chapter position within category | unmapped |
| `author` | string | Yes | Original hadith author e.g. `"Shaykh Muḥammad b. Yaʿqūb al-Kulaynī"` | `authors` (unmapped! currently set to `[]`) |
| `translator` | string | ~80% | English translator name e.g. `"Muhammad Sarwar"` | unmapped |
| `englishText` | string | ~90% | Full English translation of hadith | `abstract` |
| `arabicText` | string | ~95% | Full Arabic original text | `abstract` fallback |
| `frenchText` | string | ~30% | French translation | unmapped |
| `volume` | string/int | ~70% | Volume number in book | unmapped |
| `URL` | string | Yes | Direct permalink e.g. `"https://thaqalayn.net/hadith/1/3/228/1"` | `url` (WRONG — see note) |
| `majlisiGrading` | string | ~70% | Al-Majlisi's hadith authenticity grading | unmapped |
| `mohseniGrading` | string | ~40% | Al-Mohseni's grading | unmapped |
| `behbudiGrading` | string | ~40% | Al-Behbudi's grading | unmapped |
| `gradingsFull` | object/array | ~60% | All grading metadata | unmapped |
| `thaqalaynSanad` | string | ~50% | Chain of narrators (isnad) | unmapped |
| `thaqalaynMatn` | string | ~50% | Hadith text variant | unmapped |

**Critical note on `url` field:** The adapter currently sets `url: "https://thaqalayn.net/"` (homepage fallback, see comment in source). However, the live probe found that `item.URL` **does** contain a direct permalink (`https://thaqalayn.net/hadith/1/3/228/1`). The adapter comment is outdated — the URL field is usable. This is an exploitation gap.

**`author` field gap:** The adapter maps `authors: []` ignoring the populated `author` field. The original hadith compiler is consistently present.

## 4. Query Semantics

- **Lexical vs semantic:** Lexical full-text search over Arabic and English text fields. No semantic/vector mode.
- **NL tolerance:** Very low. Live probes: "prayer" → 3 459 hits; "fasting ramadan" → 0 hits; NL sentence → 0 hits. The API appears to do strict term matching, not stemmed/fuzzy search. Arabic terms may work better in Arabic script.
- **Multi-keyword:** AND is not supported — multi-keyword returns 0. Single-term queries only work reliably.
- **Phrase syntax:** Unknown — not documented; not tested.
- **Boolean operators:** None documented.
- **Fielded-query param:** None — only `q=` exists.
- **Author-name pollution control:** No field scoping possible; the `q=` param searches all text fields. However, since the corpus is exclusively hadith text, "author pollution" manifests differently — searching `author` names like "Kulayni" returns hadiths by that compiler, which is correct domain behavior.
- **Cross-lingual:** English and Arabic indexed; queries in either language should work if text is present.

**Key limitation:** The API returns the **entire matching result set in one call** (3 459 records for "prayer"). There is no server-side pagination — the adapter does client-side slicing. This is a single-query API.

## 5. OA / Free-Access

| Field | Value |
|-------|-------|
| Whole-corpus OA? | Yes — the API is keyless, publicly accessible; hadiths are pre-9th century texts |
| OA flag field | N/A — all results treated as OA |
| Best-OA URL field | `URL` field contains direct hadith permalink |
| OA-only filter param | N/A — whole corpus is open |
| Sort by OA | N/A |
| Flag coverage | 100% (public hadith corpus) |
| Recommended strategy | `isOA: true` for all records; use `URL` for deep link |

## 6. Images / Thumbnails / IIIF

| Field | Value |
|-------|-------|
| Has images? | No |
| Thumbnail field | None |
| Full-res field | None |
| IIIF manifest field | None |
| IIIF version | N/A |
| Multi-image? | N/A |
| Image licensing | N/A |
| Display strategy | Text-only source; no visual enrichment possible |

## 7. Discipline / Subject Tags

| Field | Value |
|-------|-------|
| Vocabulary | Hadith-specific: `category` (book section), `chapter`, `bookId` |
| Field path | `category`, `chapter`, `book` |
| Granularity | Low — category and chapter are free-form titles, not a controlled vocabulary |
| Example values | `"The Book of Haj"`, `"The Book of Prayer"`, `"Chapter on Purification"` |
| Hierarchy depth | 2 levels: book → category → chapter |
| Facet/filter param | None — no filter params; only `q=` |
| Usability | **Low** — Islamic religious categories; not mappable to general academic taxonomies |

## 8. Native Relevance & Scoring

| Field | Value |
|-------|-------|
| Score returned? | No |
| Field name | N/A |
| Semantics | Unknown internal text match; possibly simple string search |
| Range | N/A |
| Cross-query comparable? | No |
| Default sort | Unknown; appears to return matches in corpus order |
| Sort params | None |

## 9. Pagination

| Field | Value |
|-------|-------|
| Mechanism | **None server-side** — full result set returned in one response; adapter slices client-side |
| Param names | `q=` only |
| Max page size | Full corpus per query |
| Stated depth cap | N/A |
| Empirical depth | 3 459 records for "prayer" in one response (~3–4 MB JSON) |
| Cursor expiry | N/A |

### 9b. Measured Latency (live probe, 3 warm calls)

| Query type | Latency |
|-----------|---------|
| Keyword ("prayer") — full 3459-record dump | cold: 3 131 ms; warm2: 905 ms; warm3: 894 ms |
| Multi-keyword ("fasting ramadan") — 0 results | 226 ms |
| NL full sentence | 297 ms (0 results) |
| NL-vs-keyword delta | Catastrophic — NL returns 0 |
| Cold-vs-warm | ~3.5× cold penalty on large result |
| Extra resolve round-trips | None |
| Query strategy implication | Cache full result sets server-side; single-term queries only; pre-warm common religious terms |

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No |
| Key type | N/A |
| Acquisition speed | Keyless |
| Backend-safe? | Yes (`serverSafe: true` in adapter) |
| Anon limits | None documented |
| Burst | Unknown |
| Quota | Unknown |
| Rate-limit code | Unknown |
| Retry-After? | Unknown |

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `englishText` | Leading whitespace, HTML `<br>` entities | `"                   You say:"` | `stripHtml()` + `.trim()` |
| `arabicText` | Right-to-left Unicode; may contain diacritics (tashkeel) | Arabic text with harakat | Display with `dir="rtl"`; store raw |
| `frenchText` | Absent ~70%; null or empty string | `""` or `null` | Treat empty string as absent |
| `volume` | String or int | `"4"` or `4` | `String(v)` for display |
| `gradingsFull` | Object shape varies across records | `{}` or `[{…}]` | Guard with `Array.isArray` + type check |
| `URL` | HTTP not HTTPS (some records) | `"http://thaqalayn.net/..."` | Normalize to HTTPS |
| `id` | Integer; `thaq-${id}` must be stable | `2145` | Int-to-string; IDs appear stable |
| Large response | 3 000+ records per query can be 3–4 MB | prayer query | Set response size budget; paginate client-side |

## 12. Exploitation Notes

- **`author` field unmapped** — Original compiler (e.g., "Shaykh Muḥammad b. Yaʿqūb al-Kulaynī") is consistently populated; map to `authors` array immediately.
- **`URL` field usable** — Direct per-hadith permalinks (e.g., `https://thaqalayn.net/hadith/1/3/228/1`) are available and working. The adapter's homepage fallback is outdated; fix to use `item.URL`.
- **`translator` unmapped** — Translator name is a secondary author; map as `translatedBy` or append to `authors` with role tag.
- **`majlisiGrading` / `mohseniGrading`** — Hadith authenticity grades are domain-critical quality signals (sahih, hasan, mursal, da'if). Map to `quality` or `keywords` for scholarly filtering.
- **`thaqalaynSanad`** — Chain of narrators (isnad) is a structured provenance field unique to hadith scholarship; no equivalent elsewhere.
- **Arabic full-text** — `arabicText` is full hadith text in Arabic. Map alongside English to support Arabic-language queries.
- **Bulk strategy** — The single-response design makes client-side caching easy; pre-cache top 100 religious terms in a Redis/KV store to avoid repeated large-payload fetches.
- **`frenchText`** — Partial French translation; useful for French-speaking users; currently unmapped.

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score (×1.5) | 0 | No score returned; result order = corpus order |
| A2 Query expressiveness | 0 | Free-text `q=` only; no fields, no boolean, no phrase |
| A3 Sort & filter control | 0 | No sort or filter params |
| A4 Pagination depth/cursor | 0 | No server-side pagination; single full-dump response |
| A5 Batch/bulk | 2 | Full corpus returned per query; single call = full harvest |
| A6 Throughput & rate limits | 2 | Keyless; no stated limits; 3–4 MB per hit response |
| A7 ID linkage/crosswalk | 0 | No external IDs (DOI, PMID etc.); only internal numeric ID |
| A8 Result-count accuracy | 2 | Accurate count via `all.length`; no capping |
| A9 Semantic/NL (×1.5) | 0 | Strict match only; NL → 0 hits; multi-term → 0 hits |
| A10 Author-name pollution | 1 | No scoping param; but corpus is domain-specific, so pollution is contextually irrelevant |

```
Raw_A = (0×1.5 + 0 + 0 + 0 + 2 + 2 + 0 + 2 + 0×1.5 + 1) / 11
       = (0 + 0 + 0 + 0 + 2 + 2 + 0 + 2 + 0 + 1) / 11
       = 7 / 11 = 0.636
```

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | 1 | Book + hadith number + chapter; no structured date/DOI/journal |
| B2 Abstract/full-text (×1.5) | 3 | Full English + Arabic text consistently present (>85%); unique in the corpus |
| B3 Citation graph | 0 | None |
| B4 Discipline/field tags | 1 | Category + chapter = 2-level hierarchy; domain-specific, no controlled vocab |
| B5 OA guarantee (×1.5) | 3 | Entire corpus is open; pre-9th century texts; keyless public API |
| B6 Rich media/IIIF | 0 | Text-only |
| B7 Holdings/availability | 0 | No holdings; single source |
| B8 Record-quality signals | 2 | Multiple hadith authenticity gradings (Majlisi, Mohseni, Behbudi) = domain-specific quality signal |

```
Raw_B = (1 + 3×1.5 + 0 + 1 + 3×1.5 + 0 + 0 + 2) / 9
       = (1 + 4.5 + 0 + 1 + 4.5 + 0 + 0 + 2) / 9
       = 13 / 9 = 1.444
```

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | 1 | 890–3 130ms; large payloads; no SLA; small provider; occasional coldstart |
| C2 Auth friction | 3 | Keyless |
| C3 TOS risk | 2 | "Educational/academic purposes only" — informal restriction; hadith text is pre-9th century (public domain); no formal license → MEDIUM (intent unclear) |
| C4 Protocol/client maturity | 1 | REST endpoint functional; no versioning guarantee; Swagger referenced but not accessible; no changelog |
| C5 Data hygiene | 2 | Mostly consistent; known quirks (leading whitespace in text, volume type polymorphism); Arabic + Latin mixing well-handled |

```
Raw_C = (1 + 3 + 2 + 1 + 2) / 5 = 9 / 5 = 1.80
```

### Rollup

```
Overall = 0.636 × 0.45 + 1.444 × 0.40 + 1.80 × 0.15
        = 0.286 + 0.578 + 0.270
        = 1.13
```

**TIER = C** (1.0–1.4 band — Peripheral)

*Note: The full-text (B2=3) and OA guarantee (B5=3) are genuine strengths. The API is nearly unusable as a search engine (A2/A3/A4/A9 = 0) but excellent as a **text corpus source** for the unique Shia hadith niche. Recommend retaining for niche coverage but not investing in query-sophistication work.*

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | MEDIUM — "educational and academic purposes only" wording is ambiguous for a commercial product; hadith texts themselves are public domain; API access appears unrestricted in practice |
| Currently quarantined? | No |
| Recommended action | Fix `url` mapping to use `item.URL` (permalink available); map `author` field; map gradings as quality metadata; cache large result payloads |
| Blocking issues | Single-term query limitation severely limits relevance; multi-keyword returns 0 results |
