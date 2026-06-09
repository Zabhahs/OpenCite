---
machine_ids: []
runtime: infra
status: healthy
tags: [overview, stack]
---

# Tech Stack

> **One-line role.** The full technology inventory behind OpenCITE — frontend, serverless backend, data, auth, AI, and deploy.

## What it is
OpenCITE is a React/Vite SPA that fans out to ~25 scholarly-source adapters in parallel, ranks the merged results locally, and also exposes a sellable origin-blind `/api/search` grounding endpoint for AI agents. Frontend and backend **share the same adapter + scoring code** (see [[09-Audit/Duplication-and-Reuse]]).

## Layers

| Layer | Tech | Notes |
|---|---|---|
| UI | React 18 + Vite | SPA, hash routing for admin (`#/admin/console`) |
| Styling | Tailwind CSS | built to `public/output.css`; themes in [[01-Frontend/Contexts]] |
| Client search | per-source adapters (`src/adapters/`) | run in-browser, CORS-proxied where needed → see [[02-Adapters/Adapter-Architecture]] |
| Ranking | BM25F + RRF + MiniLM semantic rerank | pure JS, runs client-side (web worker for embeddings) → [[03-Search-Pipeline/Ranking-Scoring]] |
| Backend | Vercel serverless (Node) + Edge | `api/*` functions → [[04-Backend-API/Search-Endpoint]] |
| CORS proxy | `api/proxy.js` | allowlisted upstreams → [[04-Backend-API/Proxy]] |
| Auth | Auth.js (NextAuth) v5, Google OAuth | session + API-key auth → [[04-Backend-API/Auth-Sessions]] |
| DB | Postgres on Supabase, via Prisma | schema + migrations → [[07-Data-Layer/Data-Layer]] |
| KV / rate-limit | Vercel KV | credit + leaky-bucket → [[05-Billing/Billing-Credits]] |
| Billing | Stripe | checkout + webhook → [[05-Billing/Billing-Credits]] |
| AI integration | MCP server (`mcp/`) | exposes search to external models → [[06-MCP-Server/MCP-Server]] |
| Embeddings | MiniLM (~23MB), in-browser | downloaded once, cached → [[03-Search-Pipeline/Semantic-Rerank]] |
| Deploy | Vercel, auto-deploy `main` | aliases `citation.today`, `opencite.space` → [[08-Build-Deploy/Build-Deploy]] |
| Build chain | `scripts/migrate.mjs` → tailwind → `vite build` | P3005-safe migrate, never hard-fails |

## Persistence model (where data lives)
- **localStorage** (browser): settings, saved library, search history, theme. See [[01-Frontend/State-Flow]].
- **Postgres** (server): users, sessions, API keys, billing/credits, gold-set relevance labels. See [[07-Data-Layer/Data-Layer]].
- **Vercel KV**: rate-limit buckets, credit pre-auth, response cache. See [[05-Billing/Billing-Credits]].

## See also
[[00-Overview/System-Architecture]] · [[00-Overview/Search-Lifecycle]] · [[home]]
