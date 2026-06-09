---
machine_ids: []
runtime: infra
status: healthy
tags: [overview, glossary]
---

# Glossary

> **One-line role.** Project-specific terms used across the wiki, so notes can stay dense.

## Search & ranking
- **Adapter** — one module per scholarly source that queries an upstream API and returns `{ results: UnifiedResult[], hasMore }`. See [[02-Adapters/Adapter-Architecture]].
- **UnifiedResult** — the normalized result shape every adapter emits after `sanitize()`. Lets the UI and ranker stay source-agnostic.
- **BM25F** — field-weighted BM25 lexical scoring (title/abstract/keywords weighted differently). See [[03-Search-Pipeline/Ranking-Scoring]].
- **RRF (Reciprocal Rank Fusion)** — combines multiple rank lists (lexical, semantic, native-upstream) into one. The `Lexical↔Semantic` slider sets the fusion weight. See [[03-Search-Pipeline/RRF-Fusion]].
- **Semantic rerank** — MiniLM sentence-embedding cosine similarity used as a rank signal, fused via RRF. See [[03-Search-Pipeline/Semantic-Rerank]].
- **Confidence gate** — `applyConfidenceGate()` drops/keeps results by match confidence; `hasContentMatch()` is the SSOT predicate that prevents author-only "best guess" bleed. See [[03-Search-Pipeline/Confidence-Gate]].
- **Native (upstream) relevance** — the order the source API returned. Historically discarded; v0.35 plans to fuse it. See [[03-Search-Pipeline/Known-Defects]].
- **Dedup / grouping** — merging the same work across sources and grouping by source/unified view. See [[03-Search-Pipeline/Dedup-Grouping]].

## Platform & monetization
- **Origin-blind** — `/api/search` returns results **without revealing which source** produced each one (the sellable grounding mode). `debug=1` (admin only) reveals origins. See [[04-Backend-API/Search-Endpoint]].
- **Credit / meter** — per-search billing unit. Pre-authorize → settle → refund-on-failure. See [[05-Billing/Billing-Credits]].
- **Tier / eligibility** — which sources a plan may use; keyed sources auto-drop when their env var is unset.
- **Admin** — email allowlist (`VITE_ADMIN_EMAILS`); unmetered/uncapped, can use `debug=1`/`simple=1`. See [[04-Backend-API/Auth-Sessions]].
- **simple=1 / Simple search** — raw-pipeline diagnostic mode (skips dedup/score/gate), admin-gated. See [[03-Search-Pipeline/Known-Defects]].
- **MCP** — Model Context Protocol server exposing OpenCITE search to external AI models. See [[06-MCP-Server/MCP-Server]].
- **Launcher** — an external source with no queryable API; a pre-filled search link opens in a new tab. See [[01-Frontend/UI-Map]].

## Process
- **SSOT** — single source of truth (this wiki; and `_machine/` for the machine twin).
- **Coverage = partial/full** — whether all eligible sources returned; affects billing discount. See [[04-Backend-API/Search-Endpoint]].
- **Mode C** — Shahbaz's workflow: plan → approve → execute for large tasks.

## See also
[[home]] · [[00-Overview/Tech-Stack]] · [[00-Overview/System-Architecture]]
