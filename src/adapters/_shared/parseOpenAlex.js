import { reconstructAbstract } from "../../lib/helpers.js";

/**
 * OA_SELECT — top-level OpenAlex fields parseOpenAlexWork reads, for the `select=`
 * query param. SSOT: keep in sync with the field accesses below so the API payload
 * carries exactly what we parse and nothing more.
 * NOTE: OpenAlex select addresses only top-level fields (not nested subfields), and
 * the deprecated `host_venue` is intentionally omitted — selecting it returns a 400.
 */
export const OA_SELECT = [
  "id", "title", "display_name", "authorships", "publication_year",
  "primary_location", "biblio", "doi", "open_access", "abstract_inverted_index",
  "type", "keywords", "topics", "mesh", "cited_by_count", "language",
  // v.35 — full-corpus relevance score (D3). Returned per work when sorting by
  // relevance_score:desc; a valid select field (verified live), so it survives the trim.
  "relevance_score",
].join(",");

/**
 * parseOpenAlexWork — shared by OPENALEX_ADAPTER and CURATED_JOURNALS_ADAPTER.
 * Normalises a raw OpenAlex work object into a UnifiedResult.
 * @param {Object} w      raw OpenAlex work
 * @param {string} idx    stable id suffix
 * @param {number} [rank] 0-based native relevance position (v.35). Upstream is sorted by
 *                        relevance_score:desc, so array position IS the relevance rank.
 */
export const parseOpenAlexWork = (w, idx, rank = null) => {
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
    type: w.type || "article",
    // v.17 enrichment + R7: topics[] gives curated 4-level hierarchy (domain→field→subfield→topic)
    keywords: (() => {
      const s = new Set();
      for (const k of (w.keywords || [])) {
        const v = typeof k === "object" ? (k.display_name || "") : String(k);
        if (v) s.add(v);
      }
      for (const t of (w.topics || [])) {
        if (t.display_name)        s.add(t.display_name);
        if (t.field?.display_name) s.add(t.field.display_name);
      }
      // v.27 Phase C — MeSH descriptors enrich biomedical keyword coverage
      // (controlled-vocabulary subject terms assigned by NLM indexers).
      for (const m of (w.mesh || [])) {
        if (m.descriptor_name) s.add(m.descriptor_name);
      }
      return [...s];
    })(),
    citedBy: typeof w.cited_by_count === "number" ? w.cited_by_count : null,
    language: w.language || "",
    // v.35 — native relevance (D3): OpenAlex's full-corpus relevance_score + position prior.
    nativeScore: typeof w.relevance_score === "number" ? w.relevance_score : null,
    nativeRank: rank,
  };
};
