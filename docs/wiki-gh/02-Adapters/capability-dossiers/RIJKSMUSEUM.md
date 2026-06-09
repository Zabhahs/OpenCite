---
tags: [adapter, capability, dossier]
adapter_id: RIJKSMUSEUM
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/RIJKSMUSEUM.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Rijksmuseum — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | `RIJKS` |
| Source file | `src/adapters/extensions/rijksmuseum.js` |
| Official API name | Rijksmuseum Linked-Art Search API |
| Provider | Rijksmuseum (Amsterdam) |
| Search base URL | `https://data.rijksmuseum.nl/search/collection` |
| Resolve base URL | `https://data.rijksmuseum.nl/{integer-path}` |
| Protocol | Linked-Art JSON-LD (OrderedCollectionPage pattern) |
| Docs URL | https://data.rijksmuseum.nl/docs/search, https://data.rijksmuseum.nl/docs/http |
| TOS/license URL | https://data.rijksmuseum.nl/policy |
| Pre-audit tier estimate | B |
| Dossier date | 2026-06-09 |

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard | Linked Art 1.0 (CIDOC-CRM extension; JSON-LD framing) |
| Serialization | JSON-LD (`application/ld+json`) |
| Schema URL | https://linked.art/api/1.0/ |
| Schema version | Linked Art specification v1.0 |

All object records follow the Linked Art `HumanMadeObject` class. Getty AAT URIs are used for classification; multilingual labels via `identified_by[]` with language tags (`aat/300388277` = English). No free-text abstract — all descriptive text is encoded in `referred_to_by[]` LinguisticObject entries with AAT-classified type URIs.

## 3. Complete Field / Tag Inventory

### 3a. Search response (OrderedCollectionPage)

| Field | Type | Always present? | Meaning | OpenCITE maps to |
|-------|------|----------------|---------|-----------------|
| `type` | string | yes | `"OrderedCollectionPage"` | protocol check |
| `partOf.totalItems` | number | yes | Total matching objects | `total` |
| `orderedItems[].id` | string | yes | `https://id.rijksmuseum.nl/{N}` URI | resolve path extraction |
| `orderedItems[].type` | string | yes | `"HumanMadeObject"` | type check |
| `next.id` | string | no | URL with `pageToken` for next page | `nextPageToken` |
| `first`, `last`, `prev` | object | no | Navigation links | not used in adapter |

### 3b. HumanMadeObject (per-object resolve — ★ required for all metadata)

| Field | Type | Always present? | Meaning | OpenCITE maps to |
|-------|------|----------------|---------|-----------------|
| `id` | string | yes | `https://id.rijksmuseum.nl/{N}` | `url` construction fallback |
| `type` | string | yes | `"HumanMadeObject"` | type check |
| `identified_by[type=Identifier, classified_as≈AAT300312355].content` | string | no | Object number (e.g., "SK-C-5") | `id` prefix, `url` fallback |
| `identified_by[type=Name].content` | string | yes | Title (prefer `aat/300388277` = English) | `title` |
| `produced_by.carried_out_by[0].notation[@language=en].@value` | string | no | Artist name (flat production) | `authors[0]` |
| `produced_by.part[0].carried_out_by[0].notation[@language=en].@value` | string | no | Artist name (nested part) | `authors[0]` |
| `produced_by.timespan.identified_by[language=en].content` | string | no | Human-readable date (e.g., "1642") | `year` |
| `produced_by.timespan.begin_of_the_begin` | string | no | ISO date start | `year` fallback (slice 0,4) |
| `produced_by.technique[]` | array | no | Production technique (Getty AAT URI) | unmapped |
| `produced_by.referred_to_by[]` | array | no | Attribution/provenance notes | unmapped |
| `produced_by.part[0].took_place_at[0]` | object | no | Place of production | unmapped |
| `shows[0].id` | string | no | VisualItem URI for image chain hop-1 | image resolve |
| `subject_of[].digitally_carried_by[0].access_point[0].id` | string | no | HTML page URL | `url` |
| `classified_as[0]._label` | string | no | Object type label (e.g., "painting") | `subjects[]` (partial) |
| `classified_as[0].id` | string | yes | Object type Getty AAT URI | unmapped |
| `referred_to_by[]` | array | no | LinguisticObject entries: descriptions, dimensions, materials, inscriptions, acquisition info | unmapped (rich descriptive content) |
| `made_of[].id` | string | no | Material Getty AAT URI | unmapped |
| `dimension[]` | array | no | Dimension measurements with units | unmapped |
| `member_of[].id` | string | no | Collection membership URIs | unmapped |
| `equivalent[{id=hdl.handle.net/...}]` | object | no | Persistent handle (DOI-like) | unmapped |
| `@context` | string | yes | Linked Art JSON-LD context URI | unmapped |

