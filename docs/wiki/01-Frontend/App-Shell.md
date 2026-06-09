---
machine_ids: [main, App]
findings: [F-300, F-301, F-302]
runtime: client
status: healthy
tags: [shell, orchestrator, provider, state]
---

# App Shell

> **Root orchestration layer.** `main.jsx` mounts the React tree; `App.jsx` owns every piece of top-level state and wires all hooks, contexts, and components together into a single-page application.

## What it is

`src/main.jsx` (9 lines) is the Vite entry point — `ReactDOM.createRoot` on `#root`, wrapped in `<React.StrictMode>`. It renders `<App />`.

`src/App.jsx` exports two components:

- **`App`** (the default export, lines 462–470) — the outer shell. Provides `<AuthProvider>`, mounts `<KofiOverlay />` (the Ko-fi floating donation widget, renders nothing itself), `<Analytics />` and `<SpeedInsights />` (Vercel telemetry, both browser-only).
- **`OpenCITE`** (internal, lines 40–460) — the full application. All hooks are called here; JSX branches on `showAdminConsole` to render either the admin route or the main search UI.

## Provider tree (outermost → innermost)

```
ReactDOM.createRoot
  React.StrictMode
    AuthProvider          ← live (see Contexts.md)
      KofiOverlay         ← side-effect only, no children
      OpenCITE            ← all hooks + all JSX
        Analytics
        SpeedInsights
```

**Notable absence:** `BillingContext.BillingProvider` is NOT in the tree — it is never mounted anywhere (see F-300). `SettingsContext.SettingsProvider` is also absent — `useSettings` is called directly in `OpenCITE` and props/callbacks are drilled down.

## Top-level state owned by `OpenCITE`

| State | Hook/`useState` | Description |
|---|---|---|
| `query` | `useState("")` | Controlled input value |
| `activePanel` | `useState(null)` | Which panel is open (`"library"`, `"history"`, `"settings"`, `"plans"`, or `null`) |
| `copied` | `useState({id,style})` | Clipboard feedback state (card id + citation style) |
| `showAuthModal` | `useState(false)` | Auth nudge modal visibility |
| `searchCount` | `useState(0)` | Tracks searches; triggers auth modal at ≥ 3 anonymous searches |
| `filterState` | `useState({})` | Client-side filter selections (type/lang/year/keyword/oaOnly/sortBy) |
| `rrfWeight` | `useState(0.4)` | Live Lexical↔Semantic slider value (0–1) |

## Hooks called in `OpenCITE`

All called at mount; none conditionally (React rules-of-hooks compliant):

| Hook | What it gives | Source |
|---|---|---|
| `useAuth()` | `{ status, user }` | `AuthContext` |
| `useTheme()` | `{ themeKey, theme, changeTheme }` | `hooks/useTheme` |
| `useSettings()` | `{ settings, save, load, loaded, isEnabled, toggleAdapter }` | `hooks/useSettings` |
| `useHistory()` | `{ entries, load, add, remove, clear }` | `hooks/useHistory` |
| `useLibrary()` | `{ items, load, isInLibrary, toggle, clear }` | `hooks/useLibrary` |
| `useSearch()` | `{ sectionStates, hasSearched, search, loadMore, reset, isSparseResults }` | `hooks/useSearch` |
| `useSemanticRerank()` | `{ rerankedStates, rerankStatus }` | `hooks/useSemanticRerank` (not owned by this agent) |
| `useFilters()` | `filteredSections` | `hooks/useFilters` |

`isAdmin(user)` is a plain function call (not a hook) from `src/lib/admin.js`.

## The `resultsReady` gate

`src/App.jsx:165–170` — the anti-reshuffle guard introduced in v.31.

```
resultsReady =
  !hasSearched → false
  !allDone     → false
  totalResults === 0 → true      (empty results always ready)
  !semanticActive  → true        (no rerank needed)
  rerankStatus === "done" | "error" → true
```

The JSX holds the `<UnifiedResultList>` / `<SourceSection>` subtree **hidden** until `resultsReady === true`. A `semanticPreparing` flag shows a "Ranking… downloading model (~23MB)" loading message while reranking is in-flight. This prevents the "populate-then-reshuffle" flash that plagued v.30.

`effectiveStates = rerankedStates || sectionStates` — if semantic rerank hasn't run (disabled or errored), raw search states are used directly.

## Admin console routing

Hash-based SPA route (`src/App.jsx:53`):

```js
const showAdminConsole = admin && window.location.hash === "#/admin/console";
```

When true, the entire main search UI is replaced by a stripped layout containing only `<Header>` (with no-op panel handlers), `<AdminConsole />`, and `<Footer />`. Navigation back is `window.location.hash = ""; window.location.reload()`.

Gate: `isAdmin(user)` — email-allowlist (`VITE_ADMIN_EMAILS`) checked client-side in `src/lib/admin.js`. The `⚗ admin` link in `<Header>` is only rendered when `admin === true`.

## Auth modal triggers

Two paths trigger `setShowAuthModal(true)` (`src/App.jsx:90–96, 124–129`):

1. **After 3 searches** while `status === "unauthenticated"` and `localStorage["opencite_auth_prompted"]` is absent.
2. **After 2s timer** on first load while unauthenticated and the key is absent.

Once dismissed, `localStorage["opencite_auth_prompted"] = "1"` suppresses all future shows.

## Source sort in Source view

`sortedAdapters` (`src/App.jsx:173–187`) — computed after all adapters finish (`allDone`). Adapters with results float above those with zero results; within each tier they're ranked by average `_score` of their `filteredSections` results. While loading, the original `enabledAdapters` order is used (no flash).

`withResults` / `withoutResults` (`src/App.jsx:189–201`) — further partitions `sortedAdapters` into adapters that have data (loading/error/results) vs those that returned nothing; zero-result adapters show as collapsed chips at the bottom of source view.

## Logo triple-click easter egg

`src/App.jsx:132–148` — admin only. Three clicks within 600ms copies the debug log ring buffer to clipboard. Non-admin click (or <3 admin clicks) resets query + panel + search state.

## Bootstrap sequence

`useEffect([], mount)` at `src/App.jsx:78–83`:
1. `loadSettings()` — reads localStorage (and migrates legacy keys)
2. `hist.load()` — reads history from localStorage
3. `lib.load()` — reads library from localStorage
4. `inputRef.current?.focus()` — auto-focus the search input

## 🩺 Health audit

- **Verdict:** healthy — orchestration is clean; only real concern is `BillingContext` orphan.
- **Findings:** [F-300] `BillingProvider` is never mounted — stub is unreachable. [F-301] `SettingsContext`/`SettingsProvider` exists but is never used — settings are prop-drilled. [F-302] `settings.europeanaKey` emptiness check on the home-screen empty state (`src/App.jsx:444`) leaks an implementation detail into the view layer.
- **Reuse:** `isAdmin()` is called twice (App.jsx + AdminConsole.jsx); `showAdminConsole` re-implements a poor man's router — see [[09-Audit/Duplication-and-Reuse]].
- **Smells:** `copyText` at `src/App.jsx:203–207` is a one-liner helper that should live in `lib/helpers.js`. `handleLoadMoreAll` at lines 109–117 filters adapters by both `sectionStates` and `filteredSections` — subtle two-source-of-truth; works but fragile.

## See also

[[01-Frontend/Hooks]] · [[01-Frontend/Contexts]] · [[01-Frontend/State-Flow]] · [[01-Frontend/UI-Map]] · [[01-Frontend/Components/_index]] · [[03-Search-Pipeline/Semantic-Rerank]]
