/**
 * normalize.js — NCR (Normalized Citation Record) pipeline.
 *
 * Called inside runSearch() after AbstractAdapter.sanitize().
 * Produces a strict superset of UnifiedResult — all existing fields
 * are preserved unchanged. New fields are prefixed with _ to signal
 * they are pipeline-internal and not part of the public adapter contract.
 *
 * Consumers:
 *   - ResultCard.jsx        → reads existing UnifiedResult fields (unchanged)
 *   - buildMLA / buildAPA   → read existing UnifiedResult fields (unchanged)
 *   - buildCSL / buildBibTeX / buildRIS → read _type, _authorsParsed (new)
 *
 * _raw is never attached — debug via adapter.search() directly.
 * _normalized sentinel lets runSearch() skip already-processed records.
 */

// ---------------------------------------------------------------------------
// Type canonicalization
// ---------------------------------------------------------------------------

const TYPE_MAP = {
  "article":            "article",
  "journal-article":    "article",
  "article-journal":    "article",
  "review-article":     "article",
  "proceedings":        "article",
  "proceedings-article":"article",
  "posted-content":     "article",
  "peer-review":        "article",
  "report":             "report",
  "report-component":   "report",
  "book":               "book",
  "book-chapter":       "book-chapter",
  "book-section":       "book-chapter",
  "book-part":          "book-chapter",
  "inbook":             "book-chapter",
  "reference-entry":    "book-chapter",
  "edited-book":        "book",
  "monograph":          "book",
  "reference-book":     "book",
  "thesis":             "thesis",
  "dissertation":       "thesis",
  "dataset":            "dataset",
  "data":               "dataset",
  "genomic-data":       "dataset",
  "structured-data":    "dataset",
  "archaeological-data":"dataset",
  "image":              "image",
  "photograph":         "image",
  "graphic":            "image",
  "primary-source":     "primary-source",
  "manuscript":         "primary-source",
  "textual":            "misc",
  "misc":               "misc",
  "other":              "misc",
  "document":           "misc",
  "component":          "misc",
  "standard":           "misc",
};

const inferType = (raw) =>
  TYPE_MAP[String(raw || "").toLowerCase().trim()] || "misc";

// ---------------------------------------------------------------------------
// Author parsing
// Converts string[] (existing UnifiedResult shape) → Author[] for export fns.
// Does NOT replace authors: string[] on the NCR — that field stays for MLA/APA/UI.
//
// Input patterns handled:
//   "Smith, John"          → { family: "Smith", given: "John" }
//   "John Smith"           → { family: "Smith", given: "John" }
//   "Smith"                → { literal: "Smith", family: "Smith", given: "" }
//   "PANGAEA Consortium"   → { literal: "PANGAEA Consortium", family: ..., given: "" }
// ---------------------------------------------------------------------------

export const parseAuthors = (authors) => {
  if (!Array.isArray(authors)) return [];
  return authors.filter(Boolean).map((a) => {
    const str = String(a).trim();
    if (!str) return null;

    const commaIdx = str.indexOf(",");
    if (commaIdx > 0) {
      // "Last, First [Middle]" — already in citation-ready order
      return {
        family: str.slice(0, commaIdx).trim(),
        given:  str.slice(commaIdx + 1).trim(),
      };
    }

    const parts = str.split(/\s+/);
    if (parts.length >= 2) {
      // "First [Middle] Last"
      return {
        family: parts[parts.length - 1],
        given:  parts.slice(0, -1).join(" "),
      };
    }

    // Single token — institution, acronym, or anonymous
    return { literal: str, family: str, given: "" };
  }).filter(Boolean);
};

// ---------------------------------------------------------------------------
// Request-scoped dedup
// One Map per runSearch() call. Prevents duplicate results when two launchers
// target the same adapter, or when an API returns overlapping pages.
// Key: adapterKey + canonical identifier (DOI > URL > id > title).
// ---------------------------------------------------------------------------

export const createDedupMap = () => new Map();

const dedupKey = (adapterKey, r) => {
  const id = r.doi || r.url || r.id || r.title || "";
  return `${adapterKey}::${id}`;
};

// ---------------------------------------------------------------------------
// normalizeRecord — main export
// ---------------------------------------------------------------------------

/**
 * normalizeRecord(sanitized, adapterKey, dedupMap) → NCR | null
 *
 * @param {object} sanitized   - Output of AbstractAdapter.sanitize()
 * @param {string} adapterKey  - Stable adapter identifier (adapter.key or adapter.name)
 * @param {Map}    dedupMap    - Request-scoped Map from createDedupMap()
 * @returns {object|null}      - NCR, or null if duplicate within this request
 */
export const normalizeRecord = (sanitized, adapterKey, dedupMap) => {
  // Idempotency guard — already normalized records pass through unchanged
  if (sanitized._normalized) return sanitized;

  // Dedup within this request
  const key = dedupKey(adapterKey, sanitized);
  if (dedupMap.has(key)) return null;
  dedupMap.set(key, true);

  return {
    // All existing UnifiedResult fields — preserved, unchanged
    ...sanitized,

    // Canonical type string — downstream never reads r.type raw again
    _type: inferType(sanitized.type),

    // Structured authors for CSL-JSON / BibTeX / RIS export
    // Does NOT replace r.authors (string[]) — MLA/APA/UI still use that
    _authorsParsed: parseAuthors(sanitized.authors),

    // v.17 — Structured editors (same shape as _authorsParsed)
    _editorsParsed: parseAuthors(sanitized.editors),

    // Sentinel
    _normalized: true,
  };
};

// ---------------------------------------------------------------------------
// validateNCR — dev/test utility. Not called in the production hot path.
// ---------------------------------------------------------------------------

/**
 * validateNCR(ncr) → { valid: boolean, missing: string[] }
 * Use in tests or adapter development to confirm output shape.
 */
export const validateNCR = (ncr) => {
  const required = ["title", "url", "_type", "_authorsParsed", "_normalized"];
  const missing = required.filter((f) => ncr[f] == null || ncr[f] === "");
  return { valid: missing.length === 0, missing };
};

// ---------------------------------------------------------------------------
// PHASE 2 HOOK POINT (document here, implement in Phase 2)
//
// Before normalizeRecord() call in runSearch():
//   const cached = await kv.get(kvKey(adapterKey, query));
//   if (cached) return JSON.parse(cached);
//
// After results array is built in runSearch():
//   await kv.set(kvKey(adapterKey, query), JSON.stringify(results), { ex: 300 });
//
// Cache key: `opencite:${adapterKey}:${sha1(query.toLowerCase().trim())}`
// TTL: 300s (5 minutes) — balances freshness vs. upstream load.
// ---------------------------------------------------------------------------
