/**
 * Unit tests for scoring.js — D5 orthographic normalisation.
 *
 * Covers:
 *  - normalizeForMatch: alias folding, diacritic stripping, apostrophe removal,
 *    and the critical invariant that plain ASCII tokens are unchanged.
 *  - tokenize: intra-word apostrophes kept joined through normalisation;
 *    normal punctuation/whitespace still splits.
 *  - scoreResults regression: a doc titled "The Koran" scores > 0 for ["quran"].
 *
 * Run with:  node src/lib/scoring.test.js
 */

import { normalizeForMatch, scoreResults } from "./scoring.js";

// Pull tokenize out via a thin shim — it is module-private, so we test it
// indirectly through scoreResults AND by re-implementing the surface we care
// about via normalizeForMatch + the behaviour observable in scoreResults.
// For direct tokenize coverage we expose its output through scoreResults.

// ─── Helper ──────────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Extracts the title-field tokens scoreResults would use for a single doc.
// We do this by scoring the doc against a unique sentinel term, then observe
// scoring behaviour — but for tokenize coverage we instead call normalizeForMatch
// directly on pre-split tokens (the integration is verified via scoreResults).

// ─── Test Suite 1: normalizeForMatch — alias folding ─────────────────────────

function test_normalizeForMatch_koran_to_quran() {
  assertEqual(normalizeForMatch("koran"), "quran", "koran → quran");
}

function test_normalizeForMatch_mohammed_to_muhammad() {
  assertEqual(normalizeForMatch("mohammed"), "muhammad", "mohammed → muhammad");
}

function test_normalizeForMatch_mohammad_to_muhammad() {
  assertEqual(normalizeForMatch("mohammad"), "muhammad", "mohammad → muhammad");
}

function test_normalizeForMatch_hussein_to_hussain() {
  assertEqual(normalizeForMatch("hussein"), "hussain", "hussein → hussain");
}

function test_normalizeForMatch_osmani_to_usmani() {
  assertEqual(normalizeForMatch("osmani"), "usmani", "osmani → usmani");
}

// ─── Test Suite 2: normalizeForMatch — diacritic stripping ──────────────────

function test_normalizeForMatch_combining_mark_muhammad() {
  // U+1E25 = ḥ (h with combining dot below, decomposes to h + U+0323)
  // mu + ḥ + ammad → after NFKD + strip combining → muhammad → alias → muhammad
  const input = "muḥammad"; // muḥammad
  assertEqual(normalizeForMatch(input), "muhammad", "muḥammad → muhammad via diacritic fold + alias");
}

function test_normalizeForMatch_cafe_accent() {
  // café → cafe (diacritic only, no alias)
  const input = "café"; // café
  assertEqual(normalizeForMatch(input), "cafe", "café → cafe");
}

function test_normalizeForMatch_noel() {
  // noël → noel
  const input = "noël"; // noël
  assertEqual(normalizeForMatch(input), "noel", "noël → noel");
}

// ─── Test Suite 3: normalizeForMatch — apostrophe stripping ──────────────────

function test_normalizeForMatch_quran_apostrophe() {
  // qur'an (with right single quote U+2019) → quran → alias → quran (already canonical)
  const input = "qur’an";
  assertEqual(normalizeForMatch(input), "quran", "qur'an (U+2019) → quran");
}

function test_normalizeForMatch_quran_modifier_alef() {
  // qurʾan (with U+02BE modifier letter right half ring) → quran
  const input = "qurʾan";
  assertEqual(normalizeForMatch(input), "quran", "qurʾan (U+02BE) → quran");
}

// ─── Test Suite 4: normalizeForMatch — no false folding ──────────────────────

function test_normalizeForMatch_kubernetes_unchanged() {
  assertEqual(normalizeForMatch("kubernetes"), "kubernetes", "kubernetes unchanged");
}

function test_normalizeForMatch_algorithm_unchanged() {
  assertEqual(normalizeForMatch("algorithm"), "algorithm", "algorithm unchanged");
}

function test_normalizeForMatch_empty_string() {
  assertEqual(normalizeForMatch(""), "", "empty string → empty string");
}

