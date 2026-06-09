---
machine_ids: []
findings: []
runtime: infra
status: healthy
tags: [archive, history, docs]
---

# Historical Document Archive Index

> These are **legacy working documents** — sprint plans, architecture reports, and diagnostic reports produced during development. They are historical artefacts. The **wiki is now canonical**: always prefer a wiki note over any document in this table for current facts.
>
> Documents are kept for audit trail and context but should not be consulted for system behaviour. If a wiki note contradicts an archive doc, the wiki note wins.

---

## Architecture Reports

Snapshot architecture documents. Each was the handoff doc to the next Claude instance. Superseded entirely by the wiki.

| Doc | Version / Date | What it covers | Superseded by |
|---|---|---|---|
| `architecture_report_v0_17.md` | v0.17 | Adapter enrichment, book-chapter grouping, citation fixes | [[02-Adapters/Adapter-Architecture]] |
| `architecture_report_v0_18.md` | v0.18 | SOW heritage adapters, SSOT refactor, metadata enrichment | [[02-Adapters/Core-Adapters]] |
| `architecture_report_v0_19.md` | v0.19 | Diagnostics sprint: SSOT logger, admin debug UI | [[04-Backend-API/Search-Endpoint]] |
| `architecture_report_v0_20.md` | v0.20 | Adapter repair sprint | [[02-Adapters/Core-Adapters]] |
| `architecture_report_v0_21.md` | v0.21 | Search quality + UX (C/D), adapter enrichment (E) | [[03-Search-Pipeline/Ranking-Scoring]] |
| `architecture_report_v0_22.md` | v0.22 | CA URL fix, SciELO adapter, FilterBar UI, Dialnet launcher | [[02-Adapters/Core-Adapters]] |
| `architecture_report_v0_23.md` | v0.23 | Language normalization, art types, Topics facet, OA filter, museum/OpenAlex enrichment | [[02-Adapters/Adapter-Architecture]] |
| `architecture_report_v0_24.md` | v0.24 | Unified ranked view (default), source view toggle, section quality sort | [[01-Frontend/App-Shell]] |
| `architecture_report_v0_25.md` | v0.25 | BM25F scoring, semantic search, RRF fusion, synonym expansion | [[03-Search-Pipeline/Ranking-Scoring]], [[03-Search-Pipeline/RRF-Fusion]] |
| `architecture_report_v0_27.md` | v0.27 | Phrase & proximity-aware scoring (Phase B), richer OpenAlex metadata intake (Phase C) | [[03-Search-Pipeline/Ranking-Scoring]] |
| `architecture_report_v0_28.md` | v0.28 | Phase 3C kickoff: public REST search endpoint `/api/search` | [[04-Backend-API/Search-Endpoint]] |
| `architecture_report_v0_29.md` | v0.29 | Humanities worldwide-coverage adapters, capability-aware ranking, dedup SSOT, unified-view load-more fixes | [[02-Adapters/Adapter-Architecture]], [[03-Search-Pipeline/Ranking-Scoring]] |
| `architecture_report_v0_30.md` | v0.30 | Origin-blind public API, 22 server-safe adapters, runtime-aware proxy, WS3 billing shipped (Stripe Checkout, Plans UI, Prisma Migrate), WS5 cache pending | [[04-Backend-API/Search-Endpoint]], [[05-Billing/Billing-Credits]], [[07-Data-Layer/Data-Layer]] |
| `architecture_report_v0_31.md` | v0.31 (2026-05-31) | Lexical↔Semantic slider under search bar, semantic+synonym ON by default, one-time migration, resultsReady gate, Crossref hasContentMatch fix | [[03-Search-Pipeline/Ranking-Scoring]] |

---

## Sprint Logs

Execution plans and PM documents. Each was the SSOT during that sprint. Now superseded by wiki notes + memory files.

