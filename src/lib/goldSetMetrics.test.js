/**
 * Unit tests for goldSetMetrics.js
 * This file contains deterministic tests for the metrics computation.
 *
 * Test examples:
 * - Perfect ranking (all relevant docs at top)
 * - Degraded ranking (relevant docs scattered)
 * - Edge cases (empty results, no relevant docs)
 */

import { nDCG, MRR, recall, computeMetrics, aggregateMetrics } from "./goldSetMetrics.js";

// ─── Test Suite 1: nDCG ───────────────────────────────────────────────────

function test_nDCG_perfect_ranking() {
  // Perfect ranking: all relevant docs first, in descending grade order
  const results = [
    { doi: "a", title: "A" },
    { doi: "b", title: "B" },
    { doi: "c", title: "C" },
  ];
  const labels = { a: 3, b: 2, c: 0 };
  const score = nDCG(results, labels, 10);
  // Grades: [3, 2, 0]
  // DCG = (2^3-1)/log2(2) + (2^2-1)/log2(3) + (2^0-1)/log2(4)
  //     = 7/1 + 3/1.585 + 0/2 = 7 + 1.894 = 8.894
  // IDCG (best ranking) = same (only 2 relevant)
  //     = 7/1 + 3/1.585 = 8.894
  // nDCG = 1.0
  if (Math.abs(score - 1.0) > 0.01) throw new Error(`Expected ~1.0, got ${score}`);
}

function test_nDCG_degraded_ranking() {
  // Degraded ranking: relevant doc at position 3
  const results = [
    { doi: "x", title: "X" },
    { doi: "y", title: "Y" },
    { doi: "a", title: "A" },
  ];
  const labels = { a: 3 };
  const score = nDCG(results, labels, 10);
  // DCG = (2^3-1)/log2(4) = 7/2 = 3.5
  // IDCG = (2^3-1)/log2(2) = 7/1 = 7
  // nDCG = 3.5 / 7 = 0.5
  if (Math.abs(score - 0.5) > 0.01) throw new Error(`Expected ~0.5, got ${score}`);
}

function test_nDCG_empty_labels() {
  const results = [{ doi: "a" }];
  const score = nDCG(results, {}, 10);
  if (score !== 0) throw new Error(`Expected 0, got ${score}`);
}

// ─── Test Suite 2: MRR ────────────────────────────────────────────────────

function test_MRR_perfect_first() {
  const results = [
    { doi: "a", title: "A" },
    { doi: "b", title: "B" },
  ];
  const labels = { a: 2 };
  const score = MRR(results, labels);
  // First relevant at position 0 (rank 1)
  // MRR = 1 / 1 = 1
  if (score !== 1) throw new Error(`Expected 1, got ${score}`);
}

function test_MRR_rank_three() {
  const results = [
    { doi: "x", title: "X" },
    { doi: "y", title: "Y" },
    { doi: "a", title: "A" },
  ];
  const labels = { a: 2 };
  const score = MRR(results, labels);
  // First relevant at position 2 (rank 3)
  // MRR = 1 / 3
  if (Math.abs(score - 1 / 3) > 0.01) throw new Error(`Expected ${1 / 3}, got ${score}`);
}

function test_MRR_no_relevant() {
  const results = [{ doi: "a" }];
  const labels = { a: 0 };
  const score = MRR(results, labels);
  if (score !== 0) throw new Error(`Expected 0, got ${score}`);
}

// ─── Test Suite 3: Recall ────────────────────────────────────────────────

function test_recall_all_found() {
  const results = [
    { doi: "a", title: "A" },
    { doi: "b", title: "B" },
    { doi: "c", title: "C" },
  ];
  const labels = { a: 2, b: 2 };
  const score = recall(results, labels, 10);
  // 2 relevant docs, both in top 10
  // recall = 2 / 2 = 1
  if (score !== 1) throw new Error(`Expected 1, got ${score}`);
}

function test_recall_partial() {
  const results = [
    { doi: "a", title: "A" },
    { doi: "x", title: "X" },
    { doi: "x2", title: "X2" },
  ];
  const labels = { a: 2, b: 2 };
  const score = recall(results, labels, 10);
  // 2 relevant docs, only 1 in top 10
  // recall = 1 / 2 = 0.5
  if (score !== 0.5) throw new Error(`Expected 0.5, got ${score}`);
}

function test_recall_cutoff() {
  const results = [
    { doi: "a", title: "A" },
    { doi: "b", title: "B" },
    { doi: "c", title: "C" },
  ];
  const labels = { a: 2, b: 2, c: 2 };
  const score = recall(results, labels, 2);
  // 3 relevant docs, 2 in top 2
  // recall = 2 / 3
  if (Math.abs(score - 2 / 3) > 0.01) throw new Error(`Expected ${2 / 3}, got ${score}`);
}

// ─── Test Suite 4: computeMetrics ────────────────────────────────────────

function test_computeMetrics_all_present() {
  const results = [{ doi: "a", title: "A" }];
  const labels = { a: 3 };
  const metrics = computeMetrics(results, labels);
  if (!("nDCG10" in metrics) || !("MRR" in metrics) || !("recall10" in metrics)) {
    throw new Error("Missing metric keys");
  }
  if (metrics.MRR !== 1) throw new Error(`Expected MRR=1, got ${metrics.MRR}`);
}

// ─── Test Suite 5: aggregateMetrics ──────────────────────────────────────

function test_aggregateMetrics_average() {
  const metricsArray = [
    { nDCG10: 0.8, MRR: 1, recall10: 0.5, recall20: 0.7 },
    { nDCG10: 0.6, MRR: 0.5, recall10: 0.5, recall20: 0.7 },
  ];
  const agg = aggregateMetrics(metricsArray);
  // avgNDCG10 = (0.8 + 0.6) / 2 = 0.7
  if (Math.abs(agg.avgNDCG10 - 0.7) > 0.01) throw new Error(`Expected 0.7, got ${agg.avgNDCG10}`);
  if (agg.count !== 2) throw new Error(`Expected count=2, got ${agg.count}`);
}

function test_aggregateMetrics_empty() {
  const agg = aggregateMetrics([]);
  if (agg.avgNDCG10 !== 0 || agg.count !== 0) {
    throw new Error("Empty aggregation should return zeros");
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────

const tests = [
  test_nDCG_perfect_ranking,
  test_nDCG_degraded_ranking,
  test_nDCG_empty_labels,
  test_MRR_perfect_first,
  test_MRR_rank_three,
  test_MRR_no_relevant,
  test_recall_all_found,
  test_recall_partial,
  test_recall_cutoff,
  test_computeMetrics_all_present,
  test_aggregateMetrics_average,
  test_aggregateMetrics_empty,
];

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Running goldSetMetrics tests...\n");

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      console.log(`✓ ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`✗ ${test.name}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
