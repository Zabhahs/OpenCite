---
machine_ids: [hooks.useSearch, hooks.useSettings, hooks.useLibrary, hooks.useHistory, hooks.useFilters, hooks.useTheme, hooks.useEagleTooltip]
findings: [F-307, F-308, F-309, F-310]
runtime: client
status: healthy
tags: [hooks, state, localStorage, DB-sync]
---
<!-- AUTO-GENERATED from docs/wiki/01-Frontend/Hooks.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Hooks

> **Seven custom hooks** own all significant client-side state: search execution, settings persistence, library/history sync, filtering, theming, and tooltip lifecycle. `useSemanticRerank` is owned by the Search Pipeline agent — see [Semantic-Rerank](../03-Search-Pipeline/Semantic-Rerank.md).

---

## `useSearch` (`src/hooks/useSearch.js`)

**State owned:** `sectionStates` (object keyed by adapter id, shape `{ loading, results, error, hasMore, loadingMore, offset, pageToken, lowConfidence }`), `hasSearched` (boolean).

**Inputs:** `settings` (full settings object), `isEnabled(adapter)` (from `useSettings`).

**Outputs:** `{ sectionStates, hasSearched, search, loadMore, reset, isSparseResults }`.

**Side effects:**
- Calls `runSearch()` per enabled adapter in parallel (`activeAdapters.forEach(async …)` — fire-and-forget, each resolves independently and patches its own section state).
- Cross-adapter dedup: `seenDOIs` and `seenTitles` are `useRef(new Set())` — reset on each `search()` call. DOI dedup runs first, then title fingerprint dedup across adapters. In simpleSearch mode, dedup is skipped.
- BM25F scoring via `scoreResults()` and `applyConfidenceGate()` from `lib/scoring.js`.
- Synonym expansion via `expandTerms()` from `lib/synonyms.js` (async, awaited before scoring).

**Key behaviours:**
- Multi-keyword (`query.split(";")`): all terms are run in parallel per adapter, then merged. `loadMore` is disabled for multi-keyword (always `hasMore: false`).
- `loadMore(adapterId, query)`: threads both `offset` (offset-based adapters) and `pageToken` (token-based, e.g. Rijksmuseum). Combined result array grows by appending new results.
- `isSparseResults`: memoized — true when all adapters done and total results < 5 (D2/D3 signal).
- Simple/raw mode (`settings.simpleSearch`): skips dedup, scoring, and confidence gate. Results pass through as-is from adapters.

**Race condition note (F-307):** `activeAdapters.forEach(async …)` fires all adapters concurrently with separate `setSectionStates` calls. If the user fires a second search before all adapters from the first search resolve, stale adapter responses from the first search will still call `setSectionStates(prev => ({ ...prev, [adapter.id]: … }))` and potentially land in state after the second search has already reset. There is no cancellation mechanism (no `AbortController`, no search ID versioning).

---

## `useSettings` (`src/hooks/useSettings.js`)

**State owned:** `settings` (full settings object, default from `constants/defaults.js`), `loaded` (boolean).

**Inputs:** `useAuth()` for `user`.

**Outputs:** `{ settings, save, load, loaded, isEnabled, toggleAdapter }`.

**Side effects:**
- `load()`: reads `storage.get("settings")` (namespaced localStorage). Migrates legacy bare keys (`europeanaKey`, `openAlexKey`, etc.) on first run via `migrateLegacyKeys()`. Applies v.31 one-time migration (enables semantic + synonym) if `!base.searchDefaultsV31`.
- `syncFromDB()`: fires via `useEffect([user?.id, loaded])` when user signs in and settings are loaded. GETs `/api/settings`; DB wins on conflict (merges `DEFAULT_SETTINGS → localStorage → DB`). If no DB record, pushes current local settings up.
- `save(next)`: always writes `storage.set("settings", next)` + fire-and-forget POST to `/api/settings` if signed in.

**`isEnabled(adapter)`:** checks `settings.enabledSources[adapter.id]` override first; falls back to `isAdapterDefaultEnabled(adapter)` from `adapters/index.js`.

**`toggleAdapter(adapterId)`:** guards against toggling CORE adapters. Calls `save()` with updated `enabledSources`.

**Ref pattern:** `settingsRef` keeps a always-current closure ref so `syncFromDB()` (async) reads the latest local state even if it was updated between the `useEffect` trigger and the DB response.

**F-308 (dead context):** `SettingsContext.SettingsProvider` wraps `useSettings` and exports `useSettingsContext`, but it is never mounted anywhere in the app tree. All consumers call `useSettings()` directly. The context is fully dead.

---

## `useLibrary` (`src/hooks/useLibrary.js`)

**State owned:** `items` (array of saved result objects), `loaded` (boolean).

**Inputs:** `useAuth()` for `user`.

**Outputs:** `{ items, load, isInLibrary, toggle, clear }`.

**Side effects:**
- `load()`: calls `library.load()` → `storage.get("library", [])`.
- `syncFromDB()`: fires on sign-in (same pattern as useSettings). DB wins; if empty DB, pushes local items up one-by-one (fire-and-forget POSTs per item).
- `toggle(result)`: if in library → `library.remove()` + DELETE `/api/library`. Else → `library.add()` + POST `/api/library`. Both paths write localStorage first, then fire-and-forget API.
- `clear()`: wipes localStorage + DELETE `/api/library?clear=true`.
- Dynamic import of `storage.js` inside `syncFromDB()` (`src/hooks/useLibrary.js:48`) — a minor inconsistency since `storage` is already available at module level via `lib/library.js`. No real harm but odd.

