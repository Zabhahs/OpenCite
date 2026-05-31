import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { proxiedFetch } from "../_shared/proxy.js";

// R3: DPLA sourceResource.type → UnifiedResult type
const DPLA_TYPE_MAP = {
  "image":               "image",
  "still image":         "image",
  "text":                "primary-source",
  "sound":               "misc",
  "moving image":        "misc",
  "physical object":     "primary-source",
  "interactive resource":"misc",
  "dataset":             "dataset",
};

export const DPLA_ADAPTER = {
  id: "DPLA", name: "DPLA",
  tagline: "Digital Public Library of America · 50M+ items",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["north-america"], archiveType: ["aggregator", "library"],
  contentType: ["textual", "visual", "primary-source", "manuscript"],
  color: { bg: "bg-indigo-900", text: "text-indigo-50" },
  needsKey: false,
  capability: {
    protocol: "rest-json", fulltext: false, pagination: "page", totalCount: true, maxWindow: null, auth: "key",
    rankFields: { abstract: "full", subjects: "full", citedBy: false },
    serverSafe: true,
    corpusSize: 10000000, // ~10M items, dp.la
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    if (typeof window !== "undefined") {
      // BROWSER: no secret in the client — ask our own backend (same-origin, no key on the wire).
      const r = await fetch(`/api/search/dpla?q=${encodeURIComponent(query)}&offset=${offset}`);
      if (!r.ok) throw new Error(`DPLA ${r.status}`);
      return await r.json();                       // { results, hasMore } — already normalized server-side
    }
    // SERVER (the api/search/dpla route OR the /api/search fan-out): key injected by caller.
    if (!settings.dplaKey) throw new Error("DPLA_API_KEY not configured");  // backend config error
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const doiMatch = query.match(/^10\.\d{4,}\/(.+)$/);
    const safeQuery = doiMatch ? doiMatch[1] : query;
    const r = await proxiedFetch(
      `https://api.dp.la/v2/items?q=${encodeURIComponent(safeQuery)}&page=${page}&page_size=${pageSize}&api_key=${encodeURIComponent(settings.dplaKey)}`,
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

      // R3: use native DPLA type from sourceResource
      const rawType = Array.isArray(src.type) ? src.type[0] : (src.type || "");
      const resolvedType = DPLA_TYPE_MAP[String(rawType).toLowerCase()] || "primary-source";

      // R6: subjects from sourceResource.subject — can be strings or { "@id", "name" } objects
      const rawSubjects = Array.isArray(src.subject) ? src.subject : [];
      const subjects = rawSubjects
        .map(s => (typeof s === "string" ? s : s?.name))
        .filter(Boolean);

      return {
        id: `dpla-${d.id || `${offset}-${i}`}`, source: "DPLA", title,
        authors: creators, year: String(date).match(/\d{4}/)?.[0] || "",
        journal: "", publisher: d.provider?.name || "",
        volume: "", issue: "", pages: "", doi: "",
        url: d.isShownAt || "",
        abstract: stripHtml(desc),
        isOA: true,
        type: resolvedType,
        subjects,
        previewImage: d.object || ""
      };
    });
    return { results, hasMore: offset + results.length < (data.count || 0) };
  }
};
