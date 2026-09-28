# Sprint v0.44 — Engine Teardown & Honest Docs

**Date:** 2026-06-09 · **Authorized by:** Shahbaz (verbal: "kill v0.35; deprecate search-engine improvements; revert API & web to raw pass-through + DOI dedupe; do it") · **Status:** CLOSED 2026-09-28 (see §Actuals)

## Rationale (one paragraph)

The full-stack adversarial audit (2026-06-09) found: the v0.35 relevance sprint never merged but is documented as live; the browser and API run two divergent ranking engines (the free one strictly better than the paid one); the ranking layer (BM25F + synonyms + RRF + semantic + confidence gate) is the source of most open defects (incomparable scores, synonym noise passing the gate, downloads-as-citations, untuned constants) while the v0.36 diagnostic already established that retrieval + dedup are healthy. Decision: **deprecate the ranking layer entirely.** Both surfaces become *retrieval → normalize → dedupe (DOI-first) → native upstream order*. Search quality now comes from the sources' own relevance ranking, which is what the raw-mode diagnostic showed was good.

## Decisions of record

| # | Decision | Why |
|---|---|---|
| D-1 | Kill branch `sprint/v0.35-relevance-integrity`. Tip SHA recorded for recovery: **`eeda1151a67e7ed3bf9abe2820d85dcdb14fcf68`** (recoverable via SHA even after branch deletion). | Unmergeable (376-file conflict), documented-as-shipped fiction poisoning ledger + wiki. |
| D-2 | "DOI dedupe" = keep the existing healthy dedup module (DOI key first, title-fingerprint second) with one fix: **normalize the DOI key** (trim, lowercase, strip `doi.org/` prefix). First-wins streaming on client; pooled first-wins + field-merge (`mergeRecords`) on server. | Dedup was verdict-HEALTHY in v0.36; title fingerprint catches dual-DOI works. Dropping it would reintroduce visible dupes. |
| D-3 | Pass-through order: native upstream order within each source; **round-robin interleave across sources** for unified/API output (result #1 of each source, then #2, …). | Pure concatenation would let registry order starve the `limit`; interleave is the fairest order-preserving merge. |
| D-4 | Deleted engine files go to `docs/wiki/99-Archive/_quarantine/v0_44_engine/` per the existing quarantine convention. | Reversible; consistent with v0.38/v0.42. |
| D-5 | `?simple=1`, `simpleSearch`, the Lexical↔Semantic slider, synonym/semantic toggles are **removed** (raw is now the only pipeline, so the diagnostic mode and its UI are meaningless). | Self-flagged "remove before public release"; now redundant. |
| D-6 | Coverage-band billing, cache, circuit breaker, debug telemetry, citation formats: **unchanged.** They are retrieval/billing concerns, not ranking. | Out of scope; v0.45 owns billing hardening. |
| D-7 | Public API contract: `score` and `lowConfidence` fields **removed**; `coverage`, `count`, `results` unchanged. APP_VERSION → `v.44`. | Score was raw cross-query-incomparable BM25F — misleading to consumers. |
| D-8 | Deferred (explicitly NOT in this sprint): CURATED/OpenAlex double-call fold-in, Thaqalayn/OpenEdition/ONB strip decisions, theming unification, `withEndpoint` wrapper, server AbortController threading, money-path hardening (→ sprint v0.45, plan written this sprint). | Scope control. |

## Tasks

### T1 — Kill v0.35 (owner: main session)
- Delete `sprint/v0.35-relevance-integrity` locally and on origin. Record tip SHA above.
- Findings F-200/F-202/F-203/F-204 (ranking defects "fixed on branch") → re-statused in T7 as `moot` (engine deprecated) — never merged, now never will be.

### T2a — Server pass-through (`api/search.js` + render/contract modules)
- Remove scoring/gate: no `scoreResults`, `meaningfulTerms`, `applyConfidenceGate` imports; no `_score` sort.
- Dedupe: `dedupHighestScore` retained (degrades to first-wins + field-merge with no scores) — DOI key then title fingerprint, as today.
- Order: round-robin interleave per-adapter native-order lists (D-3), then `limit`.
- Remove `simpleMode` entirely. Keep `debug` (telemetry minus score fields).
- `publicResult.js`/`debugResult.js`: drop `score`/`_scoreBreakdown`; `apiContract.js` docs updated.
- Response body: drop `lowConfidence`.
- Keep: fan-out, `withTimeout`, coverage, billing flow, cache, canonicalizeDois (env-gated), formats.

### T2b — Client pass-through + frontend correctness (src)
- `useSearch.js`: drop scoring/synonyms/gate; keep streaming dedup (D-2); remove `simple` branches. **Fix F-A3/A4:** `loadMore` gets the `searchIdRef` stale-guard, and the executed query is stored in the hook (set in `search()`), so `loadMore(adapterId)` no longer trusts the live input box. Call sites updated.
- Delete (→ quarantine): `lib/scoring.js`, `lib/rrf.js`, `lib/synonyms.js`, `lib/semantic.js`, `hooks/useSemanticRerank.js`, `workers/embed.worker.js`, `workers/synonyms.worker.js`, `public/synonyms/` (29 MB), `components/admin/ScoreExplainer.jsx`. Verify no survivor imports any of them (`langNormalize.js`, `goldSetMetrics.js`: delete if orphaned, keep if still imported).
- `lib/dedup.js`: normalize `doiKey` (D-2); update `dedup.test.js` expectations (not run locally per operating rules).
- `App.jsx`: remove rrfWeight/semantic/simple wiring; `resultsReady` = `allDone`; `sortedAdapters` ranks by result count only; **hash routing made reactive** (`useSyncExternalStore` on `hashchange`, no reload-to-exit); `handleRerun` also resets `filterState`; `AdminConsole` → `React.lazy` + `Suspense`.
- `SearchControls.jsx`: remove slider + synonym/semantic/simple toggles; keep view-mode + author-search.
- `useFilters.js`: remove gate-derived `anyGenuine` logic; sorts = native (default) / year / citations.
- `UnifiedResultList.jsx`: default order = round-robin interleave across sections (D-3); remove `_score`/citedBy tie-break sorting; keep year/citations explicit sorts.
- `ResultCard.jsx`: wrap in `React.memo`; memoize `buildMLA`/`buildAPA`.
- `Panels.jsx`: fix the false "never sent anywhere" privacy copy (settings sync to the server when signed in).
- `constants/defaults.js`: remove `synonyms`, `semanticSearch`, `rrfSemanticWeight`, `searchDefaultsV31`, `simpleSearch`. Stale keys in saved settings are inert. APP_VERSION → `v.44`.
- `AdminConsole.jsx`: drop ScoreExplainer tab; GoldSetHarness stays (recall grading is ranking-independent).

### T3 — Backend discretionary fixes (api/_shared)
- `auth.js`: replace the `getSession` HTTP loopback self-call with **in-process** session resolution (read the Auth.js session cookie, look up the session via Prisma — same data the loopback round-trip produced). Behavior-identical contract for all callers.
- `handlers/credits.js`: stop serializing `Infinity` (→ `{ credits: null, unlimited: true }`); DB errors return 503, not fake `200 free`. `BillingContext.jsx`/CreditsChip handle `unlimited`.
- `handlers/settings.js`: route the body through `parseBody` (64 KB cap) like every other POST route (closes F-405).

### T5 — Adapter integrity
- Quarantine **BDH** (live-probed 403), **BRITISH_LIBRARY** (live-probed hang), **MEXICANA** (live-probed expired TLS cert): unregister from `src/adapters/index.js`, move adapter files + `api/search/{bdh,bl,mexicana}.js` to quarantine (D-4).
- `internetArchive.js`: remove `sort=downloads+desc` (native relevance order — critical now that retrieval order IS display order) and stop stuffing download counts into `citedBy`.
- Client timeout discipline: `proxiedFetch` + the core adapters' direct fetches get a 15 s `AbortSignal.timeout`. (Server signal-threading deferred, D-8.)

### T4 — Money-path hardening plan (PLAN ONLY → `sprint_log_v0_45.md`)
Spend journal, pre-auth reconciliation, webhook P2002 scoping, monthly-grant race fix, one billing philosophy for upstream outages (search vs citations). Written this sprint, executed when Shahbaz approves.

### T7 — Docs strip + wiki rules
- Delete `docs/wiki/99-Archive/*` **except** `TOS-items.md`, `_quarantine/`, `SEARCH_DIAGNOSTIC_v0_36.md` (git history keeps the rest).
- Replace the six engine pages (`RRF-Fusion`, `Semantic-Rerank`, `Semantic-Server-Spike`, `Synonyms-Vocab`, `Ranking-Scoring`, `Confidence-Gate`) with one short `03-Search-Pipeline/Pipeline.md` describing the pass-through design.
- Correct the audited-false pages (System-Architecture, Search-Endpoint, Adapter-Health-Matrix, Health-Dashboard, Known-Defects) to post-v0.44 reality — per the new rules: no line numbers, no counts, no code walkthroughs.
- Findings fragments: ranking findings → `moot (engine deprecated v0.44)`; F-405 → fixed; corpse adapters → quarantined. Rebuild machine map.
- Hygiene: `git rm --cached` the four `.claude/worktrees/agent-*` gitlinks + ignore; delete `_verify_ia.mjs`, stray temp JSONs; move root `sprint_log_v0_38–43.md` + `COVERAGE_VERIFICATION_v0_38.md` to `docs/wiki/10-Sprints/`; placeholder emails in `.env.local.example`; trim quarantined `AUTH_APPLE_*`/`AUTH_MICROSOFT_*` from `.env.example`, add `NCBI_API_KEY`.
- Author `docs/wiki/WIKI-RULES.md` (content rules, below).

## Wiki content rules (T7 deliverable, summary)

1. Document **merged `main` only** — never branch or planned behavior.
2. A page states **purpose, contract, invariants** — never narrates implementation. Link the file; the source is the walkthrough.
3. **No facts that rot:** no line numbers, no counts, no export tables, no quoted code blocks.
4. **One fact, one home:** statuses live in the findings ledger; narrative lives in the sprint log; pages link, never copy.
5. Point-in-time data (probes, dossiers) is **evidence, dated** — not living truth.
6. A verification claim must cite the command and commit it was run against.
7. Delete, don't archive — git history is the archive.
8. If a page would be stale after one sprint, it shouldn't exist.

## Acceptance

- `grep -r "scoreResults\|applyConfidenceGate\|expandTerms\|useSemanticRerank\|rrfSemanticWeight\|simpleSearch" src api` → no hits outside quarantine.
- `api/search.js` returns interleaved native-order results, no `score`/`lowConfidence` fields; billing/coverage/cache untouched.
- BDH/BL/MEXICANA absent from `ADAPTERS`; IA query has no `sort=` param.
- `node scripts/wiki/build-machine-map.mjs --check` passes.
- Working tree only — **no commit, no deploy** until Shahbaz says so.

## Actuals (§filled at close)

**Closed 2026-09-28 by the adversarial audit (docs/audit-2026-09-04/REPORT.md).**

- **Deployed before commit.** Production ran this tree from Vercel deployment `dpl_2ZTVC6KJHiFH9NKFBvdHni3q82P3` (2026-06-10, `vercel --prod` from the dirty tree) — the acceptance line "no commit, no deploy" was violated on the deploy half. Six files were edited after that deploy, so prod was a mid-sprint snapshot; the commit that closes this log is the first reproducible v0.44 state.
- T1: v0.35 tip `eeda1151a67e7ed3bf9abe2820d85dcdb14fcf68` is preserved as tag `archive/v0.35-tip` (it had become unreachable). D-1 rationale corrected: `git merge-tree` shows a 5-file conflict, not 376.
- T2a/T2b/T3/T5: shipped as described. Acceptance greps pass (no engine symbols outside `_quarantine`; BDH/BL/MEXICANA unregistered; IA carries no `sort=`).
- T7: ledger re-status (F-200/201/202/203/204/205/207/209 → `moot`, F-405 → `fixed`, F-106/F-408/F-409 → `quarantined`, 14 dead module records → `quarantined` virtuals, `contentMatch` record added) done 2026-09-28; `build-machine-map.mjs --check` green. Sprint logs moved here from repo root; stray root files removed; `.env.example` corrected.
- Not done in this sprint: the Actuals of T2/T3 prod verification for v0.38 (`COVERAGE_VERIFICATION_v0_38.md`) remain pending an admin key run.
