import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

export const NCBI_ADAPTER = {
  id: "NCBI", name: "NCBI Entrez",
  tagline: "Biomedical & life sciences · PubMed via E-utilities",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["scholarly-index", "research-repository"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-cyan-900", text: "text-cyan-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const r1 = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retstart=${offset}&retmax=${pageSize}`);
    if (!r1.ok) throw new Error(`NCBI esearch ${r1.status}`);
    const searchData = await r1.json();
    const ids = searchData.esearchresult?.idlist || [];
    const total = parseInt(searchData.esearchresult?.count || "0", 10);
    if (ids.length === 0) return { results: [], hasMore: false };
    const r2 = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`);
    if (!r2.ok) throw new Error(`NCBI esummary ${r2.status}`);
    const summaryData = await r2.json();
    const summaries = summaryData.result || {};
    const results = ids.map(id => {
      const it = summaries[id];
      if (!it) return null;
      const doi = (it.elocationid || "").replace(/^doi:\s*/i, "") || (it.articleids || []).find(a => a.idtype === "doi")?.value || "";
      return {
        id: `ncbi-${id}`, source: "NCBI",
        title: it.title || "Untitled",
        authors: (it.authors || []).map(a => a.name).filter(Boolean),
        year: String(it.pubdate || "").match(/\d{4}/)?.[0] || "",
        journal: it.fulljournalname || it.source || "", publisher: "",
        volume: it.volume || "", issue: it.issue || "", pages: it.pages || "",
        doi, url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        abstract: "", isOA: false, type: "article",
        keywords: (it.meshheadinglist || []).map(m => m.name).filter(Boolean)
      };
    }).filter(Boolean);
    return { results, hasMore: offset + results.length < total };
  }
};
