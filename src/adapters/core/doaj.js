import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";

export const DOAJ_ADAPTER = {
  id: "DOAJ",
  name: "DOAJ",
  tagline: "Directory of Open Access Journals · peer-reviewed",
  category: ADAPTER_CATEGORY.CORE,
  region: ["global"],
  archiveType: ["scholarly-index"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-amber-900", text: "text-amber-50" },
  needsKey: false,
  capability: {
    protocol: "rest-json", fulltext: false, pagination: "page", totalCount: true, maxWindow: null, auth: "none",
    rankFields: { abstract: "full", subjects: "full", citedBy: false },
    serverSafe: true,
    corpusSize: 10000000, // ~10M articles, doaj.org
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    // Phase A — field-scoped retrieval via Elasticsearch query string. Default search hits
    // bibjson.author too; scoping to title/abstract/keywords keeps author matches out.
    // Strip Lucene reserved chars from the user term so we control the query structure,
    // then let DOAJ AND the words within each field (its default when no operator given).
    const clean = query.replace(/[+\-!(){}\[\]^"~*?:\\/]/g, " ").replace(/\s+/g, " ").trim();
    const queryStr = settings.authorSearch
      ? clean
      : `bibjson.title:(${clean}) OR bibjson.abstract:(${clean}) OR bibjson.keywords:(${clean})`;
    const url = `https://doaj.org/api/v3/search/articles/${encodeURIComponent(queryStr)}?pageSize=${pageSize}&page=${page}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`DOAJ ${r.status}`);
    const data = await r.json();
    const results = (data.results || []).map((a, i) => {
      const b = a.bibjson || {};
      const doi = (b.identifier || []).find(x => x.type === "doi")?.id || "";
      const fulltext = (b.link || []).find(x => x.type === "fulltext")?.url || "";
      return {
        id: `doaj-${a.id || `${offset}-${i}`}`,
        source: "DOAJ",
        title: b.title || "Untitled",
        authors: (b.author || []).map(x => x.name).filter(Boolean),
        year: b.year ? String(b.year) : "",
        journal: b.journal?.title || "",
        publisher: b.journal?.publisher || "",
        volume: b.journal?.volume || "",
        issue: b.journal?.number || "",
        pages: b.start_page && b.end_page ? `${b.start_page}-${b.end_page}` : (b.start_page || ""),
        doi,
        url: fulltext || (doi ? `https://doi.org/${doi}` : ""),
        abstract: stripHtml(b.abstract || ""),
        isOA: true,
        type: "article",
        // v.17 enrichment
        keywords: Array.isArray(b.keywords) ? b.keywords : [],
        subjects: (b.subject || []).map(s => s.term || s).filter(Boolean),
        language: Array.isArray(b.journal?.language) ? b.journal.language[0] || "" : "",
      };
    });
    return { results, hasMore: offset + results.length < (data.total || 0) };
  }
};
