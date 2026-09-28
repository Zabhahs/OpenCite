# OpenCITE — Sprint Log v0.38

> **PM + architecture document for the next Claude instance(s).** Self-contained execution
> plan for **Coverage & Adapter Integrity** — eliminating the billing-discount recurrence
> mechanism (dead-adapter circuit-breaker), verifying the dead-adapter removal actually
> lifts coverage bands, and landing a focused set of adapter correctness fixes that
> directly affect result quality and data honesty.
>
> Read `architecture_report_v0_30.md` + `sprint_log_v0_36.md` (diagnostic findings that
> motivated this sprint) + `docs/wiki/09-Audit/Health-Dashboard.md` first.
>
> **Created:** 2026-06-08 · **Status:** PLANNED — not executed.
> **Mode:** C (plan → approval → execute → checklist). No padding; precise execution.

---

## 0. TL;DR

v0.36 confirmed: SciELO/OpenNeuro/ENA are permanently dead and have been **quarantined in T0
(already done this session)** — removed from `src/adapters/index.js` + `extensions/index.js`,
source preserved verbatim at `docs/wiki/99-Archive/_quarantine/`, machine records marked
`status: quarantined`, build verified green. That kills the F-208 revenue leak.

The remaining work this sprint has three goals:

1. **Circuit-breaker** — prevent any future always-failing adapter from silently poisoning
   coverage/billing before someone notices (the structural recurrence risk of F-208).
2. **Coverage verification** — confirm the quarantine actually lifts queries off `partial`,
   and that `freeBelowBand` no longer mis-fires.
3. **Adapter correctness** — targeted fixes for bugs and data-honesty issues identified in
   the audit (F-102/F-103/F-104/F-105/F-106/F-108/F-112/F-114), plus Wikidata prod-verify
   before any further action on it.

**F-111 (OpenLibrary no abstract):** accepted / wontfix. OpenLibrary's `search.json` API
returns no abstract field by design; fetching `/works/<key>.json` per-hit adds a fan-out
wave with no ranking benefit (BM25F already uses subjects as the rich signal).
Documented here and closed.

| Area | Findings | Revenue/quality impact |
|---|---|---|
| Circuit-breaker | F-208 (recurrence) | Prevents future billing-discount recurrence |
| Coverage recalc | F-208 post-fix | Confirms band lifts off permanent `near-full` (0.99×) toward `full` (1.0×) — ~1% undercharge, NOT a discount/free-search (see T2 correction) |
| IA citedBy display | F-104 | Product call — UI already labels IA as "downloaded" not "cited"; keep or hide (see T4 correction) |
| Mexicana pagination | F-106 | Restores load-more (currently re-fetches batch 1 forever) |
| BnF isOA | F-114 | Stops non-OA catalogue records leaking into OA-only views |
| CORS noise cleanup | F-102 (reduced scope) | Eliminates silent failed RTT in Northwestern/ONB |
| BASE capability | F-112 | BASE now counted in server coverage denominator |
| S2 protocol debt | F-105 | Low-noise correctness fix while file is open |
| CuratedJournals pageSize | F-103 | Fixes wrong page numbers on load-more |
| Thaqalayn URL | F-108 | Future-proofs deep-link when API gains item URLs |
| Wikidata prod-verify | F-208 note | Gate decision: quarantine or keep |

---

## 1. Scope

### In scope
- **T0 (DONE):** quarantine SciELO/OpenNeuro/ENA per findings F-107/F-109/F-110/F-208.
- **T1:** Chronic-failure circuit-breaker in `api/search.js` fan-out.
- **T2:** Coverage recalculation correctness — before/after probe + billing verification.
- **T3:** Wikidata production verification — 429 locally, outcome gates T3b decision.
- **T4:** IA citedBy display fix (F-104).
- **T5:** Mexicana `nextToken`→`nextPageToken` (F-106).
- **T6:** BnF `isOA` hardcoded true (F-114).
- **T7:** Northwestern/ONB CORS noise — skip direct fetch in browser (F-102, reduced scope;
  OpenNeuro is quarantined).
- **T8:** BASE missing `serverSafe`/`corpusSize` + 6 thin-shim adapters same gap (F-112).
- ~~**T9:** S2 `protocol` fix (F-105)~~ — **SUPERSEDED**: Semantic Scholar fully quarantined in v0.42; F-105 closed.
- **T10:** CuratedJournals `per_page` hardcoded 5 (F-103).
- **T11:** Thaqalayn homepage URL — investigate + apply if item URL is constructible (F-108).

