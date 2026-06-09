---
tags: [adapter, capability, dossier]
adapter_id: OPENEDITION
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/capability-dossiers/OPENEDITION.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# OPENEDITION — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| **Adapter ID** | `OPENEDITION` |
| **Adapter files** | `src/adapters/extensions/openEdition.js` (shim) · `api/search/openedition.js` (edge route — real field mapping here) |
| **Official API name** | OpenEdition Search API (`search-api.openedition.org`) |
| **Provider** | OpenEdition (CNRS / Aix-Marseille Université, France) |
| **Base URL** | `https://search-api.openedition.org/documents` |
| **Protocol** | REST-JSON, POST method (JSON body) |
| **Docs URL** | No public documentation found. API reverse-engineered from SPA bundle. OAI-PMH documented at `https://oai-openedition.readthedocs.io/` |
| **TOS/License URL** | `https://oep.hypotheses.org/2967` (licensing announcement 2022) |
| **Pre-audit tier** | B (estimated) |
| **Dossier date** | 2026-06-09 |

**Live probe**: Fully accessible. JSON POST to `https://search-api.openedition.org/documents` with `{q, pagination: {currentPage, documentsPerPage}}`. Note: requires `Referer: https://search.openedition.org/` header — requests without Referer may be blocked.

**Architecture note**: Client-side adapter (`openEdition.js`) calls the RELATIVE URL `/api/search/openedition` (a Vercel Edge Function). The Edge Function proxies the upstream POST and normalizes the response. This means the adapter is **NOT `serverSafe`** in the OpenCITE fan-out — it is browser-only, adding one extra hop.

---

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| **Standard** | Custom JSON (internal OpenEdition schema); OAI-PMH available in oai_dc, oai_openaire, MODS, METS formats |
| **Serialization** | JSON (search API); XML (OAI-PMH) |
| **Schema URL** | None published for search API; OAI-PMH at `https://oai-openedition.readthedocs.io/` |
| **Schema version** | Undocumented; inferred from SPA bundle |

---

## 3. Complete Field/Tag Inventory

Response: `{ QTime, params, pagination: {...}, documents: [...] }`.

### Pagination object fields

| Field | Type | Meaning |
|-------|------|---------|
| `currentPage` | int | Current page |
| `pageCount` | int | Total pages |
| `documentsPerPage` | int | Page size |
| `documentCount` | int | Items on this page |
| `totalDocumentCount` | int | Total matching documents |

### Document fields

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|----------------|---------|-----------------|
| `type` | string | yes | Content type: `article`, `livre`, `chapitre`, `post`, `appel a contribution`, `numerorevue`, `colloque` | `type` |
| `url` | string | yes | Canonical URL to document | `url` |
| `naked_titre` | string | yes | Title (may contain HTML; `naked_` = stripped) | `title` (stripHtml applied) |
| `title` | string | yes | Title (may differ from `naked_titre`) | `title` fallback |
| `subtitle` | string/null | no | Subtitle | NOT mapped ★ |
| `anneedatepubli` | string | yes | Publication year (e.g. `"2015"`, `"2026"`) | `year` |
| `datemisenligne` | string | yes | Date made online (ISO datetime) | NOT mapped |
| `site_title` | string | yes | Platform/journal/site title (e.g. `"IRD Éditions"`, `"Les moissons d'hypothèses"`) | `journal` (primary) |
| `first_author` | string | yes | First author name (string) | Part of `authors` array |
| `authors` | string[] | yes | Author names array | `authors` |
| `access` | boolean | yes | Access flag (`true` = accessible) | OA detection |
| `via` | string | yes | Access mode: `"openaccess"`, `"freemium"`, `"restricted"` | OA detection |
| `access_type` | string | yes | Same as `via` but explicit string | `isOA` (regex match on openaccess/libre/gratuit/freemium) |
| `platformID` | string | yes | Platform code: `OJ`=Journals, `OB`=Books, `HO`=Hypotheses, `CO`=Calenda | NOT mapped ★ |
| `overview` | string/null | medium | Abstract / excerpt (HTML, stripped in route) | `abstract` |
| `ep_isbnprint` | string | no | Print ISBN | NOT mapped ★ |
| `ep_isbnelec` | string | no | Electronic ISBN | NOT mapped ★ |
| `date` | string | yes | Display date (formatted) | NOT mapped |
| `collection_title` | string | no | Collection title (books) | `journal` fallback |

**Fields NOT present** (confirmed absent from all probes): `doi`, `subject`/`motcle`, `lang`/`langue`, `uri`, `id` (numeric, used only for URL construction).

---

## 4. Query Semantics

