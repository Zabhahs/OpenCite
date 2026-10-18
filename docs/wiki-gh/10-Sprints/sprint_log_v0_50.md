---
machine_ids: [api.searchLog, handler.telemetry, hook.useSearchTelemetry, db.search_events, db.works, db.search_signals]
runtime: both
status: executed
tags: [sprint, data, telemetry, ranking, relevance, monetization]
---
<!-- AUTO-GENERATED from docs/wiki/10-Sprints/sprint_log_v0_50.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Sprint v0.50 — Search data capture (queries · results · signals)

**Date:** 2026-10-17 · **Baseline:** `main` @ `6270662` + uncommitted v0.48-P2 / v0.49 trees · **Status:** EXECUTED 2026-10-17 (GO from Shahbaz), NOT committed, NOT deployed — see §9 actuals

## 0. Directives of record (Shahbaz, 2026-10-17)

1. Store user queries + results compactly, so the data can be used to improve the tool.
2. **Capture maximally.** No hash-only / no-store compromise. Raw query text, identity where known, full ranked page, full interaction signals. "I want data I can play with for later projects."
3. The asset is for: a proprietary scholarly reranker (primary), an agent-query corpus, research-demand intelligence, query→verified-citation pairs. None sells at today's traffic; all compound from day one, so start now.

## 1. What exists today (verified in source)

| Fact | Where | Consequence |
|---|---|---|
| Web searches never hit the server; the browser fans out to adapters directly. | `src/hooks/useSearch.js:2` (`runSearch` from `adapters/index.js`) | Web capture needs a **beacon** from the browser. |
| `/api/search` sees only API + MCP traffic. Cache hits return at step 4 before the fan-out. | `api/search.js:320–340`, `:355–470` | Server hook must fire on **both** the cache-hit return and the live path. |
| `search_history` stores `(user_id, query, ts)` with a **unique (user_id, query)** — one row per distinct query, no results, no repeats. | `prisma/schema.prisma:109` | Keep for the History UI; it is not a log. New tables, not a retrofit. |
| `library_items.result Json` stores a full card per row. | `prisma/schema.prisma:123` | The anti-pattern to avoid: cards are reproducible, store references. |
| `relevance_labels (query, doi, grade)` already feeds F2 Gold-Set + v0.49 A/B. | `prisma/migrations/20260608000000_relevance_labels` | Sink for implicit labels derived from signals. |
| Vercel Hobby: 12 Node functions, currently at the cap. `api/user/[resource].js` dispatches by path segment; `vercel.json` rewrites `/api/<r>` → `/api/user/<r>`. | `api/user/[resource].js`, `vercel.json:7–12` | Telemetry endpoint = one more handler in the dispatcher + one rewrite. **Zero new functions.** |
| KV (`kv.js`) and cache (`cache.js`) are fail-open by contract. | `api/_shared/kv.js:10–14` | Logging inherits the same contract: never blocks or fails a search. |
| MCP client sends only `Accept` + `x-api-key`. | `mcp/src/client.js:48–49` | Add `X-OpenCITE-Client: opencite-mcp/<version>` so surface = `mcp` is attributable. |
| Privacy page says "We do not store anonymous queries." | `public/legal/privacy.html:31` | One-sentence copy change + Settings opt-out toggle (§6). |
| `anonymizeId(r)` = deterministic `oc_<sha1-16>` keyed on DOI → URL → title\|year. | `api/_shared/publicResult.js:15` | Reuse as the `works.oc_id` natural key, server and browser alike (it is pure `node:crypto`; browser gets a `subtle.digest` twin in `src/lib/`). |

## 2. Data model (Prisma + one additive, idempotent migration)

Design rule: **normalize what repeats, array-pack what is per-event, compress what is long.**

### 2.1 `works` — one row per distinct work, ever

