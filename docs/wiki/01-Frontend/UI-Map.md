---
machine_ids: [App, components.Layout, components.SearchInput, components.SearchControls, components.FilterBar, components.SearchStatusBar, components.ResultCard, components.SourceSection, components.UnifiedResultList, components.LauncherBlock, components.Panels, components.AdminConsole, components.EagleTooltip]
findings: [F-303, F-304, F-305, F-306]
runtime: client
status: healthy
tags: [ux, ui-map, screens, flows]
---

# UI Map

> **Full UX anatomy of OpenCITE.** Every screen, region, panel, and user flow documented for a UX rebuild. Source of truth: `src/App.jsx` + all component files.

---

## Screen topology

OpenCITE is a single-page app with one real URL (`/`) and one hash route (`#/admin/console`). All "navigation" is panel toggling via `activePanel` state or the admin hash swap.

```
/ (main)
├── Header
│   ├── Version + app name strip
│   ├── Nav buttons: ★ Library | ↻ History | ◇ Plans | ⚙ Settings | [⚗ Admin] | AuthButton
│   ├── Logo row (h1 title + eagle image)
│   ├── Tagline
│   └── Adapter ticker strip (scrolling loop)
├── [Panel] — only one at a time, slides in below header
│   ├── LibraryPanel     (activePanel === "library")
│   ├── HistoryPanel     (activePanel === "history")
│   ├── SettingsPanel    (activePanel === "settings")
│   └── PricingPanel     (activePanel === "plans")
├── ThemeStrip  (color swatches, always visible)
├── SearchInput (sticky, always visible after header)
├── SearchControls
│   ├── Relevance slider (Lexical ↔ Semantic)
│   └── [disclosure] "Search settings"
│       ├── Result layout toggle (Unified | Source)
│       ├── Semantic ranking On/Off
│       ├── Synonym expansion On/Off
│       ├── Author search On/Off
│       └── [admin only] Simple search (raw) On/Off
├── [FilterBar]  (visible only when resultsReady)
│   ├── Sort pills (Default | Relevance | Citations ↓ | Year ↓)
│   ├── OA Only pill
│   ├── ↓ search filters (expandable)
│   │   ├── Type pills
│   │   ├── Language dropdown (with counts)
│   │   ├── Topics pills (top-8 keywords)
│   │   └── Year from/to inputs
│   └── ✕ clear all (when any filter active)
├── [Results area]  (hasSearched)
│   ├── [loading state]
│   │   ├── SearchStatusBar (unified mode: pulse + "Searching N sources…")
│   │   ├── Sparse-results warning banner
│   │   └── Semantic-preparing message ("downloading ~23MB model")
│   └── [resultsReady]
│       ├── [Unified view]
│       │   ├── SearchStatusBar
│       │   └── UnifiedResultList
│       │       ├── ResultCard (×N, interleaved from all adapters)
│       │       └── [Show N more / load-more button]
│       └── [Source view]
│           ├── SourceSection (×adapter, sorted by avg score)
│           │   ├── Adapter name chip + result count + "loose match" badge
│           │   ├── ResultCard (×N per adapter)
│           │   └── [Load 5 more from X] button
│           └── Zero-result chip row ("No matches in …")
├── [Sparse results helpers]
│   ├── Warning banner (< 5 total results)
│   └── "Try external archives ↓" nudge
├── LauncherBlock  (external archives, always visible after search)
│   └── details/summary per region → launcher rows with Open ↗ links
├── [Home state]  (!hasSearched && loaded)
│   ├── Tagline copy
│   └── Adapter grid cards (name, tagline)
├── ConnectCard  (Ko-fi + LinkedIn)
└── Footer

#/admin/console
├── Header (no-op panel buttons, back via logo click)
├── AdminConsole
│   ├── Tab: Score Explainer (F1)
│   └── Tab: Gold-Set Harness (F2)
└── Footer

[Overlays — z-index 100]
├── AuthModal  (full-screen blur overlay — sign-in nudge)
└── EagleTooltip  (inline, amber bordered speech bubble)
```

---

## Region-by-region detail

### Header (`src/components/Layout.jsx:123–204`)

