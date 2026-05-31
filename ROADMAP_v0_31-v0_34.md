# OpenCITE Roadmap — v0.31 through v0.34

**Status:** v0.30 shipped (monetization + origin-blind API). **v0.31 SHIPPED 2026-05-31.** v0.32–v0.34
planned. **Next up: v0.32.**  
**Prepared:** 2026-05-31 (Mode C planning session)

---

## The roadmap at a glance

```
v0.31 ✅ SHIPPED  →  v0.32 (A+B) ◀ NEXT  →  v0.34 (A–D)
                          ↓
                        v0.33 (T1)
                          ↑
                       (depends on v0.32 debug)
```

**v0.31 and v0.33 are independent; v0.34 depends on v0.32's source-tier-gating.**

---

## Sprint breakdown

### v0.31 — Relevance controls (browser UI) ✅ SHIPPED 2026-05-31
**Effort:** ~1 day, 4 deploy rounds  
**Status:** **SHIPPED** — live on `citation.today`. Full actuals in `sprint_log_v0_31.md` §9;
architecture in `architecture_report_v0_31.md`.  
**Delivered (expanded past the original T1 plan under live feedback):**
- **`Lexical↔Semantic` slider relocated to an always-visible `SearchControls` bar under the search
  box** (not buried in Settings). Live RRF re-fuse on drag (no re-embed), gated when semantic off,
  one-POST-per-commit persistence (`rrfSemanticWeight`, default 0.4).
- **Semantic + synonym ranking ON by default** (one-time `searchDefaultsV31` migration flips existing
  users). Cost: ~23MB model on first search (cached), surfaced via a "preparing model" hint.
- **No populate-then-reshuffle:** results are held until the final sort is known (`resultsReady` gate).
- **Quick "Search settings" disclosure** under the slider (Semantic/Synonym/Author toggles).
- **Fix:** Crossref now respects author-search-off (new `hasContentMatch` SSOT in `scoring.js`).

**Files touched (8):** `SearchControls.jsx` (new) · `App.jsx` · `useSemanticRerank.js` ·
`useSettings.js` · `defaults.js` · `Panels.jsx` · `scoring.js` · `crossref.js`.  
**Deferred (T2):** BM25F field-weight sliders + K1/B (need `scoring.js` refactor that also unblocks
v0.33 F3 tunable playground). Lands as an "Advanced" section in the `SearchControls` disclosure.

**Independence:** None — worked in isolation, blocks nothing. Done.

---

### v0.32 — Credit meter wiring + admin debug (backend)
**Effort:** ~2 days (WS-A billing + WS-B debug)  
**Status:** Planned  
**Scope:** Complete the monetization loop and give Shahbaz an admin "control panel" for testing.

**WS-A:** Wire the full v0.30 billing stack (`apiAuth`, `billing`, `ratelimit`, `cache`) into
`api/search.js` — the middleware chain from request auth through settle + refund-on-failure.
- Per-user keys minted via `api/keys` now authenticate on `/api/search`.
- Charge `creditCost` (1 per search); settle to coverage-prorated amount; refund on error (never silent burn).
- Source tier enforced: free users see `core` only; paid see `all` (the tier-gating that v0.34 depends on).

**WS-B:** Admin identity (`admin` plan, `creditCost:0`, uncapped) + debug mode (`debug=1` → origin-revealing
cards + `meta.debug` telemetry: per-adapter timing, dedup trace, coverage internals). Strict admin-only
gate; non-admin `debug=1` is silently ignored.

**Files touched:** `api/search.js` (middleware chain), `plans.js` (admin plan + tier enum), `apiAuth.js`,
`billing.js`, `ratelimit.js`, `cache.js` (all dormant → active), new `api/_shared/debugResult.js`, new
`scripts/admin/probe.mjs` harness.

**Deferred (WS-C):** Admin console UI (v0.33).

**Independence:** Blocks v0.34 (tier-gating prerequisite). Independent of v0.31 and v0.33.

---

### v0.33 — Admin console (browser UI, data from v0.32)
**Effort:** ~1.5 days (T1: F1 + F2; ~5 days total if all tiers shipped)  
**Status:** Brainstorm → scoped to T1  
**Scope:** Human-facing console on top of v0.32's debug envelope so Shahbaz can see ranking behavior and
measure tuning changes.

**T1 (this sprint):**
- **F1 — Score Explainer:** paste a query → ranked list with per-result score math (BM25F per-field,
  phrase/proximity/thin-source bonuses, RRF inputs, confidence-gate disposition).
- **F2 — Gold-Set Regression Harness:** saved queries with known-good rankings; one click runs them live
  and reports nDCG@10 / MRR / recall@N vs. baseline. The objective gate for tuning changes.

**T2 (menu):** F3 (tunable playground: RRF + BM25F live sliders), F4 (A/B scoring diff), F5 (adapter
health dashboard), F6 (single-adapter isolate), F7 (dedup inspector).

