// Reciprocal Rank Fusion — merges ranked lists by position, not score.
// WeightedRRF(d) = Σ w_r / (k + rank_r(d))

export function fuseRanks(results, rankLists, k = 60) {
  return results.map((r, idx) => {
    let score = 0;
    for (const { ranks, weight } of rankLists) {
      const rank = ranks.get(idx);
      if (rank != null) score += weight / (k + rank);
    }
    return { ...r, _score: score };
  });
}
