// OpenCITE — Public API contract SSOT
// One descriptor of /api/search's request + response shape. Consumed by:
//   - api/search.js          → the self-documenting `usage` response (no-q request)
//   - mcp/ (WS4, deferred)    → MCP tool input schema
//   - OpenAPI gen (WS4)       → operation params/response
// Define the contract ONCE here; every surface generates from it (DRY-4).
//
// Origin-blind by design: this contract never enumerates internal adapter IDs
// and the response never carries per-result source attribution.

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

// Output bibliography formats (json = structured cards; others = flat bibliography).
export const FORMATS = ["json", "mla", "apa", "bibtex", "ris", "csl-json"];
// Extra per-result citation formats addable on top of the always-present mla + apa.
export const CITE_FORMATS = ["bibtex", "ris", "csl-json"];
// Coverage bands that may appear in a response (see coverage.js — bucketed,
// corpus-weighted; a raw % / count / upstream name is NEVER emitted).
export const COVERAGE_BANDS = ["full", "near-full", "high", "partial", "limited"];

// Request parameters. `type`/`required`/`enum` are machine-readable so the MCP
// and OpenAPI generators (WS4) can build schemas without re-describing anything.
export const PARAMS = {
  q: {
    type: "string",
    required: true,
    description: "Search query. Separate multiple keywords with ';'.",
  },
  limit: {
    type: "integer",
    required: false,
    min: 1,
    max: MAX_LIMIT,
    default: DEFAULT_LIMIT,
    description: `Max merged results, 1..${MAX_LIMIT}.`,
  },
  sources: {
    type: "string",
    required: false,
    description:
      "Advanced: comma-separated subset of available source IDs to restrict the " +
      "search to. Omit to search the full available library (recommended).",
  },
  authors: {
    type: "boolean",
    required: false,
    description: "1/true to include author-name matches in retrieval.",
  },
  mailto: {
    type: "string",
    required: false,
    description: "Contact email for the polite request pool.",
  },
  cite: {
    type: "string",
    required: false,
    enum: CITE_FORMATS,
    description: `Extra citation formats per result, comma-separated: ${CITE_FORMATS.join(", ")}.`,
  },
  format: {
    type: "string",
    required: false,
    enum: FORMATS,
    default: "json",
    description:
      "json (default, structured cards) | mla | apa | bibtex | ris | csl-json " +
      "(non-json returns a flat bibliography of the ranked results).",
  },
};

// Origin-blind response card — the shape of each item in `results` (format=json).
// Deliberately omits `source`: the caller gets verifiable provenance (doi, url,
// journal, publisher, authors, citations) WITHOUT learning which upstream served it.
export const RESULT_FIELDS = {
  id: "Opaque, deterministic result identifier (prefix oc_). Not an upstream id.",
  title: "Work title.",
  authors: "Author display names.",
  year: "Publication year.",
  journal: "Containing journal / venue / collection title.",
  publisher: "Publisher.",
  volume: "Volume.",
  issue: "Issue.",
  pages: "Page range.",
  doi: "DOI, when known.",
  url: "Canonical URL to the work.",
  abstract: "Abstract / description, when available.",
  isOA: "Whether the work is open access.",
  type: "Work type (article, book-chapter, dataset, …).",
  editors: "Editors, for edited volumes.",
  keywords: "Author/publisher keywords.",
  subjects: "Controlled-vocabulary subject terms.",
  language: "ISO-639 language code, when known.",
  citedBy: "Citation count, when the work carries one (else null).",
  score: "Relevance score (BM25F) for this query.",
  lowConfidence: "True when no genuine match existed and this is a best-guess.",
  citations: "Formatted citations: { mla, apa, …extra requested formats }.",
};

// Top-level response envelope (format=json). Note: no per-result source attribution
// and no `sources` meta block — only a bucketed `coverage` band.
export const RESPONSE_SHAPE = {
  query: "Echo of the q parameter.",
  terms: "Parsed keyword terms.",
  coverage: `Corpus-weighted coverage band for this request: one of ${COVERAGE_BANDS.join(", ")}.`,
  lowConfidence: "True when results are best-guesses (no genuine match anywhere).",
  count: "Number of results returned.",
  totalCandidates: "Total deduped candidates considered before the limit.",
  tookMs: "Server processing time in milliseconds.",
  results: "Array of origin-blind result cards (see fields below).",
  meta: "Billing metadata: { creditsCharged, balance } — credits spent on this call " +
    "(coverage-prorated; 0 for unmetered tiers) and the caller's remaining balance.",
};

export const API_CONTRACT = {
  endpoint: "/api/search",
  method: "GET",
  description:
    "One verifiable, deduped, ranked, citation-ready call across many open-access " +
    "scholarly sources. Results are origin-blind: provenance fields are returned, " +
    "but the serving upstream is not disclosed.",
  params: PARAMS,
  response: { shape: RESPONSE_SHAPE, resultFields: RESULT_FIELDS, coverageBands: COVERAGE_BANDS },
};

// Build the self-documenting `usage` payload returned for a no-query request.
// Flat param summary mirrors the prior USAGE block, generated from the contract.
export function buildUsage() {
  const params = Object.fromEntries(
    Object.entries(PARAMS).map(([name, p]) => {
      const tag = p.required ? "required" : "optional";
      return [name, `${tag} — ${p.description}`];
    })
  );
  return {
    endpoint: API_CONTRACT.endpoint,
    method: API_CONTRACT.method,
    description: API_CONTRACT.description,
    params,
    example: "/api/search?q=machine%20learning&limit=10&cite=bibtex",
  };
}