```sql
CREATE TABLE IF NOT EXISTS "works" (
  "id"        SERIAL PRIMARY KEY,
  "oc_id"     TEXT NOT NULL UNIQUE,         -- anonymizeId(record)
  "doi"       TEXT,
  "source"    TEXT NOT NULL,                -- adapter id of FIRST sighting
  "title"     TEXT,
  "authors"   TEXT[],                       -- display names only
  "year"      SMALLINT,
  "venue"     TEXT,                         -- journal | publisher
  "type"      TEXT,
  "abstract"  TEXT,                         -- kept: this is what a reranker trains on
  "keywords"  TEXT[],
  "url"       TEXT,
  "is_oa"     BOOLEAN,
  "cited_by"  INTEGER,
  "first_seen" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "seen_n"    INTEGER NOT NULL DEFAULT 1    -- how many pages this work has appeared on
);
CREATE INDEX IF NOT EXISTS works_doi_idx ON "works"("doi");
ALTER TABLE "works" SET (toast_compression = lz4);
```

Upsert `ON CONFLICT (oc_id) DO UPDATE SET seen_n = works.seen_n + 1, abstract = COALESCE(works.abstract, EXCLUDED.abstract), …` — fills gaps, never overwrites a richer field with a poorer one (same spirit as `mergeRecords` F-210).

### 2.2 `search_events` — one row per executed search

```sql
CREATE TABLE IF NOT EXISTS "search_events" (
  "id"           BIGSERIAL PRIMARY KEY,
  "ts"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "query"        TEXT NOT NULL,             -- raw, as typed / as sent
  "terms"        TEXT[],                    -- ';' multi-term split (server) or [query]
  "surface"      SMALLINT NOT NULL,         -- 0 web · 1 api · 2 mcp · 3 admin-console
  "user_id"      TEXT,                      -- session user or key owner; NULL if anon
  "key_id"       TEXT,                      -- api_keys.id when keyed
  "plan"         TEXT,                      -- free | student | pro | machine | admin
  "actor"        BYTEA,                     -- sha256(ip + UA + daily salt)[:8] — anon session grouping
  "ip_hash"      BYTEA,                     -- sha256(ip + static pepper)[:8]
  "ua"           TEXT,
  "client"       TEXT,                      -- X-OpenCITE-Client (opencite-mcp/1.x) or browser
  "settings"     JSONB,                     -- semanticSearch, synonyms, slider, authors, simple, selected sources…
  "experiment"   TEXT,                      -- free-form tag (e.g. "v0.49-semantic-A")
  "eligible"     TEXT[],                    -- adapter ids asked
  "failed"       TEXT[],                    -- adapter ids that errored/timed out/circuit-open
  "coverage"     TEXT,                      -- band
  "n_raw"        SMALLINT, "n_dedup" SMALLINT, "n_returned" SMALLINT,
  "latency_ms"   INTEGER,
  "cache_hit"    BOOLEAN NOT NULL DEFAULT false,
  "page"         SMALLINT NOT NULL DEFAULT 0,   -- load-more depth (web)
  "dwell_ms"     INTEGER,                   -- time on the results page before next search / leave (web)
  "top"          INTEGER[] NOT NULL,        -- works.id in FINAL displayed order, full page
  "top_src"      SMALLINT[],                -- per-position adapter ordinal (see 2.4), parallel to top
  "scores"       SMALLINT[]                 -- per-position score ×1000 (_score | _sim | native rank), parallel to top
);
CREATE INDEX IF NOT EXISTS se_ts_idx      ON "search_events"("ts");
CREATE INDEX IF NOT EXISTS se_user_idx    ON "search_events"("user_id") WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS se_query_trgm  ON "search_events" USING gin ("query" gin_trgm_ops);  -- pg_trgm is on Supabase
ALTER TABLE "search_events" SET (toast_compression = lz4);
```

Why arrays, not JSON: 25 ids × 4 B = 100 B; the same page as JSONB cards is 25–40 KB. The three parallel arrays reconstruct the full ranked page with sources and scores by a single join on `works`.

### 2.3 `search_signals` — what the user did

