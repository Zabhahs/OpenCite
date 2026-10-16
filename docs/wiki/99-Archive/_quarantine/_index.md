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
| `v0_44_adapters/adapter-bdh.js` + `route-bdh.js` | v0.44 (T5) | Dead upstream — datos.bne.es HTTP 403 on every probe (live-probed 2026-06-09) | — | Yes — re-probe upstream, restore files + registry entries |
| `v0_44_adapters/adapter-britishLibrary.js` + `route-bl.js` | v0.44 (T5) | Dead upstream — BNB SPARQL endpoint hangs to timeout (live-probed 2026-06-09) | — | Yes — re-probe upstream, restore files + registry entries |
| `v0_44_adapters/adapter-mexicana.js` + `route-mexicana.js` | v0.44 (T5) | Dead upstream — expired TLS certificate (live-probed 2026-06-09) | — | Yes — re-probe upstream, restore files + registry entries |

| `v0_46_adapters/adapter-base.js` | v0.46 | api.base-search.net requires IP registration; answered HTTP 200 `{error: Access denied}` which the adapter read as "no match" (live-probed 2026-09-04) — 30% of the paid coverage denominator, never actually searched | — | Yes — register a static egress IP, throw on `data.error` |
| `v0_46_adapters/adapter-thaqalayn.js` | v0.46 | `/api/v2/query?q=` returns `{error: No matches found}` for every term (live-probed 2026-09-04) | — | Yes — find the current search route (API appears book-scoped) |
| `v0_46_adapters/adapter-laReferencia.js` | v0.46 | VuFind fronted by an Anubis bot-wall; HTML challenge to every UA (live-probed 2026-09-04) | — | Yes — negotiate an API path/allowlist with the operator |
| `v0_46_adapters/adapter-pangaea.js` | v0.46 | ES `_source` no longer carries `agg-datasetname`/`title`, so the F-116 pre-filter dropped every hit (live-probed 2026-09-04) | F-116 | Yes — request `sf-authortitle` and pre-filter on it |
| `v0_46_adapters/adapter-openContext.js` + `route-opencontext.js` | v0.46 | API response shape changed (no `oc-api:has-results`) + Anubis bot-wall on browser UAs (live-probed 2026-09-04) | — | Yes — re-derive the JSON contract, honest UA |

> **v0.44 format note:** the v0.44 arrivals are preserved as **raw `.js` files** under
> `v0_44_adapters/` (git `mv`, history intact) rather than embedded-source `.md` dossiers; each
> file carries its quarantine banner + revival checklist in a header comment.

> **Why these three:** all `serverSafe:true`, so the `/api/search` fan-out counted them as failed →
> forced `coverage:partial` on **every** search → the freeBelowBand discount fired on every paid query.
> Removing them is the #1 revenue fix ([[09-Audit/Health-Dashboard]]). Wikidata was **not** quarantined
> (429 locally but may work in prod — verify first; see [[10-Sprints/Index|v0.38 sprint]]).

## See also
[[99-Archive/Index]] · [[02-Adapters/Adapter-Health-Matrix]] · [[09-Audit/Bugs]]
