import { reconstructAbstract } from "../../lib/helpers.js";

/**
 * parseOpenAlexWork — shared by OPENALEX_ADAPTER and CURATED_JOURNALS_ADAPTER.
 * Normalises a raw OpenAlex work object into a UnifiedResult.
 */
export const parseOpenAlexWork = (w, idx) => {
  const oaUrl = w.open_access?.oa_url || w.primary_location?.landing_page_url || "";
  const doi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//, "") : "";
  return {
    id: `oa-${w.id?.split("/").pop() || idx}`,
    source: "OPENALEX",
    title: w.title || w.display_name || "Untitled",
    authors: (w.authorships || []).map(a => a.author?.display_name).filter(Boolean),
    year: w.publication_year ? String(w.publication_year) : "",
    journal: w.primary_location?.source?.display_name || w.host_venue?.display_name || "",
    publisher: w.primary_location?.source?.host_organization_name || "",
    volume: w.biblio?.volume || "",
    issue: w.biblio?.issue || "",
    pages: w.biblio?.first_page && w.biblio?.last_page
      ? `${w.biblio.first_page}-${w.biblio.last_page}`
      : (w.biblio?.first_page || ""),
    doi,
    url: oaUrl || (doi ? `https://doi.org/${doi}` : ""),
    abstract: reconstructAbstract(w.abstract_inverted_index),
    isOA: !!w.open_access?.is_oa,
    type: w.type || "article"
  };
};