### 3c. VisualItem (hop-1 of image chain — ★)

| Field | Meaning |
|-------|---------|
| `digitally_shown_by[0].id` | URI of DigitalObject for image (hop-2) |
| `represents[]` | Subject depicted |
| `referred_to_by[]` | Notes about the visual work |

### 3d. DigitalObject (hop-2 of image chain — ★★)

| Field | Meaning |
|-------|---------|
| `access_point[0].id` | Final IIIF image URL (e.g., `https://iiif.micr.io/PJEZO/full/max/0/default.jpg`) |

## 4. Query Semantics

- **Lexical vs semantic**: Fully lexical partial-string matching on named fields. No `q=` free-text parameter exists.
- **Available search params**: `title=`, `creator=`, `description=`, `type=`, `material=`, `imageAvailable=true/false`, `objectNumber=`, `aboutActor=`, `creationDate=`, `technique=`, `memberOfSetId=`. Wildcard `*` and `?` supported for `objectNumber` and `creationDate`.
- **Multi-keyword**: Each param accepts a single partial-match string. No boolean operators within a parameter. Multiple parameters are AND'd.
- **Author-name pollution control**: The separation of `title=` and `creator=` parameters provides structural field isolation. The adapter fans queries across both in parallel, which is correct for discovery but means `creator=` stream is also queried. For topic-only queries, only `title=` is needed. No way to do boolean OR across fields in a single call — the adapter's parallel stream strategy is the right approach.
- **NL tolerance**: Partial string match; NL sentences work as prefix/substring matches. Long sentences will over-constrain and return few results.
- **Cross-lingual**: Both Dutch and English terms accepted (documented). The API is Dutch-first; English labels available through `identified_by.language=AAT300388277`.

## 5. OA / Free-Access

| Property | Value |
|----------|-------|
| Whole-corpus OA? | Mixed — public domain artworks freely licensed; some restricted |
| OA flag field | No explicit `isOA` field. License inferred from policy: majority of digitized collection is CC0 or CC BY 4.0. |
| Best-OA URL | `subject_of[].digitally_carried_by[].access_point[].id` (HTML page URL) |
| OA-only filter param | None |
| Sort-by-OA | No |
| Flag coverage % | ~70-80% estimated (Golden Age collection largely public domain; modern acquisitions may be restricted) |
| Recommended strategy | `imageAvailable=true` (current) gates to objects with digital images; these are overwhelmingly CC0/CC BY 4.0. Adapter hardcodes `isOA: true` — this is a reasonable approximation for `imageAvailable=true` objects. |

Per the Rijksmuseum data policy (2026-06): broad usage allowed for public domain/CC0 objects; CC BY 4.0 objects require attribution; some restricted items identified per record.

## 6. Images / Thumbnails / IIIF

| Property | Value |
|----------|-------|
| Has images? | Yes — IIIF-compatible image service (iiif.micr.io) |
| Thumbnail field | None direct — requires 3-hop resolve chain: HumanMadeObject → VisualItem → DigitalObject → image URL |
| Full-res field | Same 3-hop chain; final URL is `iiif.micr.io/{id}/full/max/0/default.jpg` |
| IIIF manifest field | No IIIF manifest (Presentation API). The image URL is an IIIF Image API endpoint |
| IIIF version | IIIF Image API (iiif.micr.io provider) |
| Multi-image? | `VisualItem.digitally_shown_by[]` may have multiple DigitalObjects; current adapter uses `[0]` only |
| Image licensing | CC0 / CC BY 4.0 per data policy |
| Display strategy | 3-hop concurrent resolve; all hops run in same `Promise.all`. Total image chain latency: hop-1 (~720ms) + hop-2 (~780ms) sequential after object resolve (~1.0s). Total wall time for image: ~2.5s in production. Fail-soft: returns `""` on any failure. |

