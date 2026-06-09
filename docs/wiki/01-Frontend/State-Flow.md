---
machine_ids: [App, hooks.useSearch, hooks.useSettings, hooks.useLibrary, hooks.useHistory, hooks.useFilters, hooks.useTheme, contexts.AuthContext]
findings: [F-300, F-307, F-308]
runtime: client
status: healthy
tags: [state, data-flow, localStorage, DB-sync, search-flow]
---

# State Flow

> **Where state lives and how it propagates.** A data-flow narrative covering auth, settings, search, library/history, and filtering. The "render graph" is: props flow down from `App.jsx (OpenCITE)`; nothing flows back up except callbacks.

---

## State residency map

| Concern | Where it lives | Persistence |
|---|---|---|
| Auth session (`user`, `status`) | `AuthContext` (React context) | Auth.js cookie / Supabase session |
| Settings | `useSettings` → React state (in `OpenCITE`) | `opencite:settings` in localStorage + `/api/settings` (DB) |
| Search results | `useSearch.sectionStates` → React state (in `OpenCITE`) | In-memory only; lost on refresh |
| Filter selections | `filterState` useState in `OpenCITE` | In-memory only |
| Library items | `useLibrary.items` → React state (in `OpenCITE`) | `opencite:library` in localStorage + `/api/library` (DB) |
| History entries | `useHistory.entries` → React state (in `OpenCITE`) | `opencite:history` in localStorage + `/api/history` (DB) |
| Theme | `useTheme.themeKey` → React state (in `OpenCITE`) | `themeKey` in localStorage (bare key) |
| RRF slider weight | `rrfWeight` useState in `OpenCITE` | Written to `settings.rrfSemanticWeight` on commit only |
| Active panel | `activePanel` useState in `OpenCITE` | In-memory only |
| Auth modal | `showAuthModal` useState in `OpenCITE` | `opencite_auth_prompted` flag in localStorage |
| Query input | `query` useState in `OpenCITE` | In-memory only |
| Gold queries / test runs | `GoldSetHarness` local state | `opencite_gold_queries` / `opencite_test_runs` in localStorage (bare keys, outside namespace) |
| Admin console route | `window.location.hash` | URL bar |

---

## Prop-drilling diagram

`OpenCITE` is the god-component that prop-drills everything:

```
OpenCITE
├─ settings, saveSettings, isEnabled, toggleAdapter ─→ SearchControls, SettingsPanel
├─ sectionStates ─→ FilterBar, SearchStatusBar, SourceSection, UnifiedResultList, App computed state
├─ filteredSections ─→ SourceSection, UnifiedResultList
├─ lib.items, lib.isInLibrary, lib.toggle, lib.clear ─→ LibraryPanel, UnifiedResultList, SourceSection (→ ResultCard)
├─ hist.entries, hist.add, hist.remove, hist.clear ─→ HistoryPanel
├─ query ─→ SearchInput, LauncherBlock, SourceSection (loadMore), UnifiedResultList (searchKey)
├─ copied, copyText ─→ LibraryPanel (→ ResultCard), UnifiedResultList (→ ResultCard), SourceSection (→ ResultCard)
├─ rrfWeight, onRrfWeightChange, onRrfWeightCommit ─→ SearchControls
├─ admin ─→ Header, SearchControls, SettingsPanel, AdminConsole (self-gates via isAdmin())
└─ themeKey, theme, changeTheme ─→ ThemeStrip, top-level div (CSS vars)
```

`SettingsContext` exists but is not used — settings are not in a context. See [[01-Frontend/Contexts]].

---

## Search state flow (narrative)

### 1. User fires a search

`handleSearch()` in `App.jsx:85–97`:
- Clears `filterState` (reset facets)
- Calls `hist.add(query)` — synchronous localStorage write + async DB POST
- Calls `search(query)` from `useSearch`

### 2. useSearch initializes section states

For each enabled adapter, sets `{ loading: true, results: null, error: null, hasMore: false, … }`. This fires all adapters concurrently via `activeAdapters.forEach(async …)`.

### 3. Each adapter resolves independently

On resolution, patches its own slice: `setSectionStates(prev => ({ ...prev, [adapter.id]: { loading: false, results: filtered, … } }))`. No adapter waits for others. Cross-adapter dedup uses shared `seenDOIs` / `seenTitles` refs — these accumulate across adapter responses as they arrive. (Race condition F-307: arrival order is non-deterministic across tab refreshes.)

### 4. Semantic reranking (if enabled)

`useSemanticRerank(sectionStates, query, semanticActive, rrfWeight)` watches `sectionStates` for change. Once adapters start settling, it collects results, runs RRF fusion of BM25F local scores + semantic embedding scores. Sets `rerankStatus` to `"reranking"` then `"done"` (or `"error"`).

### 5. resultsReady gate

