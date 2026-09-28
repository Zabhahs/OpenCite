// QUARANTINED v0.44 T5 (2026-06-09) — DO NOT IMPORT. Preserved verbatim, not built.
// What: British Library browser adapter (was src/adapters/extensions/britishLibrary.js).
// Why:  dead upstream — upstream bnb.data.bl.uk SPARQL endpoint hangs until timeout on every probe (live-probed 2026-06-09).
// Revival: re-probe the BNB SPARQL endpoint (or BL's replacement service) answers within budget; then restore the file path, re-add the export/registry entries
// (src/adapters/extensions/index.js + src/adapters/index.js for adapters), re-verify.
// Register: docs/wiki/99-Archive/_quarantine/_index.md.

import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

export const BRITISH_LIBRARY_ADAPTER = {
  id: "BL", name: "British Library",
  tagline: "British National Bibliography · linked open data · 3M+ records",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe", "global"],
  archiveType: ["national-archive", "library"],
  contentType: ["textual", "manuscript", "primary-source"],
  color: { bg: "bg-red-950", text: "text-red-50" }, needsKey: false,
  capability: {
    // Server-proxied SPARQL (title-substring CONTAINS match). No COUNT — total = page length only.
    protocol: "sparql", fulltext: false, pagination: "offset", totalCount: false, maxWindow: null, auth: "none",
    rankFields: { abstract: "sparse", subjects: "full", citedBy: false },
    // v0.38 (T8, F-112): NOT serverSafe — `search` calls the RELATIVE URL /api/search/bl
    // (browser-only). corpusSize recorded for documentation only; no effect while client-only.
    corpusSize: 200000000,
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const r = await fetch(`/api/search/bl?q=${encodeURIComponent(query)}&start=${offset}&rows=${pageSize}`);
    if (!r.ok) throw new Error(`British Library ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(`British Library: ${data.error}`);
    return {
      results: data.results || [],
      hasMore: data.hasMore || false,
    };
  }
};