Confirmed example (Night Watch, SK-C-5):
- Object `200107928` → VisualItem `202107928` → DigitalObject `500711199912110510799100` → `https://iiif.micr.io/PJEZO/full/max/0/default.jpg`

## 7. Discipline / Subject Tags

| Property | Value |
|----------|-------|
| Vocabulary | Getty AAT URIs in `classified_as[]`; labels via `_label` or `identified_by[0].content` on each Type node |
| Field path | `classified_as[]{id, _label, identified_by[0].content}` on HumanMadeObject |
| Granularity | Low in practice — top-level `classified_as[0]` is object type category (e.g., "painting"); sub-classification via nested type URIs; human-readable labels not always populated |
| Example values | `{id:"https://id.rijksmuseum.nl/2208", classified_as:[{id:"aat/300435443", _label:"Type of Work"}]}` |
| Hierarchy depth | 2+ levels via AAT hierarchy (not inline) |
| Facet/filter param | `type=`, `material=`, `technique=` search params |
| Usability for faceting | **Low** — Getty AAT URIs present but human-readable labels often absent at top level; `_label` coverage incomplete. Current adapter extracts `_label || identified_by[0].content` but many objects return empty. |

`referred_to_by[]` entries provide free-text descriptions in multiple languages (Dutch, English) classified by AAT type (e.g., `aat/300435452` = scope-and-content note, `aat/300435429` = material description). These are currently unmapped.

## 8. Native Relevance & Scoring

| Property | Value |
|----------|-------|
| Score returned? | **No** — OrderedCollectionPage does not include a relevance score |
| Score field | None |
| Semantics | Partial-string match ordering (unspecified) |
| Range | N/A |
| Cross-query comparable? | No |
| Default sort | Unspecified (likely recency or object number) |
| Sort params | None documented |

## 9. Pagination

| Property | Value |
|----------|-------|
| Mechanism | Opaque `pageToken` in `next.id` URL param |
| Param names | `pageToken` |
| Max page size | **Fixed at 100** by API (not configurable) |
| Stated depth cap | None |
| Empirical depth | totalItems up to 560 observed for "rembrandt" title query; 700k+ total corpus |
| Cursor expiry | Not documented; tokens appear stable |

The `title=` stream drives pagination; `creator=` stream contributes page-1 only (no token forwarding — see adapter comments).

### 9b. Measured Latency (live probe, warm)

| Operation | Median latency |
|-----------|---------------|
| Search (title= query) | **754–1097 ms** |
| Object resolve (HumanMadeObject) | **713–1127 ms** |
| Image hop-1 (VisualItem) | **722–771 ms** |
| Image hop-2 (DigitalObject) | **709–780 ms** |

**Total per-page wall time** = search + concurrent(object_resolves) + concurrent(hop-1s) + concurrent(hop-2s). With pageSize=10, all object resolves run in parallel so object resolve adds ~1s; image hops add ~1.5s (2 sequential waves of concurrent calls). **Estimated full-page latency: 3.5–5s**. This is the highest latency of all five adapters.

## 10. Rate Limits & Auth

| Property | Value |
|----------|-------|
| Key required? | No (keyless) |
| Auth type | None |
| Acquisition speed | N/A |
| Backend-safe? | Yes (`serverSafe: true`) |
| Rate limits | None documented |
| Burst | Unknown |
| Quota | None published |
| Rate-limit code | Unknown |

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|---------------|
| `identified_by[type=Name]` | Multiple language variants; may lack English label | Dutch-only names | Prefer `language ≈ aat/300388277`; fall back to first Name entry |
| `produced_by.carried_out_by` | Some objects use flat form; others nest under `part[]` | Nested: `part[0].carried_out_by[0]` | Try both paths (current adapter handles) |
| `produced_by.timespan` | May be absent; `identified_by` may lack language tags | Missing timespan | Check `produced_by?.timespan`; fall back to `begin_of_the_begin` |
| `shows[0].id` | Uses `id.rijksmuseum.nl/...` which 303-redirects | Redirect adds RTT | Rewrite `id.rijksmuseum.nl/{N}` → `data.rijksmuseum.nl/{N}` (current adapter does this for object, not for VisualItem hop-1) |
| `classified_as[]._label` | Not reliably present; may be `null` or absent | `{id:"...", type:"Type"}` (no `_label`) | `c._label \|\| c.identified_by?.[0]?.content \|\| null` |
| `referred_to_by[].content` | In Dutch only for some objects (no English equivalent) | Dutch description text | Extract language, prefer `aat/300388277` if present |
| `equivalent[].id` | `hdl.handle.net` persistent URL | `http://hdl.handle.net/10934/RM0001...` | Could be used as a stable DOI-like ID |
| Language-tagged objects | `notation[{@language, @value}]` for actor names | `{"@language":"en","@value":"Rembrandt"}` | Extract `en` language, fall back to `[0]` |
| `dimension[]` | Complex nested structure with multiple measurement types | `{classified_as:[...], value:379.5, unit:{...}}` | Don't parse inline; skip |

