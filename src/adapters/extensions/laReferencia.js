import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { proxiedFetch } from "../_shared/proxy.js";

// VuFind v1 search API. Federates ~50 Latin American national repository networks.
// Default record set carries no abstract — subjects + title carry the rank signal.
const FIELDS = ["title", "authors", "publicationDates", "formats", "languages", "subjects", "urls", "id", "summary", "publishers"]
  .map((f) => `field[]=${f}`)
  .join("&");

export const LA_REFERENCIA_ADAPTER = {
  id: "LA_REFERENCIA", name: "LA Referencia",
  tagline: "Federated Latin American open-access repositories · ~50 networks",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["latin-america", "global"],
  archiveType: ["aggregator", "research-repository"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-amber-700", text: "text-amber-50" }, needsKey: false,
  capability: {
    protocol: "rest-json", fulltext: false, pagination: "page", totalCount: true, maxWindow: null, auth: "none",
    rankFields: { abstract: "none", subjects: "full", citedBy: false },
    serverSafe: true,
    corpusSize: 3000000, // ~3M records; lareferencia.info
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const url = `https://www.lareferencia.info/vufind/api/v1/search?lookfor=${encodeURIComponent(query)}&type=AllFields&page=${page}&limit=${pageSize}&${FIELDS}`;
    const r = await proxiedFetch(url, { headers: { Accept: "application/json" } }, { adapterId: "LA_REFERENCIA" });
    if (!r.ok) throw new Error(`LA Referencia ${r.status}`);
    const data = await r.json();
    const records = data.records || [];
    const total = data.resultCount ?? records.length;
    const results = records.map((rec, i) => {
      const authors = Object.keys(rec.authors?.primary || {}).map((k) => k.split("|||")[0].trim()).filter(Boolean);
      // subjects is an array of arrays; take the leaf label of each branch
      const subjects = (rec.subjects || [])
        .map((s) => (Array.isArray(s) ? s[s.length - 1] : s))
        .map((s) => (typeof s === "string" ? s.split("::").pop().trim() : ""))
        .filter(Boolean)
        .slice(0, 8);
      return {
        id: `laref-${rec.id || `${offset}-${i}`}`,
        source: "LA_REFERENCIA",
        title: rec.title || "Untitled",
        authors,
        year: (rec.publicationDates?.[0] || "").match(/\d{4}/)?.[0] || "",
        journal: "",
        publisher: rec.publishers?.[0] || "",
        volume: "", issue: "", pages: "", doi: "",
        url: rec.urls?.[0]?.url || "",
        abstract: "",
        isOA: true,
        type: rec.formats?.[0] || "article",
        subjects,
        language: rec.languages?.[0] || "",
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
