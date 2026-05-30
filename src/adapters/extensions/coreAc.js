import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { proxiedFetch } from "../_shared/proxy.js";

// CORE API v3 (core.ac.uk). Aggregates 300M+ open-access records from 10,000+
// repositories worldwide. South Asia coverage includes 300+ Indian institutional
// feeds: Shodhganga partner repos, IAS journal portals, IIT/IISc/Delhi/Jadavpur
// repositories — making it the best single endpoint for Indian OA humanities content.
//
// Key required — free at https://core.ac.uk/services/api (instant; 10 req/10 s free tier).
// Key passed as ?api_key= query param (Authorization: Bearer not forwarded by proxy).
// Pagination: offset/limit. totalHits returned.
// Docs: https://api.core.ac.uk/docs/v3
export const CORE_ADAPTER = {
  id: "CORE", name: "CORE",
  tagline: "300M+ open-access records · aggregates 300+ Indian repositories & South Asian journals",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global", "south-asia"],
  archiveType: ["aggregator", "research-repository"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-emerald-700", text: "text-emerald-50" },
  needsKey: true, keyName: "coreKey", keyLabel: "CORE API key",
  keyHelp: "Free + instant at core.ac.uk/services/api. Gives 10 req/10 s.",
  capability: {
    protocol: "rest-json", fulltext: false, pagination: "offset",
    totalCount: true, maxWindow: null, auth: "key",
    rankFields: { abstract: "full", subjects: "full", citedBy: false },
  },
  search: async (query, settings, opts = {}) => {
    if (!settings.coreKey) throw new Error("CORE needs a free API key. Add yours in settings (⚙).");
    const offset = opts.offset || 0;
    const limit = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const url =
      `https://api.core.ac.uk/v3/search/works` +
      `?q=${encodeURIComponent(query)}` +
      `&limit=${limit}` +
      `&offset=${offset}` +
      `&api_key=${encodeURIComponent(settings.coreKey)}`;
    const r = await proxiedFetch(url, { headers: { Accept: "application/json" } }, { adapterId: "CORE" });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new Error("CORE API key invalid or unauthorized.");
      throw new Error(`CORE ${r.status}`);
    }
    const data = await r.json();
    const total = data.totalHits ?? 0;
    const results = (data.results || []).map((item, i) => {
      // DOI: strip URL prefix if upstream returns https://doi.org/10.xxx/…
      const doi = (item.doi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//, "").trim();
      const authors = (item.authors || []).map((a) => a.name || "").filter(Boolean);
      // topics[] = author-assigned tags; subjects[] = controlled vocabulary strings
      const keywords = (item.topics || []).map((t) => t.name || "").filter(Boolean);
      const subjects = Array.isArray(item.subjects) ? item.subjects.filter(Boolean) : [];
      const journal = item.journals?.[0]?.title || "";
      // URL priority: DOI canonical → downloadUrl → fullTextIdentifier → first link
      const fallbackUrl =
        item.downloadUrl ||
        item.fullTextIdentifier ||
        item.links?.find((l) => l.url)?.url ||
        "";
      return {
        id: `core-${item.id || `${offset}-${i}`}`,
        source: "CORE",
        title: item.title || "Untitled",
        authors,
        year: String(item.year || "").match(/\d{4}/)?.[0] || "",
        journal,
        publisher: item.publisher || "",
        volume: "", issue: "", pages: "",
        doi,
        url: doi ? `https://doi.org/${doi}` : fallbackUrl,
        abstract: stripHtml(item.abstract || ""),
        isOA: true,
        type: "article",
        keywords,
        subjects,
        language: item.language?.code || "",
      };
    });
    return { results, hasMore: offset + results.length < total };
  },
};
