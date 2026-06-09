---
machine_ids: [adapters.extensions.ena]
findings: [F-109, F-208]
runtime: both
status: quarantined
tags: [archive, quarantine, adapter, ena]
---
<!-- AUTO-GENERATED from docs/wiki/99-Archive/_quarantine/adapter-ena.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# 🔒 Quarantined: ENA (European Nucleotide Archive) adapter

> **Removed from build in v0.38.** Original path: `src/adapters/extensions/ena.js`. Full source below.

## Why removed
`ena.js:23` builds `study_title="*query*" OR study_description="*query*"` — the ENA Portal API does
**not** support wildcard-within-quotes Lucene syntax and returns **HTTP 400** for most free-text
queries. `serverSafe:true` → forced `partial` coverage. See [Bugs](../../09-Audit/Bugs.md#f-109), [Bugs](../../09-Audit/Bugs.md#f-208).

## Revival checklist
- [ ] Rewrite the query without wildcard-in-quotes, e.g. `study_title=query OR study_description=query` (test ENA's exact accepted syntax).
- [ ] Add a real total/`hasMore` instead of the page-full heuristic (`items.length === pageSize`).
- [ ] Re-add export + registry entry; verify live results across several genomic queries; flip `status`.

## Verbatim source (as of v0.37)
```js
import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";

export const ENA_ADAPTER = {
  id: "ENA", name: "ENA",
  tagline: "European Nucleotide Archive · ancient DNA, genomic studies",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["genomic-database"], contentType: ["genomic-data"],
  color: { bg: "bg-cyan-800", text: "text-cyan-50" }, needsKey: false,
  capability: {
    // No count requested today (hasMore is a page-full heuristic); upstream caps deep paging at 100k.
    protocol: "rest-json", fulltext: false, pagination: "offset", totalCount: false, maxWindow: 100000, auth: "none",
    // subjects = scientific_name + study_type (non-topical taxonomy/category labels).
    rankFields: { abstract: "full", subjects: "sparse", citedBy: false },
    serverSafe: true,
    corpusSize: 500000, // ~500K searchable studies (conservative); ebi.ac.uk/ena
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const fields = "study_accession,study_title,study_description,first_public,center_name,study_alias,tax_id,scientific_name,study_type";
    const enaQuery = `study_title="*${query}*" OR study_description="*${query}*"`;
    const url = `https://www.ebi.ac.uk/ena/portal/api/search?result=study&query=${encodeURIComponent(enaQuery)}&fields=${fields}&format=json&limit=${pageSize}&offset=${offset}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      if (r.status === 400) throw new Error("ENA: query syntax rejected. Try simpler terms.");
      throw new Error(`ENA ${r.status}`);
    }
    const data = await r.json();
    const items = Array.isArray(data) ? data : [];
    const results = items.map((it, i) => ({
      id: `ena-${it.study_accession || `${offset}-${i}`}`, source: "ENA",
      title: it.study_title || it.study_alias || "Untitled study",
      authors: it.center_name ? [it.center_name] : [],
      year: String(it.first_public || "").slice(0, 4),
      journal: it.study_accession || "", publisher: "European Nucleotide Archive",
      volume: "", issue: "", pages: "", doi: "",
      url: it.study_accession ? `https://www.ebi.ac.uk/ena/browser/view/${it.study_accession}` : "",
      abstract: stripHtml(it.study_description || ""),
      subjects: [it.scientific_name, it.study_type].filter(Boolean),
      isOA: true, type: "genomic-data"
    }));
    return { results, hasMore: items.length === pageSize };
  }
};
```

## See also
[Quarantine register](../../01-Frontend/Components/_index.md) · [Extension-Adapters](../../02-Adapters/Extension-Adapters.md#ena) · [v0.38 sprint](../../10-Sprints/Index.md)
