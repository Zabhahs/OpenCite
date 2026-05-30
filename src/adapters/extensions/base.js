import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { proxiedFetch } from "../_shared/proxy.js";

// BASE — Bielefeld Academic Search Engine. Indexes 300M+ records from 10,000+
// OA repositories worldwide. South Asia coverage includes Shodhganga-linked feeds,
// Pakistani (HEC), Bangladeshi, Sri Lankan, and Nepali OA sources.
//
// No auth required. Query syntax: Solr/Lucene field operators.
// When authorSearch is off, queries are field-scoped to title/description/subject
// to prevent author-name pollution (mirrors the v0.26 scholarly-adapter pattern).
// Pagination: hits/offset. numFound is returned; Solr soft-caps at 10k window.
// Docs: https://www.base-search.net/about/download/base_interface.pdf
export const BASE_ADAPTER = {
  id: "BASE", name: "BASE",
  tagline: "300M+ records from 10,000+ repositories · incl. South Asian OA sources",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global", "south-asia"],
  archiveType: ["aggregator", "scholarly-index"],
  contentType: ["peer-reviewed", "textual", "primary-source"],
  color: { bg: "bg-stone-700", text: "text-stone-50" }, needsKey: false,
  capability: {
    protocol: "rest-json", fulltext: false, pagination: "offset",
    totalCount: true, maxWindow: 10000, auth: "none",
    // dcdescription (abstract) is populated when the source repo includes it — varies by record.
    rankFields: { abstract: "sparse", subjects: "full", citedBy: false },
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const hits = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    // Field-scope to content fields unless the user has enabled authorSearch.
    // Solr parentheses: (term1 term2) = term1 OR term2 within the field — acceptable breadth.
    const q = settings.authorSearch
      ? query
      : `dctitle:(${query}) OR dcdescription:(${query}) OR dcsubject:(${query})`;
    const url =
      `https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi` +
      `?func=PerformSearch` +
      `&query=${encodeURIComponent(q)}` +
      `&hits=${hits}` +
      `&offset=${offset}` +
      `&format=json`;
    const r = await proxiedFetch(url, { headers: { Accept: "application/json" } }, { adapterId: "BASE" });
    if (!r.ok) throw new Error(`BASE ${r.status}`);
    const data = await r.json();
    const resp = data.response || {};
    const total = resp.numFound ?? 0;
    const docs = resp.docs || [];
    const results = docs.map((doc, i) => {
      // dccreator: tab-delimited string in older records, plain array in newer ones.
      const rawCreator = doc.dccreator;
      const authors = Array.isArray(rawCreator)
        ? rawCreator.filter(Boolean)
        : typeof rawCreator === "string"
          ? rawCreator.split(/\t+/).map((s) => s.trim()).filter(Boolean)
          : [];
      // dctype and dclanguage arrive as arrays in v3 format; take first element.
      const first = (f) =>
        Array.isArray(doc[f]) ? (doc[f][0] || "") : String(doc[f] || "");
      const allArr = (f) =>
        Array.isArray(doc[f]) ? doc[f].filter(Boolean) : doc[f] ? [String(doc[f])] : [];
      // DOI: strip URL prefix if upstream includes full https://doi.org/ path.
      const doi = (doc.dcdoi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//, "").trim();
      const identifier = first("dcidentifier");
      return {
        id: `base-${doc.docid || `${offset}-${i}`}`,
        source: "BASE",
        title: doc.dctitle || "Untitled",
        authors,
        year: String(doc.dcdate || "").match(/\d{4}/)?.[0] || "",
        journal: doc.dcrelation || doc.dcsource || "",
        publisher: doc.dcpublisher || "",
        volume: "", issue: "", pages: "",
        doi,
        url: doi ? `https://doi.org/${doi}` : identifier,
        abstract: stripHtml(doc.dcdescription || ""),
        isOA: true,
        type: first("dctype") || "article",
        subjects: allArr("dcsubject").slice(0, 8),
        language: first("dclanguage") || "",
      };
    });
    return { results, hasMore: offset + results.length < total };
  },
};
