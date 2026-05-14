import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";

export const INTERNET_ARCHIVE_ADAPTER = {
  id: "IA", name: "Internet Archive",
  tagline: "42M+ texts · scholarly, historical, ephemeral",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["aggregator", "library", "audiovisual-archive"],
  contentType: ["textual", "audio", "primary-source", "ephemera"],
  color: { bg: "bg-stone-700", text: "text-stone-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const fields = "identifier,title,creator,date,description,mediatype,collection";
    const params = `q=${encodeURIComponent(query + " AND mediatype:texts")}&fl[]=${fields.split(",").join("&fl[]=")}&rows=${pageSize}&page=${page}&output=json`;
    const r = await fetch(`https://archive.org/advancedsearch.php?${params}`);
    if (!r.ok) throw new Error(`Internet Archive ${r.status}`);
    const data = await r.json();
    const docs = data.response?.docs || [];
    const results = docs.map((d, i) => {
      const creator = Array.isArray(d.creator) ? d.creator : (d.creator ? [d.creator] : []);
      const desc = Array.isArray(d.description) ? d.description[0] : (d.description || "");
      return {
        id: `ia-${d.identifier || `${offset}-${i}`}`, source: "IA",
        title: Array.isArray(d.title) ? d.title[0] : (d.title || "Untitled"),
        authors: creator, year: String(d.date || "").match(/\d{4}/)?.[0] || "",
        journal: "", publisher: "Internet Archive",
        volume: "", issue: "", pages: "", doi: "",
        url: d.identifier ? `https://archive.org/details/${d.identifier}` : "",
        abstract: stripHtml(desc), isOA: true, type: "textual",
        previewImage: d.identifier ? `https://archive.org/services/img/${d.identifier}` : ""
      };
    });
    return { results, hasMore: offset + results.length < (data.response?.numFound || 0) };
  }
};
