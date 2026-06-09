---
machine_ids: []
findings: []
runtime: infra
status: healthy
tags: [audit, strengths]
---

# What We Did Well

> **One-line role.** The genuine strengths — protect these when refactoring. A solo-built product with
> this much architectural discipline is the exception, not the rule.

## Architecture
- **One adapter codebase, two runtimes.** `src/adapters/*` power both the browser app and the origin-blind `/api/search`. `AbstractAdapter.sanitize()` means the UI and ranker never defend against null upstream fields. Adding a source is genuinely "drop a file + register it." See [[02-Adapters/Adapter-Architecture]].
- **Clean separation of concerns.** Thin `App.jsx` orchestrator; hooks own state; `lib/` is pure logic; adapters isolated. The provider-tree-stub pattern (ship monetization by changing only context files) largely held. See [[01-Frontend/App-Shell]].

## Relevance pipeline
- **The v0.35 relevance fixes actually landed**: IA download-as-citation ([[09-Audit/Bugs#f-202]]), popularity-sort ([[09-Audit/Bugs#f-203]]), diacritic fragmentation ([[09-Audit/Bugs#f-204]]) are all genuinely fixed in source.
- **`hasContentMatch()` SSOT** killed the Crossref author-bleed bug for both browser and API paths in one place. See [[03-Search-Pipeline/Confidence-Gate]].
- **Two-phase semantic rerank** keeps slider drags as pure arithmetic — a thoughtful UX-perf design. See [[03-Search-Pipeline/Semantic-Rerank]].
- **RRF fusion in the browser** (`useSemanticRerank` → `fuseRanks`) cleanly combines lexical + semantic ranks for the SPA. *(Caveat — it is NOT wired into the server `/api/search` path; see the [[03-Search-Pipeline/Known-Defects#f-209|F-209 correction]]. The browser implementation itself is sound.)*

## Billing & security posture (verified, not assumed)
- **No free/unmetered-search bypass exists.** The backend crawl specifically hunted: credits charge even on cache hits; KV fail-open disables only rate-limiting (not billing); the only zero-cost paths are by-design. See [[09-Audit/Security]].
- **Stripe webhook signature verified; checkout/webhook idempotent.** Pre-authorize → settle → refund-on-failure credit lifecycle is correct. See [[05-Billing/Billing-Credits]].
- **Defense-in-depth admin gating** — client `isAdmin()` *and* server `resolveSessionAdmin()` both enforce the allowlist. See [[04-Backend-API/Auth-Sessions]].

## Platform discipline
- **DRY MCP contract** — re-exports `apiContract`; one schema SSOT feeds MCP/OpenAI/Anthropic/OpenAPI. See [[06-MCP-Server/MCP-Server]].
- **P3005-safe migrations** — `migrate.mjs` refuses to mark a migration done if the SQL apply failed; the billing migration is fully `IF NOT EXISTS` / non-destructive. The guardrail born from the prior prod OAuth/migration incident — and it works. See [[08-Build-Deploy/Build-Deploy]].
- **No secret leakage** in the MCP package or (mostly) proxy error paths. See [[09-Audit/Security#f-412]].

## See also
[[09-Audit/Health-Dashboard]] · [[09-Audit/Duplication-and-Reuse]] · [[00-Overview/System-Architecture]]
