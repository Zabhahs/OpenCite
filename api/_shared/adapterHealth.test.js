/**
 * Unit tests for adapterHealth.js — the v0.38 chronic-failure circuit-breaker (T1, F-208).
 * Plain-Node deterministic tests (same pattern as src/lib/goldSetMetrics.test.js).
 * Run:  node api/_shared/adapterHealth.test.js
 */

import { pathToFileURL } from "node:url";
import {
  recordSuccess,
  recordFailure,
  isCircuitOpen,
  circuitBreakerStats,
  FAILURE_STREAK_THRESHOLD,
} from "./adapterHealth.js";

// Each test uses a unique adapter id so the module-level Map doesn't bleed state
// between tests (the streaks map is shared, instance-scoped by design).

function test_closed_by_default() {
  if (isCircuitOpen("CLOSED_DEFAULT")) throw new Error("a never-seen adapter must be closed");
}

function test_opens_after_threshold() {
  const id = "OPENS";
  for (let i = 0; i < FAILURE_STREAK_THRESHOLD - 1; i++) {
    recordFailure(id);
    if (isCircuitOpen(id)) throw new Error(`opened too early after ${i + 1} failures`);
  }
  recordFailure(id); // the THRESHOLD-th failure
  if (!isCircuitOpen(id)) throw new Error(`must be open after ${FAILURE_STREAK_THRESHOLD} consecutive failures`);
}

function test_success_resets_streak() {
  const id = "RESETS";
  // Almost-open, then a success clears it.
  for (let i = 0; i < FAILURE_STREAK_THRESHOLD - 1; i++) recordFailure(id);
  recordSuccess(id);
  if (isCircuitOpen(id)) throw new Error("success did not reset the streak");
  // It now takes a fresh full streak to open again.
  for (let i = 0; i < FAILURE_STREAK_THRESHOLD - 1; i++) recordFailure(id);
  if (isCircuitOpen(id)) throw new Error("opened before a full fresh streak after reset");
  recordFailure(id);
  if (!isCircuitOpen(id)) throw new Error("did not re-open after a full fresh streak");
}

function test_success_recovers_an_open_circuit() {
  const id = "RECOVERS";
  for (let i = 0; i < FAILURE_STREAK_THRESHOLD; i++) recordFailure(id);
  if (!isCircuitOpen(id)) throw new Error("precondition: should be open");
  recordSuccess(id);
  if (isCircuitOpen(id)) throw new Error("a success should close an open circuit (recovery)");
}

function test_stats_reflect_streaks() {
  const id = "STATS";
  recordFailure(id);
  recordFailure(id);
  const stats = circuitBreakerStats();
  if (stats[id] !== 2) throw new Error(`expected streak 2 in stats, got ${stats[id]}`);
}

function test_null_id_is_safe() {
  // Must not throw on a missing id.
  recordSuccess(undefined);
  recordFailure(null);
  if (isCircuitOpen(undefined)) throw new Error("undefined id should report closed");
}

const tests = [
  test_closed_by_default,
  test_opens_after_threshold,
  test_success_resets_streak,
  test_success_recovers_an_open_circuit,
  test_stats_reflect_streaks,
  test_null_id_is_safe,
];

// Cross-platform main-module check (process.argv[1] is a backslash path on Windows;
// pathToFileURL normalizes it to a file:// URL that matches import.meta.url).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log("Running adapterHealth tests...\n");
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