- **Version strip**: `APP_VERSION / APP_NAME` in mono small-caps, top-left. Purely informational.
- **Nav buttons** (top-right): ★ Library (count badge when >0), ↻ History (count badge), ◇ Plans, ⚙ Settings, ⚗ Admin (admin-only `<a>` link to `#/admin/console`), AuthButton.
- **AuthButton** (`Layout.jsx:16–119`): tri-state (loading / authenticated / unauthenticated). Authenticated → `● FirstName` dropdown with "sign out". Unauthenticated → "↳ sign in" + tooltip after 3s + provider list (Google active; Apple/Microsoft "— soon"). Only Google OAuth is live.
- **Sync tooltip** (`TOOLTIP_KEY = "opencite_sync_tooltip_dismissed"`): shown once, 3s after load if unauthenticated; dismissed by clicking OK or opening sign-in.
- **Logo row**: H1 `OpenCITE` (click → reset state) + eagle PNG (`/android-chrome-512x512.png`; click → `eagle-shake` CSS animation). Triple-click logo = admin debug log copy.
- **Tagline**: italic serif display font.
- **Ticker strip**: scrolling CSS animation of adapter color chips. Masked edges via `maskImage` gradient. Doubles adapter array to create a seamless loop.

### ThemeStrip (`Layout.jsx:208–219`)

Three color swatches (Cream / Blue-grey / OLED Night). Click sets theme key in `localStorage["themeKey"]`. Positioned between header and search bar. No label on swatches — purely visual (accessibility smell: F-303).

### SearchInput (`src/components/SearchInput.jsx`)

Sticky, full-width, blurred backdrop (`backdropFilter: blur(32px)`). Cycling placeholder (3.5s interval, 9 items from `constants/app.js`). Enter key or "Search →" button fires `handleSearch`. Button disabled when query empty. Subline: "All sources queried in parallel · zero AI tokens". The sticky positioning bleeds to the container edges via negative margins + matching padding.

### SearchControls (`src/components/SearchControls.jsx`)

Always visible below the search bar. Two zones:

1. **Relevance slider** — `<input type="range">` 0–100. Left label "Lexical", right label "Semantic", center shows `100-pct / pct` ratio. Disabled + greyed (opacity 0.5) when semantic is off or simpleSearch is on. Three commit events: `onPointerUp`, `onKeyUp`, `onTouchEnd` (all fire `onRrfWeightCommit` to persist). Live change fires `onRrfWeightChange` (no persist — avoids per-tick writes).
2. **"Search settings" disclosure** (▸/▾ toggle) — renders `<div>` with amber background, not a modal. Contains:
   - Result layout toggle (Unified | Source) — moved here from Settings in v.37/v0.36 (`SearchControls.jsx:87`).
   - Semantic ranking On/Off
   - Synonym expansion On/Off
   - Author search On/Off
   - "Reset balance" button (appears when slider ≠ 40% and semantic is on)
   - [admin only] "⚗ Simple search (raw)" On/Off + description
   - "All settings →" link (opens SettingsPanel)

### Panels (`src/components/Panels.jsx`)

All four panels render inline (not portals) immediately below the header, pushing content down. Only one panel is open at a time. All have `fade-in` CSS animation, `border-2 border-stone-900 bg-amber-50` wrapper.

#### LibraryPanel (lines 468–562)

- Header: item count, "Export all" (→ .txt bibliography), "Select to export", "Clear all".
- Select mode: tap items to check; export buttons for Bibliography (.txt) / BibTeX (.bib) / RIS (.ris) / CSL-JSON (.json). Uses `libraryKey()` for stable identity.
- Each saved item renders as `<ResultCard>` (with `onToggleLibrary` → removes from library).
- Empty state: italic prompt + ★ hint.
- Footer: "Stored locally · ★ to remove · 'Select to export' for BibTeX, RIS, CSL-JSON".

#### HistoryPanel (lines 430–464)

- Ordered list of past queries with date. Click any entry → `handleRerun` (re-searches). × on hover removes. "Clear all" wipes everything.
- Footer: "Stored locally · last 50 queries · click to re-run".

#### SettingsPanel (lines 303–426)

Sections:
1. OpenAlex API key (optional, rate-limit upgrade).
2. Crossref email (polite pool, no signup).
3. Extension API keys: europeanaKey (transitional fallback), coreKey, ndliKey.
4. Curated journals: ISSN-validated add form (`AddJournalForm`), remove, "Reset to defaults".
5. Sources: `SourcesPanel` (core adapters listed; extension adapters toggled by region groups, with toggle switches, key-missing badges, content/archiveType tags).
6. [admin only] Debug log section: Copy log / Download log / Clear buffer buttons.

