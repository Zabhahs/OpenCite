// Pure relevance scorer — SSOT for C4 + useFilters sort-by-relevance.
// No other file scores results.
export function scoreResult(result, terms) {
  const citedByScore = Math.min((result.citedBy || 0) / 500, 10);
  const corpus = [result.title, result.abstract, ...(result.keywords || [])].join(" ").toLowerCase();
  const overlap = terms.reduce((n, t) => n + (corpus.includes(t.toLowerCase()) ? 1 : 0), 0);
  return citedByScore + overlap;
}