### Out of scope
- F-111 (OpenLibrary no abstract) — **accepted/wontfix** (see §0 rationale).
- v0.35 RRF ranker changes — separate sprint, unblocked by this one.
- v0.37 MCP acquisition funnel — separate sprint.
- Security cluster (F-406, F-407, F-410, F-411) — scoped to a security sprint.

### Quarantine policy reminder
Any code removal in T1–T11 **must** follow `docs/wiki/99-Archive/_quarantine/_index.md`:
copy full verbatim source to a dossier under `_quarantine/`, mark machine record
`status: quarantined`, then remove from active codebase. T0 already did this correctly
for the three dead adapters.

---

## 2. Design / approach

### T1 — Circuit-breaker

**Problem:** a new adapter that always throws will silently drag coverage to `partial` forever,
re-creating F-208. The fix needs to happen *before* `computeCoverage` counts the adapter as
failed (i.e., the adapter must leave the eligible set, not just be a "failed" counted in
coverage).

**Design:** a lightweight in-process failure-streak counter stored in a module-level `Map` in
`api/search.js` (or a new `api/_shared/adapterHealth.js`). Each adapter gets a streak counter
reset to 0 on success. After `FAILURE_STREAK_THRESHOLD` consecutive failures (proposed: 5)
across requests within the same function instance, the adapter is **dropped from the eligible
set** before coverage is computed — it is treated as if it was never eligible, not as a failed
adapter. The counter resets on the next deployment (function cold-start) intentionally:
transient outages clear themselves.

This is a server-side (function-instance-scoped) heuristic, not a durable KV store — KV
would add latency and a new failure surface. A cold start resets all streaks; if the adapter
is still broken after cold start it will be dropped again within 5 requests.

```
// api/_shared/adapterHealth.js  (NEW, ~30 lines)
const streaks = new Map(); // adapterId → consecutive-failure count
const THRESHOLD = 5;
export function recordSuccess(id) { streaks.set(id, 0); }
export function recordFailure(id) { streaks.set(id, (streaks.get(id) || 0) + 1); }
export function isCircuitOpen(id) { return (streaks.get(id) || 0) >= THRESHOLD; }
```

In `api/search.js` fan-out: wrap each adapter run in `try/catch`, call
`recordSuccess`/`recordFailure`. Before the fan-out, filter eligible adapters:
`adapters.filter(a => !isCircuitOpen(a.id))`. Dropped adapters are added to a
`circuitBreakerDropped` array and logged (admin-visible only — origin-blind in public
response). Coverage is computed over the post-filter eligible set.

**No quarantine needed** for the circuit-breaker module itself — it is new code, not a
removal.

### T2 — Coverage verification

**Before/after** using `scripts/stress/probe.mjs`. The probe currently calls the live API
without an API key — for admin verification, extend it to accept a `KEY` env var and pass
`x-api-key`. Run a batch of 5 known queries against prod before and after deployment.

**⚠ Accurate mechanism (verified on-branch 2026-06-08 against `coverage.js` + `billing.js` —
this supersedes the looser "partial → discount" framing in earlier drafts and in finding F-208):**

The 3 dead adapters carry small `corpusSize` (SciELO 1M, ENA 500K, OpenNeuro 1K) versus the
core corpora (OpenAlex/Crossref — hundreds of millions). Their failure is ~0.3% attrition, so
`bandFor()` returns **`near-full`** (coverage ≥ 0.99), **not** `partial`. The real defect is
narrower but still systematic: because they **throw** (not return empty), `failedCount > 0` on
*every* query, and `bandFor` can therefore **never** return `full` (`coverage.js:36`:
`if (failedCount === 0) return "full"`). Every query is billed at
`coverageMultiplier("near-full") = 0.99` instead of `1.0` → a guaranteed **~1% undercharge** plus
a permanently non-`full` coverage band (a meaningless coverage signal).

The `freeBelowBand` **full waiver does NOT fire** from these adapters: plans set
`freeBelowBand: "limited"` (NOT `"partial"`), and `isAtOrBelow` (BAND_ORDER =
`["limited","partial","high","near-full","full"]`, `billing.js:119`) waives only the `"limited"`
band (coverage < 0.5). A full waiver would require ≥50% of corpus weight to fail.

Expected **before** (with dead adapters): band `near-full`, `creditsCharged ≈ 0.99 × creditCost`.
Expected **after** removal + circuit-breaker: band `full` (1.0×) **only on queries where no other
adapter errors**. If any *other* adapter times out/errors, `failedCount > 0` persists and the band
stays `near-full` — restoring `full` requires the circuit-breaker (T1) PLUS otherwise-healthy
adapters. **T2 measures the `full` vs `near-full` split and the 0.99×→1.0× charge delta, not
`partial` vs `full`.**