**Note (F-304):** The semantic/synonym/author-search/viewMode settings moved to `SearchControls` (v.31/v.36/v.37), but a stale comment at `Panels.jsx:380` still describes them as living here.

#### PricingPanel (lines 190–298)

Platform-aware billing UI:
- 3 subscription plan cards (Free/Student/Pro) with feature lists. Calls `createCheckoutSession()` → redirects to Stripe. On mobile (`subscriptionRail("iap")`), shows a store-notice instead.
- 3 credit pack cards (10k/$10, 60k/$50, 300k/$200). Always Stripe.
- `isAuthenticated` gate: unauthenticated click fires `onRequireAuth()` (shows AuthModal).
- Notice area for errors/platform messages.

### FilterBar (`src/components/FilterBar.jsx`)

Visible only after `resultsReady`. All filter state is external (`filterState`, `onChange` prop). Internal state: `expanded` (boolean).

- Always-visible: Sort pills, OA Only pill, "↓ search filters" / "↑ fewer filters" toggle (with amber dot when active filters exist).
- Expanded: Type pills (derived from live results), Language dropdown (LangDropdown component — dropdown with per-language counts; handles high-cardinality sets from Europeana etc.), Topics pills (top-8 keywords/subjects from live results), Year from/to number inputs, "✕ clear all" link.
- All filters derived from `sectionStates` via `useMemo`.

### SearchStatusBar (`src/components/SearchStatusBar.jsx`)

Visible in unified mode only. Shows "● Searching N sources…" while loading, then "✓ N sources searched [· X unavailable]" for 2s after all settle, then hides. Auto-shows again on any new search (allSettled changes).

### ResultCard (`src/components/ResultCard.jsx`)

The core output unit. Props: `result`, `index`, `onCopy`, `copied`, `isInLibrary`, `onToggleLibrary`, `isChapterInGroup`.

Anatomy (top to bottom):
- **Header row**: `№01` counter (display-font, bold), year, type badge (chapter, for book chapters), "may be paywalled" (when `!result.isOA`), ★ save button (amber when saved, outline when not; triggers `EagleTooltip` on first save).
- **EagleTooltip**: inline, shown once ever via `useEagleTooltip("eagle_library_prompted")`.
- **Content area**: optionally 2-col grid if `result.previewImage` (image thumbnail + text). Text col: title (link via DOI or URL), "In: *book title*" for chapters (unless `isChapterInGroup`), authors (up to 4 + "et al."), editors, journal/publisher, enrichment row (citedBy chip — "downloaded" for IA source, language chip, up to 3 keywords, up to 2 subjects), abstract (truncated to 200 or 280 chars).
- **"Read full text →"** link (when `result.url`).
- **Citations accordion**: collapsed by default. Expands to show MLA 9 + APA 7 rendered as styled segments (italic via `segs.map(s => s.italic ? <em> : <span>)`). Copy button per style tracks `copied.id === cardId && copied.style === style`.

### SourceSection (`src/components/SourceSection.jsx`)

Source-view wrapper per adapter. Renders adapter color chip + result count + "loose match" badge. Calls `groupByParentWork()` — groups book chapters sharing a container title under a shared parent header. Each group either renders a standalone `<ResultCard>` or a grouped container with indented chapter cards (passing `isChapterInGroup`). Load-more button at bottom when `hasMore`.

### UnifiedResultList (`src/components/UnifiedResultList.jsx`)

Pools all results from all `filteredSections`, sorts by `_score` (with `citedBy` tie-break), or by user's sort preference. Paginates by group (20 initial, 10 per "Show more"). Also calls `groupByParentWork()` for chapter clustering. Shows adapter color chip above each card. Load-more triggers `onLoadMoreAll()` when local pool is exhausted but remote `hasMore` exists. `searchKey` prop resets `displayCount` to 20 on each new search.

### LauncherBlock (`src/components/LauncherBlock.jsx`)

Always shown after a search (regardless of results). 23 external launchers from `src/launchers/index.js`, grouped by region (from `REGION_ORDER`), rendered as `<details>/<summary>` collapsibles. Each launcher has an "Open ↗" `<a target="_blank">` that calls `L.buildUrl(query)` to pre-fill the external site's search.

### AdminConsole (`src/components/AdminConsole.jsx`)

Mounted at `#/admin/console`. Gate: `isAdmin(user)` (same email allowlist as App-level check — double gate). Shows red "Admin access required" if not admin. Two tabs:

