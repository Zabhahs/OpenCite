---
machine_ids: [components.AdminConsole, components.EagleTooltip, components.FilterBar, components.LauncherBlock, components.Layout, components.Panels, components.ResultCard, components.SearchControls, components.SearchInput, components.SearchStatusBar, components.SourceSection, components.UnifiedResultList, components.admin.ScoreExplainer, components.admin.GoldSetHarness]
findings: [F-303, F-304, F-305, F-306, F-312, F-313, F-314, F-315]
runtime: client
status: healthy
tags: [components, index]
---
<!-- AUTO-GENERATED from docs/wiki/01-Frontend/Components/_index.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Components — Index

> **All 14 frontend components** (12 in `src/components/`, 2 in `src/components/admin/`). Significant components have detailed sections below.

---

## Index table

| Component | ID | Role | Parent | State source | Findings |
|---|---|---|---|---|---|
| `AdminConsole` | `components.AdminConsole` | Admin tool shell — 2 tabs (Score Explainer + Gold-Set Harness) | `App.jsx` (admin route only) | `useAuth()` for gate; tab: local | F-305 (dead auth modal), see §AdminConsole |
| `EagleTooltip` | `components.EagleTooltip` | Inline brand tooltip (eagle image + speech bubble) | `ResultCard` | props: `visible`, `onDismiss`, `message` | — |
| `FilterBar` | `components.FilterBar` | Client-side facet filters + sort | `App.jsx` | All derived from `sectionStates` prop; `expanded`: local | F-303 (no clear-all keyboard shortcut) |
| `LauncherBlock` | `components.LauncherBlock` | External archive launchers grouped by region | `App.jsx` | props only (`query`, `launchers`) | — |
| `Header` | `components.Layout` (sub) | Navigation bar + logo + adapter ticker | `App.jsx` | props only | F-305 (Apple/MS disabled providers) |
| `Footer` | `components.Layout` (sub) | Static footer | `App.jsx` | none | — |
| `ThemeStrip` | `components.Layout` (sub) | Theme color swatch picker | `App.jsx` | props: `themeKey`, `onChange` | F-303 (no text labels) |
| `AuthButton` | `components.Layout` (sub) | Sign-in/sign-out dropdown | `Header` | `useAuth()` | F-305 (dead providers) |
| `AuthModal` | `components.Layout` (sub) | Sign-in nudge overlay | `App.jsx` | props: `onDismiss` | F-312 (no focus trap) |
| `KofiOverlay` | `components.Layout` (sub) | Ko-fi floating widget script injector | `App.jsx` (outside OpenCITE) | none | — |
| `ConnectCard` | `components.Layout` (sub) | Ko-fi + LinkedIn links | `App.jsx` | none | — |
| `SettingsPanel` | `components.Panels` (sub) | API keys, curated journals, sources toggle | `App.jsx` | props from `useSettings` | F-304 (stale comment) |
| `HistoryPanel` | `components.Panels` (sub) | Recent queries list | `App.jsx` | props from `useHistory` | — |
| `LibraryPanel` | `components.Panels` (sub) | Saved items + multi-format export | `App.jsx` | props from `useLibrary` | F-313 (native confirm()) |
| `PricingPanel` | `components.Panels` (sub) | Plan cards + credit packs + Stripe checkout | `App.jsx` | `currentPlan` hardcoded "free" | F-315 (currentPlan not dynamic) |
| `AddJournalForm` | `components.Panels` (sub) | ISSN journal add form | `SettingsPanel` | local state | — |
| `SourcesPanel` | `components.Panels` (sub) | Adapter enable/disable toggles by region | `SettingsPanel` | props from useSettings | — |
| `ResultCard` | `components.ResultCard` | Single result display + citation + save | `SourceSection`, `UnifiedResultList`, `LibraryPanel` | local `citationsOpen`, `imgFailed`; `useEagleTooltip` | F-314 (duplicate group header JSX) |
| `SearchControls` | `components.SearchControls` | Relevance slider + search settings disclosure | `App.jsx` | props (`settings`, `rrfWeight`); `open`: local | — |
| `SearchInput` | `components.SearchInput` | Sticky search bar with cycling placeholder | `App.jsx` | props (`query`, `onChange`, `onSearch`, `inputRef`) | — |
| `SearchStatusBar` | `components.SearchStatusBar` | In-progress / done source count status | `App.jsx` | props (`sectionStates`, `adapters`); `visible`: local | — |
| `SourceSection` | `components.SourceSection` | Per-adapter result list (source view) | `App.jsx` | props from `useSearch`/`useFilters` | F-314 (duplicate group header JSX) |
| `UnifiedResultList` | `components.UnifiedResultList` | Cross-adapter ranked list (unified view) | `App.jsx` | props; `displayCount`: local | F-314 (duplicate group header JSX) |
| `ScoreExplainer` | `components.admin.ScoreExplainer` | Debug search → ranked results with score breakdown | `AdminConsole` | local state (query, results, expandedId) | — |
| `GoldSetHarness` | `components.admin.GoldSetHarness` | Gold-set regression test harness | `AdminConsole` | local state + localStorage | F-310 (bare localStorage keys) |