### T3 — Wikidata production verification

`wikidata.js` makes 3 sequential fetch calls per search (CirrusSearch, wbgetentities ×2).
Locally it returns 429 (rate-limited). In prod (Vercel Functions) the outbound IP is different.

Verify by hitting `/api/search?q=test&sources=WIKIDATA&debug=1` (admin key) on prod. If
it returns results → keep as-is. If it returns 429 consistently → quarantine same as T0
(copy to `_quarantine/`, mark machine record, remove from `ADAPTERS` array). Decision tree:
- `results.length > 0` → keep, no action.
- Consistent HTTP 429 across 3 queries → quarantine per policy.
- Transient 429 → add `User-Agent` / backoff comment, keep, monitor.

---

## 3. Execution plan

### T0 — Quarantine SciELO / OpenNeuro / ENA [DONE ✓]

Already completed this session. Verified:
- `src/adapters/index.js`: import block updated with quarantine comment (line 29–32), removed
  from `ADAPTERS` array (lines 68, 85).
- `src/adapters/extensions/index.js`: export lines removed (line 28–30), quarantine comment added.
- `.js` files git-removed from `src/adapters/extensions/`.
- Full source preserved at `docs/wiki/99-Archive/_quarantine/adapter-scielo.md`,
  `adapter-openneuro.md`, `adapter-ena.md`.
- Machine records in `docs/wiki/_machine/findings.json` updated: F-107/F-109/F-110/F-208
  `status: quarantined`.
- `docs/wiki/99-Archive/_quarantine/_index.md` register updated.
- `npx vite build` passes clean.

---

### T1 — Chronic-failure circuit-breaker (~2.5 hours)

**T1.1** Create `api/_shared/adapterHealth.js` (~30 lines):
- `Map<string, number> streaks` (module-level, instance-scoped).
- `FAILURE_STREAK_THRESHOLD = 5`.
- Export: `recordSuccess(id)`, `recordFailure(id)`, `isCircuitOpen(id)`.
- Export: `circuitBreakerStats()` → `{ [id]: streak }` for admin telemetry.

**T1.2** Edit `api/search.js` fan-out section (currently around line 250+, in the
`Promise.allSettled`/`withTimeout` block):
- Import `{ recordSuccess, recordFailure, isCircuitOpen, circuitBreakerStats }` from
  `./_shared/adapterHealth.js`.
- Before fan-out, filter: `const fanned = adapters.filter(a => !isCircuitOpen(a.id));`
  Track dropped: `const cbDropped = adapters.filter(a => isCircuitOpen(a.id));`.
- In each adapter's settled callback: on `fulfilled` call `recordSuccess(a.id)`; on
  `rejected` call `recordFailure(a.id)`.
- Pass `fanned` (not `adapters`) to `computeCoverage` as `eligibleAdapters`.
- In admin `?debug=1` response envelope, add `circuitBreaker: circuitBreakerStats()` and
  `cbDropped: cbDropped.map(a => a.id)` so the admin console can see which adapters are
  circuit-opened.

- [ ] T1.1 Create `api/_shared/adapterHealth.js`. (~0.5h)
- [ ] T1.2 Wire into `api/search.js` fan-out. (~1h)
- [ ] T1.3 Manual test: local dev, deliberately break one adapter URL, confirm it is
      dropped from eligible set after 5 consecutive calls; restore, confirm recovery after
      cold-start. (~1h)

**Est: 2.5h**

---

### T2 — Coverage recalculation verification (~1.5 hours)

**T2.1** Extend `scripts/stress/probe.mjs` to:
- Accept `KEY` env var and pass as `x-api-key` header (so it works against the authenticated
  `/api/search` endpoint).
- Accept `--coverage-only` flag that prints only `{ q, coverage, creditsCharged, count }`.
- `node scripts/stress/probe.mjs --coverage-only "kidney disease" KEY=<admin-key>`

**T2.2** Run a before-snapshot against prod (pre-deployment of T0 results hitting prod).
Document in `COVERAGE_VERIFICATION_v0_38.md`:
- 5 queries: `kidney disease`, `mughal empire`, `climate change 2020`, `neural networks`,
  `hadith compilation`.
- Record: `{ coverage, count, creditsCharged }` for each.

**T2.3** After deployment of T0 quarantine to prod:
- Run same 5 queries. Expected: coverage improves from `partial` toward `near-full`/`full`
  on at least 4/5 queries.
- Confirm `creditsCharged > 0` for all queries (freeBelowBand no longer triggered by
  false `partial`).

