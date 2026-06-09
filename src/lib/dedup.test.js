/**
 * Unit tests for dedup.js — dedupHighestScore O(1) replacement (F-206) and the
 * field-merge-on-collapse policy (F-208).
 *
 * Standalone Node runner (mirrors goldSetMetrics.test.js): `node src/lib/dedup.test.js`.
 * No test framework — pure assertions against pure functions.
 */

import { pathToFileURL } from "node:url";
import { dedupHighestScore, dedupFirstWins, mergeRecords, doiKey, titleFingerprint } from "./dedup.js";

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ─── F-208: field-merge enriches the survivor instead of discarding the loser ───

function test_merge_keeps_higher_score_and_enriches() {
  // Same DOI from two sources: Crossref (richer abstract, higher score) vs OpenAlex
  // (real citedBy, extra author + keyword). Crossref scores higher → canonical.
  const crossref = {
    doi: "10.1/x", _score: 9, source: "CROSSREF",
    title: "A Paper", abstract: "A long rich abstract from Crossref.",
    authors: ["Jane Doe"], keywords: ["alpha"], citedBy: null, isOA: false, year: "2020",
  };
  const openalex = {
    doi: "10.1/x", _score: 4, source: "OPENALEX",
    title: "A Paper", abstract: "short",
    authors: ["Jane Doe", "John Roe"], keywords: ["beta"], citedBy: 42, isOA: true, year: "",
  };
  const out = dedupHighestScore([crossref, openalex], doiKey);

  assert(out.length === 1, `expected 1 record, got ${out.length}`);
  const m = out[0];
  assert(m._score === 9, `expected canonical _score 9, got ${m._score}`);
  assert(m.abstract === crossref.abstract, "expected the longer abstract");
  assert(m.citedBy === 42, `expected max citedBy 42, got ${m.citedBy}`);
  assert(m.isOA === true, "expected isOA OR → true");
  assert(m.authors.length === 2 && m.authors[0] === "Jane Doe" && m.authors[1] === "John Roe",
    `expected unioned authors [Jane Doe, John Roe], got ${JSON.stringify(m.authors)}`);
  assert(m.keywords.length === 2 && m.keywords[0] === "alpha" && m.keywords[1] === "beta",
    `expected unioned keywords [alpha, beta], got ${JSON.stringify(m.keywords)}`);
  assert(m.year === "2020", `expected canonical year filled-from-loser, got ${m.year}`);
}

function test_merge_when_loser_arrives_first() {
  // Lower-scored copy arrives first (becomes initial keeper), then the higher-scored copy
  // collides → canonical must flip to the higher score, still enriched.
  const low  = { doi: "10.2/y", _score: 2, abstract: "looong abstract here", keywords: ["k1"] };
  const high = { doi: "10.2/y", _score: 8, abstract: "short", keywords: ["k2"] };
  const out = dedupHighestScore([low, high], doiKey);
  assert(out.length === 1, `expected 1, got ${out.length}`);
  assert(out[0]._score === 8, `expected canonical _score 8, got ${out[0]._score}`);
  assert(out[0].abstract === "looong abstract here", "expected the longer (loser's) abstract");
  assert(out[0].keywords.join(",") === "k2,k1", `expected canonical-first union, got ${out[0].keywords}`);
}

function test_unioned_collections_preserve_casing_and_order() {
  const a = { doi: "d", _score: 5, subjects: ["Climate", "Ocean"] };
  const b = { doi: "d", _score: 1, subjects: ["climate", "Biology"] };
  const out = dedupHighestScore([a, b], doiKey);
  // "climate" is a case-insensitive dup of "Climate" → dropped; original casing + order kept.
  assert(out[0].subjects.join("|") === "Climate|Ocean|Biology",
    `expected Climate|Ocean|Biology, got ${out[0].subjects.join("|")}`);
}

function test_mergeRecords_scalars_keep_canonical_fill_missing() {
  const keep = { _score: 5, publisher: "ACME", url: "", year: "1999" };
  const drop = { _score: 1, publisher: "OTHER", url: "http://x", year: "2001" };
  const m = mergeRecords(keep, drop);
  assert(m.publisher === "ACME", "canonical publisher must win");
  assert(m.url === "http://x", "missing url must be filled from loser");
  assert(m.year === "1999", "canonical year must win");
}

function test_mergeRecords_null_drop_is_noop() {
  const keep = { _score: 5, title: "T" };
  assert(mergeRecords(keep, null) === keep, "null drop should return keep unchanged");
}

// ─── F-206: O(1) replacement — correctness + order preservation at scale ───

function test_null_key_always_kept() {
  const recs = [{ doi: "", _score: 1 }, { doi: "", _score: 2 }, { doi: "a", _score: 3 }];
  const out = dedupHighestScore(recs, doiKey); // doiKey returns null for ""
  assert(out.length === 3, `null-key records must all be kept, got ${out.length}`);
}

function test_order_preserved_on_replacement() {
  const recs = [
    { doi: "a", _score: 1, title: "A" },
    { doi: "b", _score: 5, title: "B" },
    { doi: "a", _score: 9, title: "A2" }, // collides with index 0, must stay in slot 0
  ];
  const out = dedupHighestScore(recs, doiKey);
  assert(out.length === 2, `expected 2, got ${out.length}`);
  assert(out[0].doi === "a" && out[0]._score === 9, "slot 0 should hold the higher-scored 'a'");
  assert(out[1].doi === "b", "slot 1 order preserved");
}

function test_large_pool_dedups_correctly() {
  // 200 records, 100 unique keys each appearing twice with ascending scores.
  const recs = [];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 100; i++) {
      recs.push({ doi: `d${i}`, _score: pass * 100 + i, citedBy: pass });
    }
  }
  const out = dedupHighestScore(recs, doiKey);
  assert(out.length === 100, `expected 100 unique, got ${out.length}`);
  // Every survivor must be the higher-scored (pass 1) copy.
  assert(out.every(r => r._score >= 100), "every survivor must be the higher-scored copy");
}

function test_dedupFirstWins_unchanged() {
  const seen = new Set();
  const out = dedupFirstWins([{ doi: "a" }, { doi: "a" }, { doi: "b" }], doiKey, seen);
  assert(out.length === 2, `first-wins should drop the 2nd 'a', got ${out.length}`);
}

// ─── Runner ───

const tests = [
  test_merge_keeps_higher_score_and_enriches,
  test_merge_when_loser_arrives_first,
  test_unioned_collections_preserve_casing_and_order,
  test_mergeRecords_scalars_keep_canonical_fill_missing,
  test_mergeRecords_null_drop_is_noop,
  test_null_key_always_kept,
  test_order_preserved_on_replacement,
  test_large_pool_dedups_correctly,
  test_dedupFirstWins_unchanged,
];

// Run when invoked directly (cross-platform: pathToFileURL handles Windows drive paths).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log("Running dedup tests...\n");
  let passed = 0, failed = 0;
  for (const test of tests) {
    try { test(); console.log(`✓ ${test.name}`); passed++; }
    catch (e) { console.log(`✗ ${test.name}: ${e.message}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
