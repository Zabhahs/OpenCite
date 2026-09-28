---
machine_ids: []
runtime: infra
status: healthy
tags: [overview, architecture]
---
<!-- AUTO-GENERATED from docs/wiki/00-Overview/System-Architecture.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# System Architecture

> **One-line role.** The whole machine in one note — surfaces, runtimes, and how a request flows.
> Step-by-step trace: [Search-Lifecycle](Search-Lifecycle.md). Audit: [Health-Dashboard](../09-Audit/Health-Dashboard.md).

## The shape of it

OpenCITE is **one search engine with two front doors**, sharing a single adapter + dedup core:

1. **The browser app** (React/Vite SPA) — fans out to the source [adapters](../02-Adapters/Adapter-Architecture.md) in parallel *from the client*, dedupes as results stream in, renders in native upstream order.
2. **`/api/search`** (Vercel serverless) — the **origin-blind, metered** grounding endpoint for AI agents and the [MCP server](../06-MCP-Server/MCP-Server.md); runs the *same adapters* server-side, applies billing/auth/tiering, returns source-anonymized results.

Why it works: **adapters and dedup are `runtime: both`** — the exact same `src/adapters/*` and `src/lib/dedup.js` execute client- and server-side, so the two doors return the same works. See [Duplication-and-Reuse](../09-Audit/Duplication-and-Reuse.md).

Since v0.44 there is **no local ranking layer** on either surface: result order is each upstream's own relevance order, round-robin interleaved across sources. The BM25F/RRF/semantic engine was deprecated — see [Pipeline](../03-Search-Pipeline/Pipeline.md) and `sprint_log_v0_44.md`.

```
                          ┌─────────────────────────────────────────────┐
   Browser (SPA)          │  src/ (React)                               │
   ───────────            │  App.jsx ─ orchestrator                     │
   user → SearchInput ───►│  hooks/useSearch ─► adapters/* (parallel) ──┼─► upstream source APIs
   ResultCard / lists ◄───┤         │                ▲                   │    (CORS-blocked via
                          │  lib/dedup (streaming    │ proxiedFetch      │     api/proxy.js allowlist)
                          │   first-wins) ───────────┘                   │
                          │  contexts: Auth, Billing                     │
                          └───────────────┬─────────────────────────────┘
                                          │  fetch (auth: session / API key)
                          ┌───────────────▼─────────────────────────────┐
   Vercel serverless      │  api/search.js  (origin-blind, metered)      │
   ─────────────────      │   apiAuth → ratelimit → cache → fan-out      │
   AI agents / MCP ──────►│   adapters/* (same code) → dedup+field-merge │
                          │   → round-robin interleave (native order)    │
                          │   coverage → billing (preauth/settle/refund) │
                          │   publicResult (blind) | debugResult (admin) │
                          │  api/proxy.js · api/search/{keyed routes}    │
                          │  api/auth · api/checkout · api/stripe/webhook │
                          └───────┬──────────────┬──────────────┬────────┘
                                  │              │              │
                           Postgres/Prisma   Vercel KV       Stripe
                           (users, keys,     (rate-limit,    (checkout,
                            billing, labels)  credits, cache) webhook)
```

## Layers → wiki
| Concern | Where | Note |
|---|---|---|
| App shell / orchestration | `src/App.jsx`, `main.jsx` | [App-Shell](../01-Frontend/App-Shell.md) |
| UI components & UX | `src/components/*` | [UI-Map](../01-Frontend/UI-Map.md), [_index](../01-Frontend/Components/_index.md) |
| Client state | `src/hooks/*`, `src/contexts/*` | [State-Flow](../01-Frontend/State-Flow.md) |
| Sources | `src/adapters/*` | [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md) |
| Pipeline (dedup, order) | `src/lib/dedup.js` | [Pipeline](../03-Search-Pipeline/Pipeline.md) |
| Metered API | `api/search.js`, `api/_shared/*` | [Search-Endpoint](../04-Backend-API/Search-Endpoint.md) |
| CORS proxy | `api/proxy.js` | [Proxy](../04-Backend-API/Proxy.md) |
| Auth | `api/auth`, `api/_shared/{auth,apiAuth}` | [Auth-Sessions](../04-Backend-API/Auth-Sessions.md) |
| Billing | `api/_shared/billing`, `api/checkout`, `api/stripe/webhook` | [Billing-Credits](../05-Billing/Billing-Credits.md) |
| AI integration | `mcp/*` | [MCP-Server](../06-MCP-Server/MCP-Server.md) |
| Data | `prisma/*`, KV, localStorage | [Data-Layer](../07-Data-Layer/Data-Layer.md) |
| Build/deploy | `vite`, `tailwind`, `scripts/migrate.mjs`, `vercel.json` | [Build-Deploy](../08-Build-Deploy/Build-Deploy.md) |

## Runtime split (the key mental model)
- **`both`** — adapters and `dedup`: one implementation, two surfaces. **Protect this.**
- **`client`-only** — React UI, hooks, contexts; `BillingProvider` is mounted and drives the credits chip.
- **`server`-only** — billing, auth, proxy, KV/Prisma, per-source keyed routes, citation graph, ID resolution.

The authoritative module list with runtimes is `docs/wiki/_machine/modules.json` — do not count modules here.

## See also
[Search-Lifecycle](Search-Lifecycle.md) · [Tech-Stack](Tech-Stack.md) · [Health-Dashboard](../09-Audit/Health-Dashboard.md) · [home](../home.md)
