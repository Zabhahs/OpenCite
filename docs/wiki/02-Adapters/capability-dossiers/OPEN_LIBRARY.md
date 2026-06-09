---
tags: [adapter, capability, dossier]
adapter_id: OPEN_LIBRARY
---

# OPEN_LIBRARY — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `OPEN_LIBRARY` |
| Source file | `src/adapters/extensions/openLibrary.js` |
| Official API name | Open Library Search API |
| Provider | Internet Archive / Open Library |
| Base URL | `https://openlibrary.org/search.json` |
| Protocol | REST-JSON |
| Docs URL | https://openlibrary.org/dev/docs/api, https://openlibrary.org/swagger/docs |
| TOS / License URL | https://openlibrary.org/developers/licensing, https://archive.org/about/terms.php |
| Pre-audit tier | — |
| Dossier date | 2026-06-08 |

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard(s) | Custom JSON (derived from MARC/bibliographic); optional RDF/XML, YAML |
| Serialization | JSON (primary), YAML, RDF/XML |
| Schema/OpenAPI URL | https://openlibrary.org/swagger/docs |
| Schema version | Unversioned; stable since ~2010 |

## 3. Complete Field / Tag Inventory

Fields returned by `search.json` (requestable via `fields=`):

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|-----------------|---------|-----------------|
| `title` | string | Yes | Work title | `title` |
| `author_name` | string[] | ~85% | Author display names | `authors` |
| `first_publish_year` | int | ~80% | Year of first publication | `year` |
| `key` | string | Yes | Work key e.g. `/works/OL123W` | `url` (prefixed) |
| `subject` | string[] | ~60% | Controlled subject headings (LCSH-influenced) | `subjects` (slice 0–8) |
| `language` | string[] | ~70% | ISO 639-2/3 codes e.g. `eng`, `fre` | `language[0]` |
| `ia` | string[] | ~40% | Internet Archive IDs for scanned copies | `isOA` (truthy if non-empty) |
| `edition_count` | int | ~90% | Number of editions | unmapped |
| `publisher` | string[] | ~70% | Publisher names (can be many) | `publisher[0]` |
| `isbn` | string[] | ~50% | ISBN-10/13 values | unmapped |
| `lccn` | string[] | ~30% | Library of Congress control numbers | unmapped |
| `oclc` | string[] | ~20% | OCLC numbers | unmapped |
| `cover_i` | int | ~50% | Cover image ID → `https://covers.openlibrary.org/b/id/{id}-M.jpg` | unmapped (★ URL construct) |
| `cover_edition_key` | string | ~50% | Edition key with cover | unmapped |
| `ratings_average` | float | ~20% | Community rating 0–5 | unmapped |
| `edition_key` | string[] | ~90% | All edition OL IDs | unmapped |
| `seed` | string[] | ~80% | Subject/author/edition seeds | unmapped |
| `number_of_pages_median` | int | ~30% | Median page count | unmapped |
| `place` | string[] | ~20% | Publication places | unmapped |
| `person` | string[] | ~10% | Named persons discussed | unmapped |
| `time` | string[] | ~10% | Time periods covered | unmapped |
| `ddc` | string[] | ~20% | Dewey Decimal Classification | unmapped |
| `lcc` | string[] | ~20% | Library of Congress Classification | unmapped |

**Note:** The `abstract` / `description` field is **not** exposed in search.json; it requires a second call to `https://openlibrary.org/works/{key}.json`.

## 4. Query Semantics

- **Lexical vs semantic:** Purely lexical — Solr-based BM25 over title, author, subject, publisher. No semantic/vector mode.
- **NL tolerance:** Low. NL sentences collapse to keyword bag; no intent parsing. Live probe: NL "What are the causes of global warming" returned only 4 results vs. "climate change" → 21 554.
- **Multi-keyword default:** AND by default within field; implicit OR across fields.
- **Phrase syntax:** Quoted strings: `q="moby dick"`.
- **Boolean operators:** Implicit; no documented explicit AND/OR/NOT via `q=`. Field-prefix operators: `title:`, `author:`, `subject:`, `isbn:`, `publisher:`, `place:`, `language:`, `lccn:`.
- **Fielded-query param:** Use field: prefixes within `q=`; separate params `title=`, `author=`, `subject=`, `isbn=`, `publisher=` also accepted.
- **Author-name pollution control:** Default `q=` searches all fields including authors. Use `q=subject:X` or `title:X` prefixes to scope. Probe: `title=newton` still includes author Newton results (returned 8 204 records, first by Helmut Newton). Field scoping is **gappy** — `title=newton` is better but not fully pollution-proof. Recommended OpenCITE pattern: use `q=title:${query} OR subject:${query}` rather than bare `q=`.
- **Cross-lingual:** No; searches the English index only; non-English works discoverable only if title/subject indexed.

## 5. OA / Free-Access

| Field | Value |
|-------|-------|
| Whole-corpus OA? | No — ~40% have IA scans |
| OA flag field | `ia` array non-empty → scanned copy on archive.org |
| Best-OA URL field | Construct: `https://archive.org/details/{ia[0]}` |
| OA-only filter param | None built-in; client must filter on `ia` presence |
| Sort by OA | No |
| Flag coverage | ~40% have IA scan; public-domain vs. lending varies per title |
| Recommended "free only" strategy | Request `fields=ia` and filter `ia.length > 0`; link to `archive.org/details/{ia[0]}` |

