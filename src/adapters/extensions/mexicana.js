import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

export const MEXICANA_ADAPTER = {
  id: "MEXICANA", name: "Mexicana",
  tagline: "Mexican Ministry of Culture · OAI-PMH aggregator",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["latin-america"],
  archiveType: ["aggregator", "national-archive", "library"],
  contentType: ["textual", "visual", "primary-source", "manuscript"],
  color: { bg: "bg-green-900", text: "text-green-50" }, needsKey: false,
  capability: {
    // Server-proxied OAI-PMH ListRecords; "search" is a client-side filter over the harvested batch.
    // No keyword search and no real total — total reflects only the current batch's matches.
    protocol: "oai-pmh", fulltext: false, pagination: "token", totalCount: false, maxWindow: null, auth: "none",
    rankFields: { abstract: "full", subjects: "full", citedBy: false },
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const token = opts.mexicanaToken || '';
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    const r = await fetch(`/api/search/mexicana?q=${encodeURIComponent(query)}&start=${offset}&rows=${pageSize}${tokenParam}`);
    if (!r.ok) throw new Error(`Mexicana ${r.status}`);
    const data = await r.json();
    return {
      results: data.results || [],
      hasMore: data.hasMore || false,
      nextToken: data.nextToken || null,
    };
  }
};