---

## Detailed sections

### ResultCard

`src/components/ResultCard.jsx` — The most-rendered component. Every search result goes through this.

**Props:** `result` (normalized record), `index` (0-based for №XX counter), `onCopy(text, id, style)`, `copied: {id, style}`, `isInLibrary` (boolean), `onToggleLibrary(result)`, `isChapterInGroup` (boolean, suppresses "In: *book*" subheader when chapters are already grouped).

**Local state:** `imgFailed` (boolean — hides broken image), `citationsOpen` (boolean — citation accordion).

**Eagle tooltip:** `useEagleTooltip("eagle_library_prompted")` — one-time, shown on first-ever ★ save. Renders `<EagleTooltip>` inline (no portal).

**Citation rendering:** calls `buildMLA(result)` and `buildAPA(result)` from `lib/citations.js`. Returns `Segment[]` where each segment has `{ text, italic }`. Rendered as `<em>` or `<span>`. Copy action copies `segmentsToPlain(segs)` (strips italic formatting for paste into plain-text citation managers).

**Image grid:** when `result.previewImage` is present and hasn't errored, uses a 2-column grid (`120px | 1fr`). Lazy-loaded except for the first two results (`loading={index < 2 ? "eager" : "lazy"}`).

**IA source label:** `result.citedBy` is labeled "downloaded" instead of "cited" when `result.source === "IA"` — acknowledges the IA download-count-as-citedBy defect (D1 from v0.36 diagnostic). See [Bugs](../../09-Audit/Bugs.md#f-001).

**F-314 — Duplicate group-header JSX:** The parent-work (book chapter cluster) header JSX block is duplicated verbatim across `SourceSection.jsx:75–103` and `UnifiedResultList.jsx:136–164`. A shared `<BookGroupHeader group={group} />` component would eliminate ~30 lines of duplication.

---

### SearchControls

`src/components/SearchControls.jsx` — The always-visible relevance control strip under the search bar.

**Props:** `settings`, `onSave`, `rrfWeight`, `onRrfWeightChange`, `onRrfWeightCommit`, `onOpenSettings`, `admin`.

**Local state:** `open` (boolean — disclosure open/closed).

**Key detail:** The slider has THREE commit events (`onPointerUp`, `onKeyUp`, `onTouchEnd`) to handle mouse, keyboard, and touch interactions correctly. Live change via `onChange` only updates the `rrfWeight` value without persisting.

**simpleSearch interaction:** When `s.simpleSearch` is true, `semOn = false` regardless of `s.semanticSearch`, so the slider is greyed and a helper text explains why.

**Result layout toggle:** Moved here in v.36/v.37 (`SearchControls.jsx:87` comment confirms). `upd({ viewMode: val })` calls `onSave` which fires the full settings save path (localStorage + DB).

---

### Panels — SettingsPanel

`src/components/Panels.jsx:303–426` — Complex panel. Sub-components: `AddJournalForm`, `SourcesPanel`.

**ISSN validation:** client-side regex `/^\d{4}-\d{3}[\dX]$/` on form submit. `normalizeIssn()` strips non-alphanumeric and reformats before testing.

**SourcesPanel:** two tiers — "Always on (core)" (flat list, no toggle) and "Extensions (opt-in)" (grouped by region, toggle switch per adapter). Extension toggle: `aria-label` is correct. "key missing" badge appears when adapter `needsKey` is true and `settings[a.keyName]` is falsy.

**Debug section (admin):** `getDebugLog()`, `downloadDebugLog()`, `clearDebugLog()` from `lib/log.js`. Triple-click logo shortcut to copy is described here (but the actual handler is in App.jsx).

---

### Panels — LibraryPanel

`src/components/Panels.jsx:468–562`

**Select mode:** uses a `Set` of `libraryKey` strings for O(1) membership checks. Select mode blocks all card interaction (`pointerEvents: "none"`) except the outer `onClick` wrapper. Exit select mode clears selection.

**Export formats:** Bibliography (.txt MLA+APA), BibTeX (.bib), RIS (.ris), CSL-JSON (.json). BibTeX/RIS/CSL exports call `toNCR(item)` to normalize items that may have been saved before the normalize pipeline existed.

**F-313:** Uses `confirm()` for "Remove all N items?" confirmation — native browser dialog, unstyled, inaccessible.

---

### Panels — PricingPanel

`src/components/Panels.jsx:190–298`

**F-315:** `currentPlan` prop defaults to `"free"` and is always passed as `"free"` from `App.jsx:299`. The "Current" badge will always appear on the Free card even for paying subscribers. The real plan status is server-side; no client-side plan check is wired. This is a presentation-only debt, not a security issue.

---

### AdminConsole

`src/components/AdminConsole.jsx`

**Double-gate pattern:** `App.jsx:53` checks `admin && window.location.hash === "#/admin/console"` before rendering the admin layout. `AdminConsole.jsx:17–27` re-checks `isAdmin(user)` and renders a red "Admin access required" fallback if the gate fails. This is correct defense-in-depth — the component can be rendered on its own and still self-gates.

**ScoreExplainer (F1):** Uses `/api/search?debug=1`. The `debug=1` flag is admin-gated on the server side (`resolveSessionAdmin()` in `api/_shared/log.js`). Results show `_scoreBreakdown` with BM25F per-field, phrase/source bonuses, RRF ranks, and gate disposition (kept/best_guess/dropped) color-coded.

**GoldSetHarness (F2):** Stores gold queries + test runs in localStorage (outside `storage` namespace — F-310). Grading modal is a full-screen overlay (`fixed inset-0`) — correct z-index. `computeMetrics` / `aggregateMetrics` imported from `lib/goldSetMetrics.js` (pure functions, separately unit-tested per memory).

---

### UnifiedResultList vs SourceSection — Duplication

Both components:
- Call `groupByParentWork()` on their results
- Render a nearly identical book-chapter cluster header (parent title, editor list, publisher, chapter count badge, year)
- Render `<ResultCard>` for each item
- Maintain a `globalIndex` counter for №XX numbering

The only differences: SourceSection doesn't show source chips per-card (the adapter is already the section header). UnifiedResultList adds source chips above each card.

**F-314:** ~60 lines of JSX duplicated. Extract `<BookGroupHeader>` and the shared group-iteration rendering into a shared utility.

---

## 🩺 Health audit

- **Verdict:** healthy — components are well-scoped with one major duplication (F-314).
- **Findings:** [F-312] `AuthModal` has no focus trap — keyboard users can tab outside. [F-313] `LibraryPanel` uses `confirm()` for destructive action. [F-314] Book-chapter group header JSX duplicated across `SourceSection` and `UnifiedResultList`. [F-315] `PricingPanel` `currentPlan` is hardcoded "free" — paying subscribers always see "Current" on Free.
- **Bundle weight:** `@vercel/analytics` and `@vercel/speed-insights` are eagerly imported in `App.jsx:2–3`. Ko-fi overlay widget is script-injected lazily (only after mount — correct). No lazy-loaded React components anywhere — the entire app ships in one chunk.

## See also

[UI-Map](../UI-Map.md) · [State-Flow](../State-Flow.md) · [Hooks](../Hooks.md) · [Duplication-and-Reuse](../../09-Audit/Duplication-and-Reuse.md) · [Bugs](../../09-Audit/Bugs.md)
