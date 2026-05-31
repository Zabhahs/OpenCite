# OpenCITE — Architecture Report v0.31

> **Canonical reference for the next Claude instance picking up this project.**
> Read this for v0.31; read **`architecture_report_v0_30.md`** first for full prior context
> (origin-blind API, 22 server-safe adapters, runtime-aware proxy, WS3 billing, Prisma Migrate
> workflow + the OAuth/migration incident hard rules). This report covers **only what v0.31 changed.**
> Last updated: v0.31 — **user-facing relevance controls** (live `Lexical↔Semantic` slider under the
> search bar), semantic + synonym ranking **on by default**, **no populate-then-reshuffle** results
> gate, and a **Crossref author-search-off** fix.

---

## Project overview (unchanged)

OpenCITE is a free meta-search engine for open-access scholarly databases — searches many academic
APIs in parallel, returns results with MLA 9 / APA 7 citations ready to paste. Deployed on Vercel at
`citation.today` / `opencite.space`. As of v0.30 it also exposes a sellable, origin-blind
`/api/search` grounding endpoint for AI agents.

**Author:** Shahbaz Yusuf. Moves fast, expects precise execution. Mode C (plan + halt) for large
tasks, Mode B (fast path) for small changes. Never pad.

**Stack:** React/Vite frontend · Vercel Edge + Node serverless · Prisma + Supabase (Postgres) ·
Auth.js v5 Google OAuth. **Repo:** `Zabhahs/OpenCite`. **Deploy:** Vercel auto-deploys `main`
(production aliases `citation.today`, `opencite.space`). Build runs `scripts/migrate.mjs` (P3005-safe,
**never** hard-fails) → tailwind → `vite build`.

---

## What changed in v0.31

v0.31 is a **frontend-only** sprint (no schema/migration/auth/API-contract change). Planned in
`sprint_log_v0_31.md` as "T1: a `Lexical↔Semantic` slider in Settings"; expanded under live user
feedback into a relevance-controls UX overhaul + two fixes. **Shipped 2026-05-31** across 4 commits
(`60b0963` → `bec4a6c` → `2ffcfbf` → `d626027`), all live in prod.

### 1. Relevance controls live under the search bar — `src/components/SearchControls.jsx` (new)

The headline change. Ranking control is a primary, always-visible affordance — **not** buried behind
a Settings click.

- Rendered in `App.jsx` directly under `<SearchInput>`, always (even before the first search).
- **Slider** = the RRF fusion weight over one axis: **Lexical (hard left) ↔ Semantic (hard right)**.
  Range 0–100 maps to `semanticWeight ∈ [0,1]`; default **0.4** reproduces the historical 0.6/0.4
  balance. Live readout `Relevance · {100−pct} / {pct}`. Disabled + greyed with a note when semantic
  ranking is off. A "Reset balance" link (→ 0.4) shows when off-default.
- **"Search settings ▾" disclosure** beneath the slider: compact On/Off toggles for **Semantic
  ranking**, **Synonym expansion**, **Author search**, plus an **"All settings →"** link
  (`onOpenSettings` → opens the full panel). Local `Toggle` helper keeps it DRY within the file.
- Props contract (owned by `App.jsx`): `{ settings, onSave, rrfWeight, onRrfWeightChange,
  onRrfWeightCommit, onOpenSettings }`.
- **`SettingsPanel` (`Panels.jsx`) slimmed:** the slider + Synonym/Semantic/Author blocks were
  **removed** (relocated, no duplication). **Result layout, Sources, API keys, curated journals
  remain** in Settings — Settings is still the full-config home; `SearchControls` is quick access.

### 2. Two-phase semantic rerank — `src/hooks/useSemanticRerank.js`

Signature: `useSemanticRerank(sectionStates, query, enabled, semanticWeight = 0.4)`. The single old
rerank effect is split so a slider drag is **pure arithmetic** — never a re-embed:

- **Expensive effect** (deps `[sectionStates, enabled]`): once all adapters settle, embeds the query +
  corpus, builds `lexicalRanks` / `semanticRanks` maps, snapshots the section shape (id→state→count),
  and writes a single `fusionInputs` state object. Guarded by `didRerankRef` so it runs once per
  result set.
- **Cheap effect** (deps `[fusionInputs, semanticWeight]`): `fuseRanks(allResults, [{lexical, 1−w},
  {semantic, w}])` then re-slices back into sections. Fires instantly on every weight change.
- `fusionInputs` is cleared on new-search + toggle-off (no stale fusion).
- **Rerank failure is terminal:** `rerankStatus: "error"` (was `"idle"`), `rerankedStates` stays null
  so `effectiveStates` falls back to BM25F order — and the results gate (below) stops waiting.
- `rerankStatus` lifecycle: `idle → reranking → done` (or `→ error`).

### 3. Semantic + synonym ranking ON by default + one-time migration

- `src/constants/defaults.js`: `semanticSearch: true`, `synonyms: true` (were `false`), plus
  `rrfSemanticWeight: 0.4` and a `searchDefaultsV31: true` migration flag.
