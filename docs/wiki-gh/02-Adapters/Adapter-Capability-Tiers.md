---
machine_ids: [adapters.index, adapters.core.crossref, adapters.core.doaj, adapters.core.openalex, adapters.core.curatedJournals, adapters.extensions.internetArchive, adapters.extensions.europeana, adapters.extensions.dpla, adapters.extensions.smithsonian, adapters.extensions.met, adapters.extensions.rijksmuseum, adapters.extensions.gallica, adapters.extensions.thaqalayn, adapters.extensions.ncbi, adapters.extensions.openContext, adapters.extensions.northwestern, adapters.extensions.princetonDpul, adapters.extensions.pangaea, adapters.extensions.laReferencia, adapters.extensions.oapen, adapters.extensions.openEdition, adapters.extensions.openLibrary, adapters.extensions.coreAc, adapters.extensions.ndli, adapters.extensions.base, adapters.extensions.chroniclingAmerica, adapters.extensions.onb, adapters.extensions.bdh, adapters.extensions.bnfApi, adapters.extensions.britishLibrary, adapters.extensions.lcDatasets, adapters.extensions.mexicana, adapters.extensions.wikidata]
findings: []
runtime: both
status: complete
audited: 2026-06-09
tags: [adapter, capability, tier, ranking, rubric, metadata, oa]
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/Adapter-Capability-Tiers.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


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

## Tier Summary

> 36 APIs audited 2026-06-09 (live probe + docs). 31 integrated/quarantined + 5 revival candidates.
> **No source reaches Tier S** — the ceiling is OpenAlex (2.23): nothing offers true semantic search
> (A9≥2) *and* a citation graph *and* full-abstract coverage at once, so the "Cornerstone" band is
> currently empty. That is the headline strategic finding: our best lever is **fusing** complementary
> sources, not leaning on any single one. Each row links its full dossier.

