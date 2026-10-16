# OpenCITE

**Search 250M+ open-access papers plus museum, library, manuscript and Islamicate archives in one place — citations ready to paste. Free on the web; API + MCP for AI agents.**

> *"The only good is knowledge, Sekhandur. The only evil is ignorance."*

OpenCITE queries open scholarly indexes (OpenAlex, Crossref, DOAJ, PubMed) and heritage archives (Europeana, DPLA, Smithsonian, Gallica, Internet Archive, Open Library, national libraries and more) in parallel, deduplicates the results and formats MLA 9, APA 7, BibTeX, RIS and CSL-JSON citations. Built for citizen scholars, independent researchers and the AI assistants they work with.

**Live:** [citation.today](https://citation.today) · **API docs:** [citation.today/docs](https://citation.today/docs/) · **MCP:** `npx -y opencite-mcp`

## What is free and what is paid

| | Web app | API / MCP |
|---|---|---|
| Searching | Free, unlimited, no account needed | 1 credit per call, prorated by the coverage actually delivered |
| Sources | Every registered adapter (toggle extensions in Settings) | The server-safe set; each result names its `source` |
| Account | Optional: syncs library, history and settings | Required: sign in → Developers → Create key |
| Price | $0 | 20 free credits/month; packs $10 → 2,000 · $50 → 12,000 · $150 → 45,000 (never expire) |

Endpoints: `/api/search`, `/api/citations` (citation graph), `/api/ids` (DOI ↔ PMID ↔ PMCID). Every response carries `X-OpenCITE-API-Version: 2`. Legal: [terms](https://citation.today/legal/terms.html) · [privacy](https://citation.today/legal/privacy.html) · [refunds](https://citation.today/legal/refunds.html).

Analytics: Vercel Web Analytics and Speed Insights (cookieless, aggregate) are mounted. One strictly-necessary session cookie when signed in. No advertising trackers.

## Documentation

The engineering reference is a **single source-of-truth wiki** kept in the repo:

| Form | Where | For |
|---|---|---|
| **GitHub-readable mirror** | [`docs/wiki-gh/`](./docs/wiki-gh/README.md) | Reading on github.com. **Start here on GitHub.** |
| **Obsidian source** (canonical) | [`docs/wiki/`](./docs/wiki/home.md) | Authoring — the only place you hand-edit. |
| **Machine-native twin** | [`docs/wiki/_machine/`](./docs/wiki/_machine/schema.md) | Module registry, dependency graph, findings ledger (JSON). |

Content policy: [`WIKI-RULES`](./docs/wiki/WIKI-RULES.md). Sprint history and status: [`docs/wiki/10-Sprints/`](./docs/wiki/10-Sprints/Index.md). The 2026-09 adversarial audit that shaped v0.46 is in [`docs/audit-2026-09-04/`](./docs/audit-2026-09-04/REPORT.md).

After editing anything in `docs/wiki/`, regenerate and commit both outputs (the pre-commit hook does this):

```bash
node scripts/wiki/build-machine-map.mjs   # rebuild the machine twin (--check to lint cross-refs)
node scripts/wiki/to-github.mjs           # regenerate docs/wiki-gh/
```

## Sources

The registry in `src/adapters/index.js` is the source of truth; the web app lists every registered source on its home screen. Dead upstreams are quarantined (source preserved) under `docs/wiki/99-Archive/_quarantine/` rather than deleted.

## Architecture

React 18 + Vite SPA on Vercel; Node serverless functions under `api/` (Prisma → Supabase Postgres, Auth.js Google sign-in, Stripe); a few Edge routes for browser-only upstream shims; `mcp/` is an MIT-licensed stdio MCP client of the public API. Adapters in `src/adapters/` are shared between the browser fan-out and the server fan-out. There is no local ranking layer since v0.44: results keep each source's native order, interleaved scholarly-first, and are deduplicated by DOI and then by title fingerprint.

## License

Source-available (see [`LICENSE`](./LICENSE)): read, modify and self-host for personal use; no commercial use or hosted deployments. The `mcp/` package is MIT.
