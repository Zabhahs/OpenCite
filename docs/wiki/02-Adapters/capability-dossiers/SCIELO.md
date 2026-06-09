---
tags: [adapter, capability, dossier]
adapter_id: SCIELO
---

# Capability Dossier: SciELO

**Dossier date:** 2026-06-08  
**Quarantine status:** QUARANTINED (v0.38) — `search.scielo.org/api/v2/search` = HTTP 403 (internal ES endpoint)  
**Live status of the API (capability assessment):** PARTIAL — search.scielo.org = dead for direct API use; `articlemeta.scielo.org` REST API = ALIVE (record-by-id and identifier listing only, no free-text search)

---

## 1. Identity

| Field | Value |
|---|---|
| Adapter ID | `SCIELO` |
| Adapter file (quarantined) | `src/adapters/extensions/scielo.js` (removed; preserved in `docs/wiki/99-Archive/_quarantine/adapter-scielo.md`) |
| Official API name | SciELO ArticleMeta RESTful API |
| Provider | SciELO Network (FAPESP / Bireme / PAHO / WHO / FapUnifesp consortium) |
| Base URL (old, dead) | `https://search.scielo.org/api/v2/search` — **403 Forbidden; internal ES** |
| Base URL (alive alternative) | `https://articlemeta.scielo.org/api/v1/` |
| Protocol | REST-JSON (keyless) |
| Docs URLs | https://scielo.readthedocs.io/ · https://github.com/scieloorg/articles_meta/blob/master/docs/source/index.rst · https://pypi.org/project/articlemeta/ |
| TOS/license URL | UNKNOWN — needs research; SciELO is CC-BY by default; individual journal licenses vary |
| Pre-audit tier | D (quarantined) |
| Dossier date | 2026-06-08 |

---

## 2. Metadata standard & serialization

| Field | Value |
|---|---|
| Standard | ISIS-JSON (type 3) — legacy BIREME ISIS database export format |
| Serialization | JSON (`format=json`) |
| Schema URL | https://github.com/scieloorg/xylose (xylose library abstracts the ISIS-JSON) |
| Schema version | v1 (ArticleMeta API) |

**Critical note:** The ArticleMeta API returns raw ISIS field codes (v10, v12, v40, v65, v83, v85, etc.) not human-readable field names. Requires knowledge of ISIS field map to parse correctly.

---

## 3. Complete field/tag inventory

**ArticleMeta `/api/v1/article/` response** (top-level keys + confirmed sub-fields):

| Field path | Type | Always present | Meaning | OpenCITE maps |
|---|---|---|---|---|
| `code` | string | yes | SciELO PID (e.g. S2179-975X2011000300002) | `id` |
| `collection` | string | yes | SciELO network collection code (scl=Brazil, arg=Argentina, etc.) | NOT mapped |
| `publication_year` | string | yes | Year string | `year` |
| `publication_date` | string | yes | YYYY-MM | `year` |
| `document_type` | string | yes | "article", "review", etc. | `type` |
| `article.v12` | array | yes | Bilingual titles — array of `{l:"en",_:"title text"}` objects | `title` |
| `article.v10` | array | yes | Authors — array of `{n:"firstname",s:"surname",1:"affil_id",r:"role"}` | `authors` |
| `article.v40` | object | yes | Primary language — `{_:"en"}` | `language` |
| `article.v65` | object | yes | Publication date — `{_:"20110900"}` (YYYYMMDD) | `year` |
| `article.v83` | array | yes | Abstracts — array of `{l:"en",a:"abstract text",_:""}` | `abstract` |
| `article.v85` | array | yes | Keywords — array of `{l:"en",t:"m",k:"keyword",i:"1",_:""}` | `keywords` |
| `article.v14` | object | sometimes | Page range — `{_:"229-232"}` | `pages` |
| `article.v31` | object | sometimes | Volume — `{_:"23"}` | `volume` |
| `article.v32` | object | sometimes | Issue — `{_:"3"}` | `issue` |
| `article.v35` | object | sometimes | ISSN — `{_:"2179-975X"}` | NOT mapped |
| `article.v70` | array | sometimes | Author affiliations — `{i:"A01",p:"Brazil",e:"email",1:"city",c:"org"}` | NOT mapped |
| `article.v71` | object | sometimes | Open access flag — `{_:"oa"}` when OA | `isOA` |
| `article.v237` | null/object | sometimes | DOI — often null in old records | `doi` |
| `article.v58` | object | sometimes | Funding agency | NOT mapped |
| `article.v60` | object | sometimes | Grant ID | NOT mapped |
| `article.v709` | object | sometimes | Document type code | `type` |
| `article.v72` | object | sometimes | Language variant | `language` |
| `issue.*` | object | yes | Issue-level metadata (volume, number, date) | partially |
| `citations` | array | sometimes | Cited references (ISIS-formatted) | NOT mapped |
| `fulltexts` | object | sometimes | URLs for full-text versions | NOT mapped |

