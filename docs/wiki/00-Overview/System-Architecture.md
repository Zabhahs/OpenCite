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
OpenCITE is **one search engine with two front doors**, sharing a single adapter + ranking core:

1. **The browser app** (React/Vite SPA) — fans out to ~25 source [[02-Adapters/Adapter-Architecture|adapters]] in parallel *from the client*, ranks locally, renders streaming results.
2. **`/api/search`** (Vercel serverless) — the **origin-blind, metered** grounding endpoint for AI agents and the [[06-MCP-Server/MCP-Server|MCP server]]; runs the *same adapters* server-side, applies billing/auth/tiering, returns source-anonymized results.

Why it works: **adapters and scoring are `runtime: both`** — the exact same `src/adapters/*` and `src/lib/{scoring,rrf}.js` execute client- and server-side. See [[09-Audit/Duplication-and-Reuse]].

```
                          ┌─────────────────────────────────────────────┐
   Browser (SPA)          │  src/ (React)                               │
   ───────────            │  App.jsx ─ orchestrator                     │
   user → SearchInput ───►│  hooks/useSearch ─► adapters/* (parallel) ──┼─► upstream source APIs
   SearchControls (slider)│         │                ▲                   │    (CORS-blocked via
   ResultCard / lists ◄───┤  lib/{scoring,rrf,       │ proxiedFetch      │     api/proxy.js allowlist)
                          │   semantic,dedup} ranks ─┘                   │
                          │  contexts: Settings(local), Auth, Billing*   │
                          └───────────────┬─────────────────────────────┘
                                          │  fetch (auth: session / API key)
                          ┌───────────────▼─────────────────────────────┐
   Vercel serverless      │  api/search.js  (origin-blind, metered)      │
   ─────────────────      │   apiAuth → ratelimit → cache → fan-out      │
   AI agents / MCP ──────►│   adapters/* (same code) → scoring + RRF     │
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
*Billing context is a client stub, not yet mounted — see [[09-Audit/Tech-Debt-Overengineering#f-300]].*

## Layers → wiki
| Concern | Where | Note |
|---|---|---|
| App shell / orchestration | `src/App.jsx`, `main.jsx` | [[01-Frontend/App-Shell]] |
| UI components & UX | `src/components/*` | [[01-Frontend/UI-Map]], [[01-Frontend/Components/_index]] |
| Client state | `src/hooks/*`, `src/contexts/*` | [[01-Frontend/State-Flow]] |
| Sources | `src/adapters/*` | [[02-Adapters/Adapter-Architecture]] |
| Ranking | `src/lib/{scoring,rrf,semantic,dedup}` | [[03-Search-Pipeline/Ranking-Scoring]] |
| Metered API | `api/search.js`, `api/_shared/*` | [[04-Backend-API/Search-Endpoint]] |
| CORS proxy | `api/proxy.js` | [[04-Backend-API/Proxy]] |
| Auth | `api/auth`, `api/_shared/{auth,apiAuth}` | [[04-Backend-API/Auth-Sessions]] |
| Billing | `api/_shared/billing`, `api/checkout`, `api/stripe/webhook` | [[05-Billing/Billing-Credits]] |
| AI integration | `mcp/*` | [[06-MCP-Server/MCP-Server]] |
| Data | `prisma/*`, KV, localStorage | [[07-Data-Layer/Data-Layer]] |
| Build/deploy | `vite`, `tailwind`, `scripts/migrate.mjs`, `vercel.json` | [[08-Build-Deploy/Build-Deploy]] |

## Runtime split (the key mental model)
- **`both`** (35 modules) — adapters, `scoring`, `rrf`: one implementation, two surfaces. **Protect this.**
- **`client`-only** (55) — React UI, hooks, contexts, and crucially the **semantic rerank** (Web Worker + 23MB model) → API consumers get lexical+native RRF but **no semantic signal** ([[09-Audit/Duplication-and-Reuse#f-205]]).
- **`server`-only** (39) — billing, auth, proxy, KV/Prisma, per-source keyed routes.

## See also
[[00-Overview/Search-Lifecycle]] · [[00-Overview/Tech-Stack]] · [[09-Audit/Health-Dashboard]] · [[home]]