## 12. Exploitation Notes

### Under-exploited fields

| Field path | Why valuable |
|-----------|-------------|
| `referred_to_by[]` (classified as `aat/300435452` = scope & content) | Free-text descriptive notes (Dutch + English) about the artwork's subject matter. Currently unmapped but IS an abstract-equivalent. For Night Watch: 2 content notes in Dutch and English. |
| `referred_to_by[]` (classified as `aat/300435429` = material) | Material/medium text (e.g., "oil on canvas"). More reliable than Getty AAT URI alone. |
| `equivalent[].id` (hdl.handle.net) | Persistent handle identifier; use as stable `doi`-equivalent for record deduplication across systems. |
| `member_of[].id` | Collection URIs. Could resolve collection names for richer faceting (e.g., "Prints and Drawings"). |
| `VisualItem.represents[]` | Subject depicted in the visual work (linked entity). Potential for entity-level subject faceting. |
| `produced_by.took_place_at` | Place of production for geographic faceting. |
| `made_of[].id` | Getty AAT material IDs; resolve to labels for material-type filter. |

### Query-strategy upgrade

1. **Add `description=` stream** — the `description=` search param is available and covers text in `referred_to_by` content. Probe confirmed 5 results for `description=night+watch`. Could improve recall for topically described works.
2. **Extract `referred_to_by[aat/300435452]` as abstract** — scope-and-content notes are the closest analog to an abstract in Linked Art. Extracting English-language notes would give genuine descriptive text (currently `abstract: ""`).
3. **Hop-1 redirect optimization** — VisualItem IDs use `id.rijksmuseum.nl/{N}` which 303-redirects to `data.rijksmuseum.nl/{N}`. Rewrite these directly (as the adapter already does for object resolves) to save RTT per image.
4. **Cache `pageToken`** — the token is stable and could be cached per query to support instant load-more.

### Batch/harvest opportunity

None practical via Linked-Art search API (100-item pages, token-based). Full harvest requires separate dump endpoint (not available via this API).

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score *(1.5×)* | **0** | No score in OrderedCollectionPage. Partial-string match ordering is opaque. |
| A2 Query expressiveness | **1** | Multiple field params (`title=`, `creator=`, `description=`, `type=`, `material=`, `imageAvailable=`). No boolean operators; no phrase search within a param; AND-only between params. Limited expressiveness. |
| A3 Sort & filter control | **1** | `imageAvailable=true` filter; `type=`, `material=`, `technique=` filters. No sort control, no facet counts. |
| A4 Pagination depth / cursor | **2** | Opaque token pagination; fixed 100-item pages; token-based nav. Cursor never expires (empirically). Good depth. |
| A5 Batch / bulk endpoint | **1** | Token-paginated 100-item pages; no bulk dump via this API. |
| A6 Throughput & rate limits | **2** | No documented cap; keyless; CDN not confirmed. Empirically accessible. |
| A7 ID linkage / crosswalk | **1** | Object number (IA-style), `equivalent[hdl.handle.net]` persistent handle. No DOI/Wikidata at search level (Wikidata not present in resolved objects in probe). |
| A8 Result-count accuracy | **2** | `partOf.totalItems` is the title-stream total; accurate for the queried stream. Creator-stream total not summed. |
| A9 Semantic / NL query *(1.5×)* | **1** | Partial-string lexical matching on named fields. NL sentences work as substring but are over-constrained. No `q=` free-text mode. |
| A10 Author-name pollution control | **2** | `title=` and `creator=` are separate params. Topic queries using `title=` only avoid creator-field pollution structurally. Current adapter fans both but this is explicit and documented. |

