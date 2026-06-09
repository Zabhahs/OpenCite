import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

export const OPENCONTEXT_ADAPTER = {
  id: "OPENCONTEXT", name: "Open Context",
  tagline: "Archaeological datasets · keyless JSON-LD",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["archaeological-database"],
  contentType: ["archaeological-data", "primary-source"],
  color: { bg: "bg-stone-600", text: "text-stone-50" }, needsKey: false,
  capability: {
    // Server-proxied via /api/search/opencontext. abstract = Context/Type labels only; no subjects emitted.
    protocol: "rest-json", fulltext: false, pagination: "offset", totalCount: true, maxWindow: null, auth: "none",
    rankFields: { abstract: "sparse", subjects: "none", citedBy: false },
    // v0.38 (T8, F-112): NOT serverSafe — `search` calls the RELATIVE URL /api/search/opencontext
    // (browser-only). corpusSize recorded for documentation only; no effect while client-only.
    corpusSize: 900000,
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const r = await fetch(`/api/search/opencontext?q=${encodeURIComponent(query)}&start=${offset}&rows=${pageSize}`);
    if (!r.ok) throw new Error(`Open Context ${r.status}`);
    const data = await r.json();
    return {
      results: data.results || [],
      hasMore: offset + (data.results?.length || 0) < (data.total || 0)
    };
  }
};