| Doc | Sprint / Date | What it covers | Superseded by |
|---|---|---|---|
| `sprint_log_v0_30.md` | v0.30 | Origin-blind AI API + adapter unlock (Waves 1–2) + Stripe credit billing + MCP distribution plan | [[06-MCP-Server/MCP-Server]], [[05-Billing/Billing-Credits]], [[04-Backend-API/Search-Endpoint]] |
| `sprint_log_v0_31.md` | v0.31 | User-facing relevance controls (Lexical↔Semantic slider) | [[03-Search-Pipeline/Ranking-Scoring]] |
| `sprint_log_v0_32.md` | v0.32 | Credit meter wired into `/api/search`, admin identity + debug path | [[04-Backend-API/Search-Endpoint]], [[05-Billing/Billing-Credits]] |
| `sprint_log_v0_33.md` | v0.33 (plan) | Admin console brainstorm: F1 Score Explainer + F2 Gold-Set Harness | [[07-Data-Layer/Data-Layer#relevance_labels]] |
| `sprint_log_v0_33_actuals.md` | v0.33 (2026-05-31) | F1 + F2 implementation verified, code ready for deployment | [[07-Data-Layer/Data-Layer#relevance_labels]] |
| `sprint_log_v0_34.md` | v0.34 | Moving keyed CC0 sources (Europeana, DPLA, Smithsonian) to backend env keys, Settings declutter | [[08-Build-Deploy/Build-Deploy#third-party-source-keys-backend-only-v034]] |
| `sprint_log_v0_35.md` | v0.35 (planned, not executed) | Search-relevance integrity: RRF native+local fusion, IA inflation fix, diacritic normalization | [[03-Search-Pipeline/Ranking-Scoring]] |
| `sprint_log_v0_36.md` | v0.36 | Diagnostic simple-mode (`?simple=1`), admin Simple search UI toggle, Result layout moved to Search settings | [[04-Backend-API/Search-Endpoint]], [[01-Frontend/App-Shell]] |
| `sprint_log_v0_37.md` | v0.37 (plan ready) | MCP acquisition funnel: per-IP trial, post-OAuth AI connection selection, in-context paywall | [[06-MCP-Server/MCP-Server#relationship-to-v037-acquisition-funnel]] |

---

## Plans, Diagnostics, and One-Offs

| Doc | Date | What it covers | Superseded by |
|---|---|---|---|
| `ROADMAP_v0_31-v0_34.md` | 2026-05-31 | Roadmap from v0.31 through v0.34: ordering, rationale, effort estimates | Memory index `MEMORY.md` |
| `SPRINT_EXECUTION_SUMMARY.md` | 2026-05-31 | Comprehensive status: v0.32 complete, v0.33 T1 executed, v0.34 plan ready | Memory index `MEMORY.md` |
| `HANDOFF_TO_SHAHBAZ.md` | 2026-05-31 | Handoff doc: v0.32 complete, v0.33 code ready, v0.34 plan; review + approval checklist | Memory index `MEMORY.md` |
| `SEARCH_DIAGNOSTIC_v0_36.md` | v0.36 | v0.36 simple-mode diagnostic findings: pipeline healthy, scoring is culprit, IA citedBy=downloads confirmed, 3 always-dead adapters (SCIELO/OPENNEURO/ENA) drag coverage to `partial` | [[03-Search-Pipeline/Ranking-Scoring]], [[09-Audit/Bugs]] |
| `v0_34_execution_plan.md` | 2026-05-31 | Fast-track execution plan for backend-only keys + Settings declutter (v0.34 shipped in `ddee837`) | [[08-Build-Deploy/Build-Deploy#third-party-source-keys-backend-only-v034]] |
| `TOS-items.md` | ongoing | Engineering+product ledger of TOS/API claims, upstream obligations, customer disclosures | No wiki equivalent yet |
| `search_quality_stress_plan.md` | 2026-05-31 | Repeatable stress-test battery: relevance pipeline failure modes, live `/api/search` probe plan | [[08-Build-Deploy/Build-Deploy#scriptsstressprobemjs]] |
| `search_quality_findings.md` | 2026-05-31 | Findings from ~55-query stress test (5 Haiku agents, 8 categories): scoring, IA inflation, coverage | [[09-Audit/Bugs]] |

---

## Adapter Reference Docs

Living reference docs in `docs/`. Not historical — still in use. Listed here for completeness.

| Doc | What it covers | Wiki equivalent |
|---|---|---|
| `docs/adapter-api-capabilities.md` | Per-adapter official API docs, wire protocol, auth, query/pagination, efficiency tier | [[02-Adapters/Core-Adapters]], [[02-Adapters/Adapter-Architecture]] |
| `docs/adapter-rank-sprints.md` | Adapter ↔ rank system sprint plan: machine-readable capability descriptors, BM25F/RRF integration | [[03-Search-Pipeline/Ranking-Scoring]] |
| `docs/adapter-authoring-standard.md` | Canonical authoring standard for new adapters (v0.29+): design, build, wire, verify | [[02-Adapters/Adapter-Architecture]] |
| `mcp/README.md` | MCP server install/config/schema reference | [[06-MCP-Server/MCP-Server]] |
| `scripts/admin/README.md` | End-to-end v0.32 admin/debug verification procedure + SQL seed commands | [[08-Build-Deploy/Build-Deploy#admin-probe-scripts]] |

---

## How to use this index

1. Find the topic you care about.
2. Follow the "Superseded by" wiki link — that note is current.
3. Use the archive doc only for **historical context** (e.g. "why was this decision made in v0.25?").

If a wiki note is missing and the archive doc is the only source, file a wiki authoring task rather than citing the archive doc in code reviews.