**T3 (menu):** F8 (labeling UI to build the gold set), F9 (coverage band calibration).

**Files touched:** new admin console route group, new `relevance_labels` table (migration), renders the
v0.32 debug contract only (no new origin-blind risks).

**Dependency:** v0.32 (debug envelope is the data source).  
**Independence:** Orthogonal to v0.31 and v0.34.

---

### v0.34 — Backend-keyed sources + Settings declutter (backend + adapter edits)
**Effort:** ~1.75 days (WS-A–D)  
**Status:** Planned  
**Scope:** Ship 3 CC0 sources (Europeana, DPLA, Smithsonian) to the paid API with keys as env vars only
(no Settings UI). Move Rijksmuseum to keyless API. Simplify the Settings panel.

**WS-A:** Dedicated per-source backend endpoints (`api/search/<source>`) that own the upstream call
(keys read server-side, never exposed to client). Browser app routes those sources through these
endpoints (same-origin, no CORS). One adapter implementation, branches on context (`typeof window`).

**WS-B:** `serverSafe:true` + corpus-weighted + placed in the **paid (`all`) tier** of v0.32's
source-gating. Presence-guard: missing key ⇒ graceful drop (no false coverage band hit). Europeana
auto-activates on key add (no redeploy).

**WS-C:** Rijksmuseum → keyless Linked-Art API (two-step resolve, capped to page size, reuses the Met
pattern).

**WS-D:** Remove 4 key fields from `DEFAULT_SETTINGS`; comment-lock CORE/NDLI at `serverSafe:false`
with cross-ref to `TOS-items.md` D7/D8. Only CORE + NDLI per-user keys remain (both web/app-only).

**Files touched:** three adapters + rijksmuseum (refactor to `serverKeys.js` injected keys + browser
shim), new `api/_shared/serverKeys.js`, new `api/search/{europeana,dpla,smithsonian}.js` handlers,
`api/search.js` (inject keys + presence-guard), `defaults.js` (drop 4 fields).

**Dependency:** v0.32 (tier-gating must exist to place the three in paid tier).  
**Independence:** Orthogonal to v0.31 and v0.33.

**Architecture principle:** the fix to "why would we inject keys into a public proxy" — we don't.
Dedicated backend endpoints own the upstream call; keys are read from `process.env` server-side, just like
every other secret. Browser never touches them.

**Note on skipped sources (Wave-3 go/no-go):**
- **CORE:** web/app-only (requires license + attribution, conflicts with origin-blind). See
  `TOS-items.md` D7.
- **NDLI:** excluded (non-commercial + individual-credential model). See `TOS-items.md` D8.

---

## Execution order

1. ~~**v0.31** or **v0.32** can start independently~~ — **v0.31 is SHIPPED.**
2. **v0.32 is NEXT.** Wires credit *spend* into `api/search.js` + admin debug envelope.
3. **v0.32 must complete before v0.34.** (v0.34 needs tier-gating.)
4. **v0.33 must wait for v0.32** (consumes the debug envelope).
5. **v0.34 can start once v0.32 is live** (no other dependencies).

**Remaining serial:** **v0.32** → v0.34 → v0.33 (admin console as the polish pass, refining tuning
decisions made during v0.34 launch).

---

## The bigger picture

After v0.34:
- **API:** Monetization cycle complete (meter wired, billing flows, 3 new paid sources).
- **App:** Cleaner Settings, 3 more sources in browser, Rijksmuseum keyless (future upgrade path).
- **Admin:** Debug infrastructure in place; admin console ready to build on it (v0.33).
- **Relevance:** Live slider in the app (v0.31); tuning playground ready to build in v0.33.

**Out of scope (future):**
- Wave 4 (+4 Edge-port: Gallica, British Library, OpenContext, OpenEdition).
- Relative score floor (needs A/B testing via v0.33 console).
- Student verification (SheerID / VerifyPass).
- Agent billing (SIWE, `agent_wallet_address`).
- Key-management dashboard UI.

---

## Key docs

- **`sprint_log_v0_31.md`** — full T1 spec (slider, deps, risks, acceptance).
- **`sprint_log_v0_32.md`** — full WS-A + WS-B (meter pipeline, admin debug, test loop).
- **`sprint_log_v0_33.md`** — brainstorm + T1 scope (F1, F2, the menu for T2/T3).
- **`sprint_log_v0_34.md`** — full WS-A–D (dedicated endpoints, no-key-exposure principle).
- **`TOS-items.md`** — source go/no-go (D6 rule, D7–D8 decisions, per-source findings table).
- **`wave3_sources_decision.md`** (memory) — Wave-3 go/no-go rationale.
- **`project_v0_34_sprint.md`** (memory) — v0.34 summary for quick reference.

---

*Prepared in Mode C (plan). Ready for approval before execution.*
