---
machine_ids: []
findings: [F-300, F-301, F-302, F-303, F-304, F-305, F-306, F-308, F-309, F-310, F-311, F-312, F-313, F-103, F-105, F-108, F-111, F-112, F-102, F-113, F-115, F-116, F-200, F-201, F-206, F-207, F-500, F-501, F-502, F-504, F-506, F-507]
runtime: infra
status: mixed
tags: [audit, tech-debt, dead-code, performance, ux]
---
<!-- AUTO-GENERATED from docs/wiki/09-Audit/Tech-Debt-Overengineering.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Tech Debt, Dead Code & Overengineering

> **One-line role.** The non-security, non-correctness rot: code that ships but does nothing, things
> built heavier than needed, sloppy data/config, performance smells, and UX gaps for the rebuild.

## 💀 Dead code (ships, does nothing)

<a id="f-300"></a>
### f-300 — `BillingProvider` never mounted [med]
`BillingContext.jsx` exports the provider but it's never in the tree (`App.jsx:462-470`); the stub returns `Infinity` credits. This is *why* [PricingPanel](Bugs.md#f-315) is stuck on "free" and there's no [credit counter](#f-311). **Fix:** mount + wire to `/api/credits`, or delete. See [Contexts](../01-Frontend/Contexts.md#billingcontext).

<a id="f-301"></a>
### f-301 / f-308 — `SettingsContext` / `SettingsProvider` never mounted or consumed [low]
Settings flow through `useSettings` + prop-drilling; the context file is dead. **Fix:** delete (or adopt it to kill the prop-drilling). See [Contexts](../01-Frontend/Contexts.md#settingscontext).

<a id="f-305"></a>
### f-305 — Apple + Microsoft OAuth buttons are dead "— soon" UI [low]
`Layout.jsx:9` `PROVIDERS` includes inactive Apple/Microsoft, rendered greyed for every signed-out user. **Fix:** remove until implemented. See [UI-Map](../01-Frontend/UI-Map.md#header).

<a id="f-309"></a>
### f-309 — `DEFAULT_THEME` exported but re-hardcoded in `useTheme` [low]
`themes.js:49` exports it; `useTheme.js:4` hardcodes `'tan'` again. **Fix:** consume the export. See [Hooks](../01-Frontend/Hooks.md#usetheme).

## 🏗️ Overengineering assessment (verdict: mostly justified — don't gut)
- The **two-phase semantic rerank** (`useSemanticRerank`) is *justified* — it keeps slider drags pure arithmetic (no re-embed). Documented as a good pattern in [Semantic-Rerank](../03-Search-Pipeline/Semantic-Rerank.md).
- The **gold-set regression harness** (`goldSetMetrics` + admin `GoldSetHarness`) is well-built and unit-tested but admin-only and lightly used — keep, but know it's heavy for a solo product. See [_index](../01-Frontend/Components/_index.md).

## 🧹 Sloppiness / correctness-debt (data & config)

<a id="f-200"></a>
### f-200 — BM25F IDF over a 14–45-doc micro-pool is degenerate [med]
IDF across the tiny merged pool is statistically meaningless; mitigated (not eliminated) by RRF weighting it 30–50%. `scoring.js:160-171`. **Fix:** corpus priors or lean on native+semantic. Accepted residual. See [Ranking-Scoring](../03-Search-Pipeline/Ranking-Scoring.md).

<a id="f-201"></a>
### f-201 — No display-side score normalization [low]
Admin debug cards show raw BM25F magnitudes; not comparable cross-query. `scoring.js:13`. See [Known-Defects](../03-Search-Pipeline/Known-Defects.md#d4).

<a id="f-112"></a>
### f-112 — BASE adapter missing `serverSafe` + `corpusSize` [low]
`base.js:24` — ranker reasons blind; six thin-shim adapters similarly lack explicit caps. **Fix:** set them. See [Extension-Adapters](../02-Adapters/Extension-Adapters.md#base).

<a id="f-103"></a>
### f-103 — CuratedJournals `per_page` hardcoded to 5 [low]
`curatedJournals.js:27`. See [Core-Adapters](../02-Adapters/Core-Adapters.md#f-103--curatedjournals-per_page-hardcoded-to-5).

<a id="f-105"></a>
### f-105 — Deregistered Semantic Scholar has wrong `protocol` field [low]
`semanticScholar.js:39` says `graphql`, endpoint is REST. See [Extension-Adapters](../02-Adapters/Extension-Adapters.md#semanticscholar-deregistered).

<a id="f-108"></a>
### f-108 — Thaqalayn `url` always the homepage [low]
`thaqalayn.js:38` — no item deep-link. See [Extension-Adapters](../02-Adapters/Extension-Adapters.md#thaqalayn).

<a id="f-111"></a>
### f-111 — Open Library emits no abstract [low]
`openLibrary.js:57` — BM25F sees title+subjects only (expected; documents a blind spot). See [Extension-Adapters](../02-Adapters/Extension-Adapters.md#openlibrary).

<a id="f-302"></a>
### f-302 — Home empty-state checks raw `settings.europeanaKey` [low]
`App.jsx:444` leaks key internals into the view; breaks once the key moves backend. See [App-Shell](../01-Frontend/App-Shell.md).

<a id="f-304"></a>
### f-304 — Stale migration comment in `SettingsPanel` [low]
`Panels.jsx:380`. **Fix:** delete. See [UI-Map](../01-Frontend/UI-Map.md#settingspanel).

<a id="f-310"></a>
### f-310 / f-504 — localStorage keys outside the `opencite:` namespace [low]
`GoldSetHarness` (`opencite_gold_queries`, f-310) and legacy `useSettings` bare keys (f-504). **Fix:** route through `lib/storage.js`. See [Data-Layer](../07-Data-Layer/Data-Layer.md).

<a id="f-502"></a>
### f-502 — `ApiUsage.key_id` has no FK to `api_keys` [low]
`schema.prisma:158` — orphan usage rows accumulate. **Fix:** add the relation + migration. See [Data-Layer](../07-Data-Layer/Data-Layer.md).

## ⚡ Performance smells (all fine at ≤50 docs / current traffic)

<a id="f-102"></a>
### f-102 — OpenNeuro/Northwestern/ONB try raw fetch before proxy [med]
Wasted RTT + console CORS spam every search. **Fix:** check `typeof window` and go straight to `proxiedFetch`. See [Extension-Adapters](../02-Adapters/Extension-Adapters.md).

<a id="f-113"></a>
### f-113 / f-115 / f-116 — fan-out adapters [low–med]
Met up to 3× pageSize concurrent (`met.js:27`); Rijksmuseum 2-hop image resolve (`rijksmuseum.js:141`); PANGAEA per-hit RIS fetch (`pangaea.js:68`). See [Extension-Adapters](../02-Adapters/Extension-Adapters.md).

<a id="f-206"></a>
### f-206 — `dedupHighestScore` O(n) `indexOf` replacement [low]
`dedup.js:44` — O(n²) worst case if pools grow. **Fix:** a `Map<key,index>`. See [Dedup-Grouping](../03-Search-Pipeline/Dedup-Grouping.md#correctness-notes).

<a id="f-207"></a>
### f-207 — Moby synonym shard `JSON.parse` synchronous on main thread [low]
`synonyms.js:48` — jank on large letters (c~4MB). **Fix:** parse off-thread. See [Synonyms-Vocab](../03-Search-Pipeline/Synonyms-Vocab.md#correctness-notes).

## 📦 Dependency / build debt

<a id="f-500"></a>
### f-500 / f-507 — `^` semver on MCP SDK and `@auth/*` [low/med]
Auth.js v5 minors have shipped breaking adapters; `^` lets them in. **Fix:** pin exact, commit lockfile, Dependabot. See [Build-Deploy](../08-Build-Deploy/Build-Deploy.md#health-audit), [MCP-Server](../06-MCP-Server/MCP-Server.md#health-audit).

<a id="f-506"></a>
### f-506 — `public/output.css` committed → stale in dev [low]
Goes stale without `tailwindcss --watch`. **Fix:** concurrent dev script or import `input.css` via Vite. See [Build-Deploy](../08-Build-Deploy/Build-Deploy.md#css-pipeline).

<a id="f-501"></a>
### f-501 — MCP non-JSON responses return undocumented `{_text}` [low]
`client.js:63`. **Fix:** document or normalize the envelope. See [MCP-Server](../06-MCP-Server/MCP-Server.md#health-audit).

## 🎨 UX gaps (catalogued for the rebuild — see [UI-Map](../01-Frontend/UI-Map.md))
- **f-311 [med]** — no client credit-balance display; free users fly blind on their 20/mo. <a id="f-311"></a>
- **f-312 [med]** — `AuthModal` has no focus trap (WCAG 2.1 SC 2.1.2). `Layout.jsx:264`.
- **f-303 [low]** — ThemeStrip swatches are color-only (no labels/aria). `Layout.jsx:210`.
- **f-306 / f-313 [low]** — LibraryPanel uses native `confirm()` for clear-all. `Panels.jsx:499`.

## See also
[Health-Dashboard](Health-Dashboard.md) · [Duplication-and-Reuse](Duplication-and-Reuse.md) · [Bugs](Bugs.md) · [UI-Map](../01-Frontend/UI-Map.md)
