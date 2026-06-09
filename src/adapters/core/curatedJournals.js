import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { parseOpenAlexWork, OA_SELECT } from "../_shared/parseOpenAlex.js";

export const CURATED_JOURNALS_ADAPTER = {
  id: "CURATED",
  name: "Curated Journals",
  tagline: "Your hand-picked trusted sources · powered by OpenAlex",
  category: ADAPTER_CATEGORY.CORE,
  region: ["global"],
  archiveType: ["scholarly-index"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-amber-700", text: "text-amber-50" },
  needsKey: false,
  capability: {
    protocol: "rest-json", fulltext: false, pagination: "page", totalCount: true, maxWindow: 10000, auth: "polite",
    rankFields: { abstract: "full", subjects: "full", citedBy: true },
    serverSafe: true,
    corpusSize: 10000, // ~10K; subset of OpenAlex filtered to a user ISSN list (conservative)
  },
  search: async (query, settings, opts = {}) => {
    const journals = settings.curatedJournals || [];
    const issns = journals.map(j => j.issn).filter(Boolean);
    if (issns.length === 0) throw new Error("No curated journals configured. Add some in settings (⚙).");
    const offset = opts.offset || 0;
    // v0.38 (T10, F-103): use the shared page-size constants instead of a hardcoded 5.
    // The hardcoded value made Math.floor(offset/pageSize)+1 compute the wrong OpenAlex
    // page on load-more (offset is advanced by INITIAL/LOAD_MORE_PAGE_SIZE), skipping a page.
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const issnFilter = issns.join("|");
    let auth = "";
    if (settings.openAlexKey) auth = `&api_key=${encodeURIComponent(settings.openAlexKey)}`;
    else if (settings.crossrefEmail) auth = `&mailto=${encodeURIComponent(settings.crossrefEmail)}`;
    // Phase A — field-scoped retrieval, mirroring the OpenAlex core adapter so curated-journal
    // results rank on title/abstract content rather than author/affiliation matches.
    const field = settings.authorSearch ? "default.search" : "title_and_abstract.search";
    const safeQuery = query.replace(/,/g, " ").trim();
    const filter = `primary_location.source.issn:${issnFilter},${field}:${encodeURIComponent(safeQuery)}`;
    // v.27 Phase C — select= trims payload to the fields parseOpenAlexWork reads (SSOT in parseOpenAlex.js).
    const url = `https://api.openalex.org/works?filter=${filter}&sort=relevance_score:desc&per_page=${pageSize}&page=${page}&select=${OA_SELECT}${auth}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new Error("OpenAlex rejected the request. Verify your key in settings or remove it.");
      if (r.status === 429) throw new Error("OpenAlex rate limit hit. Adding a free API key raises your quota.");
      throw new Error(`OpenAlex ${r.status}`);
    }
    const data = await r.json();
    const results = (data.results || [])
      .map((w, i) => parseOpenAlexWork(w, `${offset}-${i}`))
      .map(item => ({ ...item, source: "CURATED" }));
    return { results, hasMore: offset + results.length < (data.meta?.count || 0) };
  }
};
