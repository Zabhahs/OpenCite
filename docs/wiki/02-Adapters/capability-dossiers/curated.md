---
tags: [adapter, capability, dossier]
adapter_id: CURATED
dossier_date: 2026-06-09
pre_audit_tier: A
---

# CURATED — Capability Dossier

## §1 Identity

| Field | Value |
|-------|-------|
| Adapter ID | `CURATED` |
| Adapter file | `src/adapters/core/curatedJournals.js` (shares `src/adapters/_shared/parseOpenAlex.js`) |
| Official API name | OpenAlex API (ISSN-filtered subset) |
| Provider | OurResearch (via OpenAlex); ISSN list user-configured |
| Base URL | `https://api.openalex.org/works` |
| Protocol | REST-JSON (same as OPENALEX) |
| Docs URL(s) | https://developers.openalex.org/ (same as OPENALEX) |
| TOS/license URL | CC0 — same as OPENALEX |
| Pre-audit tier | A |
| Dossier date | 2026-06-09 |

---

## §2 Metadata Standard & Serialization

Identical to OpenAlex. See [[openalex]] §2.

---

## §3 Complete Field / Tag Inventory

**Identical to OPENALEX adapter** — uses the shared `parseOpenAlexWork()` parser and the same `OA_SELECT` field list. Fields mapped are the same; source tag is overridden to `"CURATED"`.

**Key constraint vs OPENALEX**: Results are pre-filtered to `primary_location.source.issn:<issn1>|<issn2>|...` — only works published in the user-configured curated journal ISSN set are returned. The OpenAlex field inventory is unchanged.

See [[openalex]] §3 for full field table.

---

## §4 Query Semantics

Identical to OPENALEX adapter — same filter construction using `title_and_abstract.search` or `default.search`, same `query.replace(/,/g, " ")` sanitization, same `sort=relevance_score:desc`.

Additional filter applied: `primary_location.source.issn:<issn_list>` — restricts to user-curated journals only. This is AND-combined with the text search filter in the OpenAlex filter syntax.

Author-name pollution control: same as OPENALEX — `title_and_abstract.search` structurally impossible to pollute. See [[openalex]] §4.

---

## §5 OA / Free-Access

Same as OPENALEX. Note: the CURATED adapter does **not** apply `is_oa:true` filter (unlike the core OPENALEX adapter which does). Results include both OA and non-OA works from curated journals. `isOA` is still derived from `open_access.is_oa`.

This is a deliberate design choice: user's curated journals may include subscription-only journals they have access to.

---

## §6 Images / Thumbnails / IIIF

None. Same as OPENALEX. See [[openalex]] §6.

---

## §7 Discipline / Subject Tags

Same as OPENALEX. See [[openalex]] §7.

---

## §8 Native Relevance & Scoring

Same as OPENALEX — `relevance_score` field returned via `sort=relevance_score:desc`. See [[openalex]] §8.

**Important constraint**: With a small ISSN set (e.g., 5–10 journals), result counts are very small and relevance scores may be less meaningful as ranking signals (small sample size).

---

## §9 Pagination

Identical to OPENALEX — page-based with cursor option. Same depth and per_page limits.

**Bug fixed in v0.38 (T10)**: Page size constants previously hardcoded to `5` causing wrong page calculation on load-more. Now uses `INITIAL_PAGE_SIZE` / `LOAD_MORE_PAGE_SIZE` constants — same as core OPENALEX adapter.

### §9b Measured Latency

Same API backend as OPENALEX — expect similar latency (~780ms median warm). Smaller ISSN filters may be marginally faster due to smaller candidate set.

---

## §10 Rate Limits & Auth

Identical to OPENALEX — shares the same `settings.openAlexKey` or `settings.crossrefEmail` for polite pool. Same 10,000 req/day free tier. See [[openalex]] §10.

---

## §11 Dirty-Data / Parsing Hazards

Identical to OPENALEX — same shared `parseOpenAlexWork()` parser. See [[openalex]] §11.

**Additional hazard specific to CURATED**:
- `settings.curatedJournals` may be empty → throws "No curated journals configured" error — expected behavior, not a data hazard.
- ISSNs in the user's curated list may contain typos or be deactivated → OpenAlex returns 0 results silently. Consider validating ISSNs against OpenAlex `/sources?filter=issn:<issn>` before adding.

