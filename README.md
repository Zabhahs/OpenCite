# OpenCITE

**Free meta-search across open-access scholarly databases. Citations ready to paste.**

> *"The only good is knowledge, Sekhandur. The only evil is ignorance."*

OpenCITE searches multiple academic APIs in parallel and returns peer-reviewed results with MLA 9 and APA 7 citations formatted and ready to copy. No account required. No tracking. No paywall. Zero AI tokens per search — direct API calls only.

Built for citizen scientists, citizen scholars, independent researchers, and anyone who needs credible sources without institutional access.

---

## Live

**[opencite.app](https://citation.today)**

---

## Documentation

OpenCITE's engineering reference is a **single source-of-truth wiki**, kept in the repo in parallel forms:

| Form | Where | For |
|---|---|---|
| **GitHub-readable mirror** | [`docs/wiki-gh/`](./docs/wiki-gh/README.md) | Reading/navigating on github.com — clickable relative links + anchors. **Start here on GitHub.** |
| **Obsidian source** (canonical) | [`docs/wiki/`](./docs/wiki/home.md) | Authoring — open the folder as an Obsidian vault for `[[wikilinks]]`, backlinks, graph view. **Edit here.** |
| **Machine-native twin** | [`docs/wiki/_machine/`](./docs/wiki/_machine/schema.md) | Tooling/agents — module registry, dependency graph, findings + reuse registries (JSON). |

The honest health audit (bugs, security, duplication, tech debt) lives in **[09-Audit/Health-Dashboard](./docs/wiki-gh/09-Audit/Health-Dashboard.md)**.

### How the wiki works in git
- **`docs/wiki/` is canonical** and Obsidian-native (`[[wikilinks]]`; frontmatter binds each note to its `_machine/` record). This is the only place you hand-edit.
- **`docs/wiki-gh/` is generated** — a mirror where `[[wikilinks]]` are rewritten to standard relative `[text](path.md#anchor)` links, because GitHub's markdown viewer does **not** resolve `[[ ]]`. Never edit it by hand.
- **`_machine/*.json` is generated** from the source plus a static import scan.

**Maintaining the dual structure** — after editing anything in `docs/wiki/`, regenerate and commit both outputs:

```bash
node scripts/wiki/build-machine-map.mjs   # rebuild the machine twin  (--check to lint cross-refs)
node scripts/wiki/to-github.mjs           # regenerate the GitHub mirror (docs/wiki-gh/)
```

Commit `docs/wiki/`, `docs/wiki/_machine/*.json`, and `docs/wiki-gh/` together. The per-version
`architecture_report_*.md` / `sprint_log_*.md` files are historical and superseded by the wiki
(catalogued in [`99-Archive/Index`](./docs/wiki-gh/99-Archive/Index.md)).

> Note: sections below this point are the original project README and may lag the wiki (e.g. source
> counts). Treat the wiki as authoritative.

---

## Sources

### Core (always on)
| Source | Coverage |
|---|---|
| [DOAJ](https://doaj.org) | Directory of Open Access Journals — peer-reviewed |
| [OpenAlex](https://openalex.org) | 250M+ scholarly works, OA-filtered |
| [Crossref](https://crossref.org) | DOI authority — 130M+ works |
| Curated Journals | Your own hand-picked trusted sources, powered by OpenAlex |

### Extensions (opt-in)
| Source | Coverage |
|---|---|
| [Europeana](https://europeana.eu) | Cultural heritage, museums, primary sources |
| [The Met](https://metmuseum.org) | 470,000+ artworks |
| [Smithsonian](https://si.edu) | 11M+ records across 19 museums |
| [DPLA](https://dp.la) | Digital Public Library of America — 50M+ items |
| [Rijksmuseum](https://rijksmuseum.nl) | Dutch Golden Age, 700,000+ objects |
| [Internet Archive](https://archive.org) | 42M+ texts, full-text search |
| [BnF Gallica](https://gallica.bnf.fr) | Bibliothèque nationale de France — 9M+ items |
| [Thaqalayn](https://thaqalayn.net) | Comprehensive Shi'i hadith library |
| [NCBI Entrez](https://ncbi.nlm.nih.gov) | PubMed — biomedical & life sciences |
| [Open Context](https://opencontext.org) | Archaeological datasets |
| [Northwestern Digital](https://dc.library.northwestern.edu) | Herskovits Library — West African MSS |
| [Princeton DPUL](https://dpul.princeton.edu) | Islamic, Persian Sufi & Shi'i manuscripts |
| [PANGAEA](https://pangaea.de) | Earth & environment data, archaeogenetic metadata |
| [OpenNeuro](https://openneuro.org) | BIDS neuroimaging datasets |
| [ENA](https://ebi.ac.uk/ena) | European Nucleotide Archive — ancient DNA |
| [SciELO](https://scielo.org) | Latin American & Caribbean peer-reviewed journals |
| [OAPEN](https://oapen.org) | Open-access academic books & monographs |
| [LA Referencia](https://www.lareferencia.info) | ~50 Latin American institutional repositories |
| [OpenEdition](https://www.openedition.org) | Francophone & European SSH journals and books |
| [Open Library](https://openlibrary.org) | 40M+ book edition records |
| [CORE](https://core.ac.uk) | 200M+ OA research outputs worldwide |
| [NDLI](https://ndl.iitkgp.ac.in) | National Digital Library of India |
| [BASE](https://www.base-search.net) | 300M+ OA documents from 11,000+ sources |

### External Launchers
23 archives without queryable APIs — pre-filled search opens in a new tab, grouped by region. Includes JSTOR, Qatar Digital Library, OpenITI, British Library, HMML, and more.

---

## Features

- **Parallel search** — all enabled sources fire simultaneously, results stream in as they arrive
- **MLA 9 + APA 7** — formatted citations on every result, one-click copy
- **Saved library** — persist results across sessions, export as a full bibliography `.txt`
- **Search history** — last 50 queries, re-run with one click
- **Curated journals** — configure your own trusted ISSN list, searched via OpenAlex
- **Theme switcher** — Tan, Blue-grey, Dark, Porphyry & Gold
- **Load more** — paginate any source independently
- **Image previews** — for cultural heritage and museum results
- **Zero AI tokens** — every result comes directly from the source API

---

## Architecture

OpenCITE v.13 is a modular React application deployed on Vercel.

```
src/
├── App.jsx                    ← thin orchestrator (~200 lines)
├── adapters/                  ← one file per source; registry + sanitize wrapper
│   ├── _shared/               ← proxy, AbstractAdapter, OpenAlex parser
│   ├── core/                  ← DOAJ, OpenAlex, Crossref, CuratedJournals
│   ├── extensions/            ← 17 extension adapters
│   └── index.js               ← ADAPTERS registry + runSearch()
├── components/
│   ├── layout/Layout.jsx      ← Header, ThemeStrip, Footer, ConnectCard
│   ├── panels/Panels.jsx      ← Settings, Library, History, Sources panels
│   ├── search/                ← ResultCard, SourceSection, SearchInput
│   └── launchers/             ← LauncherBlock
├── constants/                 ← themes, vocabulary, defaults
├── contexts/                  ← SettingsContext (live); AuthContext, BillingContext (stubs)
├── hooks/                     ← useSearch, useSettings, useLibrary, useHistory, useTheme
├── launchers/                 ← 23 launcher definitions
└── lib/                       ← citations, storage, history, library, helpers
```

All search results pass through `AbstractAdapter.sanitize()` before reaching the UI — preventing `.trim()` runtime errors on inconsistent upstream fields.

The `AuthContext` and `BillingContext` are wired into the provider tree as stubs. When monetisation phases ship, only those context files change — nothing else in the tree requires modification.

### CORS Proxy

Several institutional archives block browser requests via CORS or require a specific `User-Agent`. A thin Vercel serverless function at `api/proxy.js` handles this transparently.

**Allowlisted domains:**
`dpul.princeton.edu`, `ws.pangaea.de`, `opencontext.org`, `api.dc.library.northwestern.edu`, `openneuro.org`, `www.ebi.ac.uk`, `eutils.ncbi.nlm.nih.gov`

---

## Local Development

```bash
git clone https://github.com/shahbazyusuf/opencite
cd opencite
npm install
npm run dev
```

Requires Node 18+. No environment variables needed for core sources. Some extensions require free API keys — add them in the settings panel (⚙) at runtime.

### API keys (all free)

| Source | Where to get it |
|---|---|
| Europeana | [api.europeana.eu](https://api.europeana.eu) |
| OpenAlex | [openalex.org/settings/api](https://openalex.org/settings/api) — optional |
| Semantic Scholar | [semanticscholar.org/product/api](https://semanticscholar.org/product/api) |
| Smithsonian | [api.data.gov/signup](https://api.data.gov/signup) |
| DPLA | Email pro@dp.la |
| Rijksmuseum | [rijksmuseum.nl/rijksstudio](https://www.rijksmuseum.nl/en/rijksstudio) |

---

## Adding a New Source

1. Create a file in `src/adapters/extensions/` — follow the shape of any existing adapter
2. Export it from `src/adapters/extensions/index.js`
3. Add it to the `ADAPTERS` array in `src/adapters/index.js`

The UI auto-renders a section for it. No other changes needed.

Each adapter must return `{ results: UnifiedResult[], hasMore: boolean }`. Every result passes through `AbstractAdapter.sanitize()` automatically — no need to handle null fields defensively inside the adapter itself.

If the source is CORS-blocked, use `proxiedFetch()` from `src/adapters/_shared/proxy.js` and add the domain to the allowlist in `api/proxy.js`.

---

## Roadmap

OpenCITE is the foundation for **citation.today** — a tiered platform for human and autonomous agent access to scholarly search.

| Phase | Status | Description |
|---|---|---|
| 0 — Adapter stability | ✅ Complete | All sources live, CORS proxy, field mapping fixes |
| 1 — Identity | 🔲 Next | Postgres schema, NextAuth (OIDC), SIWE (Base L2 agents) |
| 2 — Rate limiting | 🔲 | Vercel KV leaky-bucket, credit deduction in `runSearch()` |
| 3 — Human billing | 🔲 | Stripe — Starter $2.99/mo, Pro $9.99/mo |
| 4 — Agent billing | 🔲 | Base L2 micropayments via Chainlink price feeds |
| 5 — Telemetry | 🔲 | KV-buffered logs, Postgres JSONB batch writes |
| 6 — Native API | 🔲 | `/api/search` route, API keys, OpenAPI spec, iOS/Android |

---

## Contributing

Issues and PRs welcome. If you're adding a new scholarly source, please verify:
- The API is publicly accessible without auth (or document the key requirement)
- CORS behaviour in a browser environment
- The correct field names from the upstream response (don't assume standard naming)

---

## Built by

**Shahbaz Yusuf** — [LinkedIn](https://www.linkedin.com/in/shahbaz-yusuf/)

Connect with me - happy to chat anytime.
---

## License

OpenCITE Source-Available License v1.0 — Copyright (c) 2026 Shahbaz Yusuf.

Free to use, study, and modify for personal, academic, or internal research purposes. The following are strictly prohibited:

- Hosting this software or any derivative as a service for third parties
- Any commercial use, direct or indirect
- Circumventing, removing, or weakening any rate-limiting mechanism

For commercial licensing, contact Shahbaz Yusuf: shahbazyusuf@outlook.com

See [LICENSE](./LICENSE) for the full terms.
