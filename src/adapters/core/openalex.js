import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { parseOpenAlexWork } from "../_shared/parseOpenAlex.js";

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
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    let auth = "";
    if (settings.openAlexKey) auth = `&api_key=${encodeURIComponent(settings.openAlexKey)}`;
    else if (settings.crossrefEmail) auth = `&mailto=${encodeURIComponent(settings.crossrefEmail)}`;
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=is_oa:true&per_page=${pageSize}&page=${page}${auth}`;
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
