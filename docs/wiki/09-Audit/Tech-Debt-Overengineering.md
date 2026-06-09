---
machine_ids: []
findings: [F-300, F-301, F-302, F-303, F-304, F-305, F-306, F-308, F-309, F-310, F-311, F-312, F-313, F-103, F-105, F-108, F-111, F-112, F-102, F-113, F-115, F-116, F-200, F-201, F-206, F-207, F-500, F-501, F-502, F-504, F-506, F-507]
runtime: infra
status: mixed
tags: [audit, tech-debt, dead-code, performance, ux]
---

# Tech Debt, Dead Code & Overengineering

> **One-line role.** The non-security, non-correctness rot: code that ships but does nothing, things
> built heavier than needed, sloppy data/config, performance smells, and UX gaps for the rebuild.

## 💀 Dead code (ships, does nothing)

### f-300 — `BillingProvider` never mounted [med]
`BillingContext.jsx` exports the provider but it's never in the tree (`App.jsx:462-470`); the stub returns `Infinity` credits. This is *why* [[09-Audit/Bugs#f-315|PricingPanel]] is stuck on "free" and there's no [[#f-311|credit counter]]. **Fix:** mount + wire to `/api/credits`, or delete. See [[01-Frontend/Contexts#billingcontext]].

### f-301 / f-308 — `SettingsContext` / `SettingsProvider` never mounted or consumed [low]
Settings flow through `useSettings` + prop-drilling; the context file is dead. **Fix:** delete (or adopt it to kill the prop-drilling). See [[01-Frontend/Contexts#settingscontext]].

### f-305 — Apple + Microsoft OAuth buttons are dead "— soon" UI [low]
`Layout.jsx:9` `PROVIDERS` includes inactive Apple/Microsoft, rendered greyed for every signed-out user. **Fix:** remove until implemented. See [[01-Frontend/UI-Map#header]].

### f-309 — `DEFAULT_THEME` exported but re-hardcoded in `useTheme` [low]
`themes.js:49` exports it; `useTheme.js:4` hardcodes `'tan'` again. **Fix:** consume the export. See [[01-Frontend/Hooks#usetheme]].

## 🏗️ Overengineering assessment (verdict: mostly justified — don't gut)
- The **two-phase semantic rerank** (`useSemanticRerank`) is *justified* — it keeps slider drags pure arithmetic (no re-embed). Documented as a good pattern in [[03-Search-Pipeline/Semantic-Rerank]].
- The **gold-set regression harness** (`goldSetMetrics` + admin `GoldSetHarness`) is well-built and unit-tested but admin-only and lightly used — keep, but know it's heavy for a solo product. See [[01-Frontend/Components/_index]].

## 🧹 Sloppiness / correctness-debt (data & config)

### f-200 — BM25F IDF over a 14–45-doc micro-pool is degenerate [med]
IDF across the tiny merged pool is statistically meaningless; mitigated (not eliminated) by RRF weighting it 30–50%. `scoring.js:160-171`. **Fix:** corpus priors or lean on native+semantic. Accepted residual. See [[03-Search-Pipeline/Ranking-Scoring]].

### f-201 — No display-side score normalization [low]
Admin debug cards show raw BM25F magnitudes; not comparable cross-query. `scoring.js:13`. See [[03-Search-Pipeline/Known-Defects#d4]].

### f-112 — BASE adapter missing `serverSafe` + `corpusSize` [low]
`base.js:24` — ranker reasons blind; six thin-shim adapters similarly lack explicit caps. **Fix:** set them. See [[02-Adapters/Extension-Adapters#base]].

### f-103 — CuratedJournals `per_page` hardcoded to 5 [low]
`curatedJournals.js:27`. See [[02-Adapters/Core-Adapters#f-103--curatedjournals-per_page-hardcoded-to-5]].

### f-105 — Deregistered Semantic Scholar has wrong `protocol` field [low]
`semanticScholar.js:39` says `graphql`, endpoint is REST. See [[02-Adapters/Extension-Adapters#semanticscholar-deregistered]].

### f-108 — Thaqalayn `url` always the homepage [low]
`thaqalayn.js:38` — no item deep-link. See [[02-Adapters/Extension-Adapters#thaqalayn]].

### f-111 — Open Library emits no abstract [low]
`openLibrary.js:57` — BM25F sees title+subjects only (expected; documents a blind spot). See [[02-Adapters/Extension-Adapters#openlibrary]].

### f-302 — Home empty-state checks raw `settings.europeanaKey` [low]
`App.jsx:444` leaks key internals into the view; breaks once the key moves backend. See [[01-Frontend/App-Shell]].

### f-304 — Stale migration comment in `SettingsPanel` [low]
`Panels.jsx:380`. **Fix:** delete. See [[01-Frontend/UI-Map#settingspanel]].

### f-310 / f-504 — localStorage keys outside the `opencite:` namespace [low]
`GoldSetHarness` (`opencite_gold_queries`, f-310) and legacy `useSettings` bare keys (f-504). **Fix:** route through `lib/storage.js`. See [[07-Data-Layer/Data-Layer]].

### f-502 — `ApiUsage.key_id` has no FK to `api_keys` [low]
`schema.prisma:158` — orphan usage rows accumulate. **Fix:** add the relation + migration. See [[07-Data-Layer/Data-Layer]].

## ⚡ Performance smells (all fine at ≤50 docs / current traffic)

### f-102 — OpenNeuro/Northwestern/ONB try raw fetch before proxy [med]
Wasted RTT + console CORS spam every search. **Fix:** check `typeof window` and go straight to `proxiedFetch`. See [[02-Adapters/Extension-Adapters]].

### f-113 / f-115 / f-116 — fan-out adapters [low–med]
Met up to 3× pageSize concurrent (`met.js:27`); Rijksmuseum 2-hop image resolve (`rijksmuseum.js:141`); PANGAEA per-hit RIS fetch (`pangaea.js:68`). See [[02-Adapters/Extension-Adapters]].

### f-206 — `dedupHighestScore` O(n) `indexOf` replacement [low]
`dedup.js:44` — O(n²) worst case if pools grow. **Fix:** a `Map<key,index>`. See [[03-Search-Pipeline/Dedup-Grouping#correctness-notes]].

### f-207 — Moby synonym shard `JSON.parse` synchronous on main thread [low]
`synonyms.js:48` — jank on large letters (c~4MB). **Fix:** parse off-thread. See [[03-Search-Pipeline/Synonyms-Vocab#correctness-notes]].

## 📦 Dependency / build debt

### f-500 / f-507 — `^` semver on MCP SDK and `@auth/*` [low/med]
Auth.js v5 minors have shipped breaking adapters; `^` lets them in. **Fix:** pin exact, commit lockfile, Dependabot. See [[08-Build-Deploy/Build-Deploy#health-audit]], [[06-MCP-Server/MCP-Server#health-audit]].

### f-506 — `public/output.css` committed → stale in dev [low]
Goes stale without `tailwindcss --watch`. **Fix:** concurrent dev script or import `input.css` via Vite. See [[08-Build-Deploy/Build-Deploy#css-pipeline]].

### f-501 — MCP non-JSON responses return undocumented `{_text}` [low]
`client.js:63`. **Fix:** document or normalize the envelope. See [[06-MCP-Server/MCP-Server#health-audit]].

## 🎨 UX gaps (catalogued for the rebuild — see [[01-Frontend/UI-Map]])
- **f-311 [med]** — no client credit-balance display; free users fly blind on their 20/mo. {#f-311}
- **f-312 [med]** — `AuthModal` has no focus trap (WCAG 2.1 SC 2.1.2). `Layout.jsx:264`.
- **f-303 [low]** — ThemeStrip swatches are color-only (no labels/aria). `Layout.jsx:210`.
- **f-306 / f-313 [low]** — LibraryPanel uses native `confirm()` for clear-all. `Panels.jsx:499`.

## See also
[[09-Audit/Health-Dashboard]] · [[09-Audit/Duplication-and-Reuse]] · [[09-Audit/Bugs]] · [[01-Frontend/UI-Map]]
