import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

export const BDPI_ADAPTER = {
  id: "BDPI", name: "BDPI",
  tagline: "Biblioteca Digital del Patrimonio Iberoamericano · 16 national libraries",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["latin-america", "europe"], archiveType: ["aggregator", "national-archive", "library"],
  contentType: ["textual", "manuscript", "visual", "primary-source"],
  color: { bg: "bg-yellow-800", text: "text-yellow-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const r = await fetch(`/api/search/bdpi?q=${encodeURIComponent(query)}&start=${offset}&rows=${pageSize}`);
    if (!r.ok) throw new Error(`BDPI ${r.status}`);
    const data = await r.json();
    return {
      results: data.results || [],
      hasMore: offset + (data.results?.length || 0) < (data.total || 0)
    };
  }
};
