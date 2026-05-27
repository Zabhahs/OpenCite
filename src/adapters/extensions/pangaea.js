import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { proxiedFetch } from "../_shared/proxy.js";

export const PANGAEA_ADAPTER = {
  id: "PANGAEA", name: "PANGAEA",
  tagline: "Earth & environment data · archaeogenetic metadata",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["genomic-database", "archaeological-database", "research-repository"],
  contentType: ["genomic-data", "structured-data", "primary-source"],
  color: { bg: "bg-teal-900", text: "text-teal-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const safeQuery = query.replace(/\//g, '\\/');
    const body = {
      query: { query_string: { query: safeQuery } }, size: pageSize, from: offset,
      _source: ["sf-authortitle", "agg-author", "agg-pubYear", "URI", "abstract"]
    };
    const r = await proxiedFetch(
      "https://ws.pangaea.de/es/pangaea/panmd/_search",
      { method: "POST", body: JSON.stringify(body) },
      { adapterId: "PANGAEA" }
    );
    if (!r.ok) throw new Error(`PANGAEA ${r.status}`);
    const data = await r.json();
    const hits = data.hits?.hits || [];
    const total = data.hits?.total?.value ?? data.hits?.total ?? hits.length;
    const results = hits.map((h, i) => {
      const s = h._source || {};
      const url = s.URI || "";
      const doi = url.match(/10\.\d+\/[^\s]+$/)?.[0] || "";
      const displayTitle = s.title || s["sf-authortitle"] || "Untitled Dataset";
      const isGibberish = /\d[A-Z]{5,}/.test(displayTitle) || displayTitle.length > 250;
      const rawAuthors = s["agg-author"];
      const cleanAuthors = (Array.isArray(rawAuthors) ? rawAuthors : (rawAuthors ? [rawAuthors] : [])).filter(Boolean);
      return {
        id: `pangaea-${h._id || `${offset}-${i}`}`, source: "PANGAEA",
        title: isGibberish ? "Environmental Research Data" : stripHtml(displayTitle),
        authors: cleanAuthors,
        year: s["agg-pubYear"] ? String(s["agg-pubYear"]) : "",
        journal: "", publisher: "PANGAEA",
        volume: "", issue: "", pages: "",
        doi, url: url.startsWith("http") ? url : (doi ? `https://doi.org/${doi}` : ""),
        abstract: (s.abstract && !/\d[A-Z]{5,}/.test(s.abstract)) ? stripHtml(s.abstract) : "Data hosted by the PANGAEA repository.",
        isOA: true, type: "genomic-data"
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
