---
machine_ids: []
runtime: infra
status: mixed
tags: [archive, quarantine, deprecated, adapters]
---
<!-- AUTO-GENERATED from docs/wiki/99-Archive/_quarantine/_index.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# 🔒 Quarantine — preserved code removed from the active build

> **One-line role.** A secure, non-deleted home for code that has been **deprecated and removed from
> `src/`** but must survive for future review/revival. Nothing here is gone — full verbatim source is
> embedded in each dossier, and git history retains the originals.

## Policy (the "no permanent deletion" rule)
When a sprint removes code, it does **not** `git rm` it into oblivion. It:
1. Copies the **full verbatim source** into a dossier here, with a revival checklist + the finding(s)
   that justified removal.
2. Removes it from the active codebase (registry/barrel/imports) so it no longer ships or runs.
3. Marks its machine record `status: quarantined` (see [schema](../../_machine/schema.md)) so the [home](../../home.md) graph and
   `findings.json` cross-refs keep resolving.

Revival = copy the source back into `src/`, re-add the export + registry entry, fix the root cause in
the revival checklist, re-verify, and flip the machine record back to `healthy`/`degraded`.

## Register

| Dossier | Removed in | Why | Finding | Revivable? |
|---|---|---|---|---|
| [adapter-scielo](adapter-scielo.md) | v0.38 | Private Elasticsearch endpoint → 403/404 every query | [Bugs](../../09-Audit/Bugs.md#f-110), [Bugs](../../09-Audit/Bugs.md#f-208) | Yes — needs a real public API (OAI-PMH or DOAJ coverage) |
| [adapter-openneuro](adapter-openneuro.md) | v0.38 | Fetches 100 newest then client-filters → 0 hits; GraphQL errors | [Bugs](../../09-Audit/Bugs.md#f-107), [Bugs](../../09-Audit/Bugs.md#f-208) | Yes — needs a real search query/endpoint |
| [adapter-ena](adapter-ena.md) | v0.38 | Wildcard-in-quotes syntax → HTTP 400 every query | [Bugs](../../09-Audit/Bugs.md#f-109), [Bugs](../../09-Audit/Bugs.md#f-208) | Yes — drop wildcard syntax, re-test |
| [adapter-semanticscholar](adapter-semanticscholar.md) | v0.42 | Deregistered v0.27; approval-gated key + rate-limited; orphan descriptor | [Tech-Debt-Overengineering](../../09-Audit/Tech-Debt-Overengineering.md#f-105) | Yes — fix `protocol`, re-add key + registry |
| [context-settings](context-settings.md) | v0.41 | Never mounted — prop-drilling used instead | F-301, F-308 | Yes — see revival checklist |
| [oauth-apple-microsoft](oauth-apple-microsoft.md) | v0.41 | Inactive "soon" UI — no OAuth integration yet | F-305 | Yes — implement OAuth first |

> **Why these three:** all `serverSafe:true`, so the `/api/search` fan-out counted them as failed →
> forced `coverage:partial` on **every** search → the freeBelowBand discount fired on every paid query.
> Removing them is the #1 revenue fix ([Health-Dashboard](../../09-Audit/Health-Dashboard.md)). Wikidata was **not** quarantined
> (429 locally but may work in prod — verify first; see [v0.38 sprint](../../10-Sprints/Index.md)).

## See also
[Index](../Index.md) · [Adapter-Health-Matrix](../../02-Adapters/Adapter-Health-Matrix.md) · [Bugs](../../09-Audit/Bugs.md)
