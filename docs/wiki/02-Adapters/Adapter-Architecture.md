---
machine_ids: [adapters.index, adapters.shared.base, adapters.shared.normalize, adapters.shared.parseOpenAlex, adapters.shared.proxy, adapters.shared.xmlUtils, adapters.extensions.index]
findings: [F-100, F-101, F-102]
runtime: both
status: healthy
tags: [adapter, architecture, registry, shared]
---

# Adapter Architecture

> Registry, base class, shared helpers, and the `runSearch()` orchestration that every adapter runs through.

## What it is

OpenCITE's adapter layer converts heterogeneous upstream APIs into a single **UnifiedResult** shape. It has three tiers:

1. **`src/adapters/_shared/`** — pure helpers: `base.js` (AbstractAdapter + UnifiedResult typedef), `normalize.js` (NCR pipeline), `parseOpenAlex.js` (shared OpenAlex work parser), `proxy.js` (CORS bridge), `xmlUtils.js` (SRU/OAI-PMH/UNIMARC regex parser).
2. **`src/adapters/core/`** and **`src/adapters/extensions/`** — adapters as plain-object constants; each exports `{ id, name, category, capability, search() }`.
3. **`src/adapters/index.js`** — the registry: an `ADAPTERS` array (4 core + 30 extension = 34 registered total) and `runSearch()`, which wraps every `adapter.search()` call with logging, `sanitize()`, `normalizeRecord()`, and dedup.

Adapters do **not** extend `AbstractAdapter` — they export plain objects. The class is used solely for its static `sanitize()` guard.

## Key exports / surface

### `src/adapters/index.js`
| Symbol | Kind | Purpose |
|---|---|---|
| `ADAPTERS` | `AdapterObject[]` | Ordered array of all 34 registered adapters |
| `runSearch` | `async fn` | Registry wrapper: calls `adapter.search()`, sanitizes, normalizes, logs |
| `isAdapterDefaultEnabled` | `fn` | Returns true for `ADAPTER_CATEGORY.CORE` adapters |
| `ADAPTER_CATEGORY` | re-export | Vocabulary constant (CORE / EXTENSION) |

### `src/adapters/_shared/base.js`
| Symbol | Kind | Purpose |
|---|---|---|
| `AbstractAdapter.sanitize` | `static fn` | DataMappingGuard: coerces every field to its expected type; called by registry on each result |
| `UnifiedResult` | `@typedef` | The full shape every adapter must return |
| `AdapterCapability` | `@typedef` | Machine-readable descriptor: protocol, pagination, rankFields, serverSafe, corpusSize |

### `src/adapters/_shared/normalize.js`
| Symbol | Kind | Purpose |
|---|---|---|
| `normalizeRecord` | `fn` | Adds `_type`, `_authorsParsed`, `_editorsParsed`, `_normalized` to a sanitized result; request-scoped dedup |
| `createDedupMap` | `fn` | Returns a fresh `Map` for one `runSearch()` call |
| `parseAuthors` | `fn` | `string[] → Author[]` (handles "Family, Given", "Given Family", single-token) |
| `validateNCR` | `fn` | Dev/test: checks required fields are present (not on hot path) |

### `src/adapters/_shared/parseOpenAlex.js`
| Symbol | Kind | Purpose |
|---|---|---|
| `parseOpenAlexWork` | `fn` | Converts a raw OpenAlex work object → UnifiedResult; shared by OPENALEX and CURATED adapters |
| `OA_SELECT` | `string` | SSOT select= field list for OpenAlex; keeps payloads trimmed |

### `src/adapters/_shared/proxy.js`
| Symbol | Kind | Purpose |
|---|---|---|
| `proxiedFetch` | `async fn` | Browser: routes through `/api/proxy`; Server: direct fetch with spoofed browser headers |

### `src/adapters/_shared/xmlUtils.js`
| Symbol | Kind | Purpose |
|---|---|---|
| `dcOne`, `dcAll` | `fn` | Dublin Core field extraction via regex (namespace-aware) |
| `sruTotal`, `sruRecords` | `fn` | SRU envelope parsing |
| `oaiRecords`, `oaiResumptionToken` | `fn` | OAI-PMH record + token extraction |
| `unimarcOne`, `unimarcAll` | `fn` | UNIMARC datafield/subfield extraction (BnF) |

## Dependencies

- Imports: `lib/log.js`, `lib/helpers.js` (stripHtml, reconstructAbstract), `lib/scoring.js` (hasContentMatch — Crossref only), `constants/vocabulary.js`, `constants/defaults.js`
- Imported by: `hooks/useSearch.js` (client), `api/search.js` (server fan-out)

(Authoritative edges live in `_machine/graph.json`; this is the human view.)

## Behaviour / data flow

```
query → adapter.search(query, settings, opts)
      → raw [] | { results, hasMore, nextPageToken? }
      → AbstractAdapter.sanitize()   per result
      → normalizeRecord()            per result  (dedup + _type + _authorsParsed)
      → runSearch returns { results, hasMore, nextPageToken }
```

