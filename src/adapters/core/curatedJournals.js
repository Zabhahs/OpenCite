import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { parseOpenAlexWork } from "../_shared/parseOpenAlex.js";

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
  search: async (query, settings, opts = {}) => {
    const journals = settings.curatedJournals || [];
    const issns = journals.map(j => j.issn).filter(Boolean);
    if (issns.length === 0) throw new Error("No curated journals configured. Add some in settings (⚙).");
    const offset = opts.offset || 0;
    const pageSize = 5;
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
    const url = `https://api.openalex.org/works?filter=${filter}&sort=relevance_score:desc&per_page=${pageSize}&page=${page}${auth}`;
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
