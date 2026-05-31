import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { hasContentMatch } from "../../lib/scoring.js";

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
  capability: {
    protocol: "rest-json", fulltext: false, pagination: "offset", totalCount: true, maxWindow: 10000, auth: "polite",
    rankFields: { abstract: "sparse", subjects: "sparse", citedBy: true },
    serverSafe: true,
    corpusSize: 155000000, // ~155M works, crossref.org
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const mailto = settings.crossrefEmail ? `&mailto=${encodeURIComponent(settings.crossrefEmail)}` : "";
    // Phase A — Crossref has no abstract index and query.title is deprecated, so the closest
    // content-scoped field is query.bibliographic (title+author+journal+year). Author-only
    // matches that lack the term in title score 0 in BM25F and are dropped downstream.
    // authorSearch toggle targets the author field directly.
    const words = query.trim().split(/\s+/);
    let queryParam;
    if (settings.authorSearch) {
      queryParam = `query.author=${encodeURIComponent(query)}`;
    } else {
      queryParam = words.length > 1
        ? `query.bibliographic=${encodeURIComponent(query)}`
        : `query=${encodeURIComponent(query)}`;
    }
    const url = `https://api.crossref.org/works?${queryParam}&rows=${pageSize}&offset=${offset}${mailto}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Crossref ${r.status}`);
    const data = await r.json();
    const items = data.message?.items || [];
    const mapped = items.map((it, i) => {
      const doi = it.DOI || "";
      const title = Array.isArray(it.title) ? it.title[0] : (it.title || "Untitled");
      const authors = (it.author || [])
        .map(a => [a.given, a.family].filter(Boolean).join(" "))
        .filter(Boolean);
      const editors = (it.editor || [])
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
        type: it.type || "article",
        // v.17 enrichment
        editors,
        subjects: Array.isArray(it.subject) ? it.subject : [],
        language: it.language || "",
        // Sprint 3 — citation count feeds the capability-gated citedBy tiebreak.
        citedBy: typeof it["is-referenced-by-count"] === "number" ? it["is-referenced-by-count"] : null,
      };
    });
    // authorSearch off → enforce content-scope: drop matches that hit on author name
    // alone (query.bibliographic is author-inclusive). hasMore tracks the raw fetched
    // window so pagination still advances even when a page is heavily filtered.
    const results = settings.authorSearch ? mapped : mapped.filter(r => hasContentMatch(r, words));
    return { results, hasMore: offset + items.length < (data.message?.["total-results"] || 0) };
  }
};
