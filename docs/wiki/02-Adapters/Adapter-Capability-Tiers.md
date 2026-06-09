---
machine_ids: [adapters.index, adapters.core.crossref, adapters.core.doaj, adapters.core.openalex, adapters.core.curatedJournals, adapters.extensions.internetArchive, adapters.extensions.europeana, adapters.extensions.dpla, adapters.extensions.smithsonian, adapters.extensions.met, adapters.extensions.rijksmuseum, adapters.extensions.gallica, adapters.extensions.thaqalayn, adapters.extensions.ncbi, adapters.extensions.openContext, adapters.extensions.northwestern, adapters.extensions.princetonDpul, adapters.extensions.pangaea, adapters.extensions.laReferencia, adapters.extensions.oapen, adapters.extensions.openEdition, adapters.extensions.openLibrary, adapters.extensions.coreAc, adapters.extensions.ndli, adapters.extensions.base, adapters.extensions.chroniclingAmerica, adapters.extensions.onb, adapters.extensions.bdh, adapters.extensions.bnfApi, adapters.extensions.britishLibrary, adapters.extensions.lcDatasets, adapters.extensions.mexicana, adapters.extensions.wikidata]
findings: []
runtime: both
status: in-progress
tags: [adapter, capability, tier, ranking, rubric, metadata, oa]
---

# Adapter Capability Tiers

> **Purpose.** Rank every upstream API/data stream into a TIER (S/A/B/C/D) by its **true capability
> envelope** — what a fully-exploited adapter *could* extract, not what our current code maps — so we
> know which sources to lean on for ranking signals, which fields we are leaving on the table, and how
> best to query each one. Companion per-API dossiers live in
> [`capability-dossiers/`](capability-dossiers/) (one file per API).

**Evaluation philosophy.** Score each API on its capability ceiling: *"if we rebuilt the adapter from
scratch to fully exploit this API, what would we gain?"* Every dimension is scored 0–3 in observable,
verifiable terms, from **official docs + TOS + a live probe**. TOS risk is surfaced as a scored flag
(C3), never a hard veto.

---

## Part 1 — The Scored Rubric

### Axis A — Pass-Through Capabilities · weight **45%**

What the API lets us DO and the signals it hands us to drive our own ranker/UX.
**1.5× within-axis emphasis: A1 (native score) and A9 (semantic/NL mode)** — the two dimensions most
tied to ranking quality and query strategy.

| Dim | Name | 0 | 1 | 2 | 3 |
|-----|------|---|---|---|---|
| **A1** | **Native relevance score** *(1.5×)* | No score; fixed/unsorted order | Score returned but opaque/unreliable | Score monotone within a request, usable for RRF | Calibrated, cross-query-comparable, documented (BM25/TF-IDF/vector) |
| **A2** | **Query expressiveness (fielded/boolean)** | Free-text keyword only | Basic field prefix or AND only | Multi-field scope + AND/OR/NOT + phrase | Full nested boolean, proximity, wildcard/regex, or GraphQL/DSL; documented grammar |
| **A3** | **Sort & filter control** | No sort/filter | One sort OR one filter | Multiple sorts + 2+ facets (date/type/lang) | Rich faceting (5+ dims), sort by score/date/citations, facet counts returned |
| **A4** | **Pagination depth / cursor** | ≤100 or none | Offset, cap 1k–5k | Offset/cursor, cap 10k+ or empirically deep | Cursor/search-after, no depth cap; scroll/dump |
| **A5** | **Batch / bulk endpoint** | Single-record only | Batch ID lookup (≤100) | Batch ≥100 or harvest/dump w/ delta | Full harvest (OAI-PMH/SPARQL CONSTRUCT/bulk dump) + delta/resumption |
| **A6** | **Throughput & rate limits** | <10 req/min, no upgrade | 10–60 req/min; key helps | 60–600 req/min keyed; burst documented | >600 req/min or no stated cap; CDN-backed |
| **A7** | **ID linkage / crosswalk** | No external IDs | One ID (e.g. DOI) | 2–3 namespace IDs | 4+ IDs (DOI, PMID, arXiv, ORCID, QID, VIAF…) |
| **A8** | **Result-count accuracy** | No count | Approximate/capped | Accurate for small sets; caps ~10k | Exact for all sizes; stable across pages |
| **A9** | **Semantic / NL query mode** *(1.5×)* | Lexical exact-match only | Lexical + stemming/fuzzy; NL-tolerant, no semantic lift | Hybrid lexical+semantic OR documented NL endpoint (full sentence understood) | True vector/ANN semantic search; or trained NL model (e.g. SPECTER); cross-lingual |
| **A10** | **Author-name pollution control** | Searches all fields incl. authors; no scoping | Scoping param exists but gappy/undocumented | Reliable field-scope param suppresses author matches on opt-in | Default topic query already content-scoped; pollution structurally impossible |