**ArticleMeta `/api/v1/article/identifiers/` response:**

| Field | Meaning |
|---|---|
| `meta.total` | Total article count in collection/filter |
| `meta.limit` / `meta.offset` | Pagination |
| `objects[].code` | PID for each article |

---

## 4. Query semantics

| Aspect | Detail |
|---|---|
| Free-text search | **NOT AVAILABLE** via ArticleMeta API. The API is record-retrieval-by-ID only (`code=PID`) |
| Identifier listing | `article/identifiers/` supports filtering by: `collection`, `subject_areas`, `from_date`, `until_date`, `limit`, `offset` |
| Subject area filter | Pre-defined categories: "Health Sciences", "Biological Sciences", "Human Sciences", "Applied Social Sciences", etc. |
| Boolean operators | N/A — no query engine |
| Author-name pollution | N/A — no free-text search |
| Cross-lingual support | Records have multilingual titles/abstracts (EN+PT+ES) in the ISIS-JSON |

**Revival implication:** ArticleMeta cannot replace a search adapter. To revive SciELO with real search, options are: (a) SciELO OAI-PMH harvest + local index, (b) rely on DOAJ (already indexes many SciELO journals), or (c) wait for a public search endpoint to emerge.

---

## 5. OA / free-access

| Aspect | Detail |
|---|---|
| Whole-corpus OA | Effectively yes — SciELO is an OA platform; `article.v71={_:"oa"}` flag present |
| OA flag field | `article.v71` — value `"oa"` indicates open access |
| Best-OA URL | `fulltexts` object contains URLs to full text; `url` field in old adapter was constructed from DOI |
| OA-only filter | No filter needed — corpus is OA by policy |
| Flag coverage | ~95%+ (some embargoed items) |
| Recommended strategy | All SciELO content should be treated as OA |

---

## 6. Images / thumbnails / IIIF

| Aspect | Detail |
|---|---|
| Has images | No image fields in ArticleMeta API |
| Thumbnail | None |
| IIIF | None |
| Display strategy | Link to article URL only |

---

## 7. Discipline / subject tags

| Aspect | Detail |
|---|---|
| Vocabulary | SciELO subject area taxonomy (Health Sciences, Biological Sciences, etc.) |
| Field path | `article.v85` (keywords, language-tagged) + collection-level subject_areas filter |
| Granularity | Keywords from v85 (author-assigned, free-form) + top-level subject area classification |
| Example values | `[{l:"en",k:"Oriental weatherfish"}, {l:"en",k:"exotic species"}]` |
| Usability for faceting | LOW via API (subject areas only available as collection-level filter on identifier endpoint) |

---

## 8. Native relevance & scoring

| Aspect | Detail |
|---|---|
| Score returned | NO — no search, no score |
| Score field name | N/A |
| Default sort | Identifier listing is date-ordered |

---

## 9. Pagination