**`isInLibrary(result)`:** checks by `libraryKey()` (DOI or `source:id`).

---

## `useHistory` (`src/hooks/useHistory.js`)

**State owned:** `entries` (array of `{ query, ts }` objects), `loaded` (boolean).

**Inputs:** `useAuth()` for `user`.

**Outputs:** `{ entries, load, add, remove, clear }`.

**Side effects:** Identical pattern to `useLibrary`. `add()` writes to `history.js` lib + POST `/api/history`. `remove()` + DELETE. `clear()` + DELETE. DB wins on sync.

**Note:** `add()` deduplicates: history lib filters out existing entries with the same query before prepending, capped at `HISTORY_MAX` (50).

---

## `useFilters` (`src/hooks/useFilters.js`)

**State owned:** none (pure derivation).

**Inputs:** `sectionStates`, `filterState`, `bypass` (simpleSearch flag).

**Output:** filtered/sorted copy of `sectionStates` (same shape).

**Side effects:** none.

**Logic:**
1. Computes `anyGenuine` — true if any result across all adapters is not `_lowConfidence`. If true, drops all `_lowConfidence` results globally (cross-adapter confidence gate).
2. In `bypass` mode (simpleSearch), returns `sectionStates` as-is.
3. Applies filters in order: type, language (normalized), yearMin, yearMax, keyword (exact lowercase match on keywords/subjects), oaOnly.
4. Applies sort: citations (citedBy desc), year (year desc), relevance (_score desc). Default preserves BM25F + RRF order from useSearch.

Fully memoized via `useMemo` on all filter dimensions + bypass flag.

---

## `useTheme` (`src/hooks/useTheme.js`)

**State owned:** `themeKey` (string, one of the THEMES keys).

**Inputs:** none (reads from `localStorage["themeKey"]` + `window.matchMedia`).

**Outputs:** `{ themeKey, theme, changeTheme }`.

**Side effects:**
- `getInitialTheme()` runs synchronously at init (no flash): checks `localStorage["themeKey"]` first, then OS preference (`prefers-color-scheme: dark` → "oled", else "tan").
- `useEffect` listens to OS `prefers-color-scheme` changes; only acts if no manual preference is stored.
- `changeTheme(key)`: sets state + writes `localStorage["themeKey"]`.

**Note (F-309):** `DEFAULT_THEME = "tan"` exported from themes.js but `useTheme` never imports or uses it — it hardcodes `"tan"` and `"oled"` as `LIGHT_DEFAULT` and `DARK_DEFAULT` at lines 4–5. The exported constant is dead.

---

## `useEagleTooltip` (`src/hooks/useEagleTooltip.js`)

**State owned:** `visible` (boolean).

**Inputs:** optional `flagKey` (localStorage key for one-time suppression).

**Outputs:** `{ show, dismiss, props: { visible, onDismiss } }`.

**Side effects:**
- `show()`: checks `localStorage[flagKey]`; if already set, does nothing. Otherwise sets `visible = true`.
- `dismiss()`: sets `visible = false`; if `flagKey` given, writes `localStorage[flagKey] = "1"`.
- Auto-dismiss (4s timeout) and click-anywhere-dismiss are handled in `EagleTooltip` component itself, not in this hook.

Currently only used once: `ResultCard.jsx:24` with key `"eagle_library_prompted"`.

---

## localStorage key inventory

All namespaced under `"opencite:"` prefix via `lib/storage.js`:

| Namespaced key | Written by | Read by |
|---|---|---|
| `opencite:settings` | useSettings.save | useSettings.load |
| `opencite:library` | lib/library.js | useLibrary.load |
| `opencite:history` | lib/history.js | useHistory.load |
| `opencite:gold_queries` | GoldSetHarness | GoldSetHarness |
| `opencite:test_runs` | GoldSetHarness | GoldSetHarness |

Bare (un-namespaced) keys:

| Key | Written by | Read by |
|---|---|---|
| `themeKey` | useTheme.changeTheme | useTheme (init) |
| `opencite_sync_tooltip_dismissed` | Layout.AuthButton | Layout.AuthButton |
| `opencite_auth_prompted` | App.dismissModal | App (two useEffects) |
| `eagle_library_prompted` | useEagleTooltip | useEagleTooltip |

**F-310:** `GoldSetHarness` (admin-only) stores gold queries and test runs under bare keys `"opencite_gold_queries"` and `"opencite_test_runs"` — not using the namespaced `storage` utility. Should use `storage.set/get("gold_queries")` etc. **Fixed v0.40:** now does, with a one-time migration of the legacy bare keys.

---

## 🩺 Health audit

- **Verdict:** healthy overall; one real race condition (F-307), one dead feature (F-308, F-309), one namespace inconsistency (F-310).
- **Findings:** [F-307] Search race — no AbortController; stale adapter responses from a superseded search can land in state after a new search fires. [F-308] SettingsContext never mounted — dead code. [F-309] `DEFAULT_THEME` exported but never used. [F-310] GoldSetHarness writes localStorage outside the namespaced storage utility. (fixed v0.40)
- **Reuse:** `useHistory`/`useLibrary`/`useSettings` share an identical DB-sync pattern (load from localStorage → syncFromDB on sign-in → write both on mutation). This pattern should be a shared `useSyncedStore` factory — see [Duplication-and-Reuse](../09-Audit/Duplication-and-Reuse.md#r-300).

## See also

[App-Shell](App-Shell.md) · [Contexts](Contexts.md) · [State-Flow](State-Flow.md) · [Semantic-Rerank](../03-Search-Pipeline/Semantic-Rerank.md) · [Bugs](../09-Audit/Bugs.md)