```
Raw_A = (A1×1.5 + A2 + A3 + A4 + A5 + A6 + A7 + A8 + A9×1.5 + A10) / 11
```

### Axis B — Metadata Richness · weight **40%**

Depth and quality of fields the API can return.
**1.5× within-axis emphasis: B2 (abstract/full-text) and B5 (OA guarantee)** — abstract is the highest-
leverage relevance/LLM signal; OA-filterability is core to the free-access product promise.

| Dim | Name | 0 | 1 | 2 | 3 |
|-----|------|---|---|---|---|
| **B1** | **Core bibliographic completeness** | Title only (+ maybe 1 field) | Title+authors+date; source unstructured | Full citation: structured authors (ORCID where avail), journal, vol/issue/pages, DOI | + publisher, edition/version, language, type, ISSN/ISBN |
| **B2** | **Abstract / full-text access** *(1.5×)* | None | Present but <40% coverage or truncated | ≥60% abstract coverage; full-text link for a subset | >85% abstract; structured full-text XML/HTML or verified free-text link |
| **B3** | **Citation graph** | None | Cited-by count only | Count + reference list (≥50%) | Full in/out citation lists w/ DOIs; co-citation/influence |
| **B4** | **Discipline / field-tag granularity** | None | Free-text keywords only | Named controlled vocab (MeSH/DDC/LCSH/AAT/JEL…), ≥2-level, facetable | Multi-vocab: discipline+sub+fine concepts (OpenAlex concepts+QIDs / MeSH trees); sortable |
| **B5** | **OA / free-access guarantee & filterability** *(1.5×)* | No OA signal; can't restrict to free | Partial/unreliable OA flag (<80%) or unfilterable | Reliable flag (>90%) + best-OA URL + OA-only filter param | Whole corpus OA by definition; or authoritative flag (Unpaywall-level), URL always populated, filter+sort |
| **B6** | **Rich media / IIIF / thumbnails** | No image fields | Non-standard thumbnail for some records | Consistent thumbnail field (name it) OR IIIF for a subset | IIIF manifest + thumbnail + full-res; viewer-embeddable; multi-image |
| **B7** | **Holdings / availability** | None | Institution named (text) | Structured: institution + call number + status | Real-time availability; multi-institution (WorldCat-style); ILL flag |
| **B8** | **Record-quality signals** | None | Single provenance field/dedup key | Confidence/completeness score OR verified flag OR dedup cluster | Multi-axis: confidence + provenance + review date + dedup + retraction watch |

```
Raw_B = (B1 + B2×1.5 + B3 + B4 + B5×1.5 + B6 + B7 + B8) / 9
```

### Axis C — Operational / Access · weight **15%**

Feasibility of depending on the API in production. (No 1.5× — these are threshold conditions.)