| Aspect | Detail |
|---|---|
| Mechanism | Offset (`limit`, `offset` params on identifiers endpoint) |
| Max page size | Not documented; 1000 empirically reasonable |
| Stated depth cap | None documented; `meta.total` = 556,058 confirmed (Brazil collection alone) |

**9b. Measured latency (live probe):**

| Query type | Latency |
|---|---|
| Collection identifiers list (3 items) | 6,900ms |
| Single article fetch by code | 1,356ms |
| search.scielo.org/api/v2/search | 403 Forbidden (dead) |

ArticleMeta is slow (~1–7s) but alive. search.scielo.org returns 403 for all probe attempts.

---

## 10. Rate limits & auth

| Aspect | Detail |
|---|---|
| Key required | No — ArticleMeta is keyless REST |
| Backend-safe | Yes |
| Rate limits | UNKNOWN — not documented; low-volume probes succeed |
| Rate limit code | Unknown |

---

## 11. Dirty-data / parsing hazards

| Field | Hazard | Example | Safe handling |
|---|---|---|---|
| ISIS field codes | All data in cryptic `v10`, `v12`, `v83` etc. keys | `{v12:[{l:"en",_:"title"}]}` | Requires ISIS field map; use xylose library or hand-map each field |
| Null DOI | `v237` often null or absent in older records | `v237: null` | Fallback to PID-based URL: `https://www.scielo.br/article/doi/PID` |
| Array/object polymorphism | `v40` is object `{_:"en"}` not array | `{_:"en"}` | Access `v40._` not `v40[0]` |
| `v10` = authors | Despite ISIS convention for translated title, field v10 here contains author list | `[{n:"Firstname",s:"Surname"}]` | Map `v10` as authors array with `{surname: s, given: n}` |
| `v12` = titles | Array of `{l:"en",_:"title"}` objects | Multi-lingual | Extract `v12.find(t=>t.l==="en")._` or first element |
| Date format | `v65._` = "20110900" (YYYYMMDD, month=00 for quarterly) | `"20110900"` | `slice(0,4)` for year; `slice(0,6)` for YYYY-MM |
| `v83` abstract | Array with `{l:"en",a:"abstract text",_:""}` — text in `a` not `_` | `{l:"en",a:"AIM: ...",_:""}` | Read `v83[].a` not `v83[]._` |
| `v85` keywords | Array with dummy entries (`{i:"1",_:"",d:"nd"}`) | Mixed real + dummy entries | Filter `k` items: `v85.filter(k=>k.k)` |

---

## 12. Exploitation notes

**Current situation:** No public free-text search API exists for SciELO. The `search.scielo.org/api/v2/search` endpoint is dead (internal ES, 403). ArticleMeta provides record-by-ID retrieval only.

**Revival paths:**
1. **OAI-PMH harvest:** SciELO exposes OAI-PMH at `https://www.scielo.br/oai/` and per-collection endpoints. This gives full harvest capability (A5=3) but no interactive search (A1=0, A2=0) — the Mexicana anti-pattern. Only viable if we build a local search index over the harvest.
2. **DOAJ reliance:** DOAJ already indexes most SciELO journals; Latin-American OA scholarly coverage via DOAJ avoids the need for a direct SciELO adapter.
3. **Two-step adapter:** (a) Use ArticleMeta `identifiers/` filtered by subject_area + date range to enumerate PIDs, then (b) fetch individual articles by PID. Slow (~2s per record) and not a real-time search. Not viable for interactive search.

**If reviving as a harvest/background-fill source:** SciELO covers ~700,000 articles across 14 Latin American/Iberian/South African country collections. ISIS-JSON is parseable but non-trivial.

---

## 13. Scores

