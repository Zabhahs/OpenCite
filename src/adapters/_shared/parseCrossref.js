import { stripHtml } from "../../lib/helpers.js";

/**
 * parseCrossrefItem — shared by CROSSREF_ADAPTER (search) and the server-side evidence /
 * verification path (api/_shared/verify.js looks works up by DOI and by bibliographic query).
 * Normalises a raw Crossref `message.items[]` entry into a UnifiedResult. Extracted verbatim
 * from the adapter in v0.48 so both consumers render the same card (SSOT).
 *
 * `idx` only seeds the fallback id for DOI-less items.
 */
export const parseCrossrefItem = (it, idx = 0) => {
  const doi = it.DOI || "";
  const title = Array.isArray(it.title) ? it.title[0] : (it.title || "Untitled");
  const authors = (it.author || [])
    .map(a => [a.given, a.family].filter(Boolean).join(" "))
    .filter(Boolean);
  const editors = (it.editor || [])
    .map(a => [a.given, a.family].filter(Boolean).join(" "))
    .filter(Boolean);
  const dateParts = it.issued?.["date-parts"]?.[0] || it.published?.["date-parts"]?.[0] || [];
  const year = dateParts[0] ? String(dateParts[0]) : "";
  const journal = Array.isArray(it["container-title"]) ? it["container-title"][0] : (it["container-title"] || "");
  return {
    id: `cr-${doi || idx}`,
    source: "CROSSREF",
    title: stripHtml(title),
    authors, year, journal,
    publisher: it.publisher || "",
    volume: it.volume || "",
    issue: it.issue || "",
    pages: it.page || "",
    doi,
    url: it.URL || (doi ? `https://doi.org/${doi}` : ""),
    abstract: stripHtml(it.abstract || ""),
    isOA: false,
    type: it.type || "article",
    // v.17 enrichment
    editors,
    subjects: Array.isArray(it.subject) ? it.subject : [],
    language: it.language || "",
    // Sprint 3 — citation count feeds the capability-gated citedBy tiebreak.
    citedBy: typeof it["is-referenced-by-count"] === "number" ? it["is-referenced-by-count"] : null,
  };
};