**T2.4** Verify `api/_shared/coverage.js` logic is correct for the new adapter set:
- Check `FALLBACK_CORPUS = 1` still does not distort the denominator. With 3 dead adapters
  removed, the total corpus weight rises by 0 (they had FALLBACK_CORPUS = 1 each since they
  lacked `corpusSize`). Net effect: denominator is unchanged, coverage is unchanged. ✓
  (This is the correct outcome — the dead adapters contributed negligible weight anyway;
  their removal only eliminates the `failedCount > 0` trigger that forced a non-`full` band.)

- [ ] T2.1 Extend `scripts/stress/probe.mjs`. (~0.5h)
- [ ] T2.2 Run before-snapshot + document. (~0.25h)
- [ ] T2.3 Run after-snapshot, confirm improvement, confirm billing. (~0.25h)
- [ ] T2.4 Verify `coverage.js` denominator math (read-only, no code change expected). (~0.5h)

**Est: 1.5h**

---

### T3 — Wikidata production verification (~1 hour)

**T3.1** Hit prod with admin key:
```
curl -H "x-api-key: <admin>" \
  "https://citation.today/api/search?q=medieval+manuscripts&sources=WIKIDATA&debug=1&limit=5"
```
Run 3 times, 30s apart. Document in `COVERAGE_VERIFICATION_v0_38.md`.

**T3.2 — Decision:**
- If any run returns `results.length > 0` → no action. Add comment to `wikidata.js:43`
  noting "429 locally, works in prod (verified 2026-06-08)."
- If all 3 runs return HTTP 429 or 0 results + 429 error → quarantine: copy
  `src/adapters/extensions/wikidata.js` verbatim to
  `docs/wiki/99-Archive/_quarantine/adapter-wikidata.md`, mark `status: quarantined` in
  `findings.json` entry referencing F-208, remove from `ADAPTERS` + barrel. Build verify.

- [ ] T3.1 Run 3 prod queries, document results. (~0.25h)
- [ ] T3.2 Apply decision (comment or quarantine). (~0.75h if quarantine; ~0.1h if keep)

**Est: 1h (or 0.35h if keep path)**

---

### T4 — IA citedBy display fix (F-104) (~0.5 hours)

**File:** `src/adapters/extensions/internetArchive.js`

**Lines to change:**
- Line 100 (`mapMetadataDoc`): `citedBy: downloads > 0 ? downloads : null` → `citedBy: null`
- Line 141 (`mapFtsHit`): `citedBy: downloads > 0 ? downloads : null` → `citedBy: null`

**Rationale (corrected on-branch 2026-06-08):** IA has no citation data, and the ranking use was
already fixed in v0.35 (`rankFields.citedBy: false`). **However, the display is already
source-aware:** `src/components/ResultCard.jsx:153` renders
`{result.citedBy.toLocaleString()} {result.source === "IA" ? "downloaded" : "cited"}` — so an IA
item shows "10,000,000 downloaded", **NOT** "cited". F-104 is therefore **not** the
"shown as citations" bug originally described. What remains is a **product decision**: keep the
honest "N downloaded" badge (a real, correctly-labelled IA metric) or hide it.
**Recommendation: keep the badge; downgrade T4 to a ~0.1h labelling review and close F-104 as
wontfix with this note.** Only set `citedBy: null` at lines 100/141 if the product call is to
hide IA download counts entirely.

Note: `downloads` is no longer used after this change. The `downloads` variable in
`mapMetadataDoc` (line 77) and `mapFtsHit` (line 113) can be removed to avoid lint noise,
but the `FIELDS` array (line 53) should retain `"downloads"` — IA still returns it, and
removing it from the request would be a silent behavior change. Leave the field requested,
just stop mapping it to `citedBy`.

- [ ] T4.1 Set `citedBy: null` at `internetArchive.js:100` and `internetArchive.js:141`. (~0.25h)
- [ ] T4.2 Remove unused `downloads` variable in both `mapMetadataDoc` and `mapFtsHit`
      (or suppress with `void downloads;` — prefer removal). (~0.1h)
- [ ] T4.3 Verify no scoring regression: `rankFields.citedBy: false` is already set at
      line 160. No scoring change expected. (~0.1h)

**Est: 0.5h**

---

### T5 — Mexicana `nextToken` → `nextPageToken` (F-106) (~0.5 hours)

**File:** `src/adapters/extensions/mexicana.js`

**Line:** 29: `nextToken: data.nextToken || null` → `nextPageToken: data.nextToken || null`

`runSearch` in `src/adapters/index.js:127` reads `raw.nextPageToken`. The Mexicana adapter
returns `nextToken` (wrong key) so the token is never threaded back into `useSearch`'s opts
for load-more. Renaming the return key to `nextPageToken` is the entire fix.

