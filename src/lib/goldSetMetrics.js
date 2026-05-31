/**
 * OpenCITE — F2 Gold-Set Metrics Engine
 *
 * Computes ranking quality metrics (nDCG@10, MRR, recall@N) from a set of
 * results and relevance labels. Used by the regression harness to detect
 * scoring changes and measure baseline performance.
 *
 * Relevance grades: 0=irrelevant, 1=marginal, 2=relevant, 3=perfect.
 * Only grades >= 2 are counted as "relevant" for recall/MRR.
 */

/**
 * Normalized Discounted Cumulative Gain at rank 10.
 * Measures ranking quality: how high do relevant docs appear?
 *
 * DCG = sum(gain / log2(rank+1)) where gain = 2^(grade) - 1
 * Then normalize by the ideal DCG if all relevant docs were at top.
 *
 * @param {Array} results — search results in ranked order
 * @param {Object} labels — { doi: grade, ... } mapping
 * @param {number} cutoff — rank cutoff (default 10)
 * @returns {number} nDCG@cutoff (0–1)
 */
export function nDCG(results, labels, cutoff = 10) {
  if (!results.length || !labels || Object.keys(labels).length === 0) {
    return 0;
  }

  // Compute DCG for the given ranking
  let dcg = 0;
  for (let i = 0; i < Math.min(results.length, cutoff); i++) {
    const result = results[i];
    const key = result.doi || result.title; // match by DOI or title
    const grade = labels[key] ?? 0;
    const gain = Math.pow(2, grade) - 1;
    dcg += gain / Math.log2(i + 2); // i+2 because rank is 1-indexed and log2(1)=0
  }

  // Ideal DCG: sort grades descending, compute DCG for perfect ranking
  const relevantGrades = Object.values(labels).sort((a, b) => b - a);
  let idcg = 0;
  for (let i = 0; i < Math.min(relevantGrades.length, cutoff); i++) {
    const gain = Math.pow(2, relevantGrades[i]) - 1;
    idcg += gain / Math.log2(i + 2);
  }

  return idcg === 0 ? 0 : dcg / idcg;
}

/**
 * Mean Reciprocal Rank: 1 / rank of first relevant doc (grade >= 2).
 * If no relevant doc found, returns 0.
 *
 * @param {Array} results — search results in ranked order
 * @param {Object} labels — { doi: grade, ... }
 * @returns {number} MRR (0–1)
 */
export function MRR(results, labels) {
  if (!results.length || !labels) {
    return 0;
  }

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const key = result.doi || result.title;
    const grade = labels[key] ?? 0;
    if (grade >= 2) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * Recall@N: what fraction of relevant docs (grade >= 2) appear in top N?
 *
 * @param {Array} results — search results in ranked order
 * @param {Object} labels — { doi: grade, ... }
 * @param {number} n — rank cutoff (default 10)
 * @returns {number} recall@N (0–1)
 */
export function recall(results, labels, n = 10) {
  if (!labels) {
    return 0;
  }

  const relevant = Object.entries(labels)
    .filter(([_, grade]) => grade >= 2)
    .map(([key, _]) => key);

  if (relevant.length === 0) {
    return 0; // no relevant docs to recall
  }

  const resultKeys = new Set(
    results.slice(0, n).map((r) => r.doi || r.title)
  );

  const found = relevant.filter((key) => resultKeys.has(key)).length;
  return found / relevant.length;
}

/**
 * Compute all metrics at once for a single query.
 *
 * @param {Array} results — search results in ranked order
 * @param {Object} labels — { doi: grade, ... }
 * @returns {Object} { nDCG10, MRR, recall10, recall20 }
 */
export function computeMetrics(results, labels) {
  return {
    nDCG10: nDCG(results, labels, 10),
    MRR: MRR(results, labels),
    recall10: recall(results, labels, 10),
    recall20: recall(results, labels, 20),
  };
}

/**
 * Aggregate metrics across multiple queries.
 *
 * @param {Array} metricsPerQuery — array of { nDCG10, MRR, ... } objects
 * @returns {Object} { avgNDCG10, avgMRR, ... } with count
 */
export function aggregateMetrics(metricsPerQuery) {
  if (!metricsPerQuery.length) {
    return {
      avgNDCG10: 0,
      avgMRR: 0,
      avgRecall10: 0,
      avgRecall20: 0,
      count: 0,
    };
  }

  const sum = (key) => metricsPerQuery.reduce((acc, m) => acc + (m[key] || 0), 0);

  return {
    avgNDCG10: sum("nDCG10") / metricsPerQuery.length,
    avgMRR: sum("MRR") / metricsPerQuery.length,
    avgRecall10: sum("recall10") / metricsPerQuery.length,
    avgRecall20: sum("recall20") / metricsPerQuery.length,
    count: metricsPerQuery.length,
  };
}
