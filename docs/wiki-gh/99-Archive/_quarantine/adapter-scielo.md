---
machine_ids: [adapters.extensions.scielo]
findings: [F-110, F-208]
runtime: both
status: quarantined
tags: [archive, quarantine, adapter, scielo]
---
<!-- AUTO-GENERATED from docs/wiki/99-Archive/_quarantine/adapter-scielo.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# 🔒 Quarantined: SciELO adapter

> **Removed from build in v0.38.** Original path: `src/adapters/extensions/scielo.js`. Full source below.

## Why removed
`scielo.js:22` targets `https://search.scielo.org/api/v2/search` — an **internal Elasticsearch endpoint
not intended for public use**. Returns CORS errors / 403 / 404 in all environments → **0 results every
query**. Because it was `serverSafe:true` it dragged `/api/search` coverage to `partial`. See
[Bugs](../../09-Audit/Bugs.md#f-110), [Bugs](../../09-Audit/Bugs.md#f-208).

## Revival checklist
- [ ] Find a *public* SciELO search API (no public JSON search endpoint exists at the ES path).
- [ ] Candidate: SciELO **OAI-PMH** (harvest-only — the Mexicana anti-pattern, weigh carefully) or rely on **DOAJ** (already indexes many SciELO journals) for Latin-American coverage.
- [ ] Re-add `export { SCIELO_ADAPTER } from "./scielo.js";` to `extensions/index.js` + the registry entry in `index.js`.
- [ ] Verify a live query returns results; flip machine record `status` → `degraded`/`healthy`.

## Verbatim source (as of v0.37)
```js
import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { proxiedFetch } from "../_shared/proxy.js";

export const SCIELO_ADAPTER = {
  id: "SCIELO", name: "SciELO",
  tagline: "Latin American & Iberian scientific literature · open access",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["latin-america", "europe", "global"],
  archiveType: ["scholarly-index", "research-repository"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-green-800", text: "text-green-50" }, needsKey: false,
  capability: {
    protocol: "elasticsearch", fulltext: false, pagination: "offset", totalCount: true, maxWindow: 10000, auth: "none",
    rankFields: { abstract: "full", subjects: "full", citedBy: false },
    serverSafe: true,
    corpusSize: 1000000, // ~1M articles; search.scielo.org
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const url = `https://search.scielo.org/api/v2/search?q=${encodeURIComponent(query)}&rows=${pageSize}&start=${offset}&lang=en`;
    const r = await proxiedFetch(url, { headers: { Accept: "application/json" } }, { adapterId: "SCIELO" });
    if (!r.ok) throw new Error(`SciELO ${r.status}`);
    const data = await r.json();
    const hits = data.hits?.hits || [];
    const total = data.hits?.total ?? hits.length;
    const results = hits.map((h, i) => {
      const s = h._source || {};
      const titles = Array.isArray(s.title) ? s.title : (s.title ? [s.title] : []);
      const title = titles.find(t => typeof t === "string") || "Untitled";
      const authors = Array.isArray(s.au) ? s.au : (s.au ? [s.au] : []);
      const doi = s.doi || s.id || "";
      const journal = Array.isArray(s.journal_title) ? s.journal_title[0] : (s.journal_title || "");
      const lang = Array.isArray(s.la) ? s.la[0] : (s.la || "");
      const abObj = s.ab || {};
      const abstract = abObj.en?.[0] || abObj.pt?.[0] || abObj.es?.[0] || Object.values(abObj)[0]?.[0] || "";
      const kwObj = s.keywords || s.kw || {};
      const keywords = [
        ...(Array.isArray(kwObj.en) ? kwObj.en : []),
        ...(Array.isArray(kwObj.pt) ? kwObj.pt : []),
        ...(Array.isArray(kwObj.es) ? kwObj.es : []),
      ].filter(Boolean).slice(0, 8);
      const year = s.da ? String(s.da).slice(0, 4) : (s.year ? String(s.year) : "");
      const pid = h._id || s.id || `${offset}-${i}`;
      return {
        id: `scielo-${pid}`,
        source: "SCIELO",
        title,
        authors,
        year,
        journal,
        publisher: "SciELO",
        volume: s.volume || "", issue: s.number || "", pages: s.start_page || "",
        doi,
        url: doi ? `https://doi.org/${doi}` : (s.url || `https://search.scielo.org/?q=${encodeURIComponent(query)}`),
        abstract,
        isOA: true,
        type: "article",
        language: lang,
        keywords,
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
```

## See also
[Quarantine register](../../01-Frontend/Components/_index.md) · [Extension-Adapters](../../02-Adapters/Extension-Adapters.md#scielo) · [v0.38 sprint](../../10-Sprints/Index.md)