| Tier | API | Overall | A / B / C | Role / status | One-liner |
|------|-----|:---:|:---:|---|---|
| **A** | [OPENALEX](capability-dossiers/openalex.md) | **2.23** | 2.32/2.06/2.40 | integrated · core | Richest metadata + best OA signal + structurally pollution-proof content scope |
| **A** | [CURATED](capability-dossiers/curated.md) | **2.19** | 2.23/2.06/2.40 | integrated · core | OpenAlex envelope on an ISSN-curated set; inherits all OpenAlex strengths |
| **A** | [EUROPE_PMC](capability-dossiers/EUROPE_PMC.md) | **2.05** | 2.00/2.06/2.20 | **new — top search candidate** | PubMed-class biomedical + preprints + OA full text; keyless; sub-1s |
| **B** | [PANGAEA](capability-dossiers/PANGAEA.md) | **1.91** | 2.14/1.56/2.20 | integrated | Strongest earth/env data; ES `_score`; full Lucene; RIS latency bottleneck |
| **B** | [WIKIDATA](capability-dossiers/WIKIDATA.md) | **1.90** | 2.05/1.56/2.40 | integrated | Best ID-crosswalk of any source (8 namespaces) + CC0 + SPARQL; NL fails |
| **B** | [DOAJ](capability-dossiers/doaj.md) | **1.74** | 1.73/1.50/2.40 | integrated · core | Only 100%-OA-by-definition corpus; fast; no score, no citation graph |
| **B** | [DATACITE](capability-dossiers/DATACITE.md) | **1.74** | 1.82/1.39/2.40 | **new — datasets search** | Datasets/software DOI search (Zenodo/Dryad/figshare); unique corpus |
| **B** | [CROSSREF](capability-dossiers/crossref.md) | **1.73** | 2.05/1.11/2.40 | integrated · core | DOI authority + reference graph; abstract too sparse to rank on |
| **B** | [NORTHWESTERN](capability-dossiers/NORTHWESTERN.md) | **1.73** | 1.59/1.72/2.20 | integrated | ES + Cohere embeddings stored but **not exposed**; best subject vocab |
| **B** | [OPENNEURO](capability-dossiers/OPENNEURO.md) | **1.72** | 1.68/1.44/2.60 | **quarantined — REVIVE** | CC0 neuroimaging; GraphQL fast; old adapter was wrong architecture |
| **B** | [NCBI](capability-dossiers/ncbi.md) | **1.66** | 1.82/1.28/2.20 | integrated | Gold-standard biomedical MeSH; 3 req/s cap; MeSH mapping currently dead |
| **B** | [INTERNET_ARCHIVE](capability-dossiers/INTERNET_ARCHIVE.md) | **1.59** | 1.82/1.17/2.00 | integrated | Dual metadata+FTS (BM25 score); `downloads≠citedBy` defect |
| **B** | [OAPEN](capability-dossiers/OAPEN.md) | **1.54** | 1.23/1.72/2.00 | integrated | OA scholarly books; rich CC0 metadata + thumbnails; slow, no total count |
| **B** | [MET](capability-dossiers/MET.md) | **1.53** | 1.32/1.44/2.40 | integrated | CC0 museum; `tags[]` (AAT+Wikidata) unmapped; 30+ fan-out resolves/page |
| **B** | [CHRONICLING_AMERICA](capability-dossiers/CHRONICLING_AMERICA.md) | **1.51** | 1.23/1.56/2.20 | integrated | OCR full-text newspapers; rich facets; brutal 8–16s latency |
| **B** | [OPENCONTEXT](capability-dossiers/OPENCONTEXT.md) | **1.50** | 1.46/1.28/2.20 | integrated | Unique geo-temporal archaeology data; thumbnails; NL fails |
| **B** | [PRINCETON_DPUL](capability-dossiers/PRINCETON_DPUL.md) | **1.50** | 1.41/1.50/1.80 | integrated | Blacklight; IIIF + abstract only in item-detail (extra call); 50k Islamic MSS |
| **C** | [BASE](capability-dossiers/BASE.md) | **1.49** | 1.73/1.11/1.80 | integrated | 400M OA records, Solr DSL, but IP-allowlisted + abstract-sparse |
| **C** | [LC_DATASETS](capability-dossiers/LC_DATASETS.md) | **1.49** | 1.14/1.61/2.20 | integrated | Heterogeneous LoC collections; strong IIIF; junk without `fa=` filter |
| **C** | [OPENAIRE](capability-dossiers/OPENAIRE.md) | **1.46** | 1.73/1.11/1.60 | **new — search, low priority** | EU-funded research + SDG tags; abstracts absent; 60 req/hr blocker |
| **C** | [GALLICA](capability-dossiers/GALLICA.md) | **1.44** | 1.27/1.50/1.80 | integrated | SRU/DC; IIIF + OCR-quality signal; `isOA` hardcoded-true bug |
| **C** | [SCIELO](capability-dossiers/SCIELO.md) | **1.44** | 1.09/1.78/1.60 | **quarantined — keep dead** | No public search API; DOAJ covers the LatAm OA overlap |
| **C** | [ENA](capability-dossiers/ENA.md) | **1.43** | 1.50/1.06/2.20 | **quarantined — REVIVE (~30min)** | Trivial syntax bug caused quarantine; unique genomic study corpus |
| **C** | [OPEN_LIBRARY](capability-dossiers/OPEN_LIBRARY.md) | **1.43** | 1.50/1.06/2.20 | integrated | Book corpus; rich LCSH subjects; no abstract; no score; OA via IA scan |
| **C** | [RIJKSMUSEUM](capability-dossiers/RIJKSMUSEUM.md) | **1.35** | 1.23/1.39/1.60 | integrated | Linked-Art; no `q=`; 3-hop image chain; 3.5–5s; abstracts unmapped |
| **C** | [BNF_API](capability-dossiers/BNF_API.md) | **1.33** | 1.27/1.06/2.20 | integrated | SRU/UNIMARC; 15M catalogue; no abstract; Rameau subjects; 856 OA URL unused |
| **C** | [BDH](capability-dossiers/BDH.md) | **1.20** | 1.18/1.00/1.80 | **BROKEN — route 404** | REST endpoint dead; needs full SPARQL rewrite (datos.bne.es) |
| **C** | [LA_REFERENCIA](capability-dossiers/LA_REFERENCIA.md) | **1.20** | 1.32/0.83/1.80 | integrated | LatAm OA aggregator; no score/DOI; `summary` abstract unmapped |
| **C** | [BL](capability-dossiers/BL.md) | **1.17** | 1.36/0.72/1.80 | **DEAD — endpoint unreachable** | bnb.data.bl.uk ETIMEDOUT on all probes; recommend quarantine |
| **C** | [THAQALAYN](capability-dossiers/THAQALAYN.md) | **1.13** | 0.64/1.44/1.80 | integrated | Unique bilingual Shia hadith + gradings; single-term search only |
| **C** | [ONB](capability-dossiers/ONB.md) | **1.12** | 1.18/0.72/2.00 | integrated | SRU/DC via Alma; 2M; NL→0; MARCXML schema unexploited |
| **C** | [OPENEDITION](capability-dossiers/OPENEDITION.md) | **1.05** | 0.91/1.00/1.60 | integrated | French/Euro SSH; undocumented API; freemium≠OA bug |
| **C** | [MEXICANA](capability-dossiers/MEXICANA.md) | **1.01** | 0.73/1.11/1.60 | **DEAD — SSL expired** | OAI-PMH client-side filter; zero ranking guarantee; wrong architecture |
| **D** | [UNPAYWALL](capability-dossiers/UNPAYWALL.md) | **0.91** | 0.45/0.94/2.20 | **enrichment (S-tier for role)** | Authoritative OA URL by DOI; inject into every result card |
| **D** | [OPENCITATIONS](capability-dossiers/OPENCITATIONS.md) | **0.87** | 0.64/0.56/2.40 | **enrichment (best-in-class)** | 2B+ CC0 citation links; inject `citedByCount` for every DOI |
| **D** | [CROSSREF_EVENTS](capability-dossiers/CROSSREF_EVENTS.md) | **0.44** | 0.64/0.00/1.00 | **DEFUNCT — do not integrate** | Crossref sunset the API 2026-04-23; returns 403 |