- `src/hooks/useSettings.js` `load()`: a **one-time migration** — if a user's saved settings lack
  `searchDefaultsV31`, flip `semanticSearch` + `synonyms` **on** once and persist the flag; later
  user toggles are respected thereafter. This is what makes the change visible to *existing* users
  (whose `localStorage`/DB already had `false` persisted), not just new ones.
- **Cost accepted:** every user's first search now downloads the ~23MB MiniLM embedding model (cached
  permanently after). Surfaced to the user via the round-3 hint, not hidden.

### 4. No populate-then-reshuffle — `resultsReady` gate in `App.jsx`

Results no longer stream in BM25 order and then visibly reorder when the semantic fuse lands. The list
is **held until the final order is known**:

```
resultsReady =
    !hasSearched               → false
  : !allDone                   → false   // some adapter still loading
  : totalResults === 0         → true    // nothing to sort
  : !settings.semanticSearch   → true    // BM25F order IS final
  : rerankStatus ∈ {done,error}          // semantic: wait for the fuse (or terminal failure)
```

- While `!resultsReady`: show `SearchStatusBar` progress + (during the embed) the hint *"Ranking
  results… preparing semantic model (first run downloads ~23MB, then cached)"* (`semanticPreparing`).
- `FilterBar` is also gated on `resultsReady`.
- The slider's instant re-fuse path is unaffected — the gate only governs the **initial** reveal.

### 5. Crossref respects author-search-off — `scoring.js` + `crossref.js`

Bug: `"kutchi memon"` with author search off still returned papers matched on the author surname
"Memon". Crossref has no title-only index, so it queries `query.bibliographic` (title+author+journal+
year — author-inclusive & author-ranked); when no result carried the term in a content field,
`applyConfidenceGate`'s low-confidence fallback resurfaced the author matches as "best guesses".

- **`src/lib/scoring.js`** — new **`hasContentMatch(result, terms)`**: SSOT predicate that reuses the
  scorer's content fields (`FIELD_WEIGHTS` → title/abstract/keywords+subjects via `fieldText`) and
  tokenization. A query with no meaningful terms never filters. **Reusable by any adapter** with the
  same author-bleed problem.
- **`src/adapters/core/crossref.js`** — author-search-off → filter the fetched page to content matches
  *before* scoring (author-only hits dropped). `hasMore` tracks the **raw** fetched window so
  pagination still advances when a page is heavily filtered. Author-search-on path unchanged. Rides
  the shared adapter, so this fixes the **browser app and the `/api/search` path** alike.

---

## File map (v0.31 touch list)

| File | Change |
|---|---|
| `src/components/SearchControls.jsx` | **NEW** — always-visible slider + "Search settings" disclosure |
| `src/App.jsx` | live `rrfWeight` state; mount `SearchControls`; `resultsReady`/`semanticPreparing` gate; `FilterBar` gated |
| `src/hooks/useSemanticRerank.js` | two-phase (expensive/cheap) rerank; `semanticWeight` param; terminal `error` |
| `src/hooks/useSettings.js` | one-time `searchDefaultsV31` migration in `load()` |
| `src/constants/defaults.js` | `semanticSearch`+`synonyms` → true; `rrfSemanticWeight: 0.4`; `searchDefaultsV31` |
| `src/components/Panels.jsx` | `SettingsPanel` slimmed — slider/Semantic/Synonym/Author removed (relocated) |
| `src/lib/scoring.js` | new SSOT `hasContentMatch(result, terms)` |
| `src/adapters/core/crossref.js` | author-search-off content-scope filter |

**Verification:** `vite build` green each round (no local node_modules initially — `npm install` was
run once). No automated UI tests in this repo; correctness confirmed by build + live testing on
`citation.today` per round.

---

## State of the roadmap after v0.31

v0.31 was **independent** (no dependencies, blocks nothing) and is **done**. Per
`ROADMAP_v0_31-v0_34.md`, the recommended next sprint is:

- **v0.32 — credit-meter wiring + admin debug** (`sprint_log_v0_32.md`). WS-A wires the dormant v0.30
  billing stack (`apiAuth`/`billing`/`ratelimit`/`cache`) into `api/search.js` (pre-authorize →
  settle → refund-on-failure) and enforces source tiers; WS-B adds the admin plan + `debug=1`
  envelope. **This unblocks v0.34** (needs tier-gating) **and v0.33** (consumes the debug envelope).
- The only v0.30 wire-up still open is **credit *spend* in `search.js`** — v0.32 WS-A is exactly that.

**Carried forward from v0.31:** T2 (BM25F field-weight sliders + K1/B) — deferred; needs a `scoring.js`
SSOT refactor to accept weight overrides (server behavior unchanged via defaults). Lands as an
"Advanced" section inside the `SearchControls` disclosure, and also unblocks the v0.33 F3 tuning
playground. Watch item: if one slow adapter makes the `resultsReady` hold feel laggy, add a soft
per-adapter cap.

---

*v0.31 shipped 2026-05-31. Frontend-only; no schema/auth/API-contract change. Prepared as the handoff
for the next instance — start the next sprint from `ROADMAP_v0_31-v0_34.md` (recommended: v0.32).*
