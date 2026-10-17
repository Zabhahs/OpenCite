import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { parseCrossrefItem } from "../_shared/parseCrossref.js";
// v0.44 T5: hasContentMatch moved out of lib/scoring.js (engine quarantined) into the
// adapter layer — the author-search-off content filter is retrieval, not ranking.
import { hasContentMatch } from "../_shared/contentMatch.js";
import { fetchWithTimeout } from "../_shared/proxy.js";

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
    const pageSize = opts.pageSize || (offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE); // v0.46: API threads pageSize
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
    const r = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Crossref ${r.status}`);
    const data = await r.json();
    const items = data.message?.items || [];
    // v0.48: mapping extracted to _shared/parseCrossref.js (shared with the verification path).
    const mapped = items.map((it, i) => parseCrossrefItem(it, `${offset}-${i}`));
    // authorSearch off → enforce content-scope: drop matches that hit on author name
    // alone (query.bibliographic is author-inclusive). hasMore tracks the raw fetched
    // window so pagination still advances even when a page is heavily filtered.
    const results = settings.authorSearch ? mapped : mapped.filter(r => hasContentMatch(r, words));
    return { results, hasMore: offset + items.length < (data.message?.["total-results"] || 0) };
  }
};
