<!-- AUTO-GENERATED from docs/wiki/_machine/schema.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->
# Machine Layer — Schema & Maintenance Contract

> This directory (`docs/wiki/_machine/`) is the **machine-native twin** of the human Obsidian wiki.
> It exists so a Claude instance (or any tool) can load a precise model of the codebase —
> modules, dependency graph, audit findings, reuse opportunities — **without re-crawling the repo**.
> The human wiki (everything else under `docs/wiki/`) and this machine layer are **maintained in parallel**.
> Last rebuilt: see `manifest.json`.

---

## Files

| File | Owner | Source of truth for | Hand-edited? |
|---|---|---|---|
| `modules.json` | crawl + curation | Every module: id, path, runtime, purpose, exports, status, findings, wiki link | Yes (curated overlay) |
| `graph.json` | generator | Dependency edges (forward + reverse), derived from real imports | **No — regenerated** |
| `findings.json` | crawl + curation | Audit registry (bugs/security/dup/debt/deadcode/perf/ux) | Yes |
| `reuse.json` | crawl + curation | Client↔server reuse opportunities | Yes |
| `manifest.json` | generator + curation | Build metadata, counts, schema version, last-rebuilt commit | Mixed |
| `schema.md` | this file | The contract | Yes |

`graph.json` is rebuilt by `scripts/wiki/build-machine-map.mjs` (static import/require scan). Never hand-edit edges — fix the code or the scanner. The curated overlay (purpose/status/findings/runtime) lives in `modules.json` keyed by `id`; the generator merges in `loc` and the import-derived `deps` but never clobbers curated fields.

---

## Module ID scheme

Dot-path from repo root, extension dropped, `_shared` → `shared`:

| Path | id |
|---|---|
| `src/lib/scoring.js` | `lib.scoring` |
| `src/adapters/core/crossref.js` | `adapters.core.crossref` |
| `src/adapters/_shared/base.js` | `adapters.shared.base` |
| `src/components/ResultCard.jsx` | `components.ResultCard` |
| `src/hooks/useSearch.js` | `hooks.useSearch` |
| `api/_shared/billing.js` | `api.shared.billing` |
| `api/search.js` | `api.search` |
| `api/search/dpla.js` | `api.route.dpla` *(per-source routes namespaced `api.route.*` to avoid colliding with `api.search`)* |
| `mcp/src/server.js` | `mcp.server` |
| `prisma/schema.prisma` | `prisma.schema` |

Components keep PascalCase; hooks keep `useX`. Everything else camelCase as written.

---

## `modules.json` record

```json
{
  "id": "adapters.core.crossref",
  "path": "src/adapters/core/crossref.js",
  "kind": "adapter|component|hook|context|lib|api-route|api-shared|mcp|schema|config|worker|launcher|constant|script",
  "runtime": "client|server|both|shared|build|infra",
  "loc": 210,
  "purpose": "One dense sentence: what it does and why it exists.",
  "exports": ["default", "hasContentMatch"],
  "deps": ["adapters.shared.base", "lib.scoring"],
  "status": "healthy|degraded|dead|keyed|buggy|stub|deprecated|quarantined",
  "findings": ["F-007"],
  "wiki": "02-Adapters/Core-Adapters.md#crossref",
  "tags": ["adapter", "core", "fetch"],
  "notes": "Optional terse machine note (gotchas, invariants)."
}
```

- **runtime** — `both` = the *same* file executes client- and server-side (the adapters do this). `shared` = pure helper imported by either side. `build` = vite/tailwind/migrate. `infra` = vercel.json, prisma migrations.
- **status** — `dead` = ships but never returns results. `keyed` = needs an env/API key, auto-drops when absent. `stub` = wired but inert (e.g. context stubs). `buggy` = has an open `bug`/`security` finding. `quarantined` = **removed from the build, source preserved** in `docs/wiki/99-Archive/_quarantine/` (the record's `path` is the *former* disk path; the generator keeps it as a virtual module so cross-refs resolve — see the no-deletion policy in the quarantine index).
- **deps** — by `id`. Generator overwrites this from real imports; curators may add `notes` if a runtime dep isn't statically visible.

## `findings.json` record

```json
{
  "id": "F-001",
  "type": "bug|security|dup|debt|deadcode|perf|ux",
  "severity": "high|med|low",
  "title": "Internet Archive citedBy is populated from download count",
  "detail": "Why it's wrong and the blast radius.",
  "path": "src/adapters/extensions/internetArchive.js:142",
  "modules": ["adapters.extensions.internetArchive"],
  "status": "open|confirmed|fixed|wontfix",
  "wiki": "09-Audit/Bugs.md#f-001",
  "fix_hint": "Optional: the smallest correct fix."
}
```

IDs are stable and monotonic (`F-001`…). Never renumber. Mark resolved items `fixed`, don't delete (history).

## `reuse.json` record

```json
{
  "id": "R-001",
  "title": "Scoring runs both sides — already shared, keep it that way",
  "shared_module": "lib.scoring",
  "client_users": ["hooks.useSearch"],
  "server_users": ["api.search"],
  "opportunity": "already-shared|extract-shared|server-can-reuse-client|client-can-reuse-server|divergent-duplicate",
  "detail": "What to do, est. effort, risk.",
  "wiki": "09-Audit/Duplication-and-Reuse.md#r-001"
}
```

---

## Wiki ↔ machine binding (the anti-drift mechanism)

Every **wiki note** carries machine ids in YAML frontmatter:

```yaml
---
machine_ids: [adapters.core.crossref, adapters.core.doaj]
findings: [F-007]
tags: [adapter, core]
---
```

Every **machine record** carries its `wiki:` path. So: edit a module → its note's frontmatter names the `id` → update the `modules.json` record (one hop). Add a finding → it names its `wiki:` anchor → add the `## F-xxx` section (one hop). A finding or module with a dangling cross-reference is a lint failure (see `build-machine-map.mjs --check`).

## Regeneration

```bash
node scripts/wiki/build-machine-map.mjs        # rebuild graph.json + loc + manifest, merge-preserving curation
node scripts/wiki/build-machine-map.mjs --check # lint: dangling wiki/finding refs, orphan modules, missing notes
```

Run after any code change that adds/removes/moves a module or import, and after editing audit findings.
