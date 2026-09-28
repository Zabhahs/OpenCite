// Result identity & de-duplication — SSOT for collapsing the same work across sources.
//
// Two arrival models need different merge rules:
//   - Streaming (per-adapter, client): first occurrence wins — later sources haven't
//     arrived yet, so there's nothing to merge against.
//   - Pooled (server, all sources fanned-in): first-wins + field-merge (mergeRecords).
//
// v0.44 (engine teardown): the BM25F `_score` field no longer exists anywhere in the
// pipeline. dedupHighestScore's score comparison is retained but always sees 0 vs 0,
// so it degrades to first-wins (the earlier copy stays canonical), per sprint D-2.

// DOI is the strongest identity signal when present; null = no DOI, never dedup on it.
// v0.44 (D-2): normalized — trim, lowercase, strip a leading doi.org URL prefix — so the
// same work keyed as "10.1/X", " 10.1/x " and "https://doi.org/10.1/x" collapses to one key.
export const doiKey = (r) => {
  const d = String(r.doi || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  return d || null;
};

// Same-paper fingerprint for records registered under multiple DOIs — e.g. a JSTOR DOI
// and a publisher DOI for the same Crossref article. Null when there's no title to key on.
export const titleFingerprint = (r) => {
  const t = (r.title || "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const surname = (r.authors?.[0] || "").split(" ").pop().toLowerCase();
  return `${t}|${r.year || ""}|${surname}`;
};

// Streaming first-wins dedup. Drops records whose key was already seen; mutates `seen`
// so it persists across successive adapter batches / load-more pages. Null key = always kept.
// NOTE: no field-merge here — later copies haven't arrived when each batch runs, so there's
// nothing to merge against. The enrichment merge (F-208) lives in the pooled
// dedupHighestScore path only.
export function dedupFirstWins(records, keyFn, seen) {
  return records.filter((r) => {
    const key = keyFn(r);
    if (key == null) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Field-merge on dedup collapse (F-208) ──────────────────────────────────────────────
// ID note: the v0.42 sprint plan §2.13 calls this "F-208"; it is registered in the machine
// twin as F-210 (the F-208 id was already taken by the v0.38 adapter-health finding).
// When the same work arrives from two sources, dedupHighestScore keeps one canonical copy
// (first-wins since v0.44 — no scores). Discarding the loser wholesale loses the other
// source's better fields — e.g. a
// Crossref record (rich abstract, is-referenced-by-count) collapsing into an OpenAlex record
// (real cited_by_count, fuller authors) or vice-versa — degrading card quality and weakening
// the citedBy signal the explicit Citations sort consumes. mergeRecords ENRICHES the survivor
// with the loser's superior fields instead of dropping it.
//
// Field set reconciled against the real UnifiedResult (src/adapters/_shared/base.js +
// api/_shared/publicResult.js): there is no `sources[]`/`nativeScore`/`pmid` — only a
// singular `source` (dropped downstream for origin-blindness) — so the §2.13 policy maps
// onto the actual fields; nothing invented.
//
// `keep` is canonical (first-arrived since v0.44; `_score` no longer exists) and
// authoritative for single-value scalars. `drop` is the collapsed duplicate.

// Collection union: dedup on the lowercased value but keep the ORIGINAL casing and the
// first-seen insertion order (a naive Set would lose one or the other).
function unionList(a, b) {
  const seen = new Set();
  const out = [];
  for (const v of [...(a || []), ...(b || [])]) {
    const k = String(v).toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(v); }
  }
  return out;
}

// Max of two numeric signals, treating null/undefined as "absent". Both absent → null.
function maxNum(a, b) {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.max(a, b);
}

export function mergeRecords(keep, drop) {
  if (!drop) return keep;
  return {
    ...keep,
    // Richer free text / author set wins.
    abstract: (drop.abstract || "").length > (keep.abstract || "").length ? drop.abstract : keep.abstract,
    // Authors: improve on a plain longer-list rule — union both lists, de-duped by
    // normalized name, canonical order first (unionList preserves casing + first-seen order).
    authors:  unionList(keep.authors, drop.authors),
    // Collection fields: union, de-duped, casing + order preserved.
    keywords: unionList(keep.keywords, drop.keywords),
    subjects: unionList(keep.subjects, drop.subjects),
    editors:  unionList(keep.editors, drop.editors),
    // Strongest citation signal wins (null-safe; a real 0 count is preserved).
    citedBy:  maxNum(keep.citedBy, drop.citedBy),
    // Availability flag: OR — if either source flags open-access, it's open-access.
    isOA:     !!(keep.isOA || drop.isOA),
    // Single-value scalars: canonical wins; fill only when the keeper is missing it.
    doi:          keep.doi || drop.doi,
    year:         keep.year || drop.year,
    journal:      keep.journal || drop.journal,
    publisher:    keep.publisher || drop.publisher,
    volume:       keep.volume || drop.volume,
    issue:        keep.issue || drop.issue,
    pages:        keep.pages || drop.pages,
    url:          keep.url || drop.url,
    language:     keep.language || drop.language,
    previewImage: keep.previewImage || drop.previewImage,
    // title / type / source: keep canonical (untouched via spread).
  };
}

// Pooled dedup keeping one canonical copy per key, enriched with the duplicate's better
// fields (F-208). The `_score` comparison survives from the ranking era but the field no
// longer exists (v0.44), so 0-vs-0 makes the first-arrived copy canonical (first-wins, D-2).
// Null key = always kept. A `posMap` tracks each key's slot in `out[]`, so a collision
// replaces in O(1) — no `indexOf` scan over `out` (F-206).
export function dedupHighestScore(records, keyFn) {
  const byKey = new Map();   // key → current keeper record
  const posMap = new Map();  // key → index of that keeper in out[]
  const out = [];
  for (const r of records) {
    const key = keyFn(r);
    if (key == null) { out.push(r); continue; }
    const existing = byKey.get(key);
    if (!existing) {
      posMap.set(key, out.length);
      byKey.set(key, r);
      out.push(r);
    } else {
      // Pick the canonical copy by score, then enrich it with the loser's better fields.
      const keep = (r._score || 0) > (existing._score || 0) ? r : existing;
      const drop = keep === r ? existing : r;
      const merged = mergeRecords(keep, drop);
      out[posMap.get(key)] = merged;   // O(1) — slot known from posMap
      byKey.set(key, merged);
    }
  }
  return out;
}