```sql
CREATE TABLE IF NOT EXISTS "search_signals" (
  "id"        BIGSERIAL PRIMARY KEY,
  "event_id"  BIGINT NOT NULL REFERENCES "search_events"("id") ON DELETE CASCADE,
  "work_id"   INTEGER NOT NULL REFERENCES "works"("id"),
  "rank"      SMALLINT NOT NULL,            -- 0-based position as displayed
  "action"    SMALLINT NOT NULL,            -- web: 0 click-title · 1 open-doi · 2 copy-cite · 3 save-library · 4 expand-abstract · 5 dwell
                                            -- machine: 10 get-work · 11 verify-ref · 12 citations-graph · 13 resolve-ids
  "ts"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "meta"      JSONB                         -- {style} for copy · {ms} for dwell · {op, matched, unseen} for machine
);
CREATE INDEX IF NOT EXISTS ss_event_idx ON "search_signals"("event_id");
CREATE INDEX IF NOT EXISTS ss_work_idx  ON "search_signals"("work_id");
```

### 2.4 Adapter ordinal SSOT

`src/adapters/_shared/ordinals.js` — append-only `ADAPTER_ORDINAL = { DOAJ: 0, OPENALEX: 1, … }`, imported by both `searchLog.js` and the browser emitter. **Never renumber**; new adapters append. (Chosen over a lookup table so a `top_src` array stays decodable offline from the repo alone.)

### 2.5 Size (worked)

| Piece | Bytes (approx, post-lz4) |
|---|---|
| `search_events` row, 25-result page, settings JSONB | ~350 |
| `works` row with abstract (new work) | ~1,200 |
| `search_signals` row | ~60 |

At 1,000 searches/day with ~40 % new works and 0.3 signals/search: **~0.6 GB/yr**. Supabase free tier (500 MB) is crossed at roughly 300k searches; Pro ($25/mo) at that volume is a non-problem. Retention: **indefinite**, no deletion. Cold export (`COPY … TO` → gzip → Supabase Storage) is a later optional step, not in scope.

## 3. Write path

### 3.1 Server — `api/_shared/searchLog.js` (SSOT, fail-open)

```js
export async function logSearch({ identity, req, q, terms, settings, adapters, failed, cov, limited, deduped, pool, tookMs, cacheHit, surface })
export async function logSignal({ eventId, ocId, rank, action, meta })
```

