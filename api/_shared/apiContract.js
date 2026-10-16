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
// v0.46: contract version, echoed as X-OpenCITE-API-Version and folded into the result cache key.
// Bump on any change to RESULT_FIELDS / RESPONSE_SHAPE. v1 = pre-v0.44 (score/lowConfidence);
// v2 = pass-through pipeline + origin-transparent `source`.
export const API_VERSION = "2";
// v0.46: fan-out bounds — `;` splits into one upstream call per term per source.
export const MAX_TERMS = 5;
export const MAX_QUERY_CHARS = 512;

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
    description: `Search query (max ${MAX_QUERY_CHARS} chars). Separate up to ${MAX_TERMS} keywords with ';'.`,
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
      "Advanced: comma-separated subset of source IDs (as returned in each result's `source`) " +
      "to restrict the search to. Unknown ids are ignored. Omit to search the full available library (recommended).",
  },
  authors: {
    type: "boolean",
    required: false,
    description: "1/true to include author-name matches in retrieval.",
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
      "(non-json returns a flat bibliography of the returned results).",
  },
};

// Response card — the shape of each item in `results` (format=json).
// v0.46 (contract v2): ORIGIN-TRANSPARENT. `source` names the upstream database that served the
// record. Provenance is what grounding buyers select for, and the MCP directories require the
// underlying APIs to be disclosed; the old origin-blind card hid the one attribute that made a
// citation checkable. `id` stays opaque (a stable hash, not an upstream id).
export const RESULT_FIELDS = {
  id: "Opaque, deterministic result identifier (prefix oc_). Not an upstream id.",
  source: "Upstream database that served this record (e.g. OPENALEX, CROSSREF, DOAJ, NCBI, EUROPEANA).",
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
  citations: "Formatted citations: { mla, apa, …extra requested formats }.",
};

// Top-level response envelope (format=json). Coverage is a bucketed band, never a raw
// percentage or a list of which sources failed.
export const RESPONSE_SHAPE = {
  query: "Echo of the q parameter.",
  terms: "Parsed keyword terms.",
  coverage: `Corpus-weighted coverage band for this request: one of ${COVERAGE_BANDS.join(", ")}.`,
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
  version: API_VERSION,
  description:
    "One deduped, citation-ready call across 250M+ open-access papers plus museum, library, " +
    "manuscript and Islamicate archives. Each result names its source database and carries " +
    "DOI/URL provenance and formatted citations (MLA, APA, BibTeX, RIS, CSL-JSON). Results keep " +
    "each source's native relevance order, interleaved scholarly-first. Billed 1 credit per call, " +
    "prorated by the coverage actually delivered; requires an x-api-key header.",
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
