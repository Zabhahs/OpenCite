import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

export const SEMANTIC_SCHOLAR_ADAPTER = {
  id: "S2",
  name: "Semantic Scholar",
  tagline: "AI-curated · cross-disciplinary · requires free API key",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"],
  archiveType: ["scholarly-index"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-orange-800", text: "text-orange-50" },
  needsKey: true,
  keyName: "s2Key",
  keyLabel: "Semantic Scholar API key",
  keyHelp: "Free but requires approval (can take days). Request at semanticscholar.org/product/api.",
  search: async (query, settings, opts = {}) => {
    if (!settings.s2Key) throw new Error("Semantic Scholar requires an API key. Add yours in settings (⚙) — it's free but takes a few days for approval.");
    const offset = opts.offset || 0;
    const limit = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const fields = "title,authors,year,venue,abstract,openAccessPdf,externalIds,journal";
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}&fields=${fields}`;
    const r = await fetch(url, { headers: { Accept: "application/json", "x-api-key": settings.s2Key } });
    if (!r.ok) {
      if (r.status === 429) throw new Error("Semantic Scholar rate-limited even with key. Try again in a moment.");
      if (r.status === 403) throw new Error("Semantic Scholar API key invalid or unauthorized. Verify in settings.");
      throw new Error(`Semantic Scholar ${r.status}`);
    }
    const data = await r.json();
    const results = (data.data || []).map((p, i) => {
      const doi = p.externalIds?.DOI || "";
      const oaUrl = p.openAccessPdf?.url || "";
      return {
        id: `s2-${p.paperId || `${offset}-${i}`}`,
        source: "S2",
        title: p.title || "Untitled",
        authors: (p.authors || []).map(a => a.name).filter(Boolean),
        year: p.year ? String(p.year) : "",
        journal: p.journal?.name || p.venue || "",
        publisher: "",
        volume: p.journal?.volume || "",
        issue: "",
        pages: p.journal?.pages || "",
        doi,
        url: oaUrl || (doi ? `https://doi.org/${doi}` : (p.paperId ? `https://www.semanticscholar.org/paper/${p.paperId}` : "")),
        abstract: p.abstract || "",
        isOA: !!oaUrl,
        type: "article"
      };
    });
    return { results, hasMore: offset + results.length < (data.total || 0) };
  }
};