- Upserts `works` for every record in `limited` (batched `INSERT … ON CONFLICT`), then inserts the event with `top` = their ids. One transaction, `prisma.$transaction`, wrapped in `try {} catch { log.warn(...) }` — **never throws, never awaited on the response path** (`void logSearch(...)` after the response is composed; Vercel keeps the function alive for the pending promise within the invocation window — if measurement shows truncation, switch to `waitUntil` from `@vercel/functions`).
- Called from `search.js` at **two** points: the cache-hit return (§4, `cacheHit: true`, `top` from the cached body's `results[].id`) and after step 8 render on the live path.
- Surface derivation: `identity.admin && req.query.debug` → 3; header `X-OpenCITE-Client` starts with `opencite-mcp` → 2; else 1.

### 3.2 Browser — `src/hooks/useSearchTelemetry.js`

- Fires once when `resultsReady` flips true (`App.jsx:228`) — i.e. after dedup, filters not applied, semantic rerank settled — with the exact ordered list the user sees (`sectionStates` → unified order via the same `orderBySimilarity | interleaveLists` SSOT that `UnifiedResultList.jsx` uses). Payload = query, `executedQuery`, settings snapshot, enabled adapter ids, failed ids (sections with `error`), page index, and `records: [{oc_id-basis fields, source, score}]` — the **minimal fields needed to upsert `works`** (title, authors, year, venue, doi, url, abstract, keywords, type, isOA, citedBy), not the UI card.
- `navigator.sendBeacon('/api/telemetry', blob)` with a `fetch(..., {keepalive:true})` fallback. Response carries `{ eventId }` for the signal emitters (sendBeacon has no response → use `fetch keepalive` and keep the promise; fall back to beacon only on unload).
- Fires again on each load-more with `page: n`.
- Honors `settings.telemetry === false` (default `true` for anonymous and signed-in alike, §8) — skips entirely.

### 3.3 Browser — signal emitters

| Signal | Hook point |
|---|---|
| click-title / open-doi | `ResultCard.jsx:103`, `:121`, `:196` anchors — `onClick` → `emitSignal(0|1)` |
| copy-cite | `App.jsx` `onCopy` handler (already receives `cardId`, `style`) → `emitSignal(2, {style})` |
| save-library | `onToggleLibrary` wrapper in `App.jsx` → `emitSignal(3)` only on add |
| expand-abstract | the card's abstract toggle → `emitSignal(4)` |
| dwell | Two measurements, both in `useSearchTelemetry`. **(a) Result dwell:** on click-title / open-doi (opens a new tab) start a timer; stop on the next `visibilitychange → visible` or `window.focus` and emit `5 {ms}` for that work. This is the standard SERP dwell proxy: a quick bounce back = poor result, a long stay = good one. **(b) Page dwell:** time from `resultsReady` to the next search / reset / `pagehide`, written to `search_events.dwell_ms` (UPDATE by eventId via `fetch keepalive`; the `pagehide` path uses `sendBeacon`). |

`emitSignal` resolves `oc_id` client-side (browser twin of `anonymizeId`, `src/lib/ocId.js`, `crypto.subtle` sha-1 — same basis string, same base64url slice) and the rank from the displayed index.

### 3.4 Server — `api/_shared/handlers/telemetry.js`

Registered in `api/user/[resource].js` `HANDLERS` + one `vercel.json` rewrite (`/api/telemetry` → `/api/user/telemetry`). `POST { kind: "search" | "signal", ... }`. Session optional (`getSession` → `user_id` or null). `parseBody` (F-400 size cap, raise to 256 KB for this route — a 100-deep OpenAlex page with abstracts is ~150 KB). Same-origin enforced via the v0.39 `Sec-Fetch-Site` check. Rate-limited per `actor` through `kv.js` (fail-open) at 120/min so the endpoint cannot be used to spam `works`.

### 3.5 MCP

`mcp/src/client.js:48` — add `"X-OpenCITE-Client": \`opencite-mcp/${pkg.version}\``. Nothing else; the server hook covers it.

### 3.6 Machine signals — a machine's "click" is its follow-on call

API and MCP users never click. Their relevance signal is **which search result they do something with next**: `get_paper` on it, feed it into `verify_citations`, pull its citation graph, resolve its ids. All four already flow through `api/works/[op].js` (`get` · `verify` · `citations` · `ids`, handlers in `api/_shared/handlers/works/`). Each handler gets one `void logMachineSignal({ identity, req, ocIdOrDoi, action, meta })` call (from `searchLog.js`), which:

1. Resolves the work: `works.oc_id` match, else `works.doi` match, else inserts a stub `works` row. An agent referencing something we never returned is itself a signal (`meta.unseen = true`).
2. Joins to the **most recent `search_events` row by the same `key_id` (or `actor` when keyless) within 10 minutes whose `top` contains that work id**; sets `event_id` + `rank` from the array position. No match → `event_id` NULL, `rank = -1`. Kept, because "verify called on a DOI we never surfaced" is exactly the agent-corpus data for query→citation pairs.
3. `verify` is batched: one signal per reference, `meta.matched` = the verify status, so hallucinated refs are distinguishable from real ones.

For machine `search_events` rows: `client` and `ua` from §3.5, `settings` carries the request params (`limit`, `sources`, `detail`, `format`), and the MCP server adds `X-OpenCITE-Tool: search_papers` so an LLM tool call is distinguishable from a raw curl with the same key.

## 4. Read path (what the data is FOR, wired now so it is used from day one)

1. **Implicit labels → `relevance_labels`.** Nightly-able SQL (run manually from admin console for now): for each `(event, signal)`, clicked work gets `grade = max(existing, 2)` for `(query, doi)`; works ranked above the lowest clicked rank with no signal get `grade = 0` if no label exists (skip-above). Admin console F2 and v0.49 A/B then consume them unchanged.
2. **Admin console tab "Search data (v0.50)"** — three read-only panels via a `GET /api/telemetry?view=…` (admin-gated through `resolveSessionAdmin`): zero/sparse-result queries (last 30 d), per-source click share (`top_src` at clicked rank), semantic-on vs off CTR@5 from `settings.semanticSearch`. Keep it to tables; no new chart lib.
3. **Export** — `GET /api/telemetry?view=export&since=…` admin-only, streams NDJSON of events joined to works. This is the "data I can play with" door; everything else is a convenience over it.

## 5. Files

| File | Change |
|---|---|
| `prisma/schema.prisma` | `works`, `search_events`, `search_signals` models |
| `prisma/migrations/20261017000000_search_capture/migration.sql` | §2 DDL, idempotent; `CREATE EXTENSION IF NOT EXISTS pg_trgm` |
| `api/_shared/searchLog.js` | **new** SSOT writer (§3.1) |
| `api/_shared/handlers/telemetry.js` | **new** handler (§3.4 + §4.2–4.3) |
| `api/user/[resource].js`, `vercel.json` | register `telemetry` |
| `api/search.js` | two `void logSearch(...)` calls (cache-hit + live) |
| `src/adapters/_shared/ordinals.js` | **new** append-only ordinal map |
| `src/lib/ocId.js` | **new** browser twin of `anonymizeId` (+ unit test asserting parity against the node version on 5 fixtures) |
| `src/hooks/useSearchTelemetry.js` | **new** beacon on `resultsReady` / load-more |
| `src/App.jsx` | mount hook; wrap `onCopy` / `onToggleLibrary` with signal emit |
| `src/components/ResultCard.jsx` | 3 anchor `onClick` emits + abstract-expand emit |
| `src/components/admin/SearchData.jsx`, `AdminConsole.jsx` | new tab (§4.2) |
| `src/constants/defaults.js`, `SearchControls.jsx` or Settings | `telemetry: true` + "Share searches to improve ranking" toggle |
| `mcp/src/client.js` | `X-OpenCITE-Client` + `X-OpenCITE-Tool` headers |
| `api/_shared/handlers/works/{get,verify,citations,ids}.js` | one `void logMachineSignal(...)` each (§3.6) |
| `public/legal/privacy.html:31` | replace the no-store sentence (§6) |
| `docs/wiki/_machine/_fragments/*` | register new modules; rebuild via `node scripts/wiki/build-machine-map.mjs` |

Not touched: billing, dedup, gate, grouping, adapters, `search_history`, `library_items`.

## 6. Policy text (the whole compliance footprint)

Replace `privacy.html:31` second sentence with:

> We store your searches and which results you open, copy or save, together with the result metadata, to improve ranking and build better research tools. You can switch this off in Settings → Search → "Share searches to improve ranking"; anonymous searches are not tied to an account.

Keep the §"What we store when you sign in" list in sync (add "search log and result interactions"). GDPR posture: legitimate interest + opt-out; the `DELETE /api/history {clear:true}` path also deletes the user's `search_events` (cascade on `user_id` via a new FK with `ON DELETE SET NULL` — the rows stay, de-identified, so the dataset is not holed).

## 7. Verification (prod, per CLAUDE.md — no local builds)

1. `node scripts/migrate.mjs` against Supabase; `\d search_events` shows lz4 + indexes.
2. API: `curl prod/api/search?q=…` with the admin master key → one `search_events` row, `surface=1`, `top` length = `count`, `works` rows upserted; repeat the same query → `cache_hit=true` row.
3. MCP: run `search_papers` from Claude → row with `surface=2`, `client=opencite-mcp/…`.
4. Web: one search in prod → row `surface=0` with `settings.semanticSearch` recorded; click a title → `search_signals` row with correct `rank`; copy citation → `action=2, meta.style`.
5. Toggle off in Settings → no row.
6. Dwell: click a title, come back after ~15 s → `action=5` row with `meta.ms ≈ 15000`; run a new search → previous event's `dwell_ms` is set.
7. Machine: MCP `search_papers` then `get_paper` on result #3 → `action=10` row with `rank=2` and `event_id` = the search row; `verify_citations` with one real + one invented ref → two `action=11` rows, one with `unseen=true`.
8. Run §4.1 label promotion → new `relevance_labels` rows visible in F2.
9. Sanity: `/api/search` p95 latency unchanged (logging is post-response).

## 8. Decisions of record + open items

**Decisions of record (Shahbaz, 2026-10-17):**
- **Telemetry ON by default for everyone** — anonymous, signed-in, API, MCP. Opt-out toggle is web-only; machine users are covered by the API terms (data used to improve the service).
- **Dwell time in scope** (§3.3). The earlier deferral is withdrawn; it is two event listeners.
- **Machine signals in scope** (§3.6). The follow-on call is the click.

**Open:**
- **GO on the plan.** Everything above is additive and reversible (drop three tables).
- When the dataset is exported outside the app for a "later project": OpenAlex/Crossref/Europeana/DPLA/Smithsonian metadata is CC0; CORE and publisher-licensed abstracts are not redistributable. Internal training is fine for all. Tag `works.source` makes the filter a one-liner.
- Supabase Pro trigger ≈ 300k searches. Nothing to do until then.

## 9. Execution actuals (2026-10-17)

Everything in §5 was built. Deviations from the plan, all deliberate:

| Plan said | Built | Why |
|---|---|---|
| `src/lib/ocId.js` browser twin of `anonymizeId` + parity test | **Dropped.** The browser sends the id basis (doi · url · title · year); the server computes `oc_id` with the one `anonymizeId`. | One implementation, zero drift risk, no subtle-crypto async in click handlers. |
| Signal 1 `open-doi`, 4 `expand-abstract` | `1 open_link` (full-text / image link), `4 expand_cite` (citation drawer). | The card has no abstract toggle; the title link already covers the DOI. Codes unchanged. |
| `void logSearch(...)` post-response | `await withBudget(logSearch(...), 600 ms)` **before** the response. | Vercel freezes a Node function once the response ends; un-awaited work is unreliable without `@vercel/functions` `waitUntil` (not installed — no `npm install` allowed). Typical cost ~2 pooled statements. |
| Account-deletion de-identification | Wired to `DELETE /api/history {clear:true}` (the only user-initiated wipe the app has). | No account-deletion flow exists yet; `deidentifyUser` is exported for when it does. |
| Opt-out in Settings panel | Toggle lives in the under-search-bar **Search settings** disclosure (`SearchControls.jsx`) next to Semantic search. | Same place the other search toggles are. |
| Wiki note under 04-Backend-API | `docs/wiki/07-Data-Layer/Search-Data-Capture.md` | It is a data-layer concern first. |

Also discovered while executing: a **concurrent uncommitted v0.48 Phase 2 tree** (metered billing, verify trial, `usage` / `billing-sweep` handlers, per-IP window on the user dispatcher) is in the same working copy. All v0.50 edits were made surgically against the live files and co-exist with it; `verify.js` handles the trial's `identity === null` (join falls back to the actor hash). The dispatcher's new per-IP window (60/min) now also fronts `/api/telemetry` — a search + a handful of signals per minute per IP fits, but a NAT'd lab could brush it; raise `ANON_PLAN` or exempt `telemetry` if the 429 count in Vercel logs says so.

Files touched (new ★): ★`api/_shared/searchLog.js` · ★`api/_shared/handlers/telemetry.js` · ★`src/lib/telemetry.js` · ★`src/hooks/useSearchTelemetry.js` · ★`src/components/admin/SearchData.jsx` · ★`src/adapters/_shared/ordinals.js` · ★`prisma/migrations/20261017000000_search_capture/migration.sql` · ★`docs/wiki/07-Data-Layer/Search-Data-Capture.md` · `prisma/schema.prisma` · `api/search.js` · `api/_shared/handlers/works/{get,verify,citations,ids}.js` · `api/_shared/handlers/history.js` · `api/_shared/parseBody.js` · `api/user/[resource].js` · `vercel.json` · `src/App.jsx` · `src/components/{ResultCard,SearchControls,AdminConsole}.jsx` · `src/constants/defaults.js` · `mcp/src/{client,server}.js` · `public/legal/privacy.html` · `docs/wiki/_machine/_fragments/{backend,frontend,adapters}.modules.json` (+ rebuilt machine map).

Verified locally (allowed scope): `node --check` on every JS file, esbuild JSX parse on every JSX file, import + pure-helper smoke of `searchLog.js` (row shaping, context hashing, surface derivation, budget). **Not run** (per CLAUDE.md): build, DB migration, prod probes — §7 is the deploy-day checklist.
