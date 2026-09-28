---
machine_ids: [lib.dedup, adapters.extensions.internetArchive]
findings: [F-200, F-201, F-202, F-203, F-204, F-205, F-206, F-207, F-208, F-209, F-210]
tags: [defects, audit, pipeline]
---
<!-- AUTO-GENERATED from docs/wiki/03-Search-Pipeline/Known-Defects.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Known Defects — disposition

**Purpose** — the disposition record for the D1–D7 relevance defects (v0.35 forensic audit)
and the F-2xx pipeline findings. The ranking engine they lived in was **deprecated in v0.44**
(see [Pipeline](Pipeline.md) and `sprint_log_v0_44.md`); most entries are therefore moot. Statuses below
mirror the findings ledger ([Bugs](../09-Audit/Bugs.md)) — the ledger is authoritative.

## D-series (v0.35 ranker defects)

| ID | Title | Disposition |
|---|---|---|
| D1 | IA download counts inflate rank as `citedBy` | **moot (engine deprecated v0.44)** — no scorer consumes `citedBy`; the data lie itself also fixed: IA no longer maps downloads into `citedBy` at all (v0.44). |
| D2 | IA retrieval sorted by popularity, not relevance | **moot (engine deprecated v0.44)** — and fixed at retrieval: the IA query carries no `sort` param, so native relevance order applies (critical now that retrieval order *is* display order). |
| D3 | Native upstream relevance discarded by local BM25F | **moot (engine deprecated v0.44)** — native order is now the only order on both surfaces; there is no local rank to discard it. |
| D4 | Cross-query score incomparability | **moot (engine deprecated v0.44)** — the `score` field no longer exists in the public contract (D-7). |
| D5 | Diacritic/transliteration fragmentation in the tokenizer | **moot (engine deprecated v0.44)** — the tokenizer was deleted with the scorer; queries reach upstreams unmodified, so spelling-variant behavior is whatever each upstream does. |
| D6 | Surname-as-content collision (`khan`, `ali` return authored-by hits first) | **open, deferred** — retrieval-level: this is now purely upstream ranking behavior; fixing it needs query-intent handling, not a scorer. |
| D7 | Non-deterministic result pool (adapter timeout dropouts vary the pool per run) | **open, narrowed** — the IDF/gate sensitivity is moot, but the pool itself still varies with adapter dropouts; the circuit breaker (v0.38) and 15 s timeouts (v0.44) bound it. Coverage proration makes the variance billable-honest. |

## F-2xx pipeline findings

| ID | Disposition |
|---|---|
| F-200, F-202, F-203, F-204 | **moot (engine deprecated v0.44)** — ranking defects "fixed" only on the never-merged v0.35 branch; the engine they patch is deleted. |
| F-201 | **moot (engine deprecated v0.44)** — no score to normalize for display. |
| F-205 | **moot (engine deprecated v0.44)** — server semantic arm spike; there is no rank fusion to feed. |
| F-206 | **fixed (v0.42)** — pooled-dedup O(1) replacement; dedup is retained in v0.44. |
| F-207 | **moot (engine deprecated v0.44)** — synonym shards deleted with the engine. |
| F-208 | **fixed (v0.38)** — SCIELO/OPENNEURO/ENA quarantined + circuit breaker; retrieval-level, still in force. |
| F-209 | **moot (engine deprecated v0.44)** — the browser/API ranking divergence ended when both surfaces became pass-through. |
| F-210 | **fixed (v0.42)** — dedup field-merge (`mergeRecords`); retained on the v0.44 server path. |

## Links

[Pipeline](Pipeline.md) · [Dedup-Grouping](Dedup-Grouping.md) · [Bugs](../09-Audit/Bugs.md) · [Adapter-Health-Matrix](../02-Adapters/Adapter-Health-Matrix.md) ·
`sprint_log_v0_44.md` · `docs/wiki/99-Archive/SEARCH_DIAGNOSTIC_v0_36.md` (dated evidence)
