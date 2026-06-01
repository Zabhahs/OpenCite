// Reciprocal Rank Fusion — merges ranked lists by position, not score.
// WeightedRRF(d) = Σ w_r / (k + rank_r(d))
//
// RRF is SCALE-FREE: it consumes ranks, not raw scores, so a degenerate 20-doc BM25F
// IDF can't override a full-corpus relevance engine, and cross-query magnitude artifacts
// (v0.35 D4 — "1.79 vs 16.17") cannot exist. The same primitive fuses up to three
// weighted inputs: native upstream relevance, local BM25F (lexical), and semantic.

// Core: fused RRF value per result index, WITHOUT mutating the results.
// rankLists: [{ ranks: Map<index, rank>, weight }]. Returns a Float array aligned to index.
export function rrfScores(count, rankLists, k = 60) {
  const out = new Array(count).fill(0);
  for (const { ranks, weight } of rankLists) {
    for (const [idx, rank] of ranks) {
      if (idx >= 0 && idx < count && rank != null) out[idx] += weight / (k + rank);
    }
  }
  return out;
}

// Convenience wrapper (UI contract): returns results with _score set to the fused value.
// Built on rrfScores so there's a single fusion implementation (DRY).
export function fuseRanks(results, rankLists, k = 60) {
  const s = rrfScores(results.length, rankLists, k);
  return results.map((r, idx) => ({ ...r, _score: s[idx] }));
}

// Build the per-source NATIVE-relevance rank map for RRF (v0.35 D3).
// Each result whose source declares capability.rankFields.nativeRelevance "score"|"rank"
// is ranked by its position in its OWN source's native order (the `nativeRank` the adapter
// stamped — the full-corpus signal we used to discard). Positions are densified PER SOURCE
// so every source's best hit ties at rank 0 (its #1 is as good as any other source's #1);
// this is what makes the heterogeneous native scores comparable. Sources with no native
// signal ("none"/absent, or a missing nativeRank) are omitted — they fuse on lexical/
// semantic only (a documented, accepted weak-signal gap).
// @param {Object[]} results
// @param {(r: Object) => (import("../adapters/_shared/base.js").AdapterCapability|undefined)} getCapability
// @returns {Map<number, number>} resultIndex → dense 0-based native rank
export function buildNativeRanks(results, getCapability) {
  const bySource = new Map();
  results.forEach((r, i) => {
    const nr = getCapability(r)?.rankFields?.nativeRelevance;
    if (nr !== "score" && nr !== "rank") return;
    if (!Number.isFinite(r.nativeRank)) return;
    const key = r.source || "_";
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(i);
  });
  const out = new Map();
  for (const idxs of bySource.values()) {
    idxs.sort((a, b) => results[a].nativeRank - results[b].nativeRank);
    idxs.forEach((idx, dense) => out.set(idx, dense));
  }
  return out;
}

// Pool-size-aware native weight (v0.35 §5.3). The local BM25F IDF is degenerate on a
// micro-pool (measured 14–45 docs), so the smaller the pooled candidate set, the more we
// trust the upstream full-corpus native ordering. Returns the native share ∈ [0,1]; the
// caller assigns the remainder to lexical (+ semantic, in the UI's 3-way split).
export function nativeWeight(poolSize) {
  if (poolSize < 20) return 0.7;
  if (poolSize < 50) return 0.6;
  return 0.5;
}
