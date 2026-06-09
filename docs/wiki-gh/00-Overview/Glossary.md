---
machine_ids: []
runtime: infra
status: healthy
tags: [overview, glossary]
---
<!-- AUTO-GENERATED from docs/wiki/00-Overview/Glossary.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Glossary

> **One-line role.** Project-specific terms used across the wiki, so notes can stay dense.

## Search & ranking
- **Adapter** — one module per scholarly source that queries an upstream API and returns `{ results: UnifiedResult[], hasMore }`. See [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md).
- **UnifiedResult** — the normalized result shape every adapter emits after `sanitize()`. Lets the UI and ranker stay source-agnostic.
- **BM25F** — field-weighted BM25 lexical scoring (title/abstract/keywords weighted differently). See [Ranking-Scoring](../03-Search-Pipeline/Ranking-Scoring.md).
- **RRF (Reciprocal Rank Fusion)** — combines multiple rank lists (lexical, semantic, native-upstream) into one. The `Lexical↔Semantic` slider sets the fusion weight. See [RRF-Fusion](../03-Search-Pipeline/RRF-Fusion.md).
- **Semantic rerank** — MiniLM sentence-embedding cosine similarity used as a rank signal, fused via RRF. See [Semantic-Rerank](../03-Search-Pipeline/Semantic-Rerank.md).
- **Confidence gate** — `applyConfidenceGate()` drops/keeps results by match confidence; `hasContentMatch()` is the SSOT predicate that prevents author-only "best guess" bleed. See [Confidence-Gate](../03-Search-Pipeline/Confidence-Gate.md).
- **Native (upstream) relevance** — the order the source API returned. Historically discarded; v0.35 plans to fuse it. See [Known-Defects](../03-Search-Pipeline/Known-Defects.md).
- **Dedup / grouping** — merging the same work across sources and grouping by source/unified view. See [Dedup-Grouping](../03-Search-Pipeline/Dedup-Grouping.md).

## Platform & monetization
- **Origin-blind** — `/api/search` returns results **without revealing which source** produced each one (the sellable grounding mode). `debug=1` (admin only) reveals origins. See [Search-Endpoint](../04-Backend-API/Search-Endpoint.md).
- **Credit / meter** — per-search billing unit. Pre-authorize → settle → refund-on-failure. See [Billing-Credits](../05-Billing/Billing-Credits.md).
- **Tier / eligibility** — which sources a plan may use; keyed sources auto-drop when their env var is unset.
- **Admin** — email allowlist (`VITE_ADMIN_EMAILS`); unmetered/uncapped, can use `debug=1`/`simple=1`. See [Auth-Sessions](../04-Backend-API/Auth-Sessions.md).
- **simple=1 / Simple search** — raw-pipeline diagnostic mode (skips dedup/score/gate), admin-gated. See [Known-Defects](../03-Search-Pipeline/Known-Defects.md).
- **MCP** — Model Context Protocol server exposing OpenCITE search to external AI models. See [MCP-Server](../06-MCP-Server/MCP-Server.md).
- **Launcher** — an external source with no queryable API; a pre-filled search link opens in a new tab. See [UI-Map](../01-Frontend/UI-Map.md).

## Process
- **SSOT** — single source of truth (this wiki; and `_machine/` for the machine twin).
- **Coverage = partial/full** — whether all eligible sources returned; affects billing discount. See [Search-Endpoint](../04-Backend-API/Search-Endpoint.md).
- **Mode C** — Shahbaz's workflow: plan → approve → execute for large tasks.

## See also
[home](../home.md) · [Tech-Stack](Tech-Stack.md) · [System-Architecture](System-Architecture.md)
