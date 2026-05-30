import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { proxiedFetch } from "../_shared/proxy.js";

// v.22A — updated to www.loc.gov API after LOC 308 redirect of chroniclingamerica.loc.gov
export const CHRONICLING_AMERICA_ADAPTER = {
  id: "CHRONICLING_AMERICA", name: "Chronicling America",
  tagline: "Library of Congress · historic US newspapers · OCR full text",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["north-america"],
  archiveType: ["national-archive", "library"],
  contentType: ["textual", "primary-source", "ephemera"],
  color: { bg: "bg-blue-800", text: "text-blue-50" }, needsKey: false,
  capability: {
    // Server-proxied loc.gov fo=json over OCR'd newspaper full text. LoC caps deep paging at 100k.
    protocol: "rest-json", fulltext: true, pagination: "page", totalCount: true, maxWindow: 100000, auth: "none",
    rankFields: { abstract: "sparse", subjects: "full", citedBy: false },
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const url = `https://www.loc.gov/collections/chronicling-america/?q=${encodeURIComponent(query)}&fo=json&c=${pageSize}&sp=${page}`;
    const r = await proxiedFetch(url, { headers: { Accept: "application/json" } }, { adapterId: "CHRONICLING_AMERICA" });
    if (!r.ok) throw new Error(`Chronicling America ${r.status}`);
    const data = await r.json();
    const items = Array.isArray(data.results) ? data.results : [];
    const total = data.pagination?.total ?? items.length;
    const results = items.map((it, i) => {
      const rawTitle = Array.isArray(it.title) ? it.title[0] : (it.title || "Untitled");
      const newspaper = it.partof?.[0]?.title || it.partof?.[0] || "";
      const date = it.date || "";
      const desc = Array.isArray(it.description) ? it.description.join(" ") : (it.description || "");
      const lang = Array.isArray(it.language) ? it.language[0] : (it.language || "");
      const subjects = Array.isArray(it.subject) ? it.subject : [];
      const imgUrl = Array.isArray(it.image_url) ? it.image_url[0] : (it.image_url || "");
      return {
        id: `ca-${it.id?.split("/").filter(Boolean).pop() || `${offset}-${i}`}`,
        source: "CHRONICLING_AMERICA",
        title: stripHtml(rawTitle),
        authors: [],
        year: date.slice(0, 4),
        journal: typeof newspaper === "string" ? newspaper : "",
        publisher: Array.isArray(it.location) ? it.location[0] : (it.location || "Library of Congress"),
        volume: "", issue: "", pages: "",
        doi: "",
        url: it.url || "",
        abstract: stripHtml(desc.slice(0, 500)),
        isOA: true,
        type: "primary-source",
        language: lang.toLowerCase(),
        subjects,
        previewImage: imgUrl,
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
