# OpenCITE — Sprint Log v0.41

> **PM + architecture document for the next Claude instance(s).** Self-contained execution
> plan for **Frontend Cleanup & Reuse** — dead-code quarantine, a stale-response race fix,
> three correctness cleanups, and two component/hook reuse extractions. Zero new features;
> zero API changes. All tasks are zero-behavior-change unless noted.
>
> Read `architecture_report_v0_30.md` (project context) + the quarantine index at
> `docs/wiki/99-Archive/_quarantine/_index.md` before executing.
>
> **Created:** 2026-06-08 · **Status:** EXECUTED 2026-06-09 (T1–T9 complete), NOT committed/deployed.
> **Mode:** C (plan → approval → execute → checklist). No padding; precise execution.
>
> **Actuals (2026-06-09):** All 9 task groups done. Two plan corrections applied during execution:
> (1) `findings.json` is **generated** from `_machine/_fragments/*.findings.json` (build-machine-map.mjs
> concatenates them) — so statuses were set in the SSOT **fragments** + the map rebuilt, never the
> generated file (CLAUDE.md SSOT rule). (2) `getSession(req)` returns the **flat** user object
> (`{id,name,email}`), not `{user:{…}}` — `api/credits.js` uses `user.id` accordingly, plus a 405
> guard and a graceful DB-error fallback to the Infinity/"free" stub. `useSyncedStore` interface
> landed as `useSyncedStore(initialValue, { apiPath, loadLocal, parse, pushLocal, merge, persist })`.
> Machine map rebuilt clean: 160 modules / 306 edges / 71 findings, zero warnings. F-300/302/304/307/
> 309/314/315 → `fixed`; F-301/305/308 → `quarantined`; F-100/101 wiki pointer added (still `open`).

---

## 0. TL;DR

**The problem:** The frontend ships dead code (two unused context providers, two disabled OAuth
buttons, a re-hardcoded constant), contains a stale-response race condition, leaks an
implementation detail into the home empty-state view, shows a permanently wrong plan badge,
and duplicates ~120 LOC of localStorage↔DB sync logic across three hooks plus ~60 LOC of
book-group-header JSX across two components.

**This sprint:** Remove what is dead (quarantine-first, no permanent deletion), fix what is
broken (stale-response race, wrong plan badge), derive what is derived (`hasAllKeyedSources`
boolean, `DEFAULT_THEME` import), extract what is duplicated (`useSyncedStore`, `BookGroupHeader`),
and document the cross-import pattern that roots the F-100/F-101 shared-utils problem.

**Scope groups:**

| Group | Items | Risk |
|---|---|---|
| Dead-code quarantine | `SettingsContext`, Apple/Microsoft OAuth | Zero — code is never called |
| Mount + wire | `BillingProvider` → App.jsx → `/api/credits` | Low — provider currently stubs to Infinity; mounting it changes nothing until the API route is added |
| Correctness cleanups | `DEFAULT_THEME` re-hardcode; `europeanaKey` check; stale SettingsPanel comment | Zero |
| Bug fix | `useSearch` stale-response race (no `searchId` guard) | Low — pure defensive guard, no result-set change under normal timing |
| PricingPanel plan wire | `currentPlan` from `BillingContext` (depends on F-300 mount) | Low — currently always "free"; wiring to provider value is still "free" until `/api/credits` is live |
| Reuse extractions | `useSyncedStore`; `<BookGroupHeader>` | Zero — pure refactor |
| Shared-utils pattern | Document `packages/shared-utils` approach for F-100/F-101 | Zero — planning doc only this sprint |

**No scope:** security fixes, adapter changes, billing API implementation, v0.42 credit counter
(that requires a live `/api/credits` endpoint — blocked until T2 below ships and the endpoint
is built; tracked as F-311).

---

## 1. Scope

### 1.1 Dead-code removal (quarantine-first)