- **Lexical vs semantic**: Lexical (underlying Solr/Elasticsearch backend inferred from response patterns). No semantic/vector mode.
- **NL tolerance**: Minimal. Tested `"What is the impact of feudalism on medieval French society"` → 0 results. Long NL sentences fail; short keyword phrases work. The engine does NOT parse natural language.
- **Multi-keyword default**: OR (multi-token queries return union of results; tested `medieval` returns 142K results, sentence returns 0 — consistent with OR tokenization breaking on function words).
- **Phrase syntax**: Not tested; likely standard Solr quoted phrase in `q` field.
- **Boolean operators**: Not documented; no evidence from SPA reverse-engineering that filters beyond `q` + pagination are supported in the public API.
- **Filters**: The `filters` key in POST body was tested (`{q, pagination, filters: {type: "article"}}`) — filter was accepted (200 OK) but totalDocumentCount was identical to unfiltered query, indicating filters are silently ignored or not supported.
- **Fielded query**: None exposed.
- **Author-name pollution control**:
  - Default: searches all indexed text including author names → pollution present.
  - Tested `darwin` → returns results titled "Darwin encore" (author-named blog post) and "Charles Darwin" (topic article) — mixed.
  - No scope param available.
  - Mitigation: accept inherent pollution; corpus is primarily SSH/humanities where author-name overlap is lower.
- **Cross-lingual support**: Content is French/European; queries in English work but retrieve French-language results with lower recall. No explicit cross-lingual mode.

---

## 5. OA / Free-Access

| Field | Value |
|-------|-------|
| **Whole-corpus OA?** | Partially — "freemium" model. OA content = `access_type:"openaccess"` or `via:"openaccess"`. Freemium = accessible to library subscribers and limited free access. Calenda (events) = always free. |
| **OA flag field** | `via` (`"openaccess"` = fully OA; `"freemium"` = subscription-required for full text) |
| **Best-OA URL field** | `url` — direct link; access level depends on `via` |
| **OA-only filter param** | `filters: {access_type: "openaccess"}` — tested but appears to be silently ignored (same totalDocumentCount). Cannot reliably filter to OA-only. |
| **Sort-by-OA** | No |
| **Flag coverage** | Partial — in `history` query probe: 4/5 results were `via:freemium`, 1/5 `via:openaccess`. True OA proportion unknown but likely ~30–40% |
| **Recommended strategy** | Use `access_type` to flag OA vs freemium in display; do NOT rely on filter param; set `isOA: true` only when `via === "openaccess"` (current adapter uses `/open\|libre\|gratuit\|freemium/.test(access)` — freemium should NOT be marked as OA) |

---

## 6. Images / Thumbnails / IIIF

| Field | Value |
|-------|-------|
| **Has images?** | No — search API response has no thumbnail or image fields |
| **Thumbnail field** | None |
| **IIIF manifest** | Not in search API; individual book pages may have IIIF via OpenEdition Books viewer |
| **Display strategy** | No images from search API |

---

## 7. Discipline / Subject Tags

| Field | Value |
|-------|-------|
| **Vocabulary** | NONE in search API response — `subject` and `motcle` fields referenced in edge route code are absent from actual API responses (confirmed across multiple queries) |
| **Field path** | N/A — not returned |
| **Granularity** | N/A |
| **Usability** | NOT usable from search API. OAI-PMH returns subject terms via `oai_dc`/`mods` formats — harvest only. |

---

## 8. Native Relevance & Scoring

| Field | Value |
|-------|-------|
| **Score returned?** | No — no score field in any document (confirmed across 10+ docs in probe) |
| **Field name** | N/A |
| **Semantics** | Unknown internal ranking (Solr/Elasticsearch) |
| **Range** | N/A |
| **Cross-query comparable?** | No |
| **Default sort** | Relevance (internal) |
| **Sort params** | None exposed |

---

## 9. Pagination

| Field | Value |
|-------|-------|
| **Mechanism** | Page-based (`pagination.currentPage`, `pagination.documentsPerPage` in POST body) |
| **Param names** | `pagination.currentPage` (1-based), `pagination.documentsPerPage` |
| **Max page size** | 200+ (tested; 200 docs returned successfully) |
| **Stated depth cap** | None found |
| **Empirical depth** | Page 50 with 10/page → returns results for 142K total corpus; `pageCount: 47373` for page size 3 |
| **Cursor expiry** | N/A |
| **Total count** | `pagination.totalDocumentCount` |

### 9b. Measured Latency (live probe, 3 warm calls)

| Query type | Median (ms) | Notes |
|-----------|------------|-------|
| Keyword (`history`) | 242 ms | Cold=1,154 ms |
| Multi-keyword (`medieval society europe`) | 212 ms | Fast warm |
| NL full-sentence | 260 ms | Same as keyword — no NL processing |
| NL vs keyword delta | ~1.1× | Negligible delta (NL treated as keyword tokens) |
| Cold vs warm | ~5× | Significant cold penalty |
| Extra round-trip | +1 Vercel Edge hop | Client → Vercel Edge → OpenEdition API; adds ~50–100 ms |