> ⚠️ **D-tier ≠ useless.** UNPAYWALL and OPENCITATIONS score D *only* because the rubric is search-
> centric and they are **lookup/enrichment** services (no free-text search → A-axis floors). For their
> intended role they are S-tier and should be **integrated immediately** as a per-DOI enrichment layer.

---

## Master Capability Matrix

Full per-dimension scores (0–3). See Part 1 for dimension definitions. Sorted by tier then Overall.

### Axis A — Pass-Through (A1 score · A2 query · A3 sort/filter · A4 paging · A5 bulk · A6 rate · A7 IDs · A8 count · A9 semantic/NL · A10 author-ctrl)

| API | A1 | A2 | A3 | A4 | A5 | A6 | A7 | A8 | A9 | A10 | Raw A |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| OPENALEX | 2 | 2 | 3 | 3 | 3 | 2 | 3 | 2 | 1 | 3 | 2.32 |
| CURATED | 2 | 2 | 3 | 3 | 2 | 2 | 3 | 2 | 1 | 3 | 2.23 |
| EUROPE_PMC | 1 | 2 | 2 | 3 | 2 | 2 | 3 | 3 | 1 | 2 | 2.00 |
| PANGAEA | 2 | 3 | 3 | 2 | 2 | 2 | 2 | 3 | 1 | 2 | 2.14 |
| WIKIDATA | 0 | 3 | 3 | 2 | 3 | 2 | 3 | 2 | 1 | 3 | 2.05 |
| DOAJ | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 1.73 |
| DATACITE | 1 | 2 | 2 | 3 | 2 | 2 | 2 | 3 | 1 | 1 | 1.82 |
| CROSSREF | 2 | 2 | 3 | 2 | 3 | 2 | 2 | 2 | 1 | 2 | 2.05 |
| NORTHWESTERN | 0 | 3 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 1 | 1.59 |
| OPENNEURO | 0 | 2 | 2 | 3 | 2 | 2 | 2 | 1 | 1 | 3 | 1.68 |
| NCBI | 1 | 2 | 2 | 2 | 2 | 1 | 3 | 2 | 1 | 3 | 1.82 |
| INTERNET_ARCHIVE | 1 | 3 | 2 | 2 | 3 | 2 | 1 | 2 | 1 | 2 | 1.82 |
| OAPEN | 0 | 1 | 1 | 2 | 2 | 2 | 2 | 1 | 1 | 1 | 1.23 |
| MET | 0 | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 1 | 0 | 1.32 |
| CHRONICLING_AMERICA | 0 | 1 | 2 | 2 | 1 | 0 | 1 | 2 | 1 | 3 | 1.23 |
| OPENCONTEXT | 0 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 0 | 3 | 1.46 |
| PRINCETON_DPUL | 0 | 2 | 2 | 2 | 1 | 2 | 1 | 2 | 1 | 2 | 1.41 |
| BASE | 1 | 3 | 1 | 2 | 2 | 1 | 2 | 2 | 1 | 3 | 1.73 |
| LC_DATASETS | 0 | 1 | 2 | 2 | 1 | 1 | 1 | 2 | 1 | 1 | 1.14 |
| OPENAIRE | 1 | 2 | 2 | 3 | 2 | 1 | 2 | 3 | 1 | 1 | 1.73 |
| GALLICA | 0 | 2 | 2 | 2 | 1 | 2 | 1 | 2 | 0 | 2 | 1.27 |
| SCIELO | 0 | 0 | 1 | 2 | 2 | 1 | 1 | 2 | 0 | 3 | 1.09 |
| ENA | 0 | 2 | 1 | 2 | 1 | 2 | 2 | 3 | 1 | 2 | 1.50 |
| OPEN_LIBRARY | 0 | 2 | 2 | 2 | 2 | 1 | 2 | 3 | 1 | 1 | 1.50 |
| RIJKSMUSEUM | 0 | 1 | 1 | 2 | 1 | 2 | 1 | 2 | 1 | 2 | 1.23 |
| BNF_API | 0 | 2 | 1 | 2 | 1 | 2 | 2 | 2 | 0 | 2 | 1.27 |
| BDH | 0 | 3 | 2 | 2 | 2 | 1 | 1 | 1 | 0 | 1 | 1.18 |
| LA_REFERENCIA | 0 | 2 | 2 | 2 | 1 | 2 | 1 | 2 | 1 | 1 | 1.32 |
| BL | 0 | 3 | 2 | 2 | 2 | 1 | 2 | 0 | 0 | 3 | 1.36 |
| THAQALAYN | 0 | 0 | 0 | 0 | 2 | 2 | 0 | 2 | 0 | 1 | 0.64 |
| ONB | 0 | 2 | 1 | 2 | 1 | 2 | 1 | 2 | 0 | 2 | 1.18 |
| OPENEDITION | 0 | 1 | 0 | 2 | 1 | 2 | 1 | 2 | 0 | 1 | 0.91 |
| MEXICANA | 0 | 0 | 0 | 2 | 3 | 1 | 1 | 0 | 0 | 1 | 0.73 |
| UNPAYWALL | 0 | 0 | 0 | 0 | 2 | 2 | 1 | 0 | 0 | 0 | 0.45 |
| OPENCITATIONS | 0 | 0 | 1 | 0 | 2 | 1 | 2 | 1 | 0 | 0 | 0.64 |
| CROSSREF_EVENTS | 0 | 1 | 1 | 2 | 1 | 0 | 1 | 1 | 0 | 0 | 0.64 |

