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
