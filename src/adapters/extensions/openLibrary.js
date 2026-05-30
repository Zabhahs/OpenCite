import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { proxiedFetch } from "../_shared/proxy.js";

// Open Library (Internet Archive) search.json — book-metadata discovery layer for the
// humanities monograph long tail. No abstract in the search index, but the `subject`
// facet is RICH (verified: a Kant query returns ~40 controlled subjects), so this is a
// subject-driven source, not a thin one. `numFound` gives a real total → offset paging.
// isOA reflects digital availability: a non-empty `ia` array means a scanned copy exists
// on the Internet Archive (public-domain or lendable) — the most defensible openness
// signal the payload offers; it is not a guarantee of public domain.
const FIELDS = "title,author_name,first_publish_year,subject,key,language,ia,edition_count,publisher";

export const OPEN_LIBRARY_ADAPTER = {
  id: "OPEN_LIBRARY", name: "Open Library",
  tagline: "Open Library · book & edition metadata for humanities monograph discovery",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"],
  archiveType: ["library", "aggregator"],
  contentType: ["textual"],
  color: { bg: "bg-teal-800", text: "text-teal-50" }, needsKey: false,
  capability: {
    // search.json: free-text `q`, offset/limit paging, real `numFound` total. No abstract
    // field; subjects carry the topical signal (BM25F ×2 + semantic keyword tail).
    protocol: "rest-json", fulltext: false, pagination: "offset", totalCount: true, maxWindow: null, auth: "none",
    rankFields: { abstract: "none", subjects: "full", citedBy: false },
    serverSafe: true,
    corpusSize: 40000000, // ~40M editions; openlibrary.org
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${pageSize}&offset=${offset}&fields=${FIELDS}`;
    const r = await proxiedFetch(url, { headers: { Accept: "application/json" } }, { adapterId: "OPEN_LIBRARY" });
    if (!r.ok) throw new Error(`Open Library ${r.status}`);
    const data = await r.json();
    const docs = Array.isArray(data.docs) ? data.docs : [];
    const total = data.numFound ?? docs.length;
    const results = docs.map((d, i) => {
      const workId = (d.key || "").split("/").pop();
      const hasScan = Array.isArray(d.ia) && d.ia.length > 0;
      return {
        id: `openlibrary-${workId || `${offset}-${i}`}`,
        source: "OPEN_LIBRARY",
        title: d.title || "Untitled",
        authors: Array.isArray(d.author_name) ? d.author_name.filter(Boolean) : [],
        year: d.first_publish_year ? String(d.first_publish_year) : "",
        journal: "",
        publisher: Array.isArray(d.publisher) ? (d.publisher[0] || "") : "",
        volume: "", issue: "", pages: "", doi: "",
        url: d.key ? `https://openlibrary.org${d.key}` : "",
        abstract: "",
        isOA: hasScan,
        type: "book",
        subjects: Array.isArray(d.subject) ? d.subject.filter(Boolean).slice(0, 8) : [],
        language: Array.isArray(d.language) ? (d.language[0] || "") : "",
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
