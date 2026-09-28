---
machine_ids: [lib.dedup, hooks.useSearch, api.search]
tags: [pipeline, dedup, passthrough]
---

# Search Pipeline (pass-through)

**Purpose** — turn one query into one deduplicated result list from many upstream sources,
without re-ranking. Since v0.44 the pipeline trusts each source's own relevance ordering:
retrieval fan-out → normalize → dedupe → interleave. There is no local scoring layer. The
v0.36 diagnostic established that retrieval and dedup were healthy and ranking was the
defect source; v0.44 removed ranking rather than tuning it.

## Contract

- **Retrieval** — adapters (`src/adapters/`) query their upstreams in parallel and return
  results in the upstream's native relevance order. Every adapter fetch carries a 15-second
  abort timeout. Failures degrade coverage (billing prorates); they never fail the search.
- **Dedupe** — `src/lib/dedup.js`, both surfaces. Two keys, applied DOI-first:
  - *DOI key*: normalized (trimmed, lowercased, `doi.org/` URL prefix stripped); no DOI
    means no dedup on this key.
  - *Title fingerprint*: normalized title + year + first-author surname — catches the same
    work registered under multiple DOIs.
  - *Merge rule*: client (streaming, `dedupFirstWins`) — first arrival wins, nothing to
    merge against. Server (pooled, `dedupHighestScore` + `mergeRecords`) — first copy is
    canonical and is **enriched** with the duplicate's superior fields (abstract, citedBy,
    fuller authors) before the duplicate is dropped.
- **Order** — within a source: native upstream order, untouched. Across sources
  (unified view and the API response): round-robin interleave — result #1 of each source,
  then #2 of each, … — so registry order cannot starve the response limit.
- **Output** — no `score`, no `lowConfidence`, no gate. Explicit user sorts (year,
  citations) remain available client-side on top of the native order.

## Invariants

- Display order on every surface is derivable from upstream order + the interleave rule —
  nothing local may reorder results besides dedup collapse and explicit user sorts.
- Browser and `/api/search` apply the same identity keys; the only sanctioned divergence
  is streaming first-wins vs pooled field-merge.
- The original query string reaches upstream APIs unmodified (no expansion, no rewriting).
- Dedup never drops a record with a null key.

## Deprecated (v0.44)

BM25F scoring, synonym expansion, semantic rerank, RRF fusion, and the confidence gate were
removed in v0.44 (sprint `sprint_log_v0_44.md`, Decisions D-1..D-7). Source is preserved at
[[99-Archive/_quarantine/_index|_quarantine]] `v0_44_engine/`; the unmerged v0.35 relevance
branch was deleted (tip recorded in the sprint log). Their findings are statused `moot` in
the ledger.

## Links

`src/lib/dedup.js` · `src/hooks/useSearch.js` · `api/search.js` ·
[[Dedup-Grouping]] · [[Known-Defects]] · [[04-Backend-API/Search-Endpoint]] ·
[[02-Adapters/Adapter-Architecture]] · `sprint_log_v0_44.md`
