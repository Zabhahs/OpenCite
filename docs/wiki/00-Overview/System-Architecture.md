---
machine_ids: []
runtime: infra
status: healthy
tags: [overview, architecture]
---

# System Architecture

> **One-line role.** The whole machine in one note — surfaces, runtimes, and how a request flows.
> Step-by-step trace: [[00-Overview/Search-Lifecycle]]. Audit: [[09-Audit/Health-Dashboard]].

## The shape of it

OpenCITE is **one search engine with two front doors**, sharing a single adapter + dedup core:

1. **The browser app** (React/Vite SPA) — fans out to the source [[02-Adapters/Adapter-Architecture|adapters]] in parallel *from the client*, dedupes as results stream in, renders in native upstream order.
2. **`/api/search`** (Vercel serverless) — the **origin-blind, metered** grounding endpoint for AI agents and the [[06-MCP-Server/MCP-Server|MCP server]]; runs the *same adapters* server-side, applies billing/auth/tiering, returns source-anonymized results.

Why it works: **adapters and dedup are `runtime: both`** — the exact same `src/adapters/*` and `src/lib/dedup.js` execute client- and server-side, so the two doors return the same works. See [[09-Audit/Duplication-and-Reuse]].

Since v0.44 there is **no local ranking layer** on either surface: result order is each upstream's own relevance order, round-robin interleaved across sources. The BM25F/RRF/semantic engine was deprecated — see [[03-Search-Pipeline/Pipeline]] and `sprint_log_v0_44.md`.

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
| App shell / orchestration | `src/App.jsx`, `main.jsx` | [[01-Frontend/App-Shell]] |
| UI components & UX | `src/components/*` | [[01-Frontend/UI-Map]], [[01-Frontend/Components/_index]] |
| Client state | `src/hooks/*`, `src/contexts/*` | [[01-Frontend/State-Flow]] |
| Sources | `src/adapters/*` | [[02-Adapters/Adapter-Architecture]] |
| Pipeline (dedup, order) | `src/lib/dedup.js` | [[03-Search-Pipeline/Pipeline]] |
| Metered API | `api/search.js`, `api/_shared/*` | [[04-Backend-API/Search-Endpoint]] |
| CORS proxy | `api/proxy.js` | [[04-Backend-API/Proxy]] |
| Auth | `api/auth`, `api/_shared/{auth,apiAuth}` | [[04-Backend-API/Auth-Sessions]] |
| Billing | `api/_shared/billing`, `api/checkout`, `api/stripe/webhook` | [[05-Billing/Billing-Credits]] |
| AI integration | `mcp/*` | [[06-MCP-Server/MCP-Server]] |
| Data | `prisma/*`, KV, localStorage | [[07-Data-Layer/Data-Layer]] |
| Build/deploy | `vite`, `tailwind`, `scripts/migrate.mjs`, `vercel.json` | [[08-Build-Deploy/Build-Deploy]] |

## Runtime split (the key mental model)
- **`both`** — adapters and `dedup`: one implementation, two surfaces. **Protect this.**
- **`client`-only** — React UI, hooks, contexts; `BillingProvider` is mounted and drives the credits chip.
- **`server`-only** — billing, auth, proxy, KV/Prisma, per-source keyed routes, citation graph, ID resolution.

The authoritative module list with runtimes is `docs/wiki/_machine/modules.json` — do not count modules here.

## See also
[[00-Overview/Search-Lifecycle]] · [[00-Overview/Tech-Stack]] · [[09-Audit/Health-Dashboard]] · [[home]]
