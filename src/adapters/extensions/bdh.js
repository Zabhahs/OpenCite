import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

export const BDH_ADAPTER = {
  id: "BDH", name: "BDH / BNE",
  tagline: "Biblioteca Digital Hispánica · Spanish National Library digitized collections",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe", "latin-america"],
  archiveType: ["national-archive", "library"],
  contentType: ["textual", "manuscript", "visual", "primary-source"],
  color: { bg: "bg-yellow-900", text: "text-yellow-50" }, needsKey: false,
  capability: {
    // Server-proxied datos.bne.es REST via /api/search/bdh.
    protocol: "rest-json", fulltext: false, pagination: "offset", totalCount: true, maxWindow: null, auth: "none",
    rankFields: { abstract: "sparse", subjects: "full", citedBy: false },
    // v0.38 (T8, F-112): NOT serverSafe — `search` calls the RELATIVE URL /api/search/bdh
    // (browser-only). corpusSize recorded for documentation only; no effect while client-only.
    corpusSize: 400000,
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const r = await fetch(`/api/search/bdh?q=${encodeURIComponent(query)}&start=${offset}&rows=${pageSize}`);
    if (!r.ok) throw new Error(`BDH ${r.status}`);
    const data = await r.json();
    return {
      results: data.results || [],
      hasMore: offset + (data.results?.length || 0) < (data.total || 0),
    };
  }
};
