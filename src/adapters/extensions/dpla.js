import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { proxiedFetch } from "../_shared/proxy.js";

export const DPLA_ADAPTER = {
  id: "DPLA", name: "DPLA",
  tagline: "Digital Public Library of America · 50M+ items",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["north-america"], archiveType: ["aggregator", "library"],
  contentType: ["textual", "visual", "primary-source", "manuscript"],
  color: { bg: "bg-indigo-900", text: "text-indigo-50" },
  needsKey: true, keyName: "dplaKey", keyLabel: "DPLA API key",
  keyHelp: "Free 32-char key. Email pro.dp.la to request — typically same-day.",
  search: async (query, settings, opts = {}) => {
    if (!settings.dplaKey) throw new Error("DPLA needs a free API key. Add yours in settings (⚙).");
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const r = await proxiedFetch(
      `https://api.dp.la/v2/items?q=${encodeURIComponent(query)}&page=${page}&page_size=${pageSize}&api_key=${encodeURIComponent(settings.dplaKey)}`,
      {},
      { adapterId: "DPLA" }
    );
    if (!r.ok) throw new Error(`DPLA ${r.status}`);
    const data = await r.json();
    const results = (data.docs || []).map((d, i) => {
      const src = d.sourceResource || {};
      const title = Array.isArray(src.title) ? src.title[0] : (src.title || "Untitled");
      const creators = Array.isArray(src.creator) ? src.creator : (src.creator ? [src.creator] : []);
      const date = src.date?.displayDate || (Array.isArray(src.date) ? src.date[0]?.displayDate : "") || "";
      const desc = Array.isArray(src.description) ? src.description[0] : (src.description || "");
      return {
        id: `dpla-${d.id || `${offset}-${i}`}`, source: "DPLA", title,
        authors: creators, year: String(date).match(/\d{4}/)?.[0] || "",
        journal: "", publisher: d.provider?.name || "",
        volume: "", issue: "", pages: "", doi: "",
        url: d.isShownAt || "", abstract: stripHtml(desc),
        isOA: true, type: "primary-source", previewImage: d.object || ""
      };
    });
    return { results, hasMore: offset + results.length < (data.count || 0) };
  }
};
