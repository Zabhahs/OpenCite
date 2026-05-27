import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { proxiedFetch } from "../_shared/proxy.js";

export const SCIELO_ADAPTER = {
  id: "SCIELO", name: "SciELO",
  tagline: "Latin American & Iberian scientific literature · open access",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["latin-america", "europe", "global"],
  archiveType: ["scholarly-index", "research-repository"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-green-800", text: "text-green-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const url = `https://search.scielo.org/api/v2/search?q=${encodeURIComponent(query)}&rows=${pageSize}&start=${offset}&lang=en`;
    const r = await proxiedFetch(url, { headers: { Accept: "application/json" } }, { adapterId: "SCIELO" });
    if (!r.ok) throw new Error(`SciELO ${r.status}`);
    const data = await r.json();
    const hits = data.hits?.hits || [];
    const total = data.hits?.total ?? hits.length;
    const results = hits.map((h, i) => {
      const s = h._source || {};
      const titles = Array.isArray(s.title) ? s.title : (s.title ? [s.title] : []);
      const title = titles.find(t => typeof t === "string") || "Untitled";
      const authors = Array.isArray(s.au) ? s.au : (s.au ? [s.au] : []);
      const doi = s.doi || s.id || "";
      const journal = Array.isArray(s.journal_title) ? s.journal_title[0] : (s.journal_title || "");
      const lang = Array.isArray(s.la) ? s.la[0] : (s.la || "");
      const abObj = s.ab || {};
      const abstract = abObj.en?.[0] || abObj.pt?.[0] || abObj.es?.[0] || Object.values(abObj)[0]?.[0] || "";
      const kwObj = s.keywords || s.kw || {};
      const keywords = [
        ...(Array.isArray(kwObj.en) ? kwObj.en : []),
        ...(Array.isArray(kwObj.pt) ? kwObj.pt : []),
        ...(Array.isArray(kwObj.es) ? kwObj.es : []),
      ].filter(Boolean).slice(0, 8);
      const year = s.da ? String(s.da).slice(0, 4) : (s.year ? String(s.year) : "");
      const pid = h._id || s.id || `${offset}-${i}`;
      return {
        id: `scielo-${pid}`,
        source: "SCIELO",
        title,
        authors,
        year,
        journal,
        publisher: "SciELO",
        volume: s.volume || "", issue: s.number || "", pages: s.start_page || "",
        doi,
        url: doi ? `https://doi.org/${doi}` : (s.url || `https://search.scielo.org/?q=${encodeURIComponent(query)}`),
        abstract,
        isOA: true,
        type: "article",
        language: lang,
        keywords,
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