| Dim | Name | 0 | 1 | 2 | 3 |
|-----|------|---|---|---|---|
| **C1** | **Reliability & responsiveness** | Frequent outages; no status page; slow/erratic latency | ~95–98% uptime; occasional multi-hour outage; 1–2s median | 99%+ SLA/track record; <1s median; degraded-mode documented | 99.9%+ SLA; CDN/multi-region; versioned; <500ms median |
| **C2** | **Auth friction** | Institutional/NDA/manual review >1wk | Free key w/ human approval (days), or per-user OAuth at query time | Free key auto-issued (mins) or keyless | Keyless, or key auto-issued + backend-safe; no per-user auth |
| **C3** | **Redistribution / TOS risk** | Prohibits metadata display, or NC-only ambiguous → flag HIGH | NC-only w/ exemption path, or hard-to-automate attribution → MEDIUM | Display+aggregation w/ attribution; CC-BY → LOW | CC0/public-domain or explicit unrestricted-aggregation terms → NONE |
| **C4** | **Protocol / client maturity** | Undocumented/unstable; no schema | Documented REST but incomplete/unversioned | Versioned REST/JSON + changelog + SDK/OpenAPI | Semver + OpenAPI/GraphQL schema + official SDKs + sandbox |
| **C5** | **Data hygiene & parseability** | Chronically mixed types, delimiters-in-fields, raw HTML, untagged multilingual blobs, <50% field presence | Mostly consistent w/ 1–2 known quirks | Well-typed, documented schema, predictable edge cases | Schema-validated; never mixed types; no markup bleed; nulls consistent; lang-tagged |

```
Raw_C = (C1 + C2 + C3 + C4 + C5) / 5
```

### Rollup & Tier Bands

```
Overall = Raw_A × 0.45 + Raw_B × 0.40 + Raw_C × 0.15      (scale 0.0–3.0)
```

| Tier | Band | Label | Strategic directive |
|------|------|-------|---------------------|
| **S** | 2.5–3.0 | Cornerstone | Deep integration; primary ranking signal; query first; cache aggressively |
| **A** | 2.0–2.4 | First-class | Full feature exploitation; default fan-out |
| **B** | 1.5–1.9 | Complementary | Include in fan-out; don't over-invest in adapter complexity |
| **C** | 1.0–1.4 | Peripheral | Query only when corpus uniquely needed; minimal maintenance |
| **D** | <1.0 | Deprioritise | Quarantine or remove; resurrect only on explicit request |

### Protocol fairness caveats

- **SRU** (Gallica, BnF, ONB, BDH, BL): no relevance score by spec → A1=0 unless a non-standard score
  element is exposed. Resumption-token paging counts as cursor (A4 2–3), don't penalise.
- **OAI-PMH** (Mexicana): harvest, not search → A1=0, A2=0 by design, but A5=3 (ListRecords is the point).
- **Elasticsearch backends** (PANGAEA, Northwestern, BASE/Solr, DPUL/Blacklight): may leak `_score`
  even if undocumented → A1=2 if present in live responses.
- **GraphQL** (OpenNeuro): A2/A4 depend on the schema — introspect (`__schema`) for filter args + paging.
- **SPARQL** (Wikidata, BL): A2=3 by default (most expressive); A1=0 unless a text-search extension
  (CirrusSearch) is available; watch C1/C2 (public-endpoint rate limits are severe).
- **Linked-Art JSON-LD** (Rijksmuseum): B6/B7 likely high, B1/B3 likely low — score what's *returned*,
  note the bibliographic gap rather than average-penalising.

---

## Part 2 — Per-API Dossier Template

Each API gets a file at `capability-dossiers/<adapter-id>.md` following this template. All fields
mandatory; write `UNKNOWN — needs research` rather than leaving blank.

