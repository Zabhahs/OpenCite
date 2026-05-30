import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { proxiedFetch } from "../_shared/proxy.js";

function parseRIS(text) {
  const out = { title: "", authors: [], year: "", abstract: "", keywords: [], doi: "", url: "" };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9])\s+-\s+(.+)$/);
    if (!m) continue;
    const [, tag, val] = m;
    if (tag === "T1") out.title = val.trim();
    else if (tag === "AU") out.authors.push(val.trim());
    else if (tag === "PY") out.year = val.slice(0, 4);
    else if (tag === "N2") out.abstract = val.trim();
    else if (tag === "KW") out.keywords.push(val.trim());
    else if (tag === "DO") out.doi = val.trim();
    else if (tag === "UR") out.url = val.trim();
  }
  return out;
}

async function fetchRIS(numericId) {
  try {
    const r = await proxiedFetch(
      `https://doi.pangaea.de/10.1594/PANGAEA.${numericId}?format=citation_ris`,
      {},
      { adapterId: "PANGAEA" }
    );
    if (!r.ok) return null;
    return parseRIS(await r.text());
  } catch {
    return null;
  }
}

export const PANGAEA_ADAPTER = {
  id: "PANGAEA", name: "PANGAEA",
  tagline: "Earth & environment data · archaeogenetic metadata",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["genomic-database", "archaeological-database", "research-repository"],
  contentType: ["genomic-data", "structured-data", "primary-source"],
  color: { bg: "bg-teal-900", text: "text-teal-50" }, needsKey: false,
  capability: {
    // Server-proxied raw Elasticsearch _search + per-hit RIS detail fetch. abstract/keywords from RIS (often absent).
    protocol: "elasticsearch", fulltext: false, pagination: "offset", totalCount: true, maxWindow: 10000, auth: "none",
    rankFields: { abstract: "sparse", subjects: "sparse", citedBy: false },
    serverSafe: true,
    corpusSize: 400000, // ~400K datasets; pangaea.de
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const safeQuery = query.replace(/\//g, '\\/');
    const body = {
      query: { query_string: { query: safeQuery } }, size: pageSize, from: offset,
      _source: ["agg-author", "agg-pubYear", "URI", "agg-datasetname", "title"]
    };
    const r = await proxiedFetch(
      "https://ws.pangaea.de/es/pangaea/panmd/_search",
      { method: "POST", body: JSON.stringify(body) },
      { adapterId: "PANGAEA" }
    );
    if (!r.ok) throw new Error(`PANGAEA ${r.status}`);
    const data = await r.json();
    const hits = data.hits?.hits || [];
    const total = data.hits?.total?.value ?? data.hits?.total ?? hits.length;

    const rawResults = await Promise.all(hits.map(async (h, i) => {
      const s = h._source || {};
      const numericId = h._id || "";
      const uri = s.URI || "";
      const fallbackDoi = uri.match(/10\.\d+\/[^\s]+$/)?.[0] || "";
      const fallbackUrl = uri.startsWith("http") ? uri : (fallbackDoi ? `https://doi.org/${fallbackDoi}` : "");
      const fallbackAuthors = s["agg-author"]
        ? (Array.isArray(s["agg-author"]) ? s["agg-author"] : [s["agg-author"]]).filter(Boolean)
        : [];

      const ris = numericId ? await fetchRIS(numericId) : null;

      const doi = ris?.doi || fallbackDoi;
      const title = ris?.title || s["agg-datasetname"] || s["title"] || "";
      if (!doi || !title) return null;

      return {
        id: `pangaea-${numericId || `${offset}-${i}`}`,
        source: "PANGAEA",
        title,
        authors: ris?.authors?.length ? ris.authors : fallbackAuthors,
        year: ris?.year || (s["agg-pubYear"] ? String(s["agg-pubYear"]) : ""),
        journal: "", publisher: "PANGAEA",
        volume: "", issue: "", pages: "",
        doi,
        url: ris?.url || fallbackUrl,
        abstract: ris?.abstract || "Data hosted by the PANGAEA repository.",
        keywords: ris?.keywords || [],
        isOA: true, type: "genomic-data"
      };
    }));

    const results = rawResults.filter(Boolean);
    return { results, hasMore: offset + results.length < total };
  }
};
