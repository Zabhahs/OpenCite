import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";

export const CROSSREF_ADAPTER = {
  id: "CROSSREF",
  name: "Crossref",
  tagline: "DOI authority · 130M+ scholarly works",
  category: ADAPTER_CATEGORY.CORE,
  region: ["global"],
  archiveType: ["scholarly-index"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-red-900", text: "text-red-50" },
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    const mailto = settings.crossrefEmail ? `&mailto=${encodeURIComponent(settings.crossrefEmail)}` : "";
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${pageSize}&offset=${offset}${mailto}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Crossref ${r.status}`);
    const data = await r.json();
    const items = data.message?.items || [];
    const results = items.map((it, i) => {
      const doi = it.DOI || "";
      const title = Array.isArray(it.title) ? it.title[0] : (it.title || "Untitled");
      const authors = (it.author || [])
        .map(a => [a.given, a.family].filter(Boolean).join(" "))
        .filter(Boolean);
      const dateParts = it.issued?.["date-parts"]?.[0] || it.published?.["date-parts"]?.[0] || [];
      const year = dateParts[0] ? String(dateParts[0]) : "";
      const journal = Array.isArray(it["container-title"]) ? it["container-title"][0] : (it["container-title"] || "");
      return {
        id: `cr-${doi || `${offset}-${i}`}`,
        source: "CROSSREF",
        title: stripHtml(title),
        authors, year, journal,
        publisher: it.publisher || "",
        volume: it.volume || "",
        issue: it.issue || "",
        pages: it.page || "",
        doi,
        url: it.URL || (doi ? `https://doi.org/${doi}` : ""),
        abstract: stripHtml(it.abstract || ""),
        isOA: false,
        type: "article"
      };
    });
    return { results, hasMore: offset + results.length < (data.message?.["total-results"] || 0) };
  }
};