// ─── Test Suite 5: tokenize behaviour (via normalizeForMatch composition) ────

// tokenize is private but its contract is fully observable via scoreResults.
// We also test it indirectly: feed a doc with "Qur'an" in the title and verify
// it matches query term "quran".

function test_tokenize_quran_apostrophe_not_split() {
  // "Qur'an" must yield a single token "quran", not ["qur","an"].
  // We verify by scoring: a doc whose title is "Qur'an" must get score > 0
  // for query term "quran".
  const doc = { title: "Qur’an", abstract: "", keywords: [] };
  const [scored] = scoreResults([doc], ["quran"]);
  assert(scored._score > 0, `Qur'an should score > 0 for query 'quran', got ${scored._score}`);
}

function test_tokenize_normal_punctuation_still_splits() {
  // "foo,bar" should tokenize to ["foo","bar"] — normal punctuation still splits.
  // Verify: a doc whose title is "foo,bar" matches both "foo" and "bar" separately.
  const doc = { title: "foo,bar baz", abstract: "", keywords: [] };
  const [scored] = scoreResults([doc], ["foo"]);
  assert(scored._score > 0, "comma-separated word 'foo' still matched");
}

// ─── Test Suite 6: scoreResults regression ───────────────────────────────────

function test_scoreResults_koran_matches_quran_query() {
  // A doc titled "The Koran" must score > 0 for query terms ["quran"].
  // Both sides normalise to "quran" — BM25F should fire.
  const doc = { title: "The Koran", abstract: "", keywords: [] };
  const [scored] = scoreResults([doc], ["quran"]);
  assert(scored._score > 0, `"The Koran" should score > 0 for query ['quran'], got ${scored._score}`);
}

function test_scoreResults_mohammed_matches_muhammad_query() {
  // Doc titled "Mohammed and Islamic theology" scores > 0 for query ["muhammad"].
  const doc = { title: "Mohammed and Islamic theology", abstract: "", keywords: [] };
  const [scored] = scoreResults([doc], ["muhammad"]);
  assert(scored._score > 0, `"Mohammed..." should score > 0 for query ['muhammad'], got ${scored._score}`);
}

function test_scoreResults_unrelated_doc_scores_zero() {
  // Sanity check: a doc about "machine learning" doesn't score for "quran".
  const doc = { title: "Machine learning for natural language processing", abstract: "", keywords: [] };
  const [scored] = scoreResults([doc], ["quran"]);
  assert(scored._score === 0, `unrelated doc should score 0, got ${scored._score}`);
}

function test_scoreResults_exact_match_still_works() {
  // Ensure basic BM25F still fires for plain ASCII tokens (no regression).
  const doc = { title: "Deep learning architectures", abstract: "", keywords: [] };
  const [scored] = scoreResults([doc], ["deep learning"]);
  assert(scored._score > 0, `"Deep learning..." should score > 0 for query ['deep learning'], got ${scored._score}`);
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const tests = [
  test_normalizeForMatch_koran_to_quran,
  test_normalizeForMatch_mohammed_to_muhammad,
  test_normalizeForMatch_mohammad_to_muhammad,
  test_normalizeForMatch_hussein_to_hussain,
  test_normalizeForMatch_osmani_to_usmani,
  test_normalizeForMatch_combining_mark_muhammad,
  test_normalizeForMatch_cafe_accent,
  test_normalizeForMatch_noel,
  test_normalizeForMatch_quran_apostrophe,
  test_normalizeForMatch_quran_modifier_alef,
  test_normalizeForMatch_kubernetes_unchanged,
  test_normalizeForMatch_algorithm_unchanged,
  test_normalizeForMatch_empty_string,
  test_tokenize_quran_apostrophe_not_split,
  test_tokenize_normal_punctuation_still_splits,
  test_scoreResults_koran_matches_quran_query,
  test_scoreResults_mohammed_matches_muhammad_query,
  test_scoreResults_unrelated_doc_scores_zero,
  test_scoreResults_exact_match_still_works,
];

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Running scoring.js D5 normalisation tests...\n");

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      console.log(`  PASS  ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`  FAIL  ${test.name}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