Also verify the server route `api/search/mexicana.js` passes the token back under the same
key. Read that file before applying.

- [ ] T5.1 Read `api/search/mexicana.js` — confirm it returns `nextToken` in the JSON body
      and update to `nextPageToken` if so. (~0.25h)
- [ ] T5.2 Change `mexicana.js:29` to `nextPageToken`. (~0.1h)
- [ ] T5.3 Manual load-more test: search Mexicana, click load-more, confirm second batch
      is new results (not a repeat of batch 1). (~0.15h)

**Est: 0.5h**

---

### T6 — BnF `isOA: true` → `isOA: false` (F-114) (~0.25 hours)

**File:** `src/adapters/extensions/bnfApi.js`

**Line:** 60: `isOA: true` → `isOA: false`

The BnF SRU catalogue (`catalogue.bnf.fr`) indexes all BnF holdings. The vast majority are
physical non-OA items; only a small subset have digital open-access equivalents. Hardcoding
`true` causes non-OA catalogue records to appear in OA-only filter views.

An ideal fix would detect OA from UNIMARC field 856 (electronic access links), but the
current `sruRecords` parser does not extract 856. Setting `false` is conservative and
correct for catalogue records — users who want open-access content are better served by
DOAJ/OpenAlex.

- [ ] T6.1 Change `bnfApi.js:60` from `isOA: true` to `isOA: false`. (~0.1h)
- [ ] T6.2 Spot-check: run a BnF query with OA filter on, confirm catalogue records no
      longer appear. (~0.15h)

**Est: 0.25h**

---

### T7 — Northwestern/ONB CORS noise: skip direct fetch in browser (F-102) (~1 hour)

**Scope reduced from F-102:** OpenNeuro is quarantined (T0). Northwestern + ONB remain.

**Problem:** Both adapters attempt `fetch(url)` first, then fall back to `proxiedFetch` on
error. In the browser, the direct fetch throws a CORS network error (caught silently by the
`catch` block) before proxy runs — adding one wasted RTT and polluting DevTools network log
on every browser call. In a Node.js server context, the direct fetch may work, so removing
it entirely would break the server path.

**Fix:** Guard the direct fetch behind an environment check. Both adapters already import
`proxiedFetch` from `../_shared/proxy.js`. The pattern used by `proxiedFetch` itself is to
check `typeof window === 'undefined'` for server detection.

**Northwestern** (`src/adapters/extensions/northwestern.js:26-29`):
```js
// BEFORE
try {
  r = await fetch(nuUrl, { method: "POST", ... });
} catch {
  r = await proxiedFetch(nuUrl, { method: "POST", body: ... }, { adapterId: "NORTHWESTERN" });
}

// AFTER
if (typeof window === 'undefined') {
  // Server: direct fetch works (no CORS)
  r = await fetch(nuUrl, { method: "POST", ... });
} else {
  // Browser: always go through proxy to avoid CORS error on direct fetch
  r = await proxiedFetch(nuUrl, { method: "POST", body: JSON.stringify(body) }, { adapterId: "NORTHWESTERN" });
}
```

**ONB** (`src/adapters/extensions/onb.js:26-29`): same pattern, `fetch(sruUrl)` → proxy
conditional.

Note: BnF (`bnfApi.js:27-30`) has the same try/catch pattern. Since we are touching BnF in
T6, apply the same browser guard there too as a bonus fix.

- [ ] T7.1 Apply `typeof window === 'undefined'` guard to `northwestern.js:26-29`. (~0.25h)
- [ ] T7.2 Apply same guard to `onb.js:26-29`. (~0.25h)
- [ ] T7.3 Apply same guard to `bnfApi.js:27-30` (while the file is open for T6). (~0.15h)
- [ ] T7.4 Verify in browser DevTools: no red CORS network error before proxy call for a
      Northwestern or ONB query. (~0.35h)

**Est: 1h**

---

### T8 — BASE + 6 thin-shim adapters missing `serverSafe`/`corpusSize` (F-112) (~1 hour)

**Finding F-112** targets `src/adapters/extensions/base.js:24`. Without `serverSafe: true`,
BASE is excluded from the server-side fan-out (`api/search.js` filters by
`capability.serverSafe`). Without `corpusSize`, coverage engine uses `FALLBACK_CORPUS = 1`,
drastically understating BASE's 300M-record contribution.

The same gap affects 6 additional extension adapters that also lack both fields (confirmed by
grep: `gallica.js`, `openEdition.js`, `bdh.js`, `britishLibrary.js`, `mexicana.js`,
`openContext.js`). Each needs `serverSafe` and `corpusSize` set in its `capability` block.

