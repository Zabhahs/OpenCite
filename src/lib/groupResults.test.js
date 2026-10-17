/**
 * Unit tests for groupResults.js — edition collapsing (collapseEditions / editionKey) and the
 * composed groupForDisplay pipeline. Fixtures mirror real prod results probed 2026-10-16.
 *
 * Standalone Node runner (mirrors dedup.test.js): `node src/lib/groupResults.test.js`.
 * No test framework — pure assertions against pure functions.
 */

import { pathToFileURL } from "node:url";
import { collapseEditions, editionKey, groupForDisplay, groupRecordCount } from "./groupResults.js";

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const rec = (id, title, year, author, extra = {}) =>
  ({ id, title, year, authors: author ? [author] : [], type: "book", ...extra });

// ─── Editions of one work collapse; newest is primary, older newest → oldest ───

function test_editions_collapse_newest_primary() {
  const out = collapseEditions([
    rec("a", "The sonnets of Shakespeare", "1902", "Shakespeare, William, 1564-1616"),
    rec("b", "The Sonnets of Shakespeare", "1904", "Shakespeare, William, 1564-1616"),
    rec("c", "The sonnets of Shakespeare.", "1881", "William Shakespeare"),
  ]);
  assert(out.length === 1, `three editions should be one card, got ${out.length}`);
  assert(out[0].id === "b", "newest edition (1904) is the primary card");
  assert(out[0]._editions.map((e) => e.id).join() === "a,c", "older editions ordered newest → oldest");
}

// ─── Same title, different authors = different works ───

function test_different_authors_stay_separate() {
  const out = collapseEditions([
    rec("a", "Malaria Vaccine Development", "1996", "Stephen L. Hoffman"),
    rec("b", "Malaria Vaccine Development", "1994", "Trevor R. Jones"),
    rec("c", "Malaria Vaccine Development", "2018", "Camila França"),
  ]);
  assert(out.length === 3, `different authors must not merge, got ${out.length}`);
  assert(out.every((r) => !r._editions), "no edition dropdowns on distinct works");
}

// ─── Card keeps the slot of the first-arrived member; others' order untouched ───

function test_slot_is_first_arrival() {
  const out = collapseEditions([
    rec("x", "Unrelated", "2020", "A. Author"),
    rec("old", "Local agrarian societies in colonial India", "1996", "Peter Robb"),
    rec("y", "Another", "2021", "B. Writer"),
    rec("new", "Local agrarian societies in colonial India", "1997", "Robb P"),
  ]);
  assert(out.map((r) => r.id).join() === "x,new,y", `got ${out.map((r) => r.id).join()}`);
}

// ─── Distinct volumes are different works; same volume still collapses ───

function test_volumes_split_same_volume_collapses() {
  const vols = collapseEditions([
    rec("a", "The Harvard classics", "1937", "Eliot, Charles William, 1834-1926, ed", { volume: "1" }),
    rec("b", "The Harvard classics", "1909", "Eliot, Charles William, 1834-1926", { volume: "15" }),
  ]);
  assert(vols.length === 2, `different volumes must not group, got ${vols.length}`);
  const dup = collapseEditions([
    rec("a", "Un secol de reprezentare consulară britanică", "2025", "Ionel Constantin MITEA", { type: "article", volume: "8" }),
    rec("b", "Un secol de reprezentare consulară britanică", "2024", "Ionel Constantin MITEA", { type: "article", volume: "8" }),
  ]);
  assert(dup.length === 1, "same volume re-publication collapses");
}

// ─── Never grouped: chapters, authorless records, untitled records ───

function test_ineligible_records_pass_through() {
  assert(editionKey(rec("a", "Intro", "2015", "W. Shakespeare", { type: "book-chapter" })) === null, "chapter");
  assert(editionKey(rec("b", "Malaria Vaccine Development", "1990", null)) === null, "no author");
  assert(editionKey(rec("c", "Untitled", "1990", "A. Author")) === null, "untitled");
  const out = collapseEditions([
    rec("a", "Malaria Vaccine Development", "1990", null),
    rec("b", "Malaria Vaccine Development", "1996", null),
  ]);
  assert(out.length === 2, "authorless same-title records stay separate");
}

// ─── Missing year sorts as oldest; diacritics fold in title and surname ───

function test_missing_year_oldest_and_diacritics() {
  const out = collapseEditions([
    rec("a", "Peasants, Famine and the State in Colonial Western India", "", "David Hall-Matthews"),
    rec("b", "Peasants, Famine and the State in Colonial Western India", "2005", "D. Hall-Matthews"),
  ]);
  assert(out.length === 1 && out[0].id === "b", "dated edition is primary over undated");
  const d = collapseEditions([
    rec("a", "Anatolian Livestock Trade", "2024", "Yonca Köksal"),
    rec("b", "Anatolian Livestock Trade", "2019", "Yonca Koksal"),
  ]);
  assert(d.length === 1, "ö/o fold to the same surname");
}

// ─── Composed pipeline + record count includes folded editions ───

function test_groupForDisplay_counts_editions() {
  const groups = groupForDisplay([
    rec("a", "The Islamic Law of Personal Status", "2002", "Jamal J. Nasir"),
    rec("b", "The Islamic Law of Personal Status", "2009", "Jamal J. Nasir"),
    rec("c", "Ch 1", "2015", "X. Y", { type: "book-chapter", journal: "Some Book" }),
  ]);
  assert(groups.length === 2, `edition card + chapter cluster, got ${groups.length}`);
  assert(groups[0].items[0].id === "b" && groups[0].items[0]._editions.length === 1, "edition card first");
  assert(groups.reduce((n, g) => n + groupRecordCount(g), 0) === 3, "all 3 records counted");
}

// ─── Runner ───

const tests = [
  test_editions_collapse_newest_primary,
  test_different_authors_stay_separate,
  test_slot_is_first_arrival,
  test_volumes_split_same_volume_collapses,
  test_ineligible_records_pass_through,
  test_missing_year_oldest_and_diacritics,
  test_groupForDisplay_counts_editions,
];

// Run when invoked directly (cross-platform: pathToFileURL handles Windows drive paths).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log("Running groupResults tests...\n");
  let passed = 0, failed = 0;
  for (const test of tests) {
    try { test(); console.log(`✓ ${test.name}`); passed++; }
    catch (e) { console.log(`✗ ${test.name}: ${e.message}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
