---
machine_ids: []
findings: []
runtime: infra
status: healthy
tags: [audit, strengths]
---
<!-- AUTO-GENERATED from docs/wiki/09-Audit/What-We-Did-Well.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# What We Did Well

> **One-line role.** The genuine strengths — protect these when refactoring. A solo-built product with
> this much architectural discipline is the exception, not the rule.

## Architecture
- **One adapter codebase, two runtimes.** `src/adapters/*` power both the browser app and the origin-blind `/api/search`. `AbstractAdapter.sanitize()` means the UI and ranker never defend against null upstream fields. Adding a source is genuinely "drop a file + register it." See [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md).
- **Clean separation of concerns.** Thin `App.jsx` orchestrator; hooks own state; `lib/` is pure logic; adapters isolated. The provider-tree-stub pattern (ship monetization by changing only context files) largely held. See [App-Shell](../01-Frontend/App-Shell.md).

## Relevance pipeline
- **The v0.35 relevance fixes actually landed**: IA download-as-citation ([Bugs](Bugs.md#f-202)), popularity-sort ([Bugs](Bugs.md#f-203)), diacritic fragmentation ([Bugs](Bugs.md#f-204)) are all genuinely fixed in source.
- **`hasContentMatch()` SSOT** killed the Crossref author-bleed bug for both browser and API paths in one place. See [Confidence-Gate](../03-Search-Pipeline/Confidence-Gate.md).
- **Two-phase semantic rerank** keeps slider drags as pure arithmetic — a thoughtful UX-perf design. See [Semantic-Rerank](../03-Search-Pipeline/Semantic-Rerank.md).
- **RRF fusion in the browser** (`useSemanticRerank` → `fuseRanks`) cleanly combines lexical + semantic ranks for the SPA. *(Caveat — it is NOT wired into the server `/api/search` path; see the [F-209 correction](../03-Search-Pipeline/Known-Defects.md#f-209). The browser implementation itself is sound.)*

## Billing & security posture (verified, not assumed)
- **No free/unmetered-search bypass exists.** The backend crawl specifically hunted: credits charge even on cache hits; KV fail-open disables only rate-limiting (not billing); the only zero-cost paths are by-design. See [Security](Security.md).
- **Stripe webhook signature verified; checkout/webhook idempotent.** Pre-authorize → settle → refund-on-failure credit lifecycle is correct. See [Billing-Credits](../05-Billing/Billing-Credits.md).
- **Defense-in-depth admin gating** — client `isAdmin()` *and* server `resolveSessionAdmin()` both enforce the allowlist. See [Auth-Sessions](../04-Backend-API/Auth-Sessions.md).

## Platform discipline
- **DRY MCP contract** — re-exports `apiContract`; one schema SSOT feeds MCP/OpenAI/Anthropic/OpenAPI. See [MCP-Server](../06-MCP-Server/MCP-Server.md).
- **P3005-safe migrations** — `migrate.mjs` refuses to mark a migration done if the SQL apply failed; the billing migration is fully `IF NOT EXISTS` / non-destructive. The guardrail born from the prior prod OAuth/migration incident — and it works. See [Build-Deploy](../08-Build-Deploy/Build-Deploy.md).
- **No secret leakage** in the MCP package or (mostly) proxy error paths. See [Security](Security.md#f-412).

## See also
[Health-Dashboard](Health-Dashboard.md) · [Duplication-and-Reuse](Duplication-and-Reuse.md) · [System-Architecture](../00-Overview/System-Architecture.md)
