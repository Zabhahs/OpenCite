import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";

export const THAQALAYN_ADAPTER = {
  id: "THAQALAYN", name: "Thaqalayn",
  tagline: "Comprehensive Shi'i hadith library · keyless API",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["mena", "south-asia"], archiveType: ["research-repository"], contentType: ["textual"],
  color: { bg: "bg-emerald-800", text: "text-emerald-50" }, needsKey: false,
  capability: {
    // Single query endpoint returns the full match set; pagination is a client-side slice.
    protocol: "rest-json", fulltext: true, pagination: "none", totalCount: true, maxWindow: null, auth: "none",
    rankFields: { abstract: "full", subjects: "none", citedBy: false },
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const r = await fetch(`https://www.thaqalayn-api.net/api/v2/query?q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Thaqalayn ${r.status}`);
    const data = await r.json();
    const all = Array.isArray(data) ? data : (data.hadiths || data.results || []);
    const slice = all.slice(offset, offset + pageSize);
    const results = slice.map((h, i) => {
      const englishText = h.english || h.englishText || h.text_en || "";
      const arabicText = h.arabic || h.arabicText || h.text_ar || "";
      const book = h.bookName || h.book || "";
      const hadithNumber = h.hadithNumber || h.id || "";
      return {
        id: `thaq-${h._id || h.id || `${offset}-${i}`}`, source: "THAQALAYN",
        title: book && hadithNumber ? `${book}, hadith ${hadithNumber}` : (book || "Hadith"),
        authors: [], year: "", journal: h.chapterName || h.chapter || "",
        publisher: "Thaqalayn", volume: "", issue: "",
        pages: hadithNumber ? String(hadithNumber) : "", doi: "",
        url: "https://thaqalayn.net/",
        abstract: stripHtml(englishText) || stripHtml(arabicText),
        isOA: true, type: "textual"
      };
    });
    return { results, hasMore: offset + slice.length < all.length };
  }
};
