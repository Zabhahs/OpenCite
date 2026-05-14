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
  // Journal / article
  "article":                "article",
  "journal-article":        "article",
  "article-journal":        "article",
  "review-article":         "article",
  "proceedings":            "article",
  "proceedings-article":    "article",
  "posted-content":         "article",
  "peer-review":            "article",
  // Books
  "book":                   "book",
  "edited-book":            "book",
  "monograph":              "book",
  "reference-book":         "book",
  "book-chapter":           "book-chapter",
  "book-section":           "book-chapter",
  "book-part":              "book-chapter",
  "inbook":                 "book-chapter",
  "reference-entry":        "book-chapter",
  // Reports / grey literature
  "report":                 "report",
  "report-component":       "report",
  // Theses
  "thesis":                 "thesis",
  "dissertation":           "thesis",
  // Datasets
  "dataset":                "dataset",
  "data":                   "dataset",
  "genomic-data":           "dataset",
  "structured-data":        "dataset",
  "archaeological-data":    "dataset",
  // Images / visual
  "image":                  "image",
  "photograph":             "image",
  "graphic":                "image",
  "visual":                 "image",
  // Primary sources / archival
  "primary-source":         "primary-source",
  "manuscript":             "primary-source",
  "textual":                "primary-source",
  // v.18 — heritage library types emitted by CA, Delpher, NLS, ONB, BnF
  "newspaper":              "primary-source",
  "Newspaper":              "primary-source",
  "newspaper page":         "primary-source",
  "magazine":               "primary-source",
  "periodical":             "primary-source",
  "serial":                 "primary-source",
  "map":                    "primary-source",
  "maps":                   "primary-source",
  "photograph":             "primary-source",
  "photographs":            "primary-source",
  "still image":            "image",
  "moving image":           "misc",
  "sound":                  "misc",
  "audio":                  "misc",
  "ephemera":               "primary-source",
  "pamphlet":               "primary-source",
  "letter":                 "primary-source",
  "correspondence":         "primary-source",
  "text":                   "primary-source",
  "Text":                   "primary-source",
  // Misc / fallback
  "misc":                   "misc",
  "other":                  "misc",
  "document":               "misc",
  "component":              "misc",
  "standard":               "misc",
};

const inferType = (raw) =>
  TYPE_MAP[String(raw || "").trim()] || "misc";

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
      return {
        family: str.slice(0, commaIdx).trim(),
        given:  str.slice(commaIdx + 1).trim(),
      };
    }

    const parts = str.split(/\s+/);
    if (parts.length >= 2) {
      return {
        family: parts[parts.length - 1],
        given:  parts.slice(0, -1).join(" "),
      };
    }

    return { literal: str, family: str, given: "" };
  }).filter(Boolean);
};

// ---------------------------------------------------------------------------
// Request-scoped dedup
// ---------------------------------------------------------------------------

export const createDedupMap = () => new Map();

const dedupKey = (adapterKey, r) => {
  const id = r.doi || r.url || r.id || r.title || "";
  return `${adapterKey}::${id}`;
};

// ---------------------------------------------------------------------------
// normalizeRecord — main export
// ---------------------------------------------------------------------------

export const normalizeRecord = (sanitized, adapterKey, dedupMap) => {
  if (sanitized._normalized) return sanitized;

  const key = dedupKey(adapterKey, sanitized);
  if (dedupMap.has(key)) return null;
  dedupMap.set(key, true);

  return {
    ...sanitized,
    _type:          inferType(sanitized.type),
    _authorsParsed: parseAuthors(sanitized.authors),
    _editorsParsed: parseAuthors(sanitized.editors),
    _normalized:    true,
  };
};

// ---------------------------------------------------------------------------
// validateNCR — dev/test utility. Not called in the production hot path.
// ---------------------------------------------------------------------------

export const validateNCR = (ncr) => {
  const required = ["title", "url", "_type", "_authorsParsed", "_normalized"];
  const missing = required.filter((f) => ncr[f] == null || ncr[f] === "");
  return { valid: missing.length === 0, missing };
};

// ---------------------------------------------------------------------------
// PHASE 2 HOOK POINT
//
// Before normalizeRecord() call in runSearch():
//   const cached = await kv.get(kvKey(adapterKey, query));
//   if (cached) return JSON.parse(cached);
//
// After results array is built in runSearch():
//   await kv.set(kvKey(adapterKey, query), JSON.stringify(results), { ex: 300 });
//
// Cache key: `opencite:${adapterKey}:${sha1(query.toLowerCase().trim())}`
// TTL: 300s (5 minutes)
// ---------------------------------------------------------------------------
