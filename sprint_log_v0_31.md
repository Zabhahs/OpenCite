# OpenCITE — Sprint Log v0.31

> **PM + architecture document for the next Claude instance(s).** Self-contained execution plan for the
> **user-facing relevance controls** sprint — giving the user direct, transparent control over how
> results are ranked.
> Read `architecture_report_v0_29.md` first for project context, then this. (v0.30 = API monetization;
> independent of this sprint — different files, no collision.)
>
> **Created:** 2026-05-30 · **Status:** ✅ SHIPPED 2026-05-31 (T1). T2 carried forward.
> **Mode:** C (plan → approval → execute → checklist). No padding; precise execution.

---

## 0. TL;DR

**Goal:** give the user "ultimate control" over result ranking via settings-panel sliders, with a
reset-to-defaults. Ship in two tiers; **T1 only this sprint.**

| Tier | Control | Effort | This sprint? |
|---|---|---|---|
| **T1** | RRF **lexical ↔ semantic** balance slider | ~½ day | **Yes** |
| **T2** | BM25F field weights (title/abstract/keywords) + K1/B | ~1.5 day | No — §5 (needs `scoring.js` SSOT refactor) |

**Thesis:** the two scoring regimes live in different places and differ wildly in exposure cost.
The RRF fusion weights are already runtime args (`fuseRanks`) — exposing them is cheap, safe, and
high-perceived-value. BM25F constants are baked into the shared scorer and ripple into phrase/
proximity/thin-source bonuses + the confidence gate — defer.

---

## 1. The dichotomy under user control (T1)

A single slider over **one axis: lexical ↔ semantic**.

```
Lexical  ●───────────────────────────  Semantic
(BM25 keyword)        ▲              (embedding meaning)
                   default 0.4
```

- **Left edge (0.0)** = pure lexical: ranking is BM25F keyword relevance only.
- **Right edge (1.0)** = pure semantic: ranking is embedding-similarity only.
- **Default 0.4** = today's hardcoded behavior (lexical 0.6 / semantic 0.4).

**Hard requirement: the slider is labeled `Lexical` on the LEFT and `Semantic` on the RIGHT.**
That labeling *is* the mental model we're exposing — do not invert, do not relabel to
"keyword/meaning" in the control track (help text may add a plain-English gloss).

Implemented as the semantic weight `x`: `fuseRanks(..., [{lexical, 1 - x}, {semantic, x}])`.

---

## 2. Architecture truth (why T1 is cheap)

- RRF weights are **pure runtime args** to `fuseRanks` (`src/lib/rrf.js`), currently hardcoded
  `0.6 / 0.4` at `src/hooks/useSemanticRerank.js:54-55`.
- The slider only matters when **semantic search is on**. With it off, the order comes straight
  from BM25F (`fuseRanks` is never called) — so the control must be gated/disabled in that state.
- Embeddings are the expensive step; **rank fusion is just arithmetic over already-computed ranks.**
  If we cache the two rank maps per search, a slider drag re-fuses instantly — no re-fetch, no
  re-embed. This is the core refactor (§4, Task 2).
- `DEFAULT_SETTINGS` is the SSOT default; `useSettings` merges `defaults → local → DB`, so a new
  key back-fills automatically for existing users — **no migration.**

---

## 3. Key constraint — persistence frequency

`useSettings.save()` (`src/hooks/useSettings.js:121`) writes localStorage **and** fires a
fire-and-forget POST to `/api/settings` on **every** call for signed-in users. A slider wired
straight to `save` would spam the API on every drag tick. Resolution:

- **Live value** drives fusion immediately (local React state, seeded from `settings.rrfSemanticWeight`).
- **Persistence** on commit only (`onPointerUp` / change-end) or debounced ~400ms.

So the fusion weight flows from a *live* value, not directly from the persisted `settings` object.

---

## 4. T1 — execution

**Files touched (4):**

1. **`src/constants/defaults.js`** — add `rrfSemanticWeight: 0.4` to `DEFAULT_SETTINGS`.
2. **`src/hooks/useSemanticRerank.js`** — split the single effect:
   - *Expensive effect* (deps `sectionStates`, `enabled`): compute + **cache** `lexicalRanks`,
     `semanticRanks`, flat `allResults`. Embedding here; keep the `didRerankRef` guard.
   - *Cheap effect* (deps cached ranks + `weight`): `fuseRanks` + `setRerankedStates`. Instant.
   - Accept `weight` arg; fuse as `[{lexical, 1 - weight}, {semantic, weight}]`.
3. **`src/App.jsx`** — hold live weight state (seeded from `settings.rrfSemanticWeight`), pass to
   `useSemanticRerank` (line 55) + pass current value & commit handler to `SettingsPanel` (line 236).
4. **`src/components/Panels.jsx`** — slider section in `SettingsPanel`, directly under the
   "Semantic search" block (lines 301-322), matching existing label/help/control styling.

**Task breakdown (ordered):**