**For each adapter, verify the transport before setting `serverSafe: true`:** an adapter
that uses raw `fetch()` without proxy will fail server-side due to CORS. If the transport is
`proxiedFetch` only → `serverSafe: true` is correct. If it uses `fetch()` directly without
proxy fallback → `serverSafe` must stay absent or false.

**Proposed values (verify transport before applying):**

| Adapter | File | `serverSafe` | `corpusSize` | Transport check |
|---|---|---|---|---|
| BASE | `base.js:24` | `true` | `300000000` | `proxiedFetch` only ✓ |
| Gallica | `gallica.js` | `true` | `15000000` | Verify (proxiedFetch expected) |
| OpenEdition | `openEdition.js` | `true` | `600000` | Verify |
| BDH | `bdh.js` | `true` | `400000` | Verify |
| British Library | `britishLibrary.js` | `true` | `200000000` | Verify (SPARQL via proxy) |
| Mexicana | `mexicana.js` | `false` | — | Client-only: calls `/api/search/mexicana` (relative URL) — cannot run server-side |
| OpenContext | `openContext.js` | `true` | `900000` | Verify |

Mexicana is a special case: its `search` function calls `/api/search/mexicana` (a relative
URL), which only resolves in the browser. It must NOT be marked `serverSafe: true`.

- [ ] T8.1 Read each file, verify transport, document in checklist. (~0.25h)
- [ ] T8.2 Add `serverSafe: true` + `corpusSize: <N>` to `base.js` capability block
      (after line 27, before closing brace). (~0.1h)
- [ ] T8.3 Apply to Gallica, OpenEdition, BDH, BritishLibrary, OpenContext if transport
      confirmed server-safe. (~0.25h)
- [ ] T8.4 Confirm Mexicana is NOT marked serverSafe (document rationale in comment). (~0.1h)
- [ ] T8.5 Run `npx vite build` — verify no new import errors. (~0.1h)
- [ ] T8.6 Run probe: confirm BASE appears in server fan-out (check debug=1 response or
      non-zero results from BASE ID). (~0.2h)

**Est: 1h**

---

### T9 — Semantic Scholar protocol fix (F-105) — ✅ SUPERSEDED BY QUARANTINE (v0.42)

The whole Semantic Scholar adapter was **quarantined in v0.42** — `semanticScholar.js` removed
from the build, `s2Key` config cleaned from `defaults.js` + `useSettings.js` (kept in
`LEGACY_KEYS` only to purge stale localStorage), source preserved at
`docs/wiki/99-Archive/_quarantine/adapter-semanticscholar.md`. F-105 is **resolved** (no
descriptor left to carry the wrong `protocol`). **No action in this sprint.**

- [x] T9 — superseded; F-105 closed via v0.42 quarantine.

**Est: 0h (was 0.15h)**

---

### T10 — CuratedJournals `per_page` hardcoded 5 (F-103) (~0.5 hours)

**File:** `src/adapters/core/curatedJournals.js`

**Line:** 26: `const pageSize = 5;` should use the imported constants.

`INITIAL_PAGE_SIZE` and `LOAD_MORE_PAGE_SIZE` are already imported (line 1). The hardcoded
`5` means load-more calls compute the wrong OpenAlex page number: if `INITIAL_PAGE_SIZE=10`
and a load-more offset of `10` is passed, `Math.floor(10/5)+1 = 3` (wrong) instead of
`Math.floor(10/10)+1 = 2` (correct). This causes CURATED to skip a page on every load-more.

Fix (verbatim from F-103 fix_hint):
```js
// BEFORE (line 26)
const pageSize = 5;

// AFTER
const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
```

- [ ] T10.1 Change `curatedJournals.js:26` to use constants. (~0.1h)
- [ ] T10.2 Manual test: configure curated journals, run a search, click load-more, confirm
      page 2 results are new (not a repeat of page 1). (~0.4h)

**Est: 0.5h**

---

### T11 — Thaqalayn URL: investigate deep-link (F-108) (~0.5 hours)

**File:** `src/adapters/extensions/thaqalayn.js`

**Line:** 37: `url: 'https://thaqalayn.net/'` hardcoded for every result.

The API endpoint `https://www.thaqalayn-api.net/api/v2/query` returns hadith objects. Check
whether the response object includes a field that can construct a deep URL.

**Investigation plan:** read a live API response for fields like `id`, `_id`, `hadithNumber`,
`bookId`, `book`, `chapterNumber`. The current mapping at lines 27–29 reads
`h.hadithNumber || h.id` and `h.bookName || h.book`. If the API returns a numeric `id` that
maps to `https://thaqalayn.net/hadith/<id>`, use it.