- **F-301 / F-308** `src/contexts/SettingsContext.jsx` (16 lines) — `SettingsProvider` /
  `useSettingsContext` / `SettingsContext` are never mounted, never imported anywhere. Dead since
  the file was created. [[09-Audit/Tech-Debt-Overengineering#f-301]]
- **F-305** `PROVIDERS` array in `src/components/Layout.jsx:8–12` — `apple` (active:false) and
  `microsoft-entra-id` (active:false) render greyed "↳ Apple — soon" / "↳ Microsoft — soon" items
  in the sign-in dropdown for every unauthenticated user. Only `google` is live. [[09-Audit/Tech-Debt-Overengineering#f-305]]

Policy: both items go through the quarantine dossier protocol before removal.

### 1.2 BillingProvider mount (F-300 — unblocks F-311 / F-315)

- **F-300** `BillingProvider` exists but is never in the React tree. `App.jsx:462–470` wraps
  only `AuthProvider` → `KofiOverlay`, `OpenCITE`, `Analytics`, `SpeedInsights`. This sprint
  mounts `BillingProvider` inside `AuthProvider` and wires it to a new `/api/credits` GET
  endpoint. [[09-Audit/Tech-Debt-Overengineering#f-300]]

### 1.3 Correctness cleanups

- **F-309** `useTheme.js:4` hardcodes `LIGHT_DEFAULT = "tan"` even though line 2 already
  imports `DEFAULT_THEME` from `themes.js`. `themes.js:49` exports `DEFAULT_THEME = "tan"`.
  Replace the hardcoded string with the import. [[09-Audit/Tech-Debt-Overengineering#f-309]]
- **F-302** `App.jsx:444` checks `!settings.europeanaKey` to show the empty-state banner.
  Derives a boolean from adapter eligibility instead. [[09-Audit/Tech-Debt-Overengineering#f-302]]
- **F-304** `Panels.jsx:380–382` stale migration comment — remove it. [[09-Audit/Tech-Debt-Overengineering#f-304]]

### 1.4 Bug fix — stale-response race (F-307)

- **F-307** `useSearch.js:44` fires `activeAdapters.forEach(async ...)`. If the user fires a
  second search before a slow adapter from the first resolves, the stale adapter callback still
  calls `setSectionStates(prev => ...)`, overwriting the new search's `loading:true` state with
  old results. Add a `searchId` ref guard. [[09-Audit/Tech-Debt-Overengineering#f-307]]

### 1.5 PricingPanel plan wire (F-315 — depends on F-300)

- **F-315** `Panels.jsx:190` `PricingPanel({ currentPlan = "free" })` — App.jsx:299 passes no
  prop, so paying subscribers always see "Current" on the Free card. After F-300 mounts
  `BillingProvider`, read `useBilling().tier` and pass it as `currentPlan`. [[09-Audit/Bugs#f-315]]

### 1.6 Reuse extractions

- **R-300** `useSyncedStore` — extract the localStorage↔DB-sync 4-step pattern (~40–50 LOC per
  hook) shared identically across `useHistory`, `useLibrary`, `useSettings`.
  [[09-Audit/Duplication-and-Reuse#r-300]]
- **F-314 / R-301** `<BookGroupHeader>` — extract the ~30-line parent-work header JSX block
  duplicated verbatim in `SourceSection.jsx:75–103` and `UnifiedResultList.jsx:136–164`.
  [[09-Audit/Duplication-and-Reuse#r-301]]

### 1.7 Shared-utils pattern doc (F-100 / F-101 — planning only)

The 8 `divergent-duplicate` reuse records in `reuse.json` (xmlUtils, proxy spoof-headers, log,
six normalization shims) all share one root cause: Vercel Edge routes cannot import from `src/`.
This sprint produces a concise `docs/wiki/02-Adapters/Shared-Utils-Plan.md` that documents the
`packages/shared-utils` workspace approach as the durable fix. No code change this sprint —
execution is a separate spike (medium effort, requires monorepo workspace config).

---

## 2. Design / approach

### 2.1 Quarantine protocol

Per `docs/wiki/99-Archive/_quarantine/_index.md`:
1. Write a dossier file at `docs/wiki/99-Archive/_quarantine/` with the full verbatim source,
   revival checklist, and the finding IDs that justified removal.
2. Remove the import/export/usage from active files.
3. Mark `status: quarantined` in `docs/wiki/_machine/findings.json` for each finding.

Two dossiers required: `context-settings.md` (F-301/F-308) and `oauth-apple-microsoft.md` (F-305).

### 2.2 BillingProvider mount (F-300)

The provider currently stubs `credits: Infinity, tier: "free"`. Mounting it is safe — it changes
nothing visually. The real work is adding a `/api/credits` GET endpoint that returns
`{ credits, tier }` from the user's Postgres row (same DB query that `api/search.js` already
runs for credit gating). Once the endpoint exists, `BillingProvider` can call it on mount and
on each `user` change.

`App.jsx` tree after change:
```jsx
// App.jsx
export default function App() {
  return (
    <AuthProvider>
      <BillingProvider>   {/* NEW — mounts the stub; wires to /api/credits */}
        <KofiOverlay />
        <OpenCITE />
        <Analytics />
        <SpeedInsights />
      </BillingProvider>
    </AuthProvider>
  );
}
```

`BillingContext.jsx` updated to call `/api/credits` on sign-in:
```js
// BillingContext.jsx — Phase 2 wire-up
export function BillingProvider({ children }) {
  const { user, status } = useAuth();
  const [credits, setCredits] = useState(Infinity);
  const [tier, setTier]       = useState("free");

  useEffect(() => {
    if (status !== "authenticated") { setCredits(Infinity); setTier("free"); return; }
    fetch("/api/credits")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) { setCredits(data.credits); setTier(data.tier); } })
      .catch(() => {});
  }, [status]);

  const deduct = useCallback(() => Promise.resolve(true), []);
  return (
    <BillingContext.Provider value={{ credits, tier, deduct }}>
      {children}
    </BillingContext.Provider>
  );
}
```

`api/credits.js` (new route, Node runtime):
```js
// GET /api/credits → { credits: number, tier: string }
// VERIFIED ON-BRANCH 2026-06-08: import paths + signatures corrected to match the
// actual modules — getSession(req) takes ONE arg (api/_shared/auth.js:36); prisma is
// exported from api/_shared/prisma.js (there is no _shared/db.js); resolveSessionAdmin(req)
// takes the REQUEST and returns an admin identity object or null (api/_shared/apiAuth.js:86,
// called as resolveSessionAdmin(req) in api/search.js:126).
import { getSession } from "./_shared/auth.js";
import { prisma } from "./_shared/prisma.js";
import { resolveSessionAdmin } from "./_shared/apiAuth.js";

export default async function handler(req, res) {
  // Admin (allowlist/master key) → unmetered. resolveSessionAdmin reads the req itself.
  const admin = await resolveSessionAdmin(req);
  if (admin) return res.status(200).json({ credits: Infinity, tier: "admin" });
  const session = await getSession(req);
  if (!session?.user?.id) return res.status(401).json({ error: "Unauthenticated" });
  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { total_credits: true, plan: true }, // verify `plan` column on User; else derive via getPlan()
  });
  if (!row) return res.status(404).json({ error: "User not found" });
  return res.status(200).json({
    credits: Number(row.total_credits),
    tier: row.plan || "free"
  });
}
```

### 2.3 Stale-response guard (F-307)

Add a `searchId` ref incremented on every `search()` call. Each async adapter callback closes
over its own `searchId` value; if it no longer matches the current ref, it silences the
`setSectionStates` call.

```js
// useSearch.js — add near the top of useSearch()
const searchIdRef = useRef(0);

// inside search():
const thisId = ++searchIdRef.current;

// inside each adapter's async callback, before setSectionStates:
if (searchIdRef.current !== thisId) return; // stale — discard
```

Risk: zero behavior change on normal timing. Fixes the race silently.

### 2.4 `useSyncedStore` extraction (R-300)

The three hooks share an identical 4-step pattern:
1. `load()` — reads localStorage on mount.
2. `useEffect([user?.id, loaded])` → `syncFromDB()` on sign-in.
3. `syncFromDB()` — GET → DB wins merge → write localStorage.
4. Mutation (add/toggle/save) — writes localStorage + fire-and-forget API call if `user`.

The hook-specific logic is only: the localStorage read function, the API path, the state
variable name (entries/items/settings), and the mutation methods (add/remove/toggle/save/clear).

Extract to `src/hooks/useSyncedStore.js`:
```js
// useSyncedStore(key, apiPath, defaultValue, { read, push })
// Returns: [value, setValue, { load, syncFromDB }]
```
Each consumer hook becomes ~10–15 lines of mutation wrappers that call `useSyncedStore` for
the shared plumbing. Exact interface is deferred to execution; the point is zero behavior change.

### 2.5 `<BookGroupHeader>` extraction (F-314 / R-301)

Two verbatim copies:
- `SourceSection.jsx:75–103` — 29 lines of JSX (badge, year, h3 title, editors, publisher).
- `UnifiedResultList.jsx:136–164` — 29 lines, identical except for `key` prop on the outer div.

New file: `src/components/BookGroupHeader.jsx`.
Props: `group` (the grouped-result object with `items`, `year`, `parentTitle`, `editors`,
`publisher`). Both consumers import `BookGroupHeader` and replace the duplicated block with
`<BookGroupHeader group={group} />`.

Risk: zero — pure refactor, identical JSX.

### 2.6 Shared-utils plan doc (F-100 / F-101)

The 8 `divergent-duplicate` records in `reuse.json` that involve cross-import constraints are:
xmlUtils (R-100), proxy spoof headers (R-105), log twins (R-400), six normalization shims
(R-401). The durable fix is a `packages/shared-utils` workspace (npm workspaces or pnpm):

```
packages/
  shared-utils/
    package.json   { "name": "@opencite/shared-utils", "main": "index.js" }
    xmlUtils.js    (moved from src/adapters/_shared/xmlUtils.js)
    proxyHeaders.js (extracted from src/adapters/_shared/proxy.js + api/proxy.js)
    index.js
```

Both `src/` (Vite) and `api/` (Vercel Node/Edge) would import from
`@opencite/shared-utils/xmlUtils` — no cross-import constraint, no duplication. This sprint
writes the plan doc only; the actual monorepo workspace setup is a separate spike (requires
`package.json` workspaces config + Vercel build command update).

---

## 3. Execution plan

### T1 — Quarantine: SettingsContext (~1 h)

Refs: F-301, F-308 · [[09-Audit/Tech-Debt-Overengineering#f-301]]
Risk: zero.

- [ ] T1.1 Create `docs/wiki/99-Archive/_quarantine/context-settings.md`:
      - Verbatim copy of `src/contexts/SettingsContext.jsx` (16 lines).
      - Revival checklist: mount `SettingsProvider` in `App.jsx`; migrate all `useSettings()`
        call sites to `useSettingsContext()`; remove prop-drilling chain for `settings`/`save`/`load`.
      - Findings: F-301, F-308.
- [ ] T1.2 Update `docs/wiki/_machine/findings.json`: set `"status": "quarantined"` for both
      F-301 and F-308.
- [ ] T1.3 Delete `src/contexts/SettingsContext.jsx` (no import sites to clean — confirmed by
      grep: zero imports of `SettingsContext.jsx` or `SettingsProvider` across the codebase).
- [ ] T1.4 Update `docs/wiki/99-Archive/_quarantine/_index.md` register table: add the row
      `| [[context-settings]] | v0.41 | Never mounted — prop-drilling used instead | F-301, F-308 | Yes — see revival checklist |`.
- [ ] T1.5 Verify: `grep -r "SettingsContext\|SettingsProvider\|useSettingsContext" src/` → zero hits.

### T2 — Quarantine: Apple/Microsoft OAuth buttons (~0.5 h)

Refs: F-305 · [[09-Audit/Tech-Debt-Overengineering#f-305]]
Risk: zero.

- [ ] T2.1 Create `docs/wiki/99-Archive/_quarantine/oauth-apple-microsoft.md`:
      - Verbatim copy of the `PROVIDERS` array (`Layout.jsx:8–12`, the two inactive entries).
      - Revival checklist: implement Apple/Microsoft OAuth in `AuthContext.jsx`; re-add entries
        with `active: true`; test sign-in flow end-to-end.
      - Finding: F-305.
- [ ] T2.2 Update `docs/wiki/_machine/findings.json`: set `"status": "quarantined"` for F-305.
- [ ] T2.3 Edit `src/components/Layout.jsx:8–12`: remove the Apple and Microsoft entries from
      `PROVIDERS`. Leave only `{ id: "google", label: "Google", active: true }`. The `p.active`
      branch in the dropdown render stays (it still handles the `active:true` case); remove
      the `p.active ? ... : ...` ternary — simplify to just the button (no else branch needed
      once only active providers exist). Exact lines: the `PROVIDERS` array becomes 3 lines;
      the dropdown `.map()` loses the ternary and the disabled `<div>` branch.
- [ ] T2.4 Update `docs/wiki/99-Archive/_quarantine/_index.md` register: add the row
      `| [[oauth-apple-microsoft]] | v0.41 | Inactive "soon" UI — no OAuth integration yet | F-305 | Yes — implement OAuth first |`.
- [ ] T2.5 Verify: sign-in dropdown shows only "↳ google"; no greyed "soon" items.

### T3 — Mount BillingProvider + add `/api/credits` (~1.5 h)

Refs: F-300 · [[09-Audit/Tech-Debt-Overengineering#f-300]] · unblocks F-311, F-315.
Risk: low.

- [ ] T3.1 Create `api/credits.js` (new file, Node runtime, no Vercel Edge) per the design in
      §2.2. Query: `prisma.user.findUnique({ where: { id }, select: { total_credits, plan } })`.
      Admin path: return `{ credits: Infinity, tier: "admin" }`. Unauthenticated: 401.
- [ ] T3.2 Update `src/contexts/BillingContext.jsx`: replace the static `STUB_VALUE` with the
      `useAuth()`-triggered fetch per §2.2. Remove the static `STUB_VALUE` object; keep the
      `deduct` no-op for now (spend-side wiring is a v0.42 task). Import `useAuth`, `useState`,
      `useEffect`, `useCallback`.
- [ ] T3.3 Update `src/App.jsx:462–470`: wrap `<KofiOverlay />` + `<OpenCITE />` + `<Analytics />`
      + `<SpeedInsights />` inside `<BillingProvider>` (child of `<AuthProvider>`). Add the import
      line at the top of App.jsx.
- [ ] T3.4 Manual smoke test: sign in as admin → `/api/credits` returns `{ credits: Infinity, tier: "admin" }`.
      Sign in as a test free user → returns correct `{ credits, tier: "free" }`.
      Sign out → BillingProvider resets to `{ credits: Infinity, tier: "free" }` (stub fallback).
- [ ] T3.5 Update `docs/wiki/_machine/findings.json`: set `"status": "fixed"` for F-300.

### T4 — Correctness: DEFAULT_THEME, europeanaKey, stale comment (~0.5 h)

Refs: F-309, F-302, F-304 · [[09-Audit/Tech-Debt-Overengineering#f-309]] / [[#f-302]] / [[#f-304]]
Risk: zero for all three.

- [ ] T4.1 **F-309** `src/hooks/useTheme.js:4–5`: delete `const LIGHT_DEFAULT = "tan";`. Replace
      `LIGHT_DEFAULT` references in the file (lines 4, 17, 30) with `DEFAULT_THEME`. The import on
      line 2 already includes `DEFAULT_THEME` — no import change needed.
      Verify: `LIGHT_DEFAULT` no longer appears in the file.
- [ ] T4.2 **F-302** `src/App.jsx:444`: replace `!settings.europeanaKey` with a derived boolean.
      Add above the JSX block (or in a memo):
      ```js
      const hasAllKeyedSources = !!settings.europeanaKey;
      // TODO(future): expand to `allKeyedAdapters.every(a => a.isServerKeyed || settings[a.keyField])`
      //   once EUROPEANA_API_KEY env lands and europeanaKey is dropped (see useSettings.js TODO).
      ```
      Condition: `!hasAllKeyedSources`. Zero behavior change today; the abstraction is correct for
      the future transition.
- [ ] T4.3 **F-304** `src/components/Panels.jsx:380–382`: delete the three-line migration comment.
      Replace with a one-line hint: `{/* Search controls (relevance slider, synonyms, layout) live in SearchControls */}`.
- [ ] T4.4 Update `findings.json`: set `"status": "fixed"` for F-309, F-302, F-304.

### T5 — Bug fix: useSearch stale-response race (~0.5 h)

Refs: F-307 · [[09-Audit/Tech-Debt-Overengineering#f-307]]
Risk: low (defensive guard only; no result change on normal timing).

- [ ] T5.1 `src/hooks/useSearch.js`: add `const searchIdRef = useRef(0);` after the existing
      `seenTitles` ref (line ~15).
- [ ] T5.2 Inside `search()` (line ~22, after the early-return guard): add
      `const thisId = ++searchIdRef.current;`. Also call `searchIdRef.current++` inside `reset()`
      to invalidate any in-flight searches when the user clears.
- [ ] T5.3 Inside each adapter's async callback (the `try` block starting at line ~45): add
      the guard `if (searchIdRef.current !== thisId) return;` immediately before the `setSectionStates`
      success call **and** before the `setSectionStates` error call in the `catch` block. Both
      branches must be guarded.
- [ ] T5.4 Verify: fire a slow query, immediately fire a second query; confirm the first query's
      stale results do not appear in the final state (manual test with network throttling or a
      brief `await delay(500)` in an adapter call).
- [ ] T5.5 Update `findings.json`: set `"status": "fixed"` for F-307.

### T6 — Wire PricingPanel currentPlan from BillingContext (~0.5 h)

Refs: F-315 · depends on T3 (BillingProvider mounted). [[09-Audit/Bugs#f-315]]
Risk: low — behavior is unchanged until `/api/credits` returns a non-"free" tier.

- [ ] T6.1 `src/App.jsx`: import `useBilling` from `contexts/BillingContext.jsx`. Inside
      `OpenCITE()`, add `const { tier } = useBilling();`.
- [ ] T6.2 `src/App.jsx:299`: update the `PricingPanel` call from
      `<PricingPanel platform={...} isAuthenticated={...} onRequireAuth={...} />`
      to `<PricingPanel platform={...} currentPlan={tier} isAuthenticated={...} onRequireAuth={...} />`.
- [ ] T6.3 `src/components/Panels.jsx:190`: remove `currentPlan = "free"` default prop (or keep
      as a fallback). The prop is now always passed.
- [ ] T6.4 Verify: signed-out user → `tier` is `"free"` → Free card shows "Current" (correct).
      Admin user → `tier` is `"admin"` → no card shows "Current" (graceful, no match).
- [ ] T6.5 Update `findings.json`: set `"status": "fixed"` for F-315.

### T7 — Extract useSyncedStore (~2 h)

Refs: R-300 · [[09-Audit/Duplication-and-Reuse#r-300]]
Risk: zero — pure refactor of identical logic.

- [ ] T7.1 Read all three hooks carefully: `useHistory.js`, `useLibrary.js`, `useSettings.js`.
      Identify the exact shared code paths (steps 1–4 per §2.4). Document the diff points:
      - `useHistory`: state is `entries[]`; localStorage via `history` lib; syncFromDB pushes
        `{ query: e.query }` per item; mutations: add/remove/clear.
      - `useLibrary`: state is `items[]`; localStorage via `library` lib; syncFromDB pushes
        `{ result: item }` per item; mutations: toggle/clear + isInLibrary.
      - `useSettings`: state is a settings object; localStorage via `storage.get/set("settings")`;
        syncFromDB sends a single `{ settings }` blob; DB-wins merge includes `DEFAULT_SETTINGS`.
      Note: `useSettings` has a legacy key migration pass and the v.31 one-time flag; these are
      settings-specific and stay in `useSettings`.
- [ ] T7.2 Create `src/hooks/useSyncedStore.js`. Signature:
      ```js
      useSyncedStore(apiPath, { loadFn, onDBLoad, pushItem })
      // loadFn()          → initial value from localStorage
      // onDBLoad(rows)    → called when DB returns data; returns merged value
      // pushItem(item)    → called per-item when pushing local→DB on first-time sync
      // Returns: [value, setValue, { load, syncFromDB }]
      ```
      The hook owns: `loaded`, the `useEffect([user?.id, loaded])`, the GET fetch, the DB-wins
      logic (`if rows.length === 0` → push; else `onDBLoad(rows)`), the stale-closure ref, and
      the `useAuth()` import.
- [ ] T7.3 Refactor `src/hooks/useHistory.js` to call `useSyncedStore`. Keep all exported
      mutation methods (add/remove/clear) — they are useHistory-specific. Remove the now-redundant
      `useEffect`, `syncFromDB`, `useRef`, and `useAuth` imports (if no longer needed). Verify:
      `useHistory` is ~30 lines post-refactor (down from 89).
- [ ] T7.4 Refactor `src/hooks/useLibrary.js` similarly. Keep `isInLibrary`, `toggle`, `clear`.
      Verify: ~30 lines post-refactor (down from 89).
- [ ] T7.5 Refactor `src/hooks/useSettings.js`. Keep `migrateLegacyKeys`, `persistLocally`,
      `save`, `isEnabled`, `toggleAdapter`. The settings-specific merge strategy (`DEFAULT_SETTINGS`
      spread) becomes the `onDBLoad` callback. Verify: ~80 lines post-refactor (down from 154,
      since the migration and v.31 one-time logic remain).
- [ ] T7.6 Smoke test: sign in/out; verify history, library, and settings each sync correctly
      from DB on sign-in. Clear localStorage + reload → anonymous mode still works.

### T8 — Extract BookGroupHeader component (~0.5 h)

Refs: F-314 / R-301 · [[09-Audit/Duplication-and-Reuse#r-301]]
Risk: zero.

- [ ] T8.1 Create `src/components/BookGroupHeader.jsx`. Props: `{ group }` where group has
      `items`, `year`, `parentTitle`, `editors`, `publisher`. Copy the header JSX verbatim from
      `SourceSection.jsx:75–103` (the `<div className="px-4 pt-4 pb-3 border-b border-stone-300">`
      block). Export as a named export: `export function BookGroupHeader({ group })`.
- [ ] T8.2 `src/components/SourceSection.jsx:75–103`: replace the 29-line block with
      `<BookGroupHeader group={group} />`. Add the import at the top.
- [ ] T8.3 `src/components/UnifiedResultList.jsx:136–164`: replace the 29-line block with
      `<BookGroupHeader group={group} />`. Add the import.
- [ ] T8.4 Visual regression: search for a query with grouped book chapters (e.g. any Crossref
      query returning edited volumes). Verify the header renders identically in both Source view
      and Unified view.
- [ ] T8.5 Update `findings.json`: set `"status": "fixed"` for F-314.

### T9 — Shared-utils plan doc (~0.5 h)

Refs: F-100, F-101 / R-100, R-105 · [[09-Audit/Duplication-and-Reuse#f-100]] / [[#f-101]]
Risk: zero — documentation only.

- [ ] T9.1 Create `docs/wiki/02-Adapters/Shared-Utils-Plan.md`. Content: root cause (Vercel
      Edge can't import `src/`); 8 affected duplicates; the `packages/shared-utils` workspace
      approach (§2.6 above); estimated effort (~3 h spike: workspace config, move xmlUtils.js
      and extract proxyHeaders.js, update imports in both `src/` and `api/`, test Vercel build);
      why this sprint is plan-only (non-trivial build config change; should be a clean spike);
      tracked as F-100 + F-101.
- [ ] T9.2 Update `findings.json`: add `"wiki": "02-Adapters/Shared-Utils-Plan.md"` to F-100
      and F-101 fix_hint notes (or update the wiki field).

---

## 4. Acceptance criteria

- [ ] `src/contexts/SettingsContext.jsx` is deleted; quarantine dossier exists at
      `docs/wiki/99-Archive/_quarantine/context-settings.md`; zero import hits in `src/`.
- [ ] `PROVIDERS` in `Layout.jsx` contains only `google`; no "— soon" items render in the
      sign-in dropdown; quarantine dossier exists.
- [ ] `BillingProvider` is mounted in `App.jsx`; `GET /api/credits` returns `{ credits, tier }`
      for authenticated users; 401 for unauthenticated.
- [ ] `useTheme.js` uses `DEFAULT_THEME` (not the hardcoded string `"tan"`) for `LIGHT_DEFAULT`.
- [ ] `App.jsx:444` checks `!hasAllKeyedSources` (not `!settings.europeanaKey`).
- [ ] `Panels.jsx:380` stale migration comment is gone.
- [ ] `useSearch` has a `searchId` ref; stale adapter callbacks silently discard their results.
- [ ] `PricingPanel` receives `currentPlan={tier}` from `useBilling()`; no hardcoded `"free"` default in the render path from App.jsx.
- [ ] `src/hooks/useSyncedStore.js` exists; `useHistory`, `useLibrary`, `useSettings` each
      call it for the shared plumbing; all sync behaviors pass smoke tests.
- [ ] `src/components/BookGroupHeader.jsx` exists; both `SourceSection` and `UnifiedResultList`
      import and use it; book-chapter grouping renders correctly in both views.
- [ ] `docs/wiki/02-Adapters/Shared-Utils-Plan.md` exists with the workspace approach documented.
- [ ] No build errors; no console errors on startup.
- [ ] `findings.json`: F-300, F-301, F-302, F-304, F-305, F-307, F-308, F-309, F-314, F-315
      all have `"status": "fixed"` or `"quarantined"` as appropriate.

---

## 5. Risk register

| ID | Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | T3 (BillingProvider) | `/api/credits` Prisma query fails on a fresh Vercel preview with no DB | Low | Low | Catch + return fallback `{ credits: Infinity, tier: "free" }` so UI degrades gracefully |
| R2 | T7 (useSyncedStore) | Settings-specific logic (legacy migration, v.31 flag) accidentally moved into shared hook | Med | Med | Explicitly keep migration in `useSettings`; unit test `useSyncedStore` in isolation before integrating |
| R3 | T7 (useSyncedStore) | Refactored hooks break the `user?.id` + `loaded` guard → double-sync on re-renders | Med | Low | The `useEffect` dependency array `[user?.id, loaded]` is the key guard; verify it's preserved in the extracted hook |
| R4 | T8 (BookGroupHeader) | Minor JSX key prop difference between the two copies causes React warning | Low | Low | The `key` prop lives on the outer group `<div>` which stays in each parent — not in the extracted component |
| R5 | T5 (searchId guard) | `reset()` increment misses an in-flight adapter for a prior query | Low | Low | Guard is in the callback, not in reset — already correct; double-check that `reset()` increments the ref |
| R6 | T3 (credits API) | Admin resolveSessionAdmin() call adds latency to every `/api/credits` request | Low | Low | Acceptable; it's a single env-var string compare (same as the search path) |

---

## 6. Definition of done

- [ ] All 9 task groups (T1–T9) checklists fully checked.
- [ ] `findings.json` updated for all 10 findings (F-300, F-301, F-302, F-304, F-305, F-307, F-308, F-309, F-314, F-315).
- [ ] Quarantine dossiers written and registered in `_quarantine/_index.md`.
- [ ] `npm run build` (Vite) exits clean — zero TypeScript/lint errors.
- [ ] Manual smoke: sign in → library/history/settings sync → sign out → anonymous mode.
- [ ] Manual smoke: PricingPanel shows correct plan badge for free vs. admin user.
- [ ] Manual smoke: sign-in dropdown shows only Google; no "soon" items.
- [ ] Manual smoke: book-chapter grouping renders correctly in both Source and Unified views.
- [ ] No regression on any previously-passing search flow.

---

## 7. Dependencies

| Sprint | What | Status |
|---|---|---|
| v0.42 (credit counter, F-311) | Requires `BillingProvider` mounted (T3 this sprint) + a live `/api/credits` endpoint | **Blocked on T3**. Once T3 ships, v0.42 can wire the credit counter into the Header nav and add the deduct() call in `useSearch`. |
| v0.42 (PricingPanel live) | Requires `/api/credits` returning real tier for paying users | Blocked on T3 + Stripe billing being live (v0.30 shipped Stripe; next step is triggering credits on webhook → already done). |
| Shared-utils spike (F-100/F-101) | Requires monorepo workspace config (pnpm/npm workspaces) + Vercel build command update | **Planning doc only** (T9 this sprint). Execution is a clean separate spike, ~3 h, no scope creep into v0.41. |
| v0.37 MCP paywall (F-311 in-context 402) | Requires `BillingProvider` to surface `credits === 0` in the UI | Blocked on T3 + T6. |

---

*End v0.41 sprint plan. T1–T9 this sprint, mostly zero-risk. Key unlock: T3 (BillingProvider
mount) gates v0.42 credit counter + v0.37 in-context paywall. T7 (useSyncedStore) is the
largest refactor at ~2 h; all others are 0.5–1.5 h. Total estimated effort: ~7.5 h.*
