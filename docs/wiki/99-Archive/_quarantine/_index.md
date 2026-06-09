---
machine_ids: []
runtime: infra
status: mixed
tags: [archive, quarantine, deprecated, adapters]
---

# 🔒 Quarantine — preserved code removed from the active build

> **One-line role.** A secure, non-deleted home for code that has been **deprecated and removed from
> `src/`** but must survive for future review/revival. Nothing here is gone — full verbatim source is
> embedded in each dossier, and git history retains the originals.

## Policy (the "no permanent deletion" rule)
When a sprint removes code, it does **not** `git rm` it into oblivion. It:
1. Copies the **full verbatim source** into a dossier here, with a revival checklist + the finding(s)
   that justified removal.
2. Removes it from the active codebase (registry/barrel/imports) so it no longer ships or runs.
3. Marks its machine record `status: quarantined` (see [[_machine/schema]]) so the [[home]] graph and
   `findings.json` cross-refs keep resolving.

Revival = copy the source back into `src/`, re-add the export + registry entry, fix the root cause in
the revival checklist, re-verify, and flip the machine record back to `healthy`/`degraded`.

## Register

| Dossier | Removed in | Why | Finding | Revivable? |
|---|---|---|---|---|
| [[adapter-scielo]] | v0.38 | Private Elasticsearch endpoint → 403/404 every query | [[09-Audit/Bugs#f-110]], [[09-Audit/Bugs#f-208]] | Yes — needs a real public API (OAI-PMH or DOAJ coverage) |
| [[adapter-openneuro]] | v0.38 | Fetches 100 newest then client-filters → 0 hits; GraphQL errors | [[09-Audit/Bugs#f-107]], [[09-Audit/Bugs#f-208]] | Yes — needs a real search query/endpoint |
| [[adapter-ena]] | v0.38 | Wildcard-in-quotes syntax → HTTP 400 every query | [[09-Audit/Bugs#f-109]], [[09-Audit/Bugs#f-208]] | Yes — drop wildcard syntax, re-test |
| [[adapter-semanticscholar]] | v0.42 | Deregistered v0.27; approval-gated key + rate-limited; orphan descriptor | [[09-Audit/Tech-Debt-Overengineering#f-105]] | Yes — fix `protocol`, re-add key + registry |
| [[context-settings]] | v0.41 | Never mounted — prop-drilling used instead | F-301, F-308 | Yes — see revival checklist |
| [[oauth-apple-microsoft]] | v0.41 | Inactive "soon" UI — no OAuth integration yet | F-305 | Yes — implement OAuth first |

> **Why these three:** all `serverSafe:true`, so the `/api/search` fan-out counted them as failed →
> forced `coverage:partial` on **every** search → the freeBelowBand discount fired on every paid query.
> Removing them is the #1 revenue fix ([[09-Audit/Health-Dashboard]]). Wikidata was **not** quarantined
> (429 locally but may work in prod — verify first; see [[10-Sprints/Index|v0.38 sprint]]).

## See also
[[99-Archive/Index]] · [[02-Adapters/Adapter-Health-Matrix]] · [[09-Audit/Bugs]]