- [x] **T1.1** Add `rrfSemanticWeight: 0.4` default. *(trivial — Haiku agent)*
- [x] **T1.2** Refactor `useSemanticRerank` into expensive/cheap effects with rank caching + `weight`
      param. *(core, highest risk — Opus, in-house)*
- [x] **T1.3** Thread live weight + commit handler through `App.jsx`. *(Opus, in-house)*
- [x] **T1.4** Build slider UI: range 0–100 (→ 0.0–1.0), **`Lexical` label hard-left, `Semantic`
      label hard-right**, live numeric readout, **Reset** link. *(Sonnet agent)*
- [x] **T1.5** Gate the control: when `semanticSearch` is off, render disabled/greyed with note
      ("Enable Semantic search to use this"). *(Sonnet agent)*
- [ ] **T1.6** Manual browser verification (§6) — **pending Shahbaz** (compile/build verified green).

---

## 5. Out of scope — T2 (next sprint)

BM25F field weights (`FIELD_WEIGHTS = {title:3, abstract:1, keywords:2}`), `K1`, `B` —
`src/lib/scoring.js:4-7`. Deferred because:

- `scoreResults` is the **SSOT shared by the UI and `api/search.js`** — must refactor to accept
  weight overrides (defaulting to current constants so server behavior is unchanged).
- Threading required through **both** call sites in `useSearch.js` (search *and* loadMore) and
  retaining raw deduped results in memory to re-score without re-fetching.
- Field weights also feed the phrase/proximity/thin-source bonuses (`scoring.js:124,154,229`) and
  the confidence gate **drops zero-score results** (`scoring.js:53`) — so weight changes can
  *add/remove* results, not just reorder. Surprising; needs careful UX.
- When semantic is on, BM25 weights only shuffle the *lexical input* to RRF — subtle effect.

Surface T2 as an "Advanced" disclosure below the T1 slider when it lands.

---

## 6. Acceptance criteria (T1)

- [ ] Slider labeled **`Lexical` (left) ↔ `Semantic` (right)**.
- [ ] With semantic on, dragging reorders results **instantly** — no `/api/search` call, no model
      reload / re-embed on drag.
- [ ] Left edge (0) = pure BM25 order; right edge (100) = pure semantic; default 40 == today's behavior.
- [ ] Value persists across reload (localStorage); signed-in users fire **exactly one** POST per
      commit, not per tick.
- [ ] **Reset** returns to 0.4 and re-fuses.
- [ ] Slider disabled with explanation when semantic search is off.
- [ ] Works in both unified and source views (fusion feeds both via `effectiveStates`).

---

## 7. Risk register

| ID | Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | T1.2 | Hook refactor breaks "embed once / re-fuse many" — wrong dep arrays re-embed on every drag (slow) or fail to re-fuse (dead slider) | Med | High | Split expensive/cheap effects with explicit deps; verify no re-embed on drag |
| R2 | T1.2 | Stale fusion after a new search (cached ranks not cleared) | Med | Med | Extend existing reset-on-loading logic to clear the rank cache |
| R3 | T1.2 | Per-section slicing breaks on re-fuse | Low | Med | Preserve count-based slice (`useSemanticRerank.js:58-65`) |
| R4 | T1.3 | Slider persists per-tick → API/localStorage spam (see §3) | Med | Med | Live local state for fusion; commit/debounced persist only |
| R5 | UX | Slider has no visible effect when semantic is off → looks broken | Med | Low | Disable + explanatory note (T1.5) |

---

## 8. Definition of done

- [x] `Lexical ↔ Semantic` slider, correctly labeled (lexical left / semantic right), live readout,
      reset-to-0.4. **(Relocated mid-sprint from `SettingsPanel` → always-visible `SearchControls`
      under the search bar — see §9 round 2.)**
- [x] Instant re-fusion on drag (no re-fetch / re-embed).
- [x] `rrfSemanticWeight` persisted, back-filled for existing users, one POST per commit.
- [x] Disabled state when semantic search is off.
- [x] Both view modes respected.
- [x] This log updated with actuals; T2 carried forward.

---

## 9. Actuals — SHIPPED 2026-05-31 (4 rounds, all live on `citation.today`)

> The sprint started as the §4 T1 plan (slider in Settings) but expanded under live user feedback
> into a relevance-controls UX overhaul + two bug fixes. All four rounds deployed to prod via
> Vercel auto-deploy on `main`. Full architecture in **`architecture_report_v0_31.md`**.

**Commits (on `main`, in order):**
| SHA | What |
|---|---|
| `60b0963` | T1 as planned — `Lexical↔Semantic` slider inside `SettingsPanel` |
| `bec4a6c` | **Round 2** — relocate controls under the search bar (`SearchControls`) + default semantic/synonym **on** |
| `2ffcfbf` | **Round 3** — hold results until final sort (no populate-then-reshuffle) + "preparing model" hint |
| `d626027` | **Round 4** — `fix(crossref)`: respect author-search-off (drop author-only matches) |

