import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { proxiedFetch } from "../_shared/proxy.js";

export const NORTHWESTERN_ADAPTER = {
  id: "NORTHWESTERN", name: "Northwestern Digital",
  tagline: "Herskovits Library · Hausa/Fulani Ajami, West African Arabic-script MSS",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["west-africa", "sahel", "global"],
  archiveType: ["library", "manuscript-collection"], contentType: ["manuscript", "primary-source", "visual"],
  color: { bg: "bg-purple-900", text: "text-purple-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const body = { query: { query_string: { query, default_operator: "AND" } }, size: pageSize, from: offset };
    const nuUrl = "https://api.dc.library.northwestern.edu/api/v2/search";
    let r;
    try {
      r = await fetch(nuUrl, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    } catch {
      r = await proxiedFetch(nuUrl, { method: "POST", body: JSON.stringify(body) });
    }
    if (!r.ok) throw new Error(`Northwestern ${r.status}`);
    const data = await r.json();
    const docs = data.data || [];
    const total = data.info?.total || data.pagination?.total_results || docs.length;
    const results = docs.map((d, i) => ({
      id: `nu-${d.id || `${offset}-${i}`}`, source: "NORTHWESTERN",
      title: d.title || "Untitled",
      authors: (d.creator || []).map(c => c.label || c).filter(Boolean),
      year: String(d.date_created?.[0]?.label || d.create_date || "").match(/\d{4}/)?.[0] || "",
      journal: "", publisher: "Northwestern University Library",
      volume: "", issue: "", pages: "", doi: "",
      url: d.canonical_link || `https://dc.library.northwestern.edu/items/${d.id}`,
      abstract: stripHtml(Array.isArray(d.description) ? d.description[0] : (d.description || "")),
      isOA: true, type: "manuscript",
      previewImage: d.thumbnail || (d.representative_file_set?.url ? `${d.representative_file_set.url}/full/300,/0/default.jpg` : "")
    }));
    return { results, hasMore: offset + results.length < total };
  }
};