1. **Identity** — adapter id/file, official API name, provider, base URL, protocol, docs URL(s), TOS/license URL, pre-audit tier, dossier date.
2. **Metadata standard & serialization** — standard(s) (Dublin Core / MARCXML / UNIMARC / MODS / schema.org JSON-LD / Linked-Art / BIBFRAME / RIS / custom), serialization (JSON/XML/JSON-LD/CSV/RDF), schema/OpenAPI URL, schema version.
3. **Complete field/tag inventory** — table: field path (dot-notation) · type · always-present? · meaning · OpenCITE currently maps to. (★ = needs extra resolve call.) Document each schema variant separately.
4. **Query semantics** — lexical vs semantic; NL tolerance; multi-keyword default (AND/OR); phrase syntax; boolean operators; fielded-query param; **author-name pollution control** (default scope, scope param, does it eliminate author matches, recommended OpenCITE topic-query pattern); cross-lingual support.
5. **OA / free-access** — whole-corpus-OA? · OA flag field+values · best-OA URL field · OA-only filter param · sort-by-OA · flag coverage % · recommended "free only" strategy.
6. **Images / thumbnails / IIIF** — has images? · thumbnail field (exact path) · full-res field · IIIF manifest field · IIIF version · multi-image? · image licensing · display strategy.
7. **Discipline / subject tags** — vocabulary + version · field path · granularity · example values · hierarchy depth · facet/filter param · usability for our faceting (high/med/low + reason).
8. **Native relevance & scoring** — score returned? · field name · semantics (BM25/TF-IDF/vector) · range · cross-query comparable? · default sort · sort params.
9. **Pagination** — mechanism · param names · max page size · stated depth cap · empirical depth · cursor expiry.
   **9b. Measured latency (live probe, median of 3 warm calls):** keyword query ms · multi-keyword ms · NL/full-sentence ms · NL-vs-keyword delta (×) · cold-vs-warm · extra resolve round-trips · query-strategy implication.
10. **Rate limits & auth** — key required? · key type · acquisition speed · backend-safe? · anon/keyed limits · burst · quota · rate-limit code · Retry-After?
11. **Dirty-data / parsing hazards** — table: field · hazard · example · safe handling.
12. **Exploitation notes** — under-exploited fields (path + why valuable) · query-strategy upgrade · batch/harvest opportunity · crosswalk opportunity · downstream enrichment.
13. **Scores** — per-dimension 0–3 tables (A/B/C) with notes · computed Raw_A/Raw_B/Raw_C · Overall · TIER.
14. **Flags** — TOS legal risk (NONE/LOW/MED/HIGH + reason) · currently quarantined? · recommended action · blocking issues.

---

## Part 3 — Defensive Parser Reference

The §11 dirty-data tables across all dossiers collectively specify a single defensive
`normalizeRecord(raw, adapterId)`. Categories every dossier must confirm/deny:

- **Encoding** — heritage APIs (BnF/Gallica/ONB/BL) may return ISO-8859-1/UTF-16 despite a utf-8 header, or embed HTML entities (`&amp;`, `&#160;`) in title/abstract. Decode entities + coerce UTF-8 on all text.
- **Type coercion** — `string|array` polymorphism on `authors`/`subject`/`language`/`identifier`; read as `[].concat(v).filter(Boolean)`. Numeric fields (`year`, `cited_by`) may be numeric strings → `parseInt` w/ radix.
- **Delimiters inside fields** — some pack multi-values into one string (`;`, `|`, `\t`, double-space). Name the field + delimiter; never assume a text field is a clean scalar.
- **Markup bleed** — JATS XML (`<jats:p>`, `<sub>`) in Crossref/PubMed abstracts; `<br>` in DC descriptions. Strip markup on plain-text fields.
- **Language-tagged objects** — SPARQL/Linked-Art return `{"@value":"…","@language":"fr"}`; extract `@value`, prefer `en`.
- **Date polymorphism** — ISO datetime / ISO date / year int / year string / `[y,m,d]` array / free text ("Spring 2019"). One `parseYear(raw) → int|null` helper everywhere.
- **Null vs absent** — treat `null`/`undefined`/`""`/`[]`/`{}` as "not present" unless semantics need empty≠absent.

Each §11 row becomes a parser test fixture (input → expected normalized output).

---

## Master Capability Matrix

> _Populated by the research pass. One row per API; scores feed the tier column._

_(pending research fan-out — see [`capability-dossiers/`](capability-dossiers/))_

## Tier Summary

_(pending)_

## See also

[[02-Adapters/Adapter-Architecture]] · [[02-Adapters/Adapter-Health-Matrix]] · [[02-Adapters/Core-Adapters]] · [[02-Adapters/Extension-Adapters]] · [[03-Search-Pipeline/Ranking-Scoring]]