---

## §12 Exploitation Notes

CURATED inherits all under-exploited OpenAlex fields (see [[openalex]] §12). Additional considerations:

- **No `is_oa:true` filter**: Unlike the core OPENALEX adapter, CURATED does not filter to OA-only. This is intentional but means `url` may point to paywalled landing pages. Consider adding an optional OA-only mode.
- **ISSN-filtered corpus size**: The adapter advertises `corpusSize: 10000` (conservative placeholder). Actual size depends on the user's ISSN list. Consider dynamically deriving corpus size from OpenAlex `/sources?filter=issn:<list>` for better coverage scoring.
- **Journal metadata enrichment**: The `source` object on `primary_location` includes `issn_l`, `publisher`, `host_organization_name`, `type` (journal/conference/repository), `is_oa`, `is_in_doaj` — none currently surfaced. Showing journal-level OA status would help users understand access.

---

## §13 Scores

CURATED is the OpenAlex API constrained to a user ISSN set. The capability ceiling is identical to OPENALEX — any improvement to the OpenAlex adapter automatically applies here. Scores reflect the constrained envelope:

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score (1.5×) | 2 | Same `relevance_score` as OPENALEX; less meaningful in small-corpus queries. |
| A2 Query expressiveness | 2 | Same as OPENALEX; additional ISSN filter applied. |
| A3 Sort & filter control | 3 | Same as OPENALEX; ISSN pre-filter further narrows result space. |
| A4 Pagination depth/cursor | 3 | Same cursor support as OPENALEX; in practice small corpora rarely need deep pagination. |
| A5 Batch/bulk | 2 | Cursor harvest possible within ISSN set; bulk dump for a specific journal subset not independently available. Reduced from OPENALEX's 3 because bulk harvest is scoped to ISSN set only. |
| A6 Throughput & rate limits | 2 | Same rate limits as OPENALEX — shared quota if both adapters active simultaneously. |
| A7 ID linkage | 3 | Same as OPENALEX — inherits all ID namespaces. |
| A8 Result-count accuracy | 2 | Same as OPENALEX. |
| A9 Semantic/NL mode (1.5×) | 1 | Same as OPENALEX — lexical BM25 only. |
| A10 Author-name pollution | 3 | Same as OPENALEX — `title_and_abstract.search` structurally impossible. |

```
Raw_A = (2×1.5 + 2 + 3 + 3 + 2 + 2 + 3 + 2 + 1×1.5 + 3) / 11
       = (3 + 2 + 3 + 3 + 2 + 2 + 3 + 2 + 1.5 + 3) / 11
       = 24.5 / 11 = 2.23
```

### Axis B — Metadata Richness

Identical to OPENALEX — same fields returned by `parseOpenAlexWork()`.

```
Raw_B = 2.06  (same as OPENALEX)
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability | 2 | Same backend as OPENALEX. |
| C2 Auth friction | 3 | Same — keyless with polite pool. |
| C3 TOS risk | 3 | CC0 — same. |
| C4 Protocol maturity | 2 | Same. |
| C5 Data hygiene | 2 | Same; additional hazard: invalid ISSNs in user list cause silent failures. |

```
Raw_C = 2.40  (same as OPENALEX)
```

### Rollup

```
Raw_A = 2.23
Raw_B = 2.06
Raw_C = 2.40

Overall = 2.23×0.45 + 2.06×0.40 + 2.40×0.15
        = 1.004 + 0.824 + 0.360
        = 2.19
```

**TIER: A (First-class)**

---

## §14 Flags

| Flag | Value |
|------|-------|
| TOS legal risk | NONE — CC0 (same as OPENALEX) |
| Currently quarantined? | No |
| Recommended action | Inherit all OPENALEX exploitation recommendations; add optional `is_oa:true` filter mode; validate ISSNs against OpenAlex sources endpoint; surface journal-level `is_in_doaj` + `is_oa` metadata. |
| Blocking issues | Requires user-configured ISSN list (zero results otherwise); no independent corpus outside OpenAlex; small corpora may make relevance_score less meaningful. |
| Relationship to OPENALEX | This adapter is strictly OPENALEX constrained — any OPENALEX API outage = CURATED outage. Shared quota. |