**Parallelization:** Opus owned the coupled architectural spine each round (the rerank hook, App
wiring, the results gate, the scoring helper); Haiku took the trivial `defaults.js` edits; Sonnet
built the round-1 slider UI against a frozen props contract. Coupled JSX surgery (Panels relocation,
results-gate restructure) stayed in-house.

### Round 1 — slider (`60b0963`)
- `useSemanticRerank(sectionStates, query, enabled, semanticWeight = 0.4)` split into **expensive**
  (deps `[sectionStates, enabled]`: embeds + builds `lexicalRanks`/`semanticRanks`, snapshots section
  shape into `fusionInputs` state) and **cheap** (deps `[fusionInputs, semanticWeight]`: pure
  `fuseRanks` + re-slice). Slider drag hits only the cheap effect → **no re-embed/re-fetch** (R1).
  `fusionInputs` cleared on new-search + toggle-off (R2); per-section slice preserved (R3).
- `fuseRanks` weights `[{lexical, 1−w}, {semantic, w}]`, `w` clamped `[0,1]`.
- Persistence (R4): `App` holds live `rrfWeight`; `onChange` → live `setRrfWeight` (drives fusion,
  no persist); pointer/key/touch-up → `onRrfWeightCommit` → single `saveSettings` (one POST/commit).

### Round 2 — relocation + always-on defaults (`bec4a6c`)
- **`src/components/SearchControls.jsx` (NEW):** renders **permanently under the search bar**. The
  `Lexical↔Semantic` slider is always visible; a **"Search settings ▾" disclosure** beneath it holds
  the Semantic / Synonym / Author toggles + an "All settings →" link. Local `Toggle` helper (DRY).
- **`defaults.js`:** `semanticSearch: true`, `synonyms: true` (were false), + `searchDefaultsV31: true`.
- **`useSettings.load()` one-time migration:** existing users whose saved settings predate the
  always-on defaults get `semanticSearch`+`synonyms` flipped **on** once (guarded by
  `searchDefaultsV31`), then their later toggles are respected. Critical: this also flips the
  founder's own stale `localStorage` so the change is actually visible.
- **`Panels.jsx`:** removed the slider + Synonym/Semantic/Author blocks from `SettingsPanel`
  (relocated, no duplication). **Result layout, sources, keys, curated journals stay in Settings.**
- **`App.jsx`:** `<SearchControls>` mounted directly under `<SearchInput>`; slider props dropped
  from `<SettingsPanel>`.

### Round 3 — no reshuffle + model hint (`2ffcfbf`)
- **`resultsReady` gate in `App.jsx`:** the result list is **held until the final sort is known** —
  reveal only once all adapters settle **and** (semantic on) the RRF fuse completes. Zero-result and
  BM25-only paths reveal at settle. While waiting: `SearchStatusBar` progress + a *"Ranking results…
  preparing semantic model (first run downloads ~23MB, then cached)"* hint during the embed.
  `FilterBar` also gated on `resultsReady`.
- **`useSemanticRerank` failure is now terminal** (`rerankStatus: "error"`) so the gate falls back to
  BM25F order instead of waiting forever.

### Round 4 — Crossref author-search-off fix (`d626027`)
- Bug: `"kutchi memon"` with author search off still surfaced papers matched on author surname
  "Memon". Crossref has no title-only index → queries `query.bibliographic` (author-inclusive); when
  no hit carried the term in title/abstract, `applyConfidenceGate`'s low-confidence fallback
  resurfaced the author matches.
- **`scoring.js`:** new `hasContentMatch(result, terms)` — SSOT predicate reusing the scorer's
  content fields (title/abstract/keywords+subjects) + tokenization.
- **`crossref.js`:** author-search-off → filter the fetched page to content matches *before* scoring;
  `hasMore` tracks the raw fetched window so pagination still advances. Rides the shared adapter →
  fixes browser **and** API paths. Author-search-on unchanged.

### Files touched (8)
`defaults.js` · `useSemanticRerank.js` · `useSettings.js` · `App.jsx` ·
**`SearchControls.jsx` (new)** · `Panels.jsx` · `scoring.js` · `crossref.js`.

### Product decisions made this sprint
- **Semantic + synonym ranking are now ON by default** (were off). Cost: every user's *first* search
  downloads the ~23MB MiniLM model (cached after) — accepted deliberately; surfaced via the hint.
- **Relevance controls belong under the search bar, not in Settings** (ease-of-use, zero extra clicks).
- **Author-search-off must be enforced per-adapter**, including client-side filtering for sources
  that can only query author-inclusively upstream.

**Carried forward:** T2 (BM25F field-weight sliders + K1/B) → future log; needs `scoring.js` SSOT
refactor (also unblocks v0.33 F3 tunable playground). When it lands, it slots into the `SearchControls`
disclosure as an "Advanced" section. Watch item: if a single slow adapter makes the `resultsReady`
hold feel laggy, add a soft per-adapter cap so one straggler can't hold the whole list.

---

*End v0.31 sprint — SHIPPED. Next: v0.32 (credit-meter wiring + admin debug). See `ROADMAP_v0_31-v0_34.md`.*