**Note:** These scores reflect the TRUE current API capability (ArticleMeta), not the broken adapter. A revival based on ArticleMeta identifier listing would score:

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|---|---|---|
| A1 Native relevance score (×1.5) | 0 | No search → no score |
| A2 Query expressiveness | 0 | No free-text search; only subject_area/date filter on identifier listing |
| A3 Sort & filter control | 1 | Subject area + date range on identifiers; no sort |
| A4 Pagination depth | 2 | Offset, no cap documented; 556k total confirmed |
| A5 Batch / bulk | 2 | Identifier listing is batch-style; individual article fetch by PID works |
| A6 Throughput & rate limits | 1 | ~1–2s/record; no stated rate limit; slow but alive |
| A7 ID linkage | 1 | SciELO PID + ISSN; DOI sparse in old records |
| A8 Result-count accuracy | 2 | `meta.total` on identifiers endpoint accurate |
| A9 Semantic/NL mode (×1.5) | 0 | No search at all |
| A10 Author pollution control | 3 | No search → pollution impossible |

```
Raw_A = (0×1.5 + 0 + 1 + 2 + 2 + 1 + 1 + 2 + 0×1.5 + 3) / 11
      = (0 + 0 + 1 + 2 + 2 + 1 + 1 + 2 + 0 + 3) / 11
      = 12 / 11
      = 1.09
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|---|---|---|
| B1 Core bibliographic completeness | 2 | Title (bilingual) + structured authors + date + ISSN + volume/issue/pages; DOI sparse |
| B2 Abstract/full-text (×1.5) | 3 | Full abstracts confirmed (bilingual EN+PT/ES); >85% coverage for indexed articles |
| B3 Citation graph | 1 | `citations` array present; ISIS-formatted, inconsistent DOI coverage |
| B4 Discipline/field-tag granularity | 2 | Author keywords (multilingual) + subject area classification |
| B5 OA/free-access (×1.5) | 3 | v71="oa" flag present; whole corpus OA by policy |
| B6 Rich media / IIIF | 0 | No image fields |
| B7 Holdings / availability | 1 | fulltexts URLs; affiliation data |
| B8 Record-quality signals | 1 | validated_scielo, validated_wos flags present |

```
Raw_B = (2 + 3×1.5 + 1 + 2 + 3×1.5 + 0 + 1 + 1) / 9
      = (2 + 4.5 + 1 + 2 + 4.5 + 0 + 1 + 1) / 9
      = 16 / 9
      = 1.78
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|---|---|---|
| C1 Reliability & responsiveness | 1 | ArticleMeta is slow (~1–7s); search.scielo.org dead; no SLA |
| C2 Auth friction | 3 | Keyless |
| C3 Redistribution/TOS risk | 2 | SciELO is OA but individual journal licenses vary; CC-BY (not CC0); attribution required → LOW |
| C4 Protocol/client maturity | 1 | Documented but uses ISIS legacy format; no OpenAPI; effectively undocumented field map |
| C5 Data hygiene | 1 | ISIS field codes require a field map; `v83.a` not `v83._` for abstracts; date "20110900" format; null DOIs |

```
Raw_C = (1 + 3 + 2 + 1 + 1) / 5 = 8 / 5 = 1.60
```

### Rollup

```
Overall = 1.09 × 0.45 + 1.78 × 0.40 + 1.60 × 0.15
        = 0.491 + 0.712 + 0.240
        = 1.44
```

**TIER = C** (Peripheral; 1.0–1.4 → 1.44 is at the C/B boundary)

---

## 14. Flags

| Flag | Value |
|---|---|
| TOS legal risk | LOW — SciELO is CC-BY open access; individual journal TOS vary; attribution required |
| Currently quarantined | YES — removed in v0.38 |
| Recommended action | **KEEP QUARANTINED** — no public search API exists. `search.scielo.org/api/v2/search` is definitively dead (403). ArticleMeta offers only ID-based retrieval, not interactive search. Revival path: (a) Use DOAJ for Latin-American coverage (already integrated), or (b) implement as a background OAI-PMH harvest adapter (low priority, high complexity). Do NOT attempt to revive as a real-time search adapter. |
| Blocking issues | No public search endpoint exists. search.scielo.org = 403 dead. ArticleMeta = record-retrieval only. Any interactive search adapter for SciELO would require either: a working ES proxy (none public), OAI-PMH + local index, or a third-party SciELO aggregator. |
