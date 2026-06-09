import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

export const GALLICA_ADAPTER = {
  id: "GALLICA", name: "BnF Gallica",
  tagline: "Bibliothèque nationale de France · 9M+ digitized items",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe", "north-africa", "mena"],
  archiveType: ["national-archive", "library", "manuscript-collection"],
  contentType: ["manuscript", "textual", "visual", "primary-source"],
  color: { bg: "bg-rose-900", text: "text-rose-50" }, needsKey: false,
  capability: {
    // Server-proxied SRU via /api/search/gallica. "gallica all" index = OCR full-text + metadata.
    protocol: "sru", fulltext: true, pagination: "offset", totalCount: true, maxWindow: null, auth: "none",
    rankFields: { abstract: "sparse", subjects: "full", citedBy: false },
    // v0.38 (T8, F-112): NOT serverSafe — `search` calls the RELATIVE URL /api/search/gallica,
    // which only resolves in the browser (the dedicated edge route does the SRU fetch). Marking
    // it serverSafe would put an unresolvable relative URL into the server fan-out. corpusSize
    // is recorded for documentation/future use only (no effect while not in the server denominator).
    corpusSize: 15000000,
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const r = await fetch(`/api/search/gallica?q=${encodeURIComponent(query)}&start=${offset}&rows=${pageSize}`);
    if (!r.ok) throw new Error(`Gallica ${r.status}`);
    const data = await r.json();
    return {
      results: data.results || [],
      hasMore: offset + (data.results?.length || 0) < (data.total || 0)
    };
  }
};
