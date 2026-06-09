# Coverage & Wikidata Verification — v0.38 (T2 / T3)

> Companion to `sprint_log_v0_38.md`. T2 (coverage recalc) and T3 (Wikidata prod-verify)
> are **measurement** tasks that must run against **prod** (`https://citation.today`) with an
> **admin API key** — the `/api/search` endpoint is fail-closed (no anonymous access), and only
> an admin identity reads coverage/billing without being metered or rate-capped.
>
> The tooling for both is **code-complete** (`scripts/stress/probe.mjs` extended in T2.1).
> The runs below are left for Shahbaz to execute with the admin key, then paste results in.
>
> **Status:** tooling ready · prod runs PENDING (require admin key).

---

## How to run

```bash
# Coverage band + billed credits for one query (admin key → not metered, reads true band):
KEY=<admin-key> node scripts/stress/probe.mjs --coverage-only "kidney disease"

# Full relevance probe (unchanged behavior):
KEY=<admin-key> node scripts/stress/probe.mjs "kidney disease" 10
```

`--coverage-only` prints `{ q, http, coverage, creditsCharged, count }`.
`creditsCharged` is read from `meta.creditsCharged` in the live envelope.

---

## T2 — Coverage recalculation

### Mechanism (verified on-branch against `coverage.js` + `billing.js`)

The 3 quarantined adapters (SciELO/ENA/OpenNeuro) carried tiny `corpusSize` vs the core
corpora, so their failure was ~0.3% attrition → band **`near-full`** (coverage ≥ 0.99), **not**
`partial`. The real defect: they **threw** on every query, so `failedCount > 0` always, and
`bandFor()` can **never** return `full` (`coverage.js:36`). Every query was billed at
`coverageMultiplier("near-full") = 0.99` instead of `1.0` → a guaranteed **~1% undercharge**
plus a permanently non-`full` coverage signal.

- `freeBelowBand` full-waiver does **NOT** fire from these adapters (plans set
  `freeBelowBand: "limited"`; `isAtOrBelow` waives only the `"limited"` band, coverage < 0.5).
- So this was **never** a "free search / discount" — it was a small systematic undercharge.

### Expected before → after

| | Coverage band | creditsCharged (Pro, creditCost=1) |
|---|---|---|
| **Before** (dead adapters live) | `near-full` | ~0.99 |
| **After** T0 quarantine + T1 circuit-breaker, **no other adapter errors** | `full` | 1.0 |
| **After**, but **some other** adapter times out/errors | `near-full` | ~0.99 |

`full` is only restored on queries where **no** eligible adapter errors. The circuit-breaker (T1)
guarantees a *chronically* dead adapter eventually drops out; a *transient* error on any given
query still pins that query at `near-full`. **T2 measures the `full` vs `near-full` split and the
0.99×→1.0× charge delta — NOT `partial` vs `full`.**

### T2.4 — denominator sanity (read-only, confirmed)

The 3 dead adapters had no `corpusSize`, so they each contributed `FALLBACK_CORPUS = 1` to the
denominator. Removing them changes the corpus-weight denominator by ~3 out of hundreds of
millions — i.e. **unchanged** coverage ratio. Their removal's only effect is eliminating the
`failedCount > 0` trigger that forced a non-`full` band. ✓ Correct outcome.

### Before-snapshot (PENDING — run pre-deploy or note that T0 is already in prod)

| Query | coverage | count | creditsCharged |
|---|---|---|---|
| kidney disease | _TODO_ | | |
| mughal empire | _TODO_ | | |
| climate change 2020 | _TODO_ | | |
| neural networks | _TODO_ | | |
| hadith compilation | _TODO_ | | |

### After-snapshot (PENDING — after v0.38 deploy)

| Query | coverage | count | creditsCharged |
|---|---|---|---|
| kidney disease | _TODO_ | | |
| mughal empire | _TODO_ | | |
| climate change 2020 | _TODO_ | | |
| neural networks | _TODO_ | | |
| hadith compilation | _TODO_ | | |

**Pass criterion:** ≥ 4/5 queries return `full` or `near-full`, and `creditsCharged > 0` on all
non-admin queries (run a 2nd pass with a *non-admin* key to confirm billing, since admin is
cost-0). If a query stays `near-full`, check `?debug=1` → `debugMeta.coverage.failedCount` +
`circuitBreaker`/`cbDropped` to identify which other adapter errored.

---

## T3 — Wikidata production verification

`wikidata.js` makes 3 sequential MediaWiki calls per search; locally it returns **429**
(rate-limited). Prod (Vercel Functions) has a different outbound IP, so verify there before any
quarantine decision.

```bash
KEY=<admin-key> node scripts/stress/probe.mjs "medieval manuscripts" 5   # 3× runs, ~30s apart
# OR direct, to see the debug envelope per-adapter telemetry:
curl -H "x-api-key: <admin-key>" \
  "https://citation.today/api/search?q=medieval+manuscripts&sources=WIKIDATA&debug=1&limit=5"
```

### Decision tree

- **Any run returns `results.length > 0`** → KEEP. Add a comment to `wikidata.js` noting
  "429 locally, works in prod (verified <date>)." No code change.
- **All 3 runs return HTTP 429 / 0 results + 429** → QUARANTINE per policy: copy
  `src/adapters/extensions/wikidata.js` verbatim to
  `docs/wiki/99-Archive/_quarantine/adapter-wikidata.md`, mark a `findings.json` entry
  (ref F-208) `status: quarantined`, remove from `ADAPTERS` + the extensions barrel, build-verify.
  **Note:** the T1 circuit-breaker will *also* auto-drop Wikidata after 5 consecutive prod
  failures — so even if quarantine is deferred, the billing impact is now self-correcting.
- **Transient/mixed 429** → keep + add a `User-Agent`/backoff comment, monitor.

### Results (PENDING)

| Run | http | results.length | notes |
|---|---|---|---|
| 1 | _TODO_ | | |
| 2 | _TODO_ | | |
| 3 | _TODO_ | | |

**Decision:** _TODO_

---

## Summary

| Task | Code | Prod measurement |
|---|---|---|
| T2 probe tooling (`--coverage-only`, `KEY`) | ✅ done | ⏳ pending admin-key runs |
| T2 coverage mechanism + denominator math | ✅ verified on-branch | — |
| T1 circuit-breaker (makes `full` reachable + self-corrects Wikidata) | ✅ done + unit-tested | ⏳ observe `cbDropped` in debug |
| T3 Wikidata decision | gated on prod runs | ⏳ pending |
