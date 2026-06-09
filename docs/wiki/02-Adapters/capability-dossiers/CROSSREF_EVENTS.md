---
tags: [adapter, capability, dossier, revival-candidate]
adapter_id: CROSSREF_EVENTS
---

# CROSSREF_EVENTS — Capability Dossier

## 1. Identity

| Field | Value |
|-------|-------|
| Adapter ID | CROSSREF_EVENTS |
| Official API name | Crossref Event Data Query API v1 |
| Provider | Crossref |
| Base URL | `https://api.eventdata.crossref.org/v1/events` |
| Protocol | REST-JSON |
| Docs URL | https://www.eventdata.crossref.org/guide/ (currently ECONNREFUSED — service offline) |
| TOS URL | https://crossref.org/services/event-data (CC-BY) |
| Pre-audit tier | unranked (not yet integrated) |
| Dossier date | 2026-06-09 |

**CRITICAL STATUS:** The Crossref Event Data public API was **sunset on 23 April 2026**. The API and all related services are no longer accessible. The guide site (eventdata.crossref.org) returns ECONNREFUSED. The API endpoint returns HTTP 403 Forbidden.

Per Crossref's official announcement (community.crossref.org): *"The Event Data public API was sunset on 23 April 2026. While it provided a valuable proof of concept for collecting online uses of DOIs, there was not sufficient community interest to sustain it as a standalone service."*

A historical event dump is available on request from Crossref support.

---

## 2. Metadata Standard & Serialization

| Field | Value |
|-------|-------|
| Standard | Custom Crossref Event Data schema (Activity Streams 2.0-inspired) |
| Serialization | JSON |
| Schema URL | N/A (documentation site offline) |
| Schema version | v1 (now sunset) |

---

## 3. Complete Field/Tag Inventory

From documentation archived before shutdown and web search:

| Field path | Type | Always present? | Meaning | OpenCITE maps to |
|-----------|------|----------------|---------|-----------------|
| `id` | string (UUID) | yes | Unique event identifier | internal |
| `message-action` | string | yes | `create` or `delete` | internal |
| `source_id` | string | yes | Event source: `wikipedia`, `reddit`, `stackexchange`, `datacite`, `crossref`, `web` | `eventSource` |
| `timestamp` | string | yes | ISO datetime processed by Event Data | `timestamp` |
| `obj_id` | string | yes | Typically the DOI (URL form: `https://doi.org/...`) | `doi` |
| `subj_id` | string | yes | Typically the URL of the page that referenced the DOI | `refUrl` |
| `obj.pid` | string | sometimes | Canonical object PID (DOI) | — |
| `obj.url` | string | sometimes | Landing page URL for the object | — |
| `subj.pid` | string | sometimes | Subject PID | — |
| `subj.url` | string | sometimes | Subject URL | — |
| `relation_type_id` | string | yes | Type of relationship: `discusses`, `references`, `is-derived-from`, etc. | `relationType` |
| `occurred_at` | string | yes | ISO datetime when the event occurred (not when processed) | `occurredAt` |
| `terms` | string | yes | Terms of service URL for this event | — |
| `license` | string | yes | CC-BY URL | `license` |

> Note: Twitter events were collected until February 2023. All Twitter events have been removed from the API in accordance with their Twitter API contract. As of shutdown, the corpus contained 66.7M+ events from Wikipedia, Reddit, StackExchange, DataCite, Crossref internal, and web crawls.

---

## 4. Query Semantics

**Lookup by DOI (not free-text search).** Primary query pattern:

```
GET /v1/events?obj-id={doi}&mailto={email}&rows={n}
GET /v1/events?subj-id={url}&mailto={email}&rows={n}
```

**Parameters (documented before shutdown):**
- `obj-id`: Filter by DOI (URL form) as the object
- `subj-id`: Filter by URL as the subject
- `source`: Filter by source ID (e.g. `wikipedia`)
- `relation-type`: Filter by relation type
- `from-occurred-date`: Date filter (ISO format)
- `until-occurred-date`: Date filter
- `from-collected-date`: Filter by collection date
- `rows`: Number of results (max 1000, previously was 10000)
- `cursor`: Pagination cursor
- `mailto`: Email for polite pool
- `facet`: Summary counts (e.g. `facet=subj-id.domain:10`)

**Additional endpoints (now all offline):**
- `/v1/events/edited` — events that were edited
- `/v1/events/deleted` — events that were deleted

---

## 5. OA / Free-Access

Not applicable. Event Data tracks web mentions/citations of DOIs, not OA status.

---

## 6. Images / Thumbnails / IIIF

Not applicable.

---

## 7. Discipline / Subject Tags

Not applicable.

---

## 8. Native Relevance & Scoring

Not applicable — event lookup by DOI, no relevance ranking. Events are ordered by timestamp.

---

## 9. Pagination

Cursor-based: `cursor` parameter in query string. `rows` max was 1000 (reduced from 10000). The API returned a `message.next-cursor` field for subsequent pages.