**Query strategy implication**: Good warm latency (~240 ms) but the extra Edge Function hop adds overhead. Making it `serverSafe` (direct call from `/api/search`) would remove the browser→Edge→upstream chain.

---

## 10. Rate Limits & Auth

| Field | Value |
|-------|-------|
| **Key required?** | No — but `Referer: https://search.openedition.org/` header is required |
| **Key type** | None; Referer-gated |
| **Acquisition speed** | Instant (no registration) |
| **Backend-safe?** | No — `serverSafe` not set; browser-only via Edge Function shim |
| **Anon limits** | Undocumented; no rate-limit errors observed |
| **Rate-limit code** | Not observed |
| **Retry-After** | N/A |
| **Timeout** | Edge route hardcodes 8s upstream timeout |

---

## 11. Dirty-Data / Parsing Hazards

| Field | Hazard | Example | Safe handling |
|-------|--------|---------|--------------|
| `naked_titre` | Contains HTML despite `naked_` prefix | `"PRESENCE DE L'ARCHITECTURE MEDIEVALE"` — uppercase, may have entities | `stripHtml()` applied (handled); also `title` field as fallback |
| `overview` | HTML markup; may be truncated (`…`) | `" The mobilisation centred on... l…"` | `stripHtml()` (handled in edge route) |
| `anneedatepubli` | String, not int | `"2015"` | Use as-is or `parseInt`; consistent string format |
| `access` | Boolean (not string) | `true` (JSON boolean) | `.toString()` or direct boolean check — current edge code uses `String(d.access)` which is safe |
| `via` | May be `null` or absent on some record types | `null` (Calenda events) | Handle null: `(d.via || "")` |
| `authors` | Array or absent | `[]` or `["Smith, J."]` | `Array.isArray(d.authors) ? d.authors : []` (handled) |
| `datemisenligne` | ISO datetime with `T23:00:00Z` (UTC edge case) | `"2020-11-25T23:00:00Z"` | Year extracted from `anneedatepubli`, not this field |
| `ep_isbnprint` | Present only for books; often `undefined` on articles/posts | `undefined` | Guard with `if (d.ep_isbnprint)` |
| `subject`/`motcle` | Referenced in edge route code but ABSENT from actual API responses | `undefined` everywhere | Remove dead code; subjects unavailable from this API |
| `lang`/`langue` | Referenced in edge route but ABSENT from actual responses | `undefined` everywhere | Remove dead code; use `naked_titre` language heuristics if needed |

---

## 12. Exploitation Notes

| Opportunity | Field/Path | Value |
|------------|-----------|-------|
| **Platform-based filtering** | `platformID` | `OJ`=Journals, `OB`=Books, `HO`=Hypotheses blogs, `CO`=Calenda events. Filter Calenda (`CO`) for academic events corpus; prioritize `OJ`/`OB` for scholarly results. Currently not mapped. |
| **OA vs freemium display** | `via` / `access_type` | Current `isOA` heuristic marks `freemium` as OA — **incorrect**. Fix: `isOA = d.access_type === "openaccess"`. Freemium = library subscription required. |
| **ISBN for book dedup** | `ep_isbnprint`, `ep_isbnelec` | Available for books/chapters — enables ISBN-based dedup with OAPEN/OpenLibrary |
| **Subtitle display** | `subtitle` | Available for books; add to `title` display as `"Title: Subtitle"` |
| **Make serverSafe** | Architecture | Move upstream POST directly into `/api/search` fan-out instead of client → Edge → upstream chain; eliminates extra hop and enables `serverSafe: true` |
| **OAI-PMH for subjects** | `https://oai.openedition.org/` | OAI-PMH returns subject terms (keywords) via oai_dc; not available via search API; harvest for enrichment |
| **Date online** | `datemisenligne` | Recent date signal — useful for "newly published" sort that `anneedatepubli` alone misses |
| **Fix dead code** | `subject`, `motcle`, `lang`, `langue` | Edge route references these fields but they are absent from API responses — remove dead branches to clarify the parser |

