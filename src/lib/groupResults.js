// Result grouping for display — SSOT for how the web UI clusters results into cards.
//   collapseEditions  — editions of one work → one card (newest) + older editions dropdown
//   groupByParentWork — book chapters → one parent-work cluster
//   groupForDisplay   — the composed pipeline both result views render from
// Pure functions: the API can adopt collapseEditions later (e.g. an `editions[]` field)
// without touching the UI.

import { surnameOf } from "./dedup.js";
import { isBookChapter } from "./citations.js";

// ── Editions ─────────────────────────────────────────────────────────────────────────────
// Same work = same normalized title + same first-author surname, ANY year. Year is the axis
// editions differ on, so it is deliberately not in the key (contrast dedup's titleFingerprint,
// which includes year and collapses same-year copies as duplicates). Probe-validated
// 2026-10-16: groups DPLA's 1881–1905 Shakespeare Sonnets, Nasir 2002/2009, Darwin Life &
// Letters 1888/1896/1898; keeps four different "Malaria Vaccine Development" authors apart.
// Volume is in the key: distinct volumes of a multi-volume set (Harvard Classics v.1 vs v.15)
// and Part I/II articles are different works, not editions; book editions carry no volume
// (live-probed 2026-10-17), so they still group.
// Null (never grouped): chapters (they cluster under their parent book instead), records
// with no author or no real title.
const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const editionKey = (r) => {
  if (isBookChapter(r)) return null;
  const surname = fold(surnameOf(r.authors?.[0]));
  if (!surname) return null;
  const title = fold(r.title).replace(/[^a-z0-9]+/g, " ").trim();
  if (!title || title === "untitled") return null;
  return `${title}|${surname}|${String(r.volume || "").trim().toLowerCase()}`;
};

// Missing/unparseable year sorts as oldest.
const yearOf = (r) => parseInt(r.year, 10) || -Infinity;

// Collapses each edition set into its newest edition, carrying the rest (newest → oldest)
// on `_editions`. The card keeps the list slot of the set's FIRST-arrived member, so the
// interleave / explicit-sort order is preserved. Singletons pass through untouched.
export function collapseEditions(results) {
  if (!results?.length) return [];
  const slots = [];          // one entry per work, in first-arrival order
  const slotOf = new Map();  // editionKey → index in slots
  for (const r of results) {
    const key = editionKey(r);
    if (key == null) { slots.push([r]); continue; }
    if (slotOf.has(key)) slots[slotOf.get(key)].push(r);
    else { slotOf.set(key, slots.length); slots.push([r]); }
  }
  return slots.map((set) => {
    if (set.length === 1) return set[0];
    // Array.prototype.sort is stable: equal years keep arrival order.
    const [newest, ...older] = [...set].sort((a, b) => yearOf(b) - yearOf(a));
    return { ...newest, _editions: older };
  });
}

// ── Book chapters ────────────────────────────────────────────────────────────────────────
// groupByParentWork — clusters book-chapter results under their container title.
// Non-chapter results pass through as single-item groups ({ parentTitle: null }).
// Returns: [{ parentTitle, publisher, editors, year, items: [result, ...] }, ...]
// Stable: preserves original order; chapters of the same book are consecutive.

export function groupByParentWork(results) {
  if (!results?.length) return [];

  const groups = [];
  const bookMap = new Map(); // container-title → group index

  for (const r of results) {
    const isChapter = r._type === "book-chapter" || r.type === "book-chapter"
      || r.type === "book-section" || r.type === "book-part"
      || r.type === "reference-entry";

    if (isChapter && r.journal) {
      const key = r.journal.toLowerCase().trim();
      if (bookMap.has(key)) {
        groups[bookMap.get(key)].items.push(r);
      } else {
        bookMap.set(key, groups.length);
        groups.push({
          parentTitle: r.journal,
          publisher: r.publisher || "",
          editors: r.editors || [],
          year: r.year || "",
          items: [r],
        });
      }
    } else {
      groups.push({ parentTitle: null, items: [r] });
    }
  }

  return groups;
}

// ── Composed display pipeline ────────────────────────────────────────────────────────────
export const groupForDisplay = (results) => groupByParentWork(collapseEditions(results));

// Records a group renders, counting the editions folded into each card's dropdown.
export const groupRecordCount = (group) =>
  group.items.reduce((n, r) => n + 1 + (r._editions?.length || 0), 0);
