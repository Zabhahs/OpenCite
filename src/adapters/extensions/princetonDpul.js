import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { proxiedFetch } from "../_shared/proxy.js";

export const PRINCETON_DPUL_ADAPTER = {
  id: "PRINCETON_DPUL", name: "Princeton DPUL",
  tagline: "Digital PUL · Islamic, Persian Sufi & Shi'i manuscripts",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["mena", "south-asia", "global"],
  archiveType: ["manuscript-collection", "library"], contentType: ["manuscript", "textual", "primary-source"],
  color: { bg: "bg-orange-800", text: "text-orange-50" }, needsKey: false,
  capability: {
    // Server-proxied Blacklight catalog.json. No subjects/keywords mapped today.
    protocol: "blacklight", fulltext: false, pagination: "page", totalCount: true, maxWindow: null, auth: "none",
    rankFields: { abstract: "sparse", subjects: "none", citedBy: false },
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const url = `https://dpul.princeton.edu/catalog.json?q=${encodeURIComponent(query)}&per_page=${pageSize}&page=${page}`;
    const r = await proxiedFetch(url, {}, { adapterId: "PRINCETON_DPUL" });
    if (!r.ok) throw new Error(`Princeton DPUL ${r.status}`);
    const data = await r.json();
    const docs = data.data || data.response?.docs || [];
    const total = data.meta?.pages?.total_count || data.response?.numFound || docs.length;
    const getAttr = (item, field) => {
      const a = item.attributes?.[field];
      if (!a) return "";
      if (typeof a === "string") return a;
      if (a.attributes?.value) return a.attributes.value;
      return Array.isArray(a) ? a.join(", ") : (a.value || "");
    };
    const results = docs.map((d, i) => {
      const title = getAttr(d, "title_tsim") || getAttr(d, "title_display") || getAttr(d, "readonly_title_ssim") || "Untitled";
      const author = getAttr(d, "author_tsim") || getAttr(d, "creator_tsim") || getAttr(d, "author_display");
      const dateRaw = getAttr(d, "pub_date_start_sort") || getAttr(d, "date_tsim") || getAttr(d, "pub_date");
      return {
        id: `dpul-${d.id || `${offset}-${i}`}`, source: "PRINCETON_DPUL",
        title: typeof title === "string" ? title : (Array.isArray(title) ? title.join(", ") : "Untitled"),
        authors: author ? [String(author)] : [],
        year: String(dateRaw).match(/\d{4}/)?.[0] || "",
        journal: "", publisher: "Princeton University Library",
        volume: "", issue: "", pages: "", doi: "",
        url: d.links?.self || `https://dpul.princeton.edu/catalog/${d.id}`,
        abstract: stripHtml(getAttr(d, "description_tsim") || getAttr(d, "summary")),
        isOA: true, type: "manuscript"
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