### Axis B — Richness (B1 biblio · B2 abstract · B3 citations · B4 discipline tags · B5 OA · B6 media · B7 holdings · B8 quality)

| API | B1 | B2 | B3 | B4 | B5 | B6 | B7 | B8 | Raw B |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| OPENALEX | 3 | 2 | 3 | 3 | 3 | 0 | 0 | 2 | 2.06 |
| CURATED | 3 | 2 | 3 | 3 | 3 | 0 | 0 | 2 | 2.06 |
| EUROPE_PMC | 3 | 3 | 2 | 3 | 2 | 0 | 1 | 2 | 2.06 |
| PANGAEA | 2 | 2 | 0 | 2 | 2 | 0 | 2 | 2 | 1.56 |
| WIKIDATA | 3 | 1 | 2 | 3 | 1 | 0 | 1 | 2 | 1.56 |
| DOAJ | 3 | 2 | 0 | 2 | 3 | 0 | 0 | 1 | 1.50 |
| DATACITE | 3 | 1 | 1 | 1 | 2 | 0 | 1 | 2 | 1.39 |
| CROSSREF | 3 | 1 | 2 | 1 | 1 | 0 | 0 | 1 | 1.11 |
| NORTHWESTERN | 2 | 2 | 0 | 3 | 1 | 2 | 2 | 2 | 1.72 |
| OPENNEURO | 2 | 1 | 0 | 2 | 3 | 0 | 1 | 2 | 1.44 |
| NCBI | 2 | 2 | 0 | 3 | 1 | 0 | 0 | 2 | 1.28 |
| INTERNET_ARCHIVE | 1 | 2 | 0 | 1 | 3 | 1 | 0 | 0 | 1.17 |
| OAPEN | 3 | 2 | 0 | 2 | 3 | 1 | 0 | 2 | 1.72 |
| MET | 1 | 1 | 0 | 2 | 3 | 2 | 1 | 1 | 1.44 |
| CHRONICLING_AMERICA | 1 | 1 | 0 | 2 | 3 | 3 | 1 | 1 | 1.56 |
| OPENCONTEXT | 1 | 0 | 0 | 2 | 3 | 2 | 1 | 1 | 1.28 |
| PRINCETON_DPUL | 2 | 1 | 0 | 2 | 2 | 2 | 2 | 1 | 1.50 |
| BASE | 2 | 1 | 0 | 1 | 3 | 0 | 0 | 1 | 1.11 |
| LC_DATASETS | 2 | 1 | 0 | 2 | 2 | 3 | 2 | 1 | 1.61 |
| OPENAIRE | 2 | 0 | 1 | 1 | 2 | 0 | 1 | 2 | 1.11 |
| GALLICA | 2 | 1 | 0 | 2 | 2 | 3 | 1 | 1 | 1.50 |
| SCIELO | 2 | 3 | 1 | 2 | 3 | 0 | 1 | 1 | 1.78 |
| ENA | 1 | 1 | 0 | 2 | 2 | 0 | 1 | 1 | 1.06 |
| OPEN_LIBRARY | 2 | 0 | 0 | 2 | 1 | 1 | 2 | 1 | 1.06 |
| RIJKSMUSEUM | 1 | 1 | 0 | 1 | 2 | 3 | 2 | 1 | 1.39 |
| BNF_API | 3 | 0 | 0 | 3 | 1 | 0 | 1 | 1 | 1.06 |
| BDH | 2 | 0 | 0 | 1 | 2 | 2 | 1 | 0 | 1.00 |
| LA_REFERENCIA | 1 | 1 | 0 | 1 | 2 | 0 | 0 | 1 | 0.83 |
| BL | 2 | 1 | 0 | 2 | 0 | 0 | 1 | 0 | 0.72 |
| THAQALAYN | 1 | 3 | 0 | 1 | 3 | 0 | 0 | 2 | 1.44 |
| ONB | 2 | 1 | 0 | 2 | 0 | 0 | 1 | 0 | 0.72 |
| OPENEDITION | 2 | 2 | 0 | 0 | 2 | 0 | 0 | 1 | 1.00 |
| MEXICANA | 1 | 2 | 0 | 1 | 2 | 1 | 1 | 0 | 1.11 |
| UNPAYWALL | 1 | 0 | 0 | 0 | 3 | 0 | 1 | 2 | 0.94 |
| OPENCITATIONS | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 2 | 0.56 |
| CROSSREF_EVENTS | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 |

