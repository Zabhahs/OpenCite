---
machine_ids: [api.shared.searchLog, api.shared.handlers.telemetry, lib.telemetry, hook.useSearchTelemetry, components.admin.SearchData, adapters.shared.ordinals]
findings: []
runtime: both
status: healthy
tags: [data, telemetry, ranking, relevance, capture, v0.50]
---

# Search Data Capture (v0.50)

**Purpose** — every search on every surface (web, API, MCP) and every interaction with a result is
recorded for ranking research: a proprietary reranker, an agent-query corpus, research-demand
intelligence, query→verified-citation pairs. Decision of record (sprint v0.50 §8): capture
maximally, ON by default for everyone, indefinite retention. Plan + rationale:
[[10-Sprints/sprint_log_v0_50]].

## Storage model — references, never cards

| Table | One row per | Key fields |
|---|---|---|
| `works` | distinct paper, ever | `oc_id` (= `publicResult.anonymizeId`), doi, source of first sighting, title, authors, year, venue, **abstract**, keywords, url, is_oa, cited_by, `seen_n` |
| `search_events` | executed search | raw `query`, `surface` (0 web · 1 api · 2 mcp · 3 admin), `user_id` / `key_id` / `plan`, `actor` (daily-rotating hash), `ip_hash`, `ua`, `client`, `tool`, `settings` JSONB, `eligible[]` / `failed[]`, coverage, counts, latency, `cache_hit`, `page`, `dwell_ms`, **`top INTEGER[]`** (works.id in displayed order) + parallel **`top_src`** (adapter ordinal) + **`scores`** (×1000) |
| `search_signals` | user / agent action on a result | `event_id` (nullable), `work_id`, `rank` (displayed position, −1 unmatched), `action`, `meta` |

`works` only ever gets richer on conflict (longer abstract wins, nulls fill, cited_by max, is_oa OR).
Both wide tables use `toast_compression = lz4`. Sizing: ~350 B/event, ~1.2 KB per new work, ~60 B/signal.

Signal codes (`searchLog.SIGNAL`, mirrored in `lib/telemetry.js`): web 0 click-title · 1 open-link ·
2 copy-cite · 3 save-library · 4 expand-cite · 5 dwell; machine 10 get-work · 11 verify-ref ·
12 citations-graph · 13 resolve-ids.

Adapter ordinals: `src/adapters/_shared/ordinals.js` — append-only, quarantined ids keep their slot,
`UNSEEN = 255` marks a stub work an agent referenced that no search ever returned.

## Write paths

- **`api/_shared/searchLog.js`** — the ONE writer. `logSearch` (works upsert + event row),
  `logSignal`, `setDwell`, `logMachineSignal`, `deidentifyUser`. Fail-open like `kv.js`; callers
  wrap it in `withBudget` (600 ms) so logging can never add more than that to a response.
- **`/api/search`** — logs on BOTH the cache-hit return (cards resolve to the same works rows) and
  the live path, every format. Surface derives from `X-OpenCITE-Client` (MCP) / admin debug.
- **Browser** — `hooks/useSearchTelemetry` fires when `resultsReady` flips (the order on screen,
  rebuilt with the `lib/semanticSearch.js` SSOT), again on load-more (`page: n`); `lib/telemetry.js`
  posts to `/api/telemetry` (`handlers/telemetry.js`, mounted on `api/user/[resource].js` — no new
  function). `ResultCard` emits signals directly; outbound clicks start the result-dwell clock
  (settles on `visibilitychange`/`focus`); page dwell flushes on next search / `pagehide` (beacon).
- **Machine signals** — `api/works/{get,verify,citations,ids}` call `logMachineSignal`: resolve the
  work (record → upsert; DOI → lookup; else UNSEEN stub), join to the caller's latest search within
  10 minutes whose `top @> ARRAY[work_id]` (GIN index), record the rank it was pulled from. The MCP
  client sends `X-OpenCITE-Client: opencite-mcp/<ver>` + `X-OpenCITE-Tool: <tool>`.

## Read paths

- Admin console tab **Search data (v0.50)** (`components/admin/SearchData.jsx`) over
  `GET /api/telemetry?view=summary|zero|sources|semantic` (session-admin gated via
  `resolveSessionAdmin`, same allowlist as `?debug=1`).
- **Promote** (`POST ?view=promote`): click signals → `relevance_labels` grade 2; skip-above → grade 0;
  never lowers an existing label. Feeds F2 Gold-Set + the v0.49 Semantic A/B unchanged.
- **Export** (`GET ?view=export[&since=ISO]`): NDJSON, one line per event with results expanded to
  their works rows + signals. The door for offline work.

## Invariants

1. Logging never throws to a caller and never blocks a response beyond `LOG_BUDGET_MS`.
2. `settings.telemetry === false` → the browser sends nothing. API/MCP capture is unconditional.
3. Per-user upstream keys (CORE/NDLI/…) are never stored — `snapshotSettings` whitelists keys.
4. History clear de-identifies (`user_id → NULL`); rows are never deleted.
5. Policy text: `public/legal/privacy.html` "Search data we keep".

## See also

[[04-Backend-API/Search-Endpoint]] · [[04-Backend-API/Shared-Modules]] · [[01-Frontend/Hooks]] ·
[[10-Sprints/sprint_log_v0_49]] (A/B harness that consumes the labels)