**9b. Measured Latency (live probe, 2026-06-09):**

| Query type | Result |
|-----------|--------|
| Any endpoint | HTTP 403 Forbidden (API sunset 2026-04-23) |

**Cannot probe — API is offline.**

---

## 10. Rate Limits & Auth

**Moot — API is sunset.** Historical values:
- No API key required; `mailto` parameter used for polite pool
- Rate limit documentation was at the guide site (now offline)
- Community reports suggest generous limits (hundreds of requests/minute)

---

## 11. Dirty-Data / Parsing Hazards

Moot — API offline. Historical hazards noted for documentation completeness:
- `obj_id` is a URL (`https://doi.org/...`), not a bare DOI — requires stripping prefix
- `occurred_at` and `timestamp` are separate fields; prefer `occurred_at` for when the event happened
- Twitter events were retroactively deleted — event counts dropped significantly in 2023
- Some events have sparse `subj`/`obj` metadata depending on source

---

## 12. Exploitation Notes

**Integration Opportunity: NONE (service is defunct)**

The Crossref Event Data API was sunset on 23 April 2026. **Do not integrate.** The API returns HTTP 403 and the guide site is unreachable.

**What it was:** Altmetric-style tracking of DOI mentions across Wikipedia, Reddit, StackExchange, and web crawls. Would have provided social attention signals for ranking.

**What supersedes it:**
- OpenAlex has citation/influence metrics (citationCount, influence score)
- Altmetric (commercial) remains available for social attention scores
- Semantic Scholar API provides social attention signals
- The historical event dump is available from Crossref on request (contact support@crossref.org) — useful for offline analysis only, not live enrichment

---

## 13. Scores

### Axis A — Pass-Through Capabilities

| Dim | Score | Notes |
|-----|-------|-------|
| A1 Native relevance score | 0 | Timestamp order only; no relevance score |
| A2 Query expressiveness | 1 | Filter by DOI, source, date range, relation-type; no full-text search |
| A3 Sort & filter control | 1 | Date filter + source filter; no rich faceting |
| A4 Pagination depth / cursor | 2 | Cursor-based paging; no stated depth cap |
| A5 Batch / bulk endpoint | 1 | No batch HTTP; historical dump available on request |
| A6 Throughput & rate limits | 0 | API is offline (HTTP 403) |
| A7 ID linkage / crosswalk | 1 | DOI as `obj_id` (URL form); source URL as `subj_id` |
| A8 Result-count accuracy | 1 | `total_results` count returned but reliability was documented as unstable |
| A9 Semantic / NL query mode | 0 | No free-text search |
| A10 Author-name pollution control | 0 | N/A — not a search API |

```
Raw_A = (0×1.5 + 1 + 1 + 2 + 1 + 0 + 1 + 1 + 0×1.5 + 0) / 11 = 7/11 = 0.64
```

### Axis B — Metadata Richness

| Dim | Score | Notes |
|-----|-------|-------|
| B1 Core bibliographic completeness | 0 | No bibliographic metadata — events only |
| B2 Abstract / full-text access | 0 | No abstract |
| B3 Citation graph | 0 | Not citation graph — social attention/altmetrics events |
| B4 Discipline / field-tag granularity | 0 | No subject tags |
| B5 OA / free-access guarantee | 0 | No OA signal |
| B6 Rich media / IIIF | 0 | No images |
| B7 Holdings / availability | 0 | No holdings |
| B8 Record-quality signals | 0 | No quality signals for underlying papers |

```
Raw_B = 0/9 = 0.00
```

### Axis C — Operational / Access

| Dim | Score | Notes |
|-----|-------|-------|
| C1 Reliability & responsiveness | 0 | API is defunct (HTTP 403); service sunset 2026-04-23 |
| C2 Auth friction | 2 | Was keyless + email; backend-safe (historical) |
| C3 Redistribution / TOS risk | 3 | Historical data CC-BY; no risk (data is gone) |
| C4 Protocol / client maturity | 0 | Documentation site offline; no longer maintained |
| C5 Data hygiene & parseability | 0 | Cannot assess — service is offline |

```
Raw_C = (0 + 2 + 3 + 0 + 0) / 5 = 5/5 = 1.00
```

### Rollup

```
Raw_A = 0.64
Raw_B = 0.00
Raw_C = 1.00

Overall = 0.64 × 0.45 + 0.00 × 0.40 + 1.00 × 0.15
        = 0.29 + 0.00 + 0.15
        = 0.44
```

**TIER = D** (0.44 < 1.0)

---

## 14. Flags

| Flag | Value |
|------|-------|
| TOS legal risk | NONE (service is defunct) |
| Currently quarantined? | N/A (never integrated; API is shutdown) |
| Recommended action | **DO NOT INTEGRATE — API SUNSET 2026-04-23.** Mark as permanently unavailable. Remove from any integration roadmaps. |
| Blocking issues | API returns HTTP 403. Guide site ECONNREFUSED. Service officially discontinued by Crossref. |