### Axis C — Operational (C1 reliability · C2 auth · C3 TOS · C4 protocol · C5 hygiene)

| API | C1 | C2 | C3 | C4 | C5 | Raw C |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| OPENALEX | 2 | 3 | 3 | 2 | 2 | 2.40 |
| CURATED | 2 | 3 | 3 | 2 | 2 | 2.40 |
| EUROPE_PMC | 2 | 3 | 2 | 2 | 2 | 2.20 |
| PANGAEA | 2 | 3 | 2 | 2 | 2 | 2.20 |
| WIKIDATA | 2 | 3 | 3 | 2 | 2 | 2.40 |
| DOAJ | 2 | 3 | 3 | 2 | 2 | 2.40 |
| DATACITE | 2 | 3 | 3 | 2 | 2 | 2.40 |
| CROSSREF | 2 | 3 | 3 | 2 | 2 | 2.40 |
| NORTHWESTERN | 2 | 3 | 2 | 2 | 2 | 2.20 |
| OPENNEURO | 2 | 3 | 3 | 3 | 2 | 2.60 |
| NCBI | 2 | 2 | 3 | 2 | 2 | 2.20 |
| INTERNET_ARCHIVE | 2 | 3 | 2 | 2 | 1 | 2.00 |
| OAPEN | 1 | 3 | 3 | 1 | 2 | 2.00 |
| MET | 2 | 3 | 3 | 2 | 2 | 2.40 |
| CHRONICLING_AMERICA | 1 | 3 | 3 | 2 | 2 | 2.20 |
| OPENCONTEXT | 2 | 3 | 2 | 2 | 2 | 2.20 |
| PRINCETON_DPUL | 2 | 3 | 2 | 1 | 1 | 1.80 |
| BASE | 2 | 1 | 2 | 2 | 2 | 1.80 |
| LC_DATASETS | 2 | 3 | 3 | 2 | 1 | 2.20 |
| OPENAIRE | 2 | 1 | 2 | 2 | 1 | 1.60 |
| GALLICA | 1 | 3 | 1 | 2 | 2 | 1.80 |
| SCIELO | 1 | 3 | 2 | 1 | 1 | 1.60 |
| ENA | 2 | 3 | 2 | 2 | 2 | 2.20 |
| OPEN_LIBRARY | 2 | 3 | 2 | 2 | 2 | 2.20 |
| RIJKSMUSEUM | 1 | 3 | 2 | 1 | 1 | 1.60 |
| BNF_API | 1 | 3 | 3 | 2 | 2 | 2.20 |
| BDH | 1 | 3 | 2 | 1 | 2 | 1.80 |
| LA_REFERENCIA | 2 | 3 | 2 | 1 | 1 | 1.80 |
| BL | 0 | 2 | 3 | 2 | 2 | 1.80 |
| THAQALAYN | 1 | 3 | 2 | 1 | 2 | 1.80 |
| ONB | 1 | 3 | 2 | 2 | 2 | 2.00 |
| OPENEDITION | 2 | 2 | 2 | 1 | 1 | 1.60 |
| MEXICANA | 0 | 3 | 2 | 2 | 1 | 1.60 |
| UNPAYWALL | 2 | 3 | 2 | 2 | 2 | 2.20 |
| OPENCITATIONS | 2 | 3 | 3 | 2 | 2 | 2.40 |
| CROSSREF_EVENTS | 0 | 2 | 3 | 0 | 0 | 1.00 |

