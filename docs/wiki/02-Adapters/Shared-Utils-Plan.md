---
machine_ids: []
runtime: infra
status: planned
tags: [adapters, reuse, monorepo, plan]
findings: [F-100, F-101]
---

# Shared-Utils Plan — the durable fix for src/↔api/ duplication (F-100 / F-101)

> Plan-only document. No code is changed this sprint (v0.41). The fix is scoped to its own isolated spike.

---

## Root cause

Vercel serverless and Edge routes under `api/` cannot import modules from `src/`. The two directories are separate bundling roots: `src/` is processed by Vite for the client bundle; `api/` is processed by the Vercel Node/Edge runtime. A plain relative import like `import { dcOne } from '../../src/adapters/_shared/xmlUtils.js'` is not resolved at deploy time and will throw at runtime.

The consequence is that every helper needed on both sides is copy-pasted into `api/`, creating `divergent-duplicate` reuse records that drift independently whenever either copy is updated.

---

## Affected duplicates

The following records from `docs/wiki/_machine/reuse.json` share this root cause:

| ID | What is duplicated | Client-side location | Server-side location |
|---|---|---|---|
| **R-100** | Dublin Core / OAI-PMH / UNIMARC XML helpers (`dcOne`, `dcAll`, `sruTotal`, `sruRecords`, `oaiRecords`, `oaiResumptionToken`, `unimarcOne`, `unimarcAll`) | `src/adapters/_shared/xmlUtils.js` | Inlined in `api/search/mexicana.js` (Edge route) |
| **R-105** | Browser-spoof headers (`User-Agent`, `Accept`, `Accept-Language`, `Referer`) used by the server branch of `proxiedFetch` | `src/adapters/_shared/proxy.js` lines 19–24 | `api/proxy.js` lines 69–73 |
| **R-400** | Structured log format and severity levels (`log`, `log.warn`, `log.err`) | `src/lib/log.js` (client, ring-buffer) | `api/_shared/log.js` (server, console-only) |
| **R-401** | Fetch-and-normalize logic for six heritage per-source routes | `src/adapters/extensions/{bl,gallica,bdh,mexicana,opencontext,openedition}.js` | `api/search/{bl,gallica,bdh,mexicana,opencontext,openedition}.js` |

**Notes:**

- R-100 and R-105 are clean candidates for `packages/shared-utils` (pure functions, no DOM or Node-only dependencies).
- R-400 cannot be fully merged — the client log maintains a 500-entry ring buffer while the server log writes to Vercel's edge log stream. The log *format* (tag + key=value pairs) is the shared contract; the implementations must stay separate. The workspace package would house only the format constants/helpers, not the full logger.
- R-401 is a medium-to-high effort refactor per adapter (each normalization function depends on whether `DOMParser` is available). It is in-scope as a follow-on after the workspace scaffolding is in place.

---

## Proposed fix — a `packages/shared-utils` workspace

Create an npm workspace package `@opencite/shared-utils`. Both `src/` (Vite) and `api/` (Vercel Node/Edge) declare it as a dependency. Vite resolves it through the workspace symlink at build time; Vercel resolves it the same way during the `npm install` step.

```
packages/
  shared-utils/
    package.json      { "name": "@opencite/shared-utils", "main": "index.js" }
    xmlUtils.js       (moved from src/adapters/_shared/xmlUtils.js)
    proxyHeaders.js   (extracted from src/adapters/_shared/proxy.js + api/proxy.js)
    logFormat.js      (log tag/format constants shared by both log.js files)
    index.js          (re-exports all public symbols)
```

Both sides then import directly from the package:

```js
import { dcOne, dcAll, oaiRecords } from "@opencite/shared-utils/xmlUtils";
import { spoofHeaders }             from "@opencite/shared-utils/proxyHeaders";
```

The root `package.json` gains a `"workspaces": ["packages/*"]` field. The Vercel build command remains `npm run build`; Vercel's install step (`npm install` at repo root) already resolves workspace packages before building.

---

## Why plan-only this sprint

This is a non-trivial build-config change. It touches:

1. Root `package.json` — workspaces config.
2. Vercel build / install configuration — must confirm the workspace symlink is resolved before Vite and before the Edge function bundle step.
3. Import paths in both `src/` and `api/` — a mechanical but broad change across multiple files.

Riding this alongside v0.41's zero-behavior-change frontend cleanup would make it harder to bisect if a Vercel build regression appears. It deserves a clean, isolated spike with a focused Vercel preview-deploy verification before landing on `main`.

---

## Estimated effort

~3 h spike, broken down:

| Step | Time |
|---|---|
| Add `"workspaces"` to root `package.json`; scaffold `packages/shared-utils/package.json` + `index.js` | 20 min |
| Move `xmlUtils.js` into the package; update imports in `src/adapters/_shared/` and `api/search/mexicana.js` | 45 min |
| Extract `proxyHeaders.js` from `src/adapters/_shared/proxy.js` and `api/proxy.js`; update both callers | 30 min |
| Extract `logFormat.js` constants; update `src/lib/log.js` and `api/_shared/log.js` | 20 min |
| Verify Vercel resolves the workspace package on both bundling roots (preview deploy smoke test) | 45 min |
| Update `reuse.json` records R-100, R-105, R-400 to `already-shared`; update wiki | 20 min |

---

## Tracked as

**F-100** (xmlUtils duplicated into `api/search/mexicana.js`), **F-101** (proxiedFetch spoof headers duplicated with `api/proxy.js`).

Related reuse records: **R-100**, **R-105**, **R-400**, **R-401**.

---

## See also

- [[09-Audit/Duplication-and-Reuse]]
- [[02-Adapters/Adapter-Architecture]]
