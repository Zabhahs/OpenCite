import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

export const OPENCONTEXT_ADAPTER = {
  id: "OPENCONTEXT", name: "Open Context",
  tagline: "Archaeological datasets · keyless JSON-LD",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["archaeological-database"],
  contentType: ["archaeological-data", "primary-source"],
  color: { bg: "bg-stone-600", text: "text-stone-50" }, needsKey: false,
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