---

## Cross-Cutting Findings & Action Items

These surfaced repeatedly across dossiers. Full detail + exact field paths live in each dossier's §11/§12.

### 🔴 Broken / dead in production (fix or quarantine)
- **BL** — `bnb.data.bl.uk` SPARQL endpoint `ETIMEDOUT` on every probe; silently returns empty. **Quarantine.**
- **MEXICANA** — SSL cert expired + OAI-PMH client-side-filter architecture gives zero ranking. **Quarantine / rebuild.**
- **BDH** — `api/search/bdh.js` REST endpoint returns **404**; the real source is `datos.bne.es/sparql`. **Needs SPARQL rewrite** (~fast once rewritten, 370ms).
- **SCIELO** (quarantined) — `search.scielo.org/api/v2` is a private ES endpoint, permanently 403. No public search API exists. **Keep quarantined**; DOAJ covers the overlap.

### 🟢 Revive (cheap, high value)
- **ENA** (~30 min) — quarantine was a single syntax bug: `field="*word*"` (wildcard-in-quotes) → 400. Correct: `study_title="term" OR study_description="term"`; drop invalid `study_type` field; add `/count` endpoint. Healthy API, ~1s, exact counts.
- **OPENNEURO** (~2–3 hr) — API is alive/fast/CC0; old adapter fetched 100 newest + client-filtered. Rebuild on `datasets(first,after)` Relay cursor + local BM25F. `metadata.associatedPaperDOI` is a high-value dataset→paper crosswalk.