`App.jsx:165–170` — boolean computed from `hasSearched`, `allDone`, `totalResults`, `semanticActive`, `rerankStatus`. Only flips true when the FINAL ranked order is known. Result list stays hidden until this point.

### 6. effectiveStates → filteredSections

```
sectionStates
  ↓ useSemanticRerank (if semanticActive)
rerankedStates (or sectionStates if no rerank)
  ↓ effectiveStates = rerankedStates || sectionStates
  ↓ useFilters(effectiveStates, filterState, simpleSearch)
filteredSections  ←── passed to UnifiedResultList / SourceSection
```

`useFilters` is a pure memoized derivation — no side effects, no state. Filters applied to `effectiveStates.results` per adapter, then sorted.

### 7. Display

`isUnified` (from `settings.viewMode`) determines whether `UnifiedResultList` (pools + sorts globally) or `SourceSection` × N (per-adapter) renders. Both consume `filteredSections`.

---

## Settings persistence flow

```
User changes setting
  ↓ onSave({ ...settings, [key]: value })  (App.jsx saves → useSettings.save)
  ↓ setSettings(next)                        [React state update → re-render]
  ↓ storage.set("settings", next)            [localStorage write, sync]
  ↓ if (user) apiFetch("POST", { settings: next })  [fire-and-forget to /api/settings]

On sign-in:
  ↓ useEffect([user?.id, loaded])
  ↓ syncFromDB() → GET /api/settings
  ↓ DB wins → setSettings(merged) + storage.set
```

---

## Library persistence flow

```
User clicks ★ on a result
  ↓ lib.toggle(result)  [useLibrary]
  ↓ library.add(result) [lib/library.js]
  ↓ storage.set("library", next)   [localStorage]
  ↓ setItems(next)                  [React state → re-render star buttons]
  ↓ if (user) apiFetch("POST", { result })  [fire-and-forget]
```

The `isInLibrary(result)` check in every `ResultCard` is a live-derived lookup against `lib.items` — no separate flag per result. This means every star button re-renders when any library change occurs. With many results visible, this could be a performance concern (F-307-class concern — not filed separately as it's not currently causing issues).

---

## Theme flow

```
User clicks swatch in ThemeStrip
  ↓ changeTheme(key)
  ↓ setThemeKey(key)                 [React state → CSS vars recompute in top div]
  ↓ localStorage.setItem("themeKey", key)
```

CSS variables (`--ui-fg`, `--ui-accent`, etc.) are set as inline `style` on the root `<div>` in `OpenCITE`. All child components consume them via CSS classes or direct `style` props referencing `var(--ui-*)`. No React context needed — pure CSS cascade.

---

## Auth flow

```
App mount → AuthProvider → getSession() → { user, status }
  ↓ authenticated: setUser(session.user), setStatus("authenticated")
  ↓ useSettings/useLibrary/useHistory: useEffect([user?.id, loaded]) fires syncFromDB()

User clicks "sign in"
  ↓ Layout.AuthButton → signIn("google") → lib/auth-client.js → redirect to OAuth
  ↓ callback → session cookie set → getSession() resolves on next load
```

---

## Filter flow (client-side only)

```
User picks a filter in FilterBar
  ↓ onChange({ ...filterState, [key]: value })  (App.jsx: setFilterState)
  ↓ useFilters(effectiveStates, filterState, simpleSearch) re-evaluates (memoized)
  ↓ filteredSections updates → UnifiedResultList / SourceSection re-renders
```

No API call is made for filtering — it's pure client-side derivation from the already-fetched `sectionStates`.

---

## What is NOT in state

- Citation format preference (always MLA + APA, both shown).
- Scroll position.
- Which ResultCard has its citations accordion open (`citationsOpen` is local state per card — not lifted).
- Admin console tab (`activeTab` is local state in `AdminConsole`).
- Gold-set grades during grading (`grades` is local state in `GradingModal`).

---

## 🩺 Health audit

- **Verdict:** healthy flow overall. The main risks are the search race (F-307), the dead BillingContext (F-300), and the missing credit-balance client display (F-311).
- **Smells:** Heavy prop-drilling from `OpenCITE` to deep components (especially `copied`, `onCopy`, `isInLibrary`, `onToggleLibrary` threading through 3 component levels: `App → UnifiedResultList → ResultCard`). Ideal fix is either lifting these into a `ResultInteractionContext` or co-locating them closer to where they're used.
- **Reuse:** `useHistory`, `useLibrary`, `useSettings` all implement the same load-from-localStorage → syncFromDB-on-sign-in → write-both-on-mutation pattern. Should be a shared `useSyncedStore(key, apiPath, validate)` factory hook — see [[09-Audit/Duplication-and-Reuse#r-300]].

## See also

[[01-Frontend/App-Shell]] · [[01-Frontend/Hooks]] · [[01-Frontend/Contexts]] · [[03-Search-Pipeline/Semantic-Rerank]] · [[04-Backend-API/Search-Endpoint]] · [[05-Billing/Billing-Credits]]
