import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";

export const CHRONICLING_AMERICA_ADAPTER = {
  id: "CHRONICLING_AMERICA", name: "Chronicling America",
  tagline: "Library of Congress · historic US newspapers · OCR full text",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["north-america"],
  archiveType: ["national-archive", "library", "newspaper-archive"],
  contentType: ["textual", "primary-source", "ephemera"],
  color: { bg: "bg-blue-800", text: "text-blue-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const url = `https://chroniclingamerica.loc.gov/search/pages/results/?proxtext=${encodeURIComponent(query)}&format=json&page=${page}&rows=${pageSize}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Chronicling America ${r.status}`);
    const data = await r.json();
    const items = data.items || [];
    const total = data.totalItems || 0;
    const results = items.map((it, i) => {
      const title = Array.isArray(it.title) ? it.title[0] : (it.title || "Untitled");
      const date = it.date || "";
      const pageUrl = it.url ? `https://chroniclingamerica.loc.gov${it.url}` : "";
      return {
        id: `ca-${it.id || `${offset}-${i}`}`,
        source: "CHRONICLING_AMERICA",
        title: stripHtml(title),
        authors: [],
        year: date.slice(0, 4),
        journal: it.title_normal || "",
        publisher: (Array.isArray(it.place_of_publication) ? it.place_of_publication[0] : it.place_of_publication) || "Library of Congress",
        volume: "", issue: it.edition || "", pages: it.sequence ? String(it.sequence) : "",
        doi: "",
        url: pageUrl,
        abstract: stripHtml((it.ocr_eng || "").slice(0, 500)),
        isOA: true,
        type: (Array.isArray(it.type) ? it.type[0] : it.type) || "primary-source",
        language: it.language?.[0] || "",
        subjects: Array.isArray(it.subject) ? it.subject : [],
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
