---
machine_ids: [adapters.extensions.openNeuro]
findings: [F-107, F-208]
runtime: both
status: quarantined
tags: [archive, quarantine, adapter, openneuro]
---
<!-- AUTO-GENERATED from docs/wiki/99-Archive/_quarantine/adapter-openneuro.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# 🔒 Quarantined: OpenNeuro adapter

> **Removed from build in v0.38.** Original path: `src/adapters/extensions/openNeuro.js`. Full source below.

## Why removed
`openNeuro.js:22` fetches only the **100 newest** datasets (`datasets(first: 100, orderBy: {created: descending})`)
then client-filters by substring — so any query outside those 100 returns nothing. The GraphQL endpoint
also errors in practice. **0 results for real queries**, `serverSafe:true` → forced `partial` coverage.
See [Bugs](../../09-Audit/Bugs.md#f-107), [Bugs](../../09-Audit/Bugs.md#f-208).

## Revival checklist
- [ ] Replace the "newest 100 + client filter" with a **real search** — OpenNeuro GraphQL needs a search mutation/argument, or use a REST search endpoint if one exists.
- [ ] Confirm the GraphQL endpoint (`https://openneuro.org/crn/graphql`) responds without errors server-side.
- [ ] Re-add export + registry entry; verify live results; flip `status`.

## Verbatim source (as of v0.37)
```js
import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { proxiedFetch } from "../_shared/proxy.js";

export const OPENNEURO_ADAPTER = {
  id: "OPENNEURO", name: "OpenNeuro",
  tagline: "BIDS neuroimaging datasets · client-side filtered text match",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["research-repository"],
  contentType: ["structured-data", "primary-source"],
  color: { bg: "bg-violet-900", text: "text-violet-50" }, needsKey: false,
  capability: {
    // GraphQL: fetches only the latest 100 datasets, then filters/paginates client-side. No real total.
    protocol: "graphql", fulltext: false, pagination: "none", totalCount: false, maxWindow: 100, auth: "none",
    rankFields: { abstract: "sparse", subjects: "sparse", citedBy: false },
    serverSafe: true,
    corpusSize: 1000, // ~1K public BIDS datasets (conservative); openneuro.org
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const gqlQuery = `query PublicDatasets { datasets(first: 100, orderBy: { created: descending }) { edges { node { id created latestSnapshot { tag description { Name Authors DatasetDOI Acknowledgements } summary { modalities tasks species } } } } } }`;
    const onUrl = "https://openneuro.org/crn/graphql";
    let r;
    try {
      r = await fetch(onUrl, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query: gqlQuery }) });
    } catch {
      r = await proxiedFetch(onUrl, { method: "POST", body: JSON.stringify({ query: gqlQuery }) }, { adapterId: "OPENNEURO" });
    }
    if (!r.ok) throw new Error(`OpenNeuro ${r.status}`);
    const data = await r.json();
    if (data.errors) throw new Error(`OpenNeuro GraphQL: ${data.errors[0]?.message || "unknown error"}`);
    const allDatasets = (data.data?.datasets?.edges || []).map(e => e.node);
    const q = query.toLowerCase();
    // Phase D — content-scoped matching. Authors are excluded from the haystack by default so a
    // name query doesn't surface datasets merely authored by that person; toggle re-includes them.
    const matched = allDatasets.filter(ds => {
      const desc = ds.latestSnapshot?.description || {};
      const summary = ds.latestSnapshot?.summary || {};
      const fields = [desc.Name || "", desc.Acknowledgements || "", (summary.tasks || []).join(" "), (summary.modalities || []).join(" ")];
      if (settings.authorSearch) fields.push((desc.Authors || []).join(" "));
      return fields.join(" ").toLowerCase().includes(q);
    });
    const slice = matched.slice(offset, offset + pageSize);
    const results = slice.map((ds, i) => {
      const desc = ds.latestSnapshot?.description || {};
      const summary = ds.latestSnapshot?.summary || {};
      return {
        id: `on-${ds.id}-${i}`, source: "OPENNEURO",
        title: desc.Name || ds.id, authors: desc.Authors || [],
        year: String(ds.created || "").match(/\d{4}/)?.[0] || "",
        journal: (summary.modalities || []).join(", "), publisher: "OpenNeuro",
        keywords: (summary.species || []),
        volume: "", issue: "", pages: "", doi: desc.DatasetDOI || "",
        url: `https://openneuro.org/datasets/${ds.id}`,
        abstract: desc.Acknowledgements || `Tasks: ${(summary.tasks || []).join(", ")}`,
        isOA: true, type: "structured-data"
      };
    });
    return { results, hasMore: offset + slice.length < matched.length };
  }
};
```

## See also
[Quarantine register](../../01-Frontend/Components/_index.md) · [Extension-Adapters](../../02-Adapters/Extension-Adapters.md#openneuro) · [v0.38 sprint](../../10-Sprints/Index.md)