**Decision tree:**
- If `h._id` or a numeric id maps to a known deep URL pattern → construct it, update line 37.
- If no reliable item-level URL can be constructed → add a comment at line 37 explaining why,
  and close F-108 as "accepted — API provides no item-level URL."

- [ ] T11.1 Fetch a live Thaqalayn API response for query "water" and inspect the fields.
      (`curl "https://www.thaqalayn-api.net/api/v2/query?q=water"`) (~0.25h)
- [ ] T11.2 Apply deep-link URL if constructible, or add explanatory comment + close
      finding. (~0.25h)

**Est: 0.5h**

---

## 4. Acceptance criteria

- [x] **T0 verified:** `npx vite build` passes; SciELO/OpenNeuro/ENA absent from
      `ADAPTERS` array and extensions barrel; quarantine dossiers present in
      `docs/wiki/99-Archive/_quarantine/`.
- [x] **T1 circuit-breaker:** `api/_shared/adapterHealth.js` (threshold 5) wired into
      `api/search.js` — circuit-open adapters are filtered out of `eligible` BEFORE
      `computeCoverage` (passed as `adapters`). Admin `?debug=1` includes `circuitBreaker`
      + `cbDropped` telemetry. **Unit-tested** (`adapterHealth.test.js`, 6/6 pass). T1.3
      live-dev manual recovery test still recommended on deploy.
- [~] **T2 coverage:** tooling done (`probe.mjs --coverage-only` + `KEY`). Mechanism +
      denominator math verified on-branch. Before/after **prod runs PENDING** (need admin
      key) — see `COVERAGE_VERIFICATION_v0_38.md`.
- [~] **T3 Wikidata:** kept for now (no prod evidence to quarantine; T1 circuit-breaker
      now auto-drops it if it 429s in prod). Prod decision runs PENDING — documented in
      `COVERAGE_VERIFICATION_v0_38.md`.
- [x] **T4 IA citedBy:** product decision = **KEEP** the honest "N downloaded" badge
      (`ResultCard.jsx:153` already source-aware; rank ignores it). F-104 → wontfix. No code change.
- [x] **T5 Mexicana load-more:** TWO-part fix — return key `nextToken`→`nextPageToken`
      AND read `opts.pageToken` (was bespoke `opts.mexicanaToken`, never populated). Server
      route body unchanged (adapter maps its `nextToken` body field). Manual load-more test
      recommended on deploy.
- [x] **T6 BnF isOA:** `isOA: false` at `bnfApi.js:60`.
- [x] **T7 CORS noise:** `typeof window === 'undefined'` guard applied to `northwestern.js`,
      `onb.js`, and `bnfApi.js`. Browser DevTools spot-check recommended on deploy.
- [x] **T8 BASE server:** BASE → `serverSafe: true` + `corpusSize: 300000000` (proxiedFetch,
      absolute URL). **Plan correction:** Gallica/OpenEdition/BDH/BL/OpenContext/Mexicana use
      RELATIVE-URL `fetch(/api/search/<x>)` (browser-only) → given `corpusSize` for docs but
      deliberately NOT `serverSafe` (risk R6).