### ➕ New sources to adopt (revival-candidate audit)
- **EUROPE_PMC** (Tier A, 2.05) — **top priority.** Keyless, ~937ms, 85%+ abstracts, MeSH, 6.5M OA full-text. `TITLE:{q} OR ABSTRACT:{q} OR MESH:{q}` is pollution-proof; `OPEN_ACCESS:Y` filter works.
- **DATACITE** (Tier B, 1.74) — adopt as the **datasets/software search** source (Zenodo/Dryad/figshare). `titles.title:{q}` avoids author pollution.
- **UNPAYWALL** + **OPENCITATIONS** — adopt as a **per-DOI enrichment layer** (not search): inject `best_oa_location.url`/`oa_status` and `citedByCount` into every DOI-bearing card. Both keyless-ish, CC0/open, cache-friendly. (Unpaywall needs a real `UNPAYWALL_EMAIL`.)
- **OPENAIRE** (Tier C) — only if EU-funding/SDG filters are wanted; **60 req/hr unauthenticated is a hard blocker** → needs server-side OAuth token refresh. Graph API v1 drops abstracts.
- **CROSSREF_EVENTS** — ❌ **defunct** (sunset 2026-04-23, returns 403). Remove from roadmaps.

### ⚡ Quick-win field exploits (we already query these APIs — fields are returned but unmapped)
- **CROSSREF** — `isOA:false` is hardcoded but ~50% of records carry a CC `license[].URL`; derive `isOA` from it. Also map `reference[]` (citation crosswalk), `author[].ORCID`, `link[].URL` (full text).
- **OPENALEX** — `relevance_score` is returned but only reaches RRF on the **browser** path; `api/search.js` never imports `rrf.js` (BM25F-only server-side). Wiring it server-side is the single biggest ranking win. (Confirms the standing memory note.)
- **NCBI** — MeSH mapping (`meshheadinglist`) is **dead code** (absent from esummary JSON); MeSH only comes from efetch MEDLINE/XML. PMC full-text URL derivable from `articleids[type=pmc]`.
- **INTERNET_ARCHIVE** — FTS endpoint returns a real BM25 `_score` not forwarded to RRF; and `downloads`→`citedBy` must stop (already `rankFields.citedBy:false`, but drop any downloads sort).
- **NORTHWESTERN** — stores `cohere.embed-multilingual-v3` embeddings per doc but strips them from API output; `/ai-search` 404. No semantic access today, but watch for exposure.
- **PANGAEA** — each ES hit embeds an `xml-thumb` blob containing the full citation; parsing it inline **eliminates the per-hit RIS round-trip** (~1.2s/record). `sp-loginOption:"unrestricted"` is a one-line OA filter.
- **LA_REFERENCIA** — `summary` field holds the abstract but is unmapped → `abstract:""`. One-line win.
- **THAQALAYN** — `author` populated but mapped to `[]`; `item.URL` is a working per-hadith permalink but adapter falls back to homepage.
- **OPEN_LIBRARY** — `cover_i` (thumbnail) + `isbn`/`lccn`/`oclc` crosswalk unmapped.
- **MET** — `tags[]` carry AAT + Wikidata IDs (discipline + crosswalk), unmapped.
- **GALLICA** — `nqamoyen` OCR-quality (0–100) unique signal; `dc:rights` should drive `isOA` (hardcoded true for ~40% non-OA); IIIF manifest buildable from ARK.
- **BNF_API** — UNIMARC 856 $u (electronic access URL) unparsed → would enable `isOA` for digitised items.
- **ONB** — `recordSchema=marcxml` would add ISBN, GND subject IDs (→VIAF crosswalk), DDC; currently only flattened DC.
- **PRINCETON_DPUL / RIJKSMUSEUM** — IIIF manifest + abstract live only in the per-item detail call; current adapters miss them.