**Caveat:** `ia` non-empty ≠ public domain. Some are controlled digital lending (CDL), not freely downloadable.

## 6. Images / Thumbnails / IIIF

| Field | Value |
|-------|-------|
| Has images? | Yes — cover images via Covers API |
| Thumbnail field | `cover_i` (int ID) → `https://covers.openlibrary.org/b/id/{cover_i}-S.jpg` (S/M/L sizes) |
| Full-res field | `cover_i` → `-L.jpg` suffix |
| IIIF manifest field | None standard; Internet Archive items have IIIF via archive.org |
| IIIF version | Not directly; IA IIIF v2 available for scanned works |
| Multi-image? | One cover per work |
| Image licensing | Public domain / CC-licensed (varies per scan) |
| Display strategy | Request `cover_i` + `cover_edition_key`; build URL client-side; ~50% coverage |

## 7. Discipline / Subject Tags

| Field | Value |
|-------|-------|
| Vocabulary | LCSH-influenced free-form + Dewey (`ddc`), LCC (`lcc`) |
| Field path | `subject[]` (in search response), `ddc[]`, `lcc[]` |
| Granularity | Medium–high; controlled terms but not strict hierarchy |
| Example values | `"Reason"`, `"Causation"`, `"Theory of Knowledge"`, `"Early works to 1800"` |
| Hierarchy depth | 1–2 levels implicit (no parent/child structure in search results) |
| Facet/filter param | `subject=` filter param; no facet counts returned in search.json |
| Usability | **High** — rich subject array (40+ per major work); LCSH terms are crosswalk-ready |

## 8. Native Relevance & Scoring

| Field | Value |
|-------|-------|
| Score returned? | No — `_score` not in search.json response |
| Field name | N/A |
| Semantics | Solr BM25 internally; title fields boosted |
| Range | N/A (not exposed) |
| Cross-query comparable? | No |
| Default sort | Relevance (BM25 internal) |
| Sort params | `sort=` accepts: `new` (first_publish_year desc), `old` (asc), `editions` (edition_count desc), `scans` (ia count desc), `rating` (ratings_average desc), `title` (alphabetic), `random` |

## 9. Pagination

| Field | Value |
|-------|-------|
| Mechanism | Offset / limit |
| Param names | `limit=`, `offset=` |
| Max page size | No stated cap; tested 100+; practical ~1000 |
| Stated depth cap | None documented |
| Empirical depth | Deep paging tested: offset=100 000 on "history" → `numFound: 3 913 187`, `numFoundExact: true`, 2 docs returned. Deep paging works but slow (~6s) |
| Cursor expiry | N/A (offset) |

### 9b. Measured Latency (live probe, 3 warm calls)

| Query type | Latency |
|-----------|---------|
| Keyword ("climate change") | cold: 1 442 ms; warm2: 842 ms; warm3: 365 ms |
| Multi-keyword ("kant critique pure reason") | 651 ms |
| NL full sentence | 824 ms |
| NL-vs-keyword delta | Low NL hit count (4 vs 21k) — lexical degradation, not latency |
| Deep page (offset=100k) | ~6 281 ms |
| Cold-vs-warm | ~4× cold penalty |
| Extra resolve round-trips | None needed for search; +1 if description required |
| Query strategy implication | Use multi-keyword; avoid NL; subject= param for precision |

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| Key required? | No |
| Key type | N/A |
| Acquisition speed | Keyless |
| Backend-safe? | Yes (no per-user auth) |
| Anon limits | 1 req/s |
| Keyed limits | 3 req/s (with descriptive User-Agent + email) |
| Burst | Undocumented |
| Quota | None stated |
| Rate-limit code | 429 (assumed) |
| Retry-After? | Not documented |

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `author_name` | String or array; can be empty array | `[]` or `["Author Name"]` | `[].concat(v).filter(Boolean)` |
| `language` | ISO 639-2/3 mix (3-char codes, not 2-char) | `"eng"` not `"en"` | Map 3→2 with a lookup table |
| `subject` | Can be 100+ entries, HTML entities in old entries | `"Science &amp; Technology"` | Slice to 8; decode HTML entities |
| `first_publish_year` | Integer or absent; can be 0 or 9999 | `0`, `9999` | `parseInt`; reject <1000 or >currentYear+2 |
| `publisher` | Array with duplicates, mixed case | `["Oxford","Oxford University Press"]` | Dedupe; take `[0]` |
| `ia` | Can be empty array `[]` | `[]` | Treat empty array as no OA |
| `isbn` | String or array; may include hyphens | `"978-0-393-97283-2"` | Strip hyphens; `[].concat(v)` |
| `edition_count` | Integer string sometimes | `"247"` | `parseInt` |

## 12. Exploitation Notes

