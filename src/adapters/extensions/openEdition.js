import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

// OpenEdition — French/European open-access SSH platform (Journals, Books, Hypotheses,
// Calenda). The upstream search-api takes a JSON POST, which the generic proxy can't carry
// (it drops Content-Type), so this adapter is a thin shim over the dedicated edge route
// at /api/search/openedition. 1-based pagination derived from offset.
export const OPENEDITION_ADAPTER = {
  id: "OPENEDITION", name: "OpenEdition",
  tagline: "French & European open-access humanities & social sciences · journals & books",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe", "global"],
  archiveType: ["scholarly-index", "research-repository"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-sky-800", text: "text-sky-50" }, needsKey: false,
  capability: {
    // Server-proxied JSON POST via /api/search/openedition. 1-based page pagination.
    protocol: "rest-json", fulltext: false, pagination: "page", totalCount: true, maxWindow: null, auth: "none",
    rankFields: { abstract: "full", subjects: "sparse", citedBy: false },
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const r = await fetch(`/api/search/openedition?q=${encodeURIComponent(query)}&page=${page}&rows=${pageSize}`);
    if (!r.ok) throw new Error(`OpenEdition ${r.status}`);
    const data = await r.json();
    const results = data.results || [];
    return { results, hasMore: offset + results.length < (data.total || 0) };
  }
};
