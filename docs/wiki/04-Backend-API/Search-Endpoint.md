---
machine_ids: [api.search, api.shared.apiContract, api.shared.publicResult, api.shared.debugResult, api.shared.coverage, api.shared.serverKeys]
findings: [F-400, F-401, F-402, F-403]
runtime: server
status: healthy
tags: [api, search, billing, origin-blind, passthrough]
---

# Search Endpoint

**Purpose** — `GET /api/search` is the origin-blind, metered grounding endpoint for AI agents,
the MCP server, and the browser admin console. It runs the same adapters as the SPA server-side,
applies auth/tiering/billing, and returns source-anonymized results in pass-through order
(see [[03-Search-Pipeline/Pipeline]]). It is the **only** path that charges credits and the
**only** path that may reveal source attribution (admin debug). Source: `api/search.js`;
request contract SSOT: `api/_shared/apiContract.js` (also feeds the MCP tool schema).

## Contract

**Request** (`GET`, parameters per `apiContract.js`):

| Param | Meaning |
|---|---|
| `q` | required — query; `;` separates multi-keyword terms |
| `limit` | optional — max merged results (bounded; defaults per `apiContract.js`) |
| `sources` | optional — comma-sep adapter IDs, intersected with the caller's tier (out-of-tier IDs silently dropped, no upstream names leaked) |
| `authors` | optional — author-inclusive search mode |
| `mailto` | optional — polite-pool contact email (excluded from cache key) |
| `cite` | optional — extra per-result citation formats beyond mla/apa |
| `format` | optional — `json` (default) or a flat bibliography format; validated before any billing |
| `debug` | admin-only — origin-revealing cards + telemetry; silent no-op for non-admins |

There is no `simple` parameter (removed v0.44 — raw pass-through is the only pipeline) and no
`score`/`lowConfidence` anywhere in the response (D-7, v0.44).

**Auth** — `x-api-key` header (preferred), `?key=` fallback, or session cookie for the
admin break-glass (`resolveSessionAdmin`). Bad keys get a generic 401. `admin` is
server-derived, never read from the request. See [[04-Backend-API/Auth-Sessions]].

**Execution order** — identity → param validation → rate limit (KV leaky-bucket, fail-open
with in-process fallback) → cache read (hit is billed the stored coverage band via
`chargeForBand`) → credit pre-authorization → parallel adapter fan-out (circuit-breaker
filtered, per-adapter timeout) → round-robin **interleave** of each adapter's native-order
list → dedup (normalized DOI key, then title fingerprint; first occurrence — i.e. interleave
order — wins, with field-merge) → coverage band → settle/refund → render.

**Response** (`format=json`) — `query`, `terms`, `coverage` (band only, never raw % or
adapter names), `count`, `totalCandidates`, `tookMs`, `results`, and per-caller `meta`
(`creditsCharged`, `balance`; excluded from the cache payload). Public cards come from
`api/_shared/publicResult.js`: origin dropped, id replaced with a deterministic opaque
`anonymizeId`. Admin `debug=1` cards come from `api/_shared/debugResult.js`, which composes
the public card and re-adds `source` plus per-adapter/dedup/coverage/circuit-breaker
telemetry — the only place origin re-enters a response. Non-json formats return a flat
bibliography (`text/plain`, or a JSON array for csl-json), are still metered (charge in
`X-OpenCITE-*` headers), and are never cached.

## Invariants

- **Origin-blind:** `toPublicResult` is the last transform; nothing after it may reintroduce
  `source` or upstream ids. Debug cards require `identity.admin === true`.
- **Never bill a failed search:** any throw inside fan-out/dedup/coverage refunds the
  pre-authorization and returns 500.
- **Format validated before billing:** a bad `format` costs nothing.
- **No local ranking:** response order is upstream-native, interleaved (v0.44). Tier filtering
  is server-authoritative; keyed sources auto-drop from eligibility when their env key is
  absent so they cannot falsely depress the coverage band.
- Cache hits are billed the same coverage-prorated amount as the original search.

## Findings

Statuses live in the ledger ([[09-Audit/Security]]): F-400 (parseBody cap) fixed v0.39;
F-401 (getSession loopback) — the loopback itself was removed in v0.44 (in-process sessions);
F-402 (timing-safe master-key compare) fixed v0.39; F-403 (rate-limit fail-open) closed as
by-design with an in-process burst fallback.

## See also

[[05-Billing/Billing-Credits]] · [[04-Backend-API/Shared-Modules]] · [[04-Backend-API/Per-Source-Routes]] · [[09-Audit/Security]] · [[03-Search-Pipeline/Pipeline]]
