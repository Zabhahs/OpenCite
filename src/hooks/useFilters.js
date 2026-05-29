import { useMemo } from "react";
import { normalizeLanguage } from "../lib/langNormalize.js";

// SSOT for C2 client-side filtering and sorting.
// Pure derivation from sectionStates — no mutations to search state.
// sortBy: "default" | "citations" | "year" | "relevance"
// language: ISO 639-1 code (or raw code for ancient/constructed languages)
// keyword: lowercase string matched against keywords[] and subjects[]
// oaOnly: boolean — keep only results where isOA === true

export function useFilters(sectionStates, filterState = {}) {
  const { type, language, yearMin, yearMax, sortBy = "default", keyword, oaOnly } = filterState;

  return useMemo(() => {
    // Global low-confidence gate. Loose-match fallbacks are an adapter's "best
    // guesses" emitted when it found nothing genuinely relevant (every result
    // scored 0). Those guesses should only surface when NOTHING anywhere is a
    // genuine match — otherwise a niche/heritage query like "Memons of Kutch"
    // gets polluted by every all-field heritage adapter's tangential junk.
    // If even one adapter produced a genuine hit (a result not flagged
    // _lowConfidence), drop every adapter's loose matches across the board.
    const anyGenuine = Object.values(sectionStates).some(
      s => (s.results || []).some(r => !r._lowConfidence)
    );

    const out = {};
    for (const [id, section] of Object.entries(sectionStates)) {
      if (!section.results) { out[id] = section; continue; }

      let results = section.results;

      if (anyGenuine) results = results.filter(r => !r._lowConfidence);

      if (type)     results = results.filter(r => (r._type || r.type) === type);
      if (language) results = results.filter(r => normalizeLanguage(r.language)?.code === language);
      if (yearMin)  results = results.filter(r => parseInt(r.year, 10) >= yearMin);
      if (yearMax)  results = results.filter(r => parseInt(r.year, 10) <= yearMax);
      if (keyword) {
        const kl = String(keyword).toLowerCase();
        results = results.filter(r =>
          (r.keywords || []).some(k => String(k).toLowerCase() === kl) ||
          (r.subjects || []).some(s => String(s).toLowerCase() === kl)
        );
      }
      if (oaOnly)   results = results.filter(r => r.isOA === true);

      if (sortBy === "citations") {
        results = [...results].sort((a, b) => (b.citedBy ?? -1) - (a.citedBy ?? -1));
      } else if (sortBy === "year") {
        results = [...results].sort((a, b) => parseInt(b.year, 10) - parseInt(a.year, 10));
      } else if (sortBy === "relevance") {
        results = [...results].sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
      }

      out[id] = { ...section, results };
    }
    return out;
  }, [sectionStates, type, language, yearMin, yearMax, sortBy, keyword, oaOnly]);
}