- **`cover_i` / thumbnail** — unmapped. Build `https://covers.openlibrary.org/b/id/{cover_i}-M.jpg` for ~50% coverage; negligible cost.
- **`isbn` + `lccn` + `oclc`** — powerful crosswalk to WorldCat, library catalogs. Currently unmapped. Add to result for downstream enrichment.
- **`subject[]` facets** — only 8 subjects sliced currently; increasing to 15–20 improves subject-graph richness substantially.
- **`ddc` / `lcc`** — Dewey and LC classification numbers unmapped; valuable for disciplinary clustering.
- **Works API** — `https://openlibrary.org/works/{key}.json` returns description (abstract-equivalent), subjects, links. One extra round-trip per record.
- **Editions API** — `https://openlibrary.org/works/{key}/editions.json` — full edition list; useful for library holdings crosswalk.
- **OLID batch** — `?bibkeys=ISBN:xxx,LCCN:yyy` supports multi-ID batch lookup.
- **Query strategy upgrade** — Use `q=title:${q} OR subject:${q}` instead of bare `q=` to reduce author-name pollution.
- **`ratings_average`** — community quality signal; unmapped; low coverage (~20%) but nonzero.

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score (×1.5) | 0 | Score not returned in search.json |
| A2 Query expressiveness | 2 | Field-prefix operators (`title:`, `author:`, `subject:`), phrase; no explicit boolean |
| A3 Sort & filter control | 2 | 6 sort options (`new`, `old`, `editions`, `scans`, `rating`, `title`); subject/author/isbn filter params |
| A4 Pagination depth/cursor | 2 | Offset, empirically deep (>100k), no cursor |
| A5 Batch/bulk | 2 | `?bibkeys=` multi-ID; OAI-PMH via archive.org; no delta |
| A6 Throughput & rate limits | 1 | 1–3 req/s; no key upgrade path beyond UA polite identification |
| A7 ID linkage/crosswalk | 2 | ISBN, LCCN, OCLC, OLID; no DOI/ORCID |
| A8 Result-count accuracy | 3 | `numFound` + `numFoundExact: true`; stable across pages |
| A9 Semantic/NL (×1.5) | 1 | Lexical Solr; NL sentence returns near-zero hits; stemming likely |
| A10 Author-name pollution | 1 | Field prefix params exist but gappy; `title=newton` still returns author-named books |

```
Raw_A = (0×1.5 + 2 + 2 + 2 + 2 + 1 + 2 + 3 + 1×1.5 + 1) / 11
       = (0 + 2 + 2 + 2 + 2 + 1 + 2 + 3 + 1.5 + 1) / 11
       = 16.5 / 11 = 1.50
```

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | 2 | Title + structured authors + year + publisher + ISBN; no journal/DOI (books) |
| B2 Abstract/full-text (×1.5) | 0 | No abstract in search.json; Works API call needed |
| B3 Citation graph | 0 | None |
| B4 Discipline/field tags | 2 | LCSH-influenced subjects, DDC, LCC; 2-level but no hierarchy structure |
| B5 OA guarantee (×1.5) | 1 | `ia` field signals scan presence; ~40% coverage; no filter param; CDL caveat |
| B6 Rich media/IIIF | 1 | `cover_i` → Covers API; consistent but not IIIF; single image |
| B7 Holdings/availability | 2 | `ia` links to IA holdings; edition keys cross-walkable to library catalogs |
| B8 Record-quality signals | 1 | `edition_count` as indirect popularity signal; `ratings_average` partial |

```
Raw_B = (2 + 0×1.5 + 0 + 2 + 1×1.5 + 1 + 2 + 1) / 9
       = (2 + 0 + 0 + 2 + 1.5 + 1 + 2 + 1) / 9
       = 9.5 / 9 = 1.056
```

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | 2 | Median ~400–850ms warm; IA-backed; occasional slowness; no SLA but generally reliable |
| C2 Auth friction | 3 | Keyless; no auth required |
| C3 TOS risk | 2 | IA doesn't assert new copyright; CC0-leaning metadata; CDL ambiguity on `ia` content links → LOW |
| C4 Protocol/client maturity | 2 | Versioned REST JSON; OpenAPI sandbox; documented but unversioned schema |
| C5 Data hygiene | 2 | Well-typed; known quirks (language codes 3-char, publisher dedup, entity bleed in old subjects) |

```
Raw_C = (2 + 3 + 2 + 2 + 2) / 5 = 11 / 5 = 2.20
```

### Rollup

```
Overall = 1.50 × 0.45 + 1.056 × 0.40 + 2.20 × 0.15
        = 0.675 + 0.422 + 0.330
        = 1.43
```

**TIER = C** (1.0–1.4 band — Peripheral)

*Note: Raw_A and Raw_B score is dragged by the absent native score (A1=0) and no abstract (B2=0). The actual subject and bibliographic fields are richer than Tier C implies for its niche (humanities books).*

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | LOW — IA/OL does not assert new copyright over bibliographic metadata; CDL scans themselves not redistributed |
| Currently quarantined? | No |
| Recommended action | Keep in fan-out; add `cover_i` thumbnail; add ISBN/LCCN crosswalk fields; use `title:` + `subject:` fielded query to reduce author pollution |
| Blocking issues | None |
