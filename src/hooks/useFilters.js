import { useMemo } from "react";

// SSOT for C2 client-side filtering and sorting.
// Pure derivation from sectionStates — no mutations to search state.
// sortBy: "default" | "citations" | "year" | "relevance"

export function useFilters(sectionStates, filterState = {}) {
  const { type, language, yearMin, yearMax, sortBy = "default" } = filterState;

  return useMemo(() => {
    const out = {};
    for (const [id, section] of Object.entries(sectionStates)) {
      if (!section.results) { out[id] = section; continue; }

      let results = section.results;

      if (type)     results = results.filter(r => (r._type || r.type) === type);
      if (language) results = results.filter(r => r.language === language);
      if (yearMin)  results = results.filter(r => parseInt(r.year, 10) >= yearMin);
      if (yearMax)  results = results.filter(r => parseInt(r.year, 10) <= yearMax);

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
  }, [sectionStates, type, language, yearMin, yearMax, sortBy]);
}