---

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Note |
|-----|-------|------|
| A1 Native relevance score (×1.5) | **0** | No score returned in any document |
| A2 Query expressiveness | **1** | `q` param only; no fielded syntax, no boolean documented; `filters` param silently ignored; basic keyword search only |
| A3 Sort & filter control | **0** | No sort or functional filter params; pagination only |
| A4 Pagination depth/cursor | **2** | Page-based; empirically deep; `totalDocumentCount` and `pageCount` returned; max 200+ per page |
| A5 Batch/bulk | **1** | No batch; OAI-PMH available separately for harvest |
| A6 Throughput & rate limits | **2** | Keyless (Referer-gated); sub-250 ms warm; no observed rate limits |
| A7 ID linkage | **1** | Only URL (`url`); ISBN present for books but no DOI, no ORCID |
| A8 Result-count accuracy | **2** | `totalDocumentCount` returned; stable across pages |
| A9 Semantic/NL mode (×1.5) | **0** | NL sentence query returns 0 results; no semantic lift; lexical tokenization only |
| A10 Author-name pollution | **1** | No scope param; `darwin` returns author-named content; corpus specificity (SSH/humanities) limits practical impact |

```
Raw_A = (0×1.5 + 1 + 0 + 2 + 1 + 2 + 1 + 2 + 0×1.5 + 1) / 11
      = (0 + 1 + 0 + 2 + 1 + 2 + 1 + 2 + 0 + 1) / 11
      = 10 / 11
      = 0.91
```

### Axis B — Metadata Richness

| Dim | Score | Note |
|-----|-------|------|
| B1 Core bibliographic completeness | **2** | Title + authors + year + journal/site title + URL + type; no DOI, no volume/issue/pages, no ISSN |
| B2 Abstract / full-text (×1.5) | **2** | `overview` field present for ~70% of records (articles and books); truncated snippets for some; no full-text XML |
| B3 Citation graph | **0** | None |
| B4 Discipline / subject tags | **0** | No subject fields in search API response (confirmed absent); OAI-PMH only |
| B5 OA / free-access (×1.5) | **2** | `via`/`access_type` fields present; `openaccess` vs `freemium` distinguishable; no OA-only filter that works reliably; partial OA corpus (not all content OA) |
| B6 Rich media / IIIF | **0** | No images in search API response |
| B7 Holdings / availability | **0** | None |
| B8 Record-quality signals | **1** | `platformID` provides provenance; `datemisenligne` for online date; no confidence/dedup signal |

```
Raw_B = (2 + 2×1.5 + 0 + 0 + 2×1.5 + 0 + 0 + 1) / 9
      = (2 + 3 + 0 + 0 + 3 + 0 + 0 + 1) / 9
      = 9 / 9
      = 1.00
```

### Axis C — Operational / Access

| Dim | Score | Note |
|-----|-------|------|
| C1 Reliability & responsiveness | **2** | ~240 ms warm; Edge function has 8s timeout; university infrastructure; generally stable |
| C2 Auth friction | **2** | Keyless in practice; Referer header required (minor friction, handled in edge route) |
| C3 Redistribution / TOS risk | **2** | Metadata CC0 (announced Nov 2022); full content CC-BY-NC-ND default for books/blogs; Journals CC BY-SA; display + aggregation of metadata permitted (CC0); full-text links only → LOW risk |
| C4 Protocol / client maturity | **1** | Undocumented; reverse-engineered from SPA; no versioning; fragile (Referer required; may change without notice) |
| C5 Data hygiene | **1** | `subject`/`lang` fields referenced in edge code but absent; `freemium` incorrectly marked as OA; truncated `overview` not flagged; inconsistent field presence |

```
Raw_C = (2 + 2 + 2 + 1 + 1) / 5 = 8 / 5 = 1.60
```

### Rollup

```
Overall = 0.91 × 0.45 + 1.00 × 0.40 + 1.60 × 0.15
        = 0.410 + 0.400 + 0.240
        = 1.05
```

**TIER: C** (1.0–1.4 band — barely above D threshold)

> **Note**: The A9=0 (NL sentences return 0 results) and A3=0 (no functional filter) are the primary score depressors. The corpus uniqueness (French/European SSH) justifies keeping it despite the low tier, but the undocumented API is a fragility risk.

---

## 14. Flags

| Field | Value |
|-------|-------|
| **TOS legal risk** | LOW — metadata CC0; full-text links only (not hosted); OpenCITE displays metadata and links, does not redistribute full text |
| **Currently quarantined?** | No — but `serverSafe` is NOT set; client-only via Edge Function |
| **Recommended action** | (1) Fix `isOA` logic: `freemium` ≠ OA; (2) Map `platformID` to filter Calenda events from scholarly results; (3) Remove dead `subject`/`lang` code in edge route; (4) Consider making `serverSafe` by moving POST upstream into `/api/search` fan-out; (5) Map `subtitle`, `ep_isbnprint` for book dedup with OAPEN |
| **Blocking issues** | API is undocumented and reverse-engineered — contract may change without notice; `Referer` requirement is fragile; NL sentence queries return 0 results (A9=0) |
