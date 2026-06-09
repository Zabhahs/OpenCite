---
machine_ids: []
runtime: infra
status: healthy
tags: [overview, stack]
---
<!-- AUTO-GENERATED from docs/wiki/00-Overview/Tech-Stack.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Tech Stack

> **One-line role.** The full technology inventory behind OpenCITE — frontend, serverless backend, data, auth, AI, and deploy.

## What it is
OpenCITE is a React/Vite SPA that fans out to ~25 scholarly-source adapters in parallel, ranks the merged results locally, and also exposes a sellable origin-blind `/api/search` grounding endpoint for AI agents. Frontend and backend **share the same adapter + scoring code** (see [Duplication-and-Reuse](../09-Audit/Duplication-and-Reuse.md)).

## Layers

| Layer | Tech | Notes |
|---|---|---|
| UI | React 18 + Vite | SPA, hash routing for admin (`#/admin/console`) |
| Styling | Tailwind CSS | built to `public/output.css`; themes in [Contexts](../01-Frontend/Contexts.md) |
| Client search | per-source adapters (`src/adapters/`) | run in-browser, CORS-proxied where needed → see [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md) |
| Ranking | BM25F + RRF + MiniLM semantic rerank | pure JS, runs client-side (web worker for embeddings) → [Ranking-Scoring](../03-Search-Pipeline/Ranking-Scoring.md) |
| Backend | Vercel serverless (Node) + Edge | `api/*` functions → [Search-Endpoint](../04-Backend-API/Search-Endpoint.md) |
| CORS proxy | `api/proxy.js` | allowlisted upstreams → [Proxy](../04-Backend-API/Proxy.md) |
| Auth | Auth.js (NextAuth) v5, Google OAuth | session + API-key auth → [Auth-Sessions](../04-Backend-API/Auth-Sessions.md) |
| DB | Postgres on Supabase, via Prisma | schema + migrations → [Data-Layer](../07-Data-Layer/Data-Layer.md) |
| KV / rate-limit | Vercel KV | credit + leaky-bucket → [Billing-Credits](../05-Billing/Billing-Credits.md) |
| Billing | Stripe | checkout + webhook → [Billing-Credits](../05-Billing/Billing-Credits.md) |
| AI integration | MCP server (`mcp/`) | exposes search to external models → [MCP-Server](../06-MCP-Server/MCP-Server.md) |
| Embeddings | MiniLM (~23MB), in-browser | downloaded once, cached → [Semantic-Rerank](../03-Search-Pipeline/Semantic-Rerank.md) |
| Deploy | Vercel, auto-deploy `main` | aliases `citation.today`, `opencite.space` → [Build-Deploy](../08-Build-Deploy/Build-Deploy.md) |
| Build chain | `scripts/migrate.mjs` → tailwind → `vite build` | P3005-safe migrate, never hard-fails |

## Persistence model (where data lives)
- **localStorage** (browser): settings, saved library, search history, theme. See [State-Flow](../01-Frontend/State-Flow.md).
- **Postgres** (server): users, sessions, API keys, billing/credits, gold-set relevance labels. See [Data-Layer](../07-Data-Layer/Data-Layer.md).
- **Vercel KV**: rate-limit buckets, credit pre-auth, response cache. See [Billing-Credits](../05-Billing/Billing-Credits.md).

## See also
[System-Architecture](System-Architecture.md) · [Search-Lifecycle](Search-Lifecycle.md) · [home](../home.md)