```
Raw_A = (0×1.5 + 1 + 1 + 2 + 1 + 2 + 1 + 2 + 1×1.5 + 2) / 11
      = (0 + 1 + 1 + 2 + 1 + 2 + 1 + 2 + 1.5 + 2) / 11
      = 13.5 / 11
      = 1.23
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | **1** | Title + artist + date present. No journal/publisher/DOI — artworks, not publications. Per Linked Art fairness caveat: score what's returned. |
| B2 Abstract / full-text *(1.5×)* | **1** | `referred_to_by[aat/300435452]` provides scope-and-content notes (Dutch + English) — genuine descriptive text exists but is **currently unmapped** (`abstract: ""`). Partial credit: richness exists, exploitation is zero. |
| B3 Citation graph | **0** | No citation data. |
| B4 Discipline / subject tags | **1** | `classified_as[]` with Getty AAT URIs; `type=`, `material=`, `technique=` filters. Labels unreliably present. Getty AAT is a controlled vocab but inline labels are sparse. |
| B5 OA / free-access *(1.5×)* | **2** | Mixed: majority CC0/CC BY 4.0 for digitized objects; `imageAvailable=true` gates to freely usable images. No per-record OA flag; policy-level guarantee rather than field-level. |
| B6 Rich media / IIIF / thumbnails | **3** | IIIF Image API endpoint (iiif.micr.io) accessible via 3-hop chain; full-res and thumbnail sizes (`/full/max/` vs `/full/!300,300/`); multi-image via `digitally_shown_by[]`; viewer-embeddable via IIIF Image API. Per Linked Art fairness caveat: high B6 appropriate. |
| B7 Holdings / availability | **2** | `member_of[]` collection URIs; `produced_by.took_place_at` location; `isOnView`-equivalent implicit from `imageAvailable`. Structured but requires resolve for human-readable labels. |
| B8 Record-quality signals | **1** | `metadataDate` available via `referred_to_by[aat/300435430]`? No. `equivalent[hdl.handle.net]` provides stable ID. Limited quality signals. |

```
Raw_B = (1 + 1×1.5 + 0 + 1 + 2×1.5 + 3 + 2 + 1) / 9
      = (1 + 1.5 + 0 + 1 + 3 + 3 + 2 + 1) / 9
      = 12.5 / 9
      = 1.39
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | **1** | Search ~850ms; object resolve ~1s; image chain adds 1.5s. Total page latency ~3.5–5s is the worst of all five adapters. No formal SLA documented. |
| C2 Auth friction | **3** | Fully keyless. |
| C3 Redistribution / TOS risk | **2** | Most digital objects CC0 or CC BY 4.0; CC BY requires attribution. Attribution "kindly asked" even when not legally required. LOW–NONE TOS risk. |
| C4 Protocol / client maturity | **1** | Linked Art 1.0 spec documented; no OpenAPI; no versioned changelog; redirects (303) add complexity. Incomplete documentation for rate limits. |
| C5 Data hygiene & parseability | **1** | Language-tagged objects throughout (Linked Art JSON-LD `@language`); Getty AAT URIs require resolution for labels; Dutch/English inconsistency; nested `part[]` vs flat `carried_out_by` schema variation; `classified_as._label` unreliably present. Multiple known quirks. |

```
Raw_C = (1 + 3 + 2 + 1 + 1) / 5
      = 8 / 5
      = 1.60
```

### Rollup

```
Overall = Raw_A × 0.45 + Raw_B × 0.40 + Raw_C × 0.15
        = 1.23 × 0.45 + 1.39 × 0.40 + 1.60 × 0.15
        = 0.554 + 0.556 + 0.240
        = 1.35
```

**TIER C — Peripheral**

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | **LOW** — CC0 / CC BY 4.0 policy; attribution requested for CC BY objects. |
| Currently quarantined? | No |
| Recommended action | Keep active but set expectations: unique source for Dutch art collection (700k objects). The 3-hop image chain (3.5–5s total) is the primary UX cost. Map `referred_to_by[aat/300435452]` as `abstract` to dramatically improve B2. Fix hop-1 VisualItem redirect rewrite. |
| Blocking issues | No free-text `q=` parameter — only field-specific partial-match. No relevance score. 3-hop image chain adds ~1.5s to every page load. High operational complexity for modest bibliographic richness. |