### 📐 Systemic patterns
- **Semantic search is absent fleet-wide** — A9 = 0/1 everywhere (no source exposes vector/ANN search to us; Northwestern has embeddings but hides them). Any semantic capability must be **our own** embedding layer over fetched results, not upstream.
- **Author-name pollution** is real on lexical sources (Open Library, LA Referencia, ONB defaults). Field-scoping (`title:`/`bibliographic`/CQL `title=`) fixes most; OpenAlex `title_and_abstract.search` and Europe PMC `TITLE/ABSTRACT/MESH` are structurally clean.
- **Discipline tags for our own faceting** are best from **OpenAlex concepts (Wikidata QIDs + scores)**, **NCBI/Europe PMC MeSH**, and **Northwestern/BnF (LCSH/Rameau)** — these are the sources to drive a cross-source discipline facet.
- **OA-guarantee tiers**: whole-corpus-OA (DOAJ, OAPEN, OpenNeuro, BASE, IA) > reliable flag+filter (OpenAlex, Europe PMC, PANGAEA) > derive-from-license (Crossref, Gallica, BnF) > none. Unpaywall is the universal backstop.

---

## R-NAME — Distribution Name Decision (v0.43)

The PyPI name `opencite` is already taken by Seyed Yahya Shirazi ("neuromechanist", v0.5.3,
published 2026-06-05) — the same upstream author whose MIT code we clean-room-ported in v0.43.
Additionally, OpenCitations.net (Bologna / I4OC) owns the head SEO term "open + citation".

**Decision:** never ship a CLI or installable package under the dist name `opencite`.
If we ever publish one, use a distinct name (e.g. `opencite-search`).
Keep the product brand **OpenCITE** unchanged; add a non-affiliation line to docs/marketing
making clear we are not affiliated with OpenCitations.net or the neuromechanist/opencite project.
The name is descriptive and undefensible — do not contest either party.

## See also

[Adapter-Architecture](Adapter-Architecture.md) · [Adapter-Health-Matrix](Adapter-Health-Matrix.md) · [Core-Adapters](Core-Adapters.md) · [Extension-Adapters](Extension-Adapters.md) · [Ranking-Scoring](../03-Search-Pipeline/Ranking-Scoring.md)
