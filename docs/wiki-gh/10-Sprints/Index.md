---
machine_ids: []
runtime: infra
status: healthy
tags: [sprints, moc, roadmap]
---
<!-- AUTO-GENERATED from docs/wiki/10-Sprints/Index.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Sprint Plan — v0.38 → v0.42 (from the audit)

> **One-line role.** The remediation roadmap generated from [Health-Dashboard](../09-Audit/Health-Dashboard.md). Each sprint is
> a self-contained Mode-C execution plan at repo root (`sprint_log_v0_XX.md`); this note is the map +
> sequencing. Every code-removal task follows the **no-deletion / quarantine policy**
> ([_index](../99-Archive/_quarantine/_index.md)).

## Sequence & dependencies
```
v0.38 Coverage/Adapters ─┐ (revenue-critical; partly DONE)
v0.39 Security ──────────┼─ independent, run in any order
v0.40 Deploy/Data ───────┘
v0.41 Frontend Cleanup ──► v0.42 UX/Perf   (F-300 BillingProvider mount → F-311 credit display)
```
v0.38/0.39/0.40 are mutually independent. **v0.42 depends on v0.41** (credit counter needs the provider mounted). Recommended order: **v0.38 → v0.39 → v0.40 → v0.41 → v0.42** (impact-first).

## The sprints

| Sprint | Theme | Tasks | Est. | Findings covered | Log |
|---|---|---|---|---|---|
| **v0.38** | Coverage & Adapter Integrity (💰) | 12 (T0 done) | ~9.4h | F-208/107/109/110 (dead adapters — **quarantine DONE**), circuit-breaker, coverage/billing verify, F-106, F-114, F-104, F-112, F-103, F-102, F-105, F-108, F-111 | [sprint_log_v0_38.md](../../../sprint_log_v0_38.md) |
| **v0.39** | Security Hardening | 12 (~37 sub) | ~14h | F-406, F-407, F-410, F-411, F-412, F-414, F-401, F-402, F-404, F-509, F-413, F-400, F-408, F-409, F-403, F-415, F-417, F-416 | [sprint_log_v0_39.md](../../../sprint_log_v0_39.md) |
| **v0.40** | Deploy & Data Integrity | 9 | ~8h | F-508, F-503, F-502, F-505, F-507, F-500, F-506, F-310, F-504, F-501 | [sprint_log_v0_40.md](../../../sprint_log_v0_40.md) |
| **v0.41** | Frontend Cleanup & Reuse | 9 (~40 items) | ~7.5h | F-300, F-301, F-308, F-305, F-309, F-307, F-302, F-304, F-315, R-300, F-314/R-301, F-100, F-101 | [sprint_log_v0_41.md](../../../sprint_log_v0_41.md) |
| **v0.42** | UX & Performance Polish | 5 (~23 items) | ~14h | F-311, F-312, F-303, F-306, F-313, F-113, F-115, F-116, F-206, F-207, F-200, F-201, F-205 (spike) | [sprint_log_v0_42.md](../../../sprint_log_v0_42.md) |

**Total: ~53h remaining** across 5 sprints. All 71 findings + 26 reuse records are assigned (or consciously marked accepted/wontfix within a sprint). Per-sprint task breakdown, risk register, and acceptance criteria live in each log.

## Key cross-sprint ordering traps (surfaced by the drafters)
- **v0.42 F-311 (credit chip) is hard-blocked by v0.41 F-300** (BillingProvider mount + new `api/credits.js`). v0.42 ships the chip shell rendering `null` on the stub; it goes live the moment v0.41 lands.
- **v0.39 T7** (`API_KEY_PEPPER` guard): the pepper must be confirmed set in Vercel prod **before** merge — rotating it after key issuance invalidates all existing key hashes (one-way).
- **v0.40 T2** (`relevance_labels` migration) unblocks fresh-environment deploys of the v0.33 gold-set harness.
- **v0.41 shared-utils (F-100/F-101)** is a planning spike only — execution needs a monorepo workspace config (Edge routes can't import `src/`).

## See also
[Health-Dashboard](../09-Audit/Health-Dashboard.md) · [_index](../99-Archive/_quarantine/_index.md) · [home](../home.md)