- [x] **T9 S2 protocol:** SUPERSEDED — Semantic Scholar fully quarantined in v0.42; F-105 closed.
- [x] **T10 CURATED pageSize:** `curatedJournals.js:26` now uses INITIAL/LOAD_MORE_PAGE_SIZE.
- [x] **T11 Thaqalayn URL:** investigated — no constructible deep link (SPA, no per-hadith
      route; `id` doesn't resolve via `/api/v2/hadith/<id>`). Comment added, F-108 → wontfix.
- [x] **No regression:** `npx vite build` passes (3.3s, 121 modules); circuit-breaker
      tests 6/6.

---

## 5. Risk register

| ID | Task | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | T1 | Circuit-breaker state is instance-scoped — a fresh cold-start resets streaks, so a perpetually failing adapter comes back on every deploy | Low-Med | Low | Acceptable: cold-starts reset streaks intentionally; a broken adapter will re-open within 5 requests. Document this clearly. |
| R2 | T2 | Prod coverage does not improve (another adapter is also always-failing) | Low | Med | The probe will surface it. Investigate via admin `?debug=1` to identify which adapter is failing; re-evaluate for quarantine. |
| R3 | T3 | Wikidata is still 429 in prod (rate-limit applies to Vercel IPs) | Med | Low | Quarantine path is ready; clean execution of T3.2 quarantine branch. |
| R4 | T5 | `api/search/mexicana.js` uses a different key name — fix must mirror both files | Low | Low | T5.1 explicitly reads the server route before changing. |
| R5 | T7 | `typeof window === 'undefined'` guard breaks SSR if Vite pre-render is ever enabled | Low | Low | OpenCITE currently does no SSR; guard is correct for the present architecture. Add a comment noting the SSR caveat. |
| R6 | T8 | A thin-shim adapter uses raw `fetch()` without proxy but is incorrectly marked `serverSafe: true` — server-side call fails with CORS/network error | Low-Med | Med | T8.1 mandates reading each file to verify transport before marking. If uncertain, leave `serverSafe` absent rather than guessing. |
| R7 | T8 | Adding BASE to server fan-out significantly increases response time (300M-corpus queries may be slow) | Low | Low | BASE uses proxiedFetch → `api/proxy.js` which has standard timeout. If it adds >3s, consider dropping its `serverSafe` flag for the first sprint and re-evaluating. |
| R8 | T10 | CuratedJournals pageSize change breaks existing offsets stored in client state | Very Low | Low | `useSearch` computes offset from result count; no stored offset that could conflict. |

---

## 6. Definition of done

- [ ] All T0–T11 checkboxes above are ticked or explicitly skipped with rationale.
- [ ] `npx vite build` passes with 0 errors on the final branch state.
- [ ] Coverage probe (`T2`) documents before/after `coverage` bands for 5 queries.
- [ ] Wikidata decision (T3) is documented in `COVERAGE_VERIFICATION_v0_38.md`.
- [ ] F-111 (OpenLibrary no abstract) documented as accepted/wontfix in this sprint log —
      no code change required.
- [ ] No finding in scope has `status: open` in `findings.json` after the sprint
      (statuses: `fixed`, `quarantined`, or `wontfix` with rationale).
- [ ] Commit message references `feat(v0.38): coverage & adapter integrity`.

---

## 7. Dependencies / sequence

```
T0 (DONE) ──► T2 (coverage verification — depends on T0 being in prod)
           └► T1 (circuit-breaker — independent, ships same PR as T0 residuals)

T3 (Wikidata verify) — independent; gates T3b quarantine decision only.

T4–T11 (adapter correctness) — all independent of each other and of T1–T3.
        Can batch in any order. Suggested grouping for a single commit:
        - "IA/Mexicana/BnF/BnF-CORS" (T4+T5+T6+T7, touching same 4 files)
        - "BASE+shims+S2+CURATED" (T8+T9+T10, touching capability blocks)
        - "Thaqalayn URL investigation" (T11, separate — might produce no code change)
```

**Cross-sprint dependencies:**
- v0.35 (RRF ranker) does not block this sprint. The adapter fixes here feed cleaner data
  into the ranker regardless of whether v0.35 is shipped first.
- v0.37 (MCP acquisition funnel) is independent. It consumes the same `/api/search` endpoint
  whose coverage we fix here — shipping v0.38 first means MCP callers get correct billing.
- F-503 (`relevance_labels` missing from migration) — out of scope here but blocks the Gold
  Set Harness in new deployments. Should be a next-sprint quick-win (<0.5h).

---

## Task summary

| Task | Description | Finding(s) | Est. |
|---|---|---|---|
| T0 | Quarantine SciELO/OpenNeuro/ENA | F-107/109/110/208 | DONE |
| T1 | Chronic-failure circuit-breaker | F-208 (recurrence) | 2.5h |
| T2 | Coverage recalculation verification | F-208 | 1.5h |
| T3 | Wikidata production verify | F-208 note | 1h |
| T4 | IA citedBy: null (display fix) | F-104 | 0.5h |
| T5 | Mexicana nextToken→nextPageToken | F-106 | 0.5h |
| T6 | BnF isOA: false | F-114 | 0.25h |
| T7 | Northwestern/ONB CORS guard | F-102 | 1h |
| T8 | BASE + 6 shims serverSafe/corpusSize | F-112 | 1h |
| T9 | ~~S2 protocol~~ SUPERSEDED — S2 quarantined in v0.42 | F-105 | DONE |
| T10 | CuratedJournals pageSize constants | F-103 | 0.5h |
| T11 | Thaqalayn deep-link URL | F-108 | 0.5h |
| — | F-111 wontfix (OpenLibrary no abstract) | F-111 | 0h |
| **Total** | | | **~9.4h** |

---

*End v0.38 sprint plan. T1–T11 remaining (T0 already done). Primary revenue fix (T0) is
already shipped. T1 (circuit-breaker) is the most critical structural fix; T2 confirms the
revenue impact. T4–T11 are correctness improvements that improve data honesty and search
quality.*
