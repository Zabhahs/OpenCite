import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { parseOpenAlexWork, OA_SELECT } from "../_shared/parseOpenAlex.js";

export const OPENALEX_ADAPTER = {
  id: "OPENALEX",
  name: "OpenAlex",
  tagline: "250M+ scholarly works · OA-filtered",
  category: ADAPTER_CATEGORY.CORE,
  region: ["global"],
  archiveType: ["scholarly-index", "aggregator"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-stone-800", text: "text-stone-50" },
  needsKey: false,
  keyName: "openAlexKey",
  keyLabel: "OpenAlex API key (optional)",
  keyHelp: "Optional. Works without a key via the polite pool (rate-limited). For higher quotas, get a free key at openalex.org/settings/api — 30-second signup.",
  capability: {
    protocol: "rest-json", fulltext: false, pagination: "page", totalCount: true, maxWindow: 10000, auth: "polite",
    rankFields: { abstract: "full", subjects: "full", citedBy: true },
    serverSafe: true,
    corpusSize: 250000000, // ~250M works, openalex.org
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    let auth = "";
    if (settings.openAlexKey) auth = `&api_key=${encodeURIComponent(settings.openAlexKey)}`;
    else if (settings.crossrefEmail) auth = `&mailto=${encodeURIComponent(settings.crossrefEmail)}`;
    // Phase A — field-scoped retrieval. Default scopes to title+abstract so author/affiliation
    // matches never enter the candidate set (the "memon returns author papers" problem).
    // title_and_abstract.search applies Kstem stemming + stopword removal server-side.
    // authorSearch toggle reverts to default.search (all fields, incl. authorships).
    const field = settings.authorSearch ? "default.search" : "title_and_abstract.search";
    // Commas separate filters in OpenAlex; strip them from the query value so a comma in the
    // query can't be misread as a filter delimiter after URL-decoding.
    const safeQuery = query.replace(/,/g, " ").trim();
    const filter = `is_oa:true,${field}:${encodeURIComponent(safeQuery)}`;
    // Relevance ordering is implicit with the legacy ?search= param but must be requested
    // explicitly when the query lives in a .search filter, else results sort by id.
    // v.27 Phase C — select= trims the payload to fields parseOpenAlexWork actually reads.
    // Top-level fields only (OpenAlex select can't address nested subfields). host_venue is
    // deprecated/removed — including it would 400 the request, so it's intentionally absent.
    const url = `https://api.openalex.org/works?filter=${filter}&sort=relevance_score:desc&per_page=${pageSize}&page=${page}&select=${OA_SELECT}${auth}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new Error("OpenAlex rejected the request. Verify your key in settings or remove it.");
      if (r.status === 429) throw new Error("OpenAlex rate limit hit. Adding a free API key in settings raises your quota.");
      throw new Error(`OpenAlex ${r.status}`);
    }
    const data = await r.json();
    const results = (data.results || []).map((w, i) => parseOpenAlexWork(w, `${offset}-${i}`));
    return { results, hasMore: offset + results.length < (data.meta?.count || 0) };
  }
};