`runSearch()` (`src/adapters/index.js:106`) is the ONLY call site for `sanitize()` + `normalizeRecord()`. Individual adapters **must not** call these themselves.

### UnifiedResult shape (post-sanitize, pre-normalize)
Required: `title`. Optional but sanitized to empty string/array/null: `id`, `source`, `authors`, `year`, `journal`, `publisher`, `volume`, `issue`, `pages`, `doi`, `url`, `abstract`, `type`, `editors`, `keywords`, `subjects`, `language`, `citedBy`, `nativeScore` (v.35), `nativeRank` (v.35).

### AdapterCapability descriptor
Each adapter carries a `capability` object (see `base.js:96–123`). Key fields used by the ranker:
- `rankFields.nativeRelevance`: `"score"` (OpenAlex, Crossref), `"rank"` (DOAJ, IA), absent/`"none"` (position not a relevance signal)
- `rankFields.citedBy`: `false` for IA (downloads, not citations); `true` for OpenAlex/Crossref
- `serverSafe`: gates inclusion in the `/api/search` Node fan-out

### proxiedFetch routing
`proxy.js` detects `typeof window === "undefined"` to choose its branch:
- **Browser**: hits `/api/proxy?url=<encoded>` (same-origin, no CORS)
- **Server (Node/Edge)**: direct fetch with spoofed `User-Agent`, `Accept`, `Referer` headers

The spoof headers are duplicated between `proxy.js:18–24` and `api/proxy.js:69–73`; this is a **documented accepted duplication** because the Edge route and `src/` cannot import each other. See [[09-Audit/Duplication-and-Reuse#r-100]].

### Adding a new adapter
1. Create `src/adapters/extensions/<name>.js`; export a `*_ADAPTER` constant with `id`, `name`, `category`, `capability`, `search()`.
2. Re-export from `src/adapters/extensions/index.js`.
3. Add to `ADAPTERS` array in `src/adapters/index.js`.
4. Update machine fragment `_fragments/adapters.modules.json`.

## 🩺 Health audit

- **Verdict:** healthy — the shared layer is clean and well-factored.
- **Findings:**
  - [F-100] `xmlUtils.js` helpers manually duplicated into `api/search/mexicana.js` — constraint is documented but creates a drift risk. See [[09-Audit/Duplication-and-Reuse#r-100]].
  - [F-101] `proxiedFetch` spoof headers duplicated with `api/proxy.js` — same constraint, same risk.
  - [F-102] `OPENNEURO` adapter bypasses `proxiedFetch` with a raw `fetch()` first, then falls back to `proxiedFetch` on catch (`openNeuro.js:26–29`); this produces a silent CORS error on every browser run before the proxy catches it.
- **Reuse:** `parseOpenAlexWork` is already properly shared between OPENALEX and CURATED — good. See [[09-Audit/Duplication-and-Reuse#r-101]].
- **Smells:**
  - `validate NCR` (`normalize.js:168`) is never called in production — dead test utility with no test file.
  - Phase 2 KV cache hook point (`normalize.js:179–186`) has been a comment for multiple sprints.

## See also

[[02-Adapters/Core-Adapters]] · [[02-Adapters/Extension-Adapters]] · [[02-Adapters/Adapter-Health-Matrix]] · [[03-Search-Pipeline/Ranking-Scoring]] · [[09-Audit/Duplication-and-Reuse]]

---

## F-100 — xmlUtils duplicated into api/search/mexicana.js

`src/adapters/_shared/xmlUtils.js` provides `dcOne`, `dcAll`, `oaiRecords`, `oaiResumptionToken` but cannot be imported by `api/search/mexicana.js` (Vercel Edge route; `src/` cross-import is a standing constraint). The helpers are copied inline. Any bug fix to the shared helpers must be manually mirrored. **Severity: low** (helper logic is simple; risk is maintenance drift).

**Fix hint:** Move to a `packages/shared-utils` workspace package importable by both, or accept the duplication and add a lint comment.

## F-101 — proxiedFetch spoof headers duplicated with api/proxy.js

`src/adapters/_shared/proxy.js:19–24` duplicates the browser-spoof headers from `api/proxy.js:69–73`. Documented in `proxy.js` as an accepted constraint. **Severity: low.**

## F-102 — OpenNeuro raw fetch before proxy fallback causes silent CORS error in browser

`src/adapters/extensions/openNeuro.js:26–29`: the adapter attempts `fetch(onUrl, ...)` directly before falling back to `proxiedFetch`. In the browser, the direct fetch will throw a CORS network error (caught silently), then the proxy runs. This adds ~RTT latency on every browser call and pollutes the network error log. **Severity: low** (functional, just slow and noisy).

**Fix hint:** Check `typeof window === "undefined"` first (as `proxiedFetch` does) and skip the direct fetch in the browser.
