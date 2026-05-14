import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";

export const ENA_ADAPTER = {
  id: "ENA", name: "ENA",
  tagline: "European Nucleotide Archive · ancient DNA, genomic studies",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["genomic-database"], contentType: ["genomic-data"],
  color: { bg: "bg-cyan-800", text: "text-cyan-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const fields = "study_accession,study_title,study_description,first_public,center_name,study_alias";
    const enaQuery = `study_title="*${query}*" OR study_description="*${query}*"`;
    const url = `https://www.ebi.ac.uk/ena/portal/api/search?result=study&query=${encodeURIComponent(enaQuery)}&fields=${fields}&format=json&limit=${pageSize}&offset=${offset}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      if (r.status === 400) throw new Error("ENA: query syntax rejected. Try simpler terms.");
      throw new Error(`ENA ${r.status}`);
    }
    const data = await r.json();
    const items = Array.isArray(data) ? data : [];
    const results = items.map((it, i) => ({
      id: `ena-${it.study_accession || `${offset}-${i}`}`, source: "ENA",
      title: it.study_title || it.study_alias || "Untitled study",
      authors: it.center_name ? [it.center_name] : [],
      year: String(it.first_public || "").slice(0, 4),
      journal: it.study_accession || "", publisher: "European Nucleotide Archive",
      volume: "", issue: "", pages: "", doi: "",
      url: it.study_accession ? `https://www.ebi.ac.uk/ena/browser/view/${it.study_accession}` : "",
      abstract: stripHtml(it.study_description || ""), isOA: true, type: "genomic-data"
    }));
    return { results, hasMore: items.length === pageSize };
  }
};