- **Score Explainer (F1)**: query input → `/api/search?q=…&debug=1&limit=25` → ranked `ScoreCard` list with gate color coding (kept=green, best_guess=amber, dropped=red), expandable BM25F per-field, phrase/source bonuses, RRF rank inputs.
- **Gold-Set Harness (F2)**: localStorage-persisted gold queries + test runs. Create query → `GradingModal` (full-screen overlay, grade 0–3 per result). Run all tests → per-query nDCG@10/MRR/Recall@10/Recall@20 + diff vs previous run.

---

## User flows

### First load → search → refine → save → export

1. **First load**: Auth status resolves (loading → authenticated/unauthenticated). Settings, history, library loaded from localStorage. Input auto-focused.
2. **(if unauthenticated)**: After 2s, `AuthModal` appears. User may sign in (Google) or dismiss ("Continue anonymously").
3. **Search**: User types query, presses Enter or "Search →". `handleSearch` fires: adds to history, clears filters, calls `search(query)`. All enabled adapters fire in parallel. `SearchStatusBar` shows progress. Placeholder list hidden until `resultsReady`.
4. **Multi-keyword**: User types `term1; term2` — parsed as separate terms, each adapter is called for all terms in parallel, results merged.
5. **Results appear**: After `allDone` and (if semantic) `rerankStatus === "done"`, `resultsReady` flips true. Filter bar appears. Results show in Unified (default) or Source view.
6. **Refine**: User opens filter bar. Picks sort/type/language/topic/year/OA. `useFilters` re-derives `filteredSections` without re-fetching.
7. **Slider**: User drags Lexical↔Semantic slider → triggers immediate re-rerank via `useSemanticRerank`. Commit (pointer-up) persists to settings.
8. **Save**: User clicks ★ on a card. `lib.toggle(result)` → localStorage write + (if signed in) fire-and-forget POST to `/api/library`. EagleTooltip shows once.
9. **Cite**: User expands "Cite · MLA 9 · APA 7" accordion, clicks "Copy" → `copyText()` → clipboard write + 1.5s "✓ Copied" feedback.
10. **Export**: User opens Library panel, clicks "Export all" → `.txt` download (MLA + APA). Or "Select to export" → picks items → BibTeX/RIS/CSL-JSON.

### Load more

- **Unified view**: "↓ Show 10 more" first paginates the in-memory pool. When pool exhausted and `hasMoreRemote`, triggers `onLoadMoreAll()` → `loadMore(adapterId, query)` for each adapter with visible results.
- **Source view**: Per-adapter "Load 5 more from X" buttons call `loadMore(adapterId, query)`.

### Admin diagnostic flow

1. Admin navigates to `#/admin/console` via "⚗ admin" header link.
2. Score Explainer (F1): types query → hits `/api/search?debug=1` → sees full ranking with score breakdown.
3. Gold-Set (F2): adds a query, grades results (0–3 per result in modal), saves. Runs all gold queries → sees nDCG/MRR/Recall metrics with diff vs last run.

---

## 🩺 Health audit

- **Verdict:** mostly healthy — UX is coherent but has accessibility gaps and dead UI.
- **Findings:** [F-303] `ThemeStrip` swatches have no text labels — purely color (inaccessible). [F-304] Stale comment in `Panels.jsx:380` says relevance slider/search toggles are in Settings, but they moved to `SearchControls`. [F-305] `AuthButton` has Apple and Microsoft providers rendered as disabled "— soon" items — dead UI shipped to all users. [F-306] Home screen empty state checks `settings.europeanaKey` to show/hide a "Visit Settings" banner — leaks key-management concern into view layer; should use a `hasAllKeyedSources` derived flag.
- **Smells:** No keyboard shortcut to focus the search input (e.g., `/`). No error boundary around the results area. `AuthModal` is a raw `<div>` overlay with no focus trap — keyboard users can tab behind it. `GradingModal` (admin only) does use overflow-y-auto correctly. `confirm()` is used in LibraryPanel for the "Remove all" action (F-306 level smell — native dialogs are inaccessible and unstyled).

## See also

[[01-Frontend/App-Shell]] · [[01-Frontend/Components/_index]] · [[01-Frontend/Hooks]] · [[01-Frontend/State-Flow]] · [[04-Backend-API/Search-Endpoint]] · [[05-Billing/Billing-Credits]]
