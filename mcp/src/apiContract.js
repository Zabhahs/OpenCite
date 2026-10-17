// GENERATED COPY — do not edit. Source of truth: api/_shared/apiContract.js
// Regenerate with `npm run sync-contract` (runs automatically on prepublishOnly).
// OpenCITE — Public API contract SSOT
// One descriptor of every public endpoint's request + response shape. Consumed by:
//   - api/search.js, api/works/[op].js → the self-documenting `usage` response + param validation
//   - mcp/src/tools.js                 → the three MCP tool definitions
//   - mcp/src/schema.js                → OpenAPI 3.1 (public/openapi.json is generated from it)
// Define the contract ONCE here; every surface generates from it (DRY-4).
//
// v0.48 (contract v3): the "verifiable evidence" contract. Every card can carry an `evidence`
// block (retraction / correction / expression-of-concern status, work type, OA status, DOAJ
// listing, licence), every response names which sources answered (`sources[]`), and the
// default card is COMPACT (agents pay for context; `detail=full` restores the v2 card).

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
// Contract version, echoed as X-OpenCITE-API-Version and folded into the result cache key.
// Bump on any change to RESULT_FIELDS / RESPONSE_SHAPE. v1 = pre-v0.44 (score/lowConfidence);
// v2 = pass-through pipeline + origin-transparent `source`; v3 = evidence + sources + compact cards.
export const API_VERSION = "3";
// v0.46: fan-out bounds — `;` splits into one upstream call per term per source.
export const MAX_TERMS = 5;
export const MAX_QUERY_CHARS = 512;
// v0.48: verification batch bound (one Crossref/OpenAlex lookup per reference).
export const MAX_VERIFY_REFS = 50;

// Output bibliography formats (json = structured cards; others = flat bibliography).
export const FORMATS = ["json", "mla", "apa", "bibtex", "ris", "csl-json"];
// Extra per-result citation formats addable on top of the always-present mla + apa (detail=full).
export const CITE_FORMATS = ["bibtex", "ris", "csl-json"];
// v0.48: the ONE citation style rendered on a compact card (`citation`), and on verify results.
export const CITATION_STYLES = ["apa", "mla", "bibtex", "ris", "csl-json"];
export const DEFAULT_STYLE = "apa";
// Card detail levels (v0.48). compact = agent-sized card; full = the v2 card + evidence.
export const DETAIL_LEVELS = ["compact", "full"];
export const DEFAULT_DETAIL = "compact";
// Coverage bands that may appear in a response (see coverage.js — bucketed,
// corpus-weighted; a raw % / count is never emitted).
export const COVERAGE_BANDS = ["full", "near-full", "high", "partial", "limited"];
// v0.48: per-source outcome for THIS request (`sources[]`). "empty" = answered, no match.
export const SOURCE_STATUSES = ["ok", "empty", "failed", "timeout", "circuit_open"];
// v0.48: evidence status per card. "unknown" is always explicit — never omitted.
export const EVIDENCE_STATUSES = ["ok", "retracted", "corrected", "expression_of_concern", "unknown"];
// v0.48: verification verdict per reference.
export const VERDICTS = ["verified", "mismatch", "not_found", "ambiguous"];

// Request parameters. `type`/`required`/`enum` are machine-readable so the MCP
// and OpenAPI generators can build schemas without re-describing anything.
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
  detail: {
    type: "string",
    required: false,
    enum: DETAIL_LEVELS,
    default: DEFAULT_DETAIL,
    description:
      "compact (default): agent-sized cards — title, up to 3 authors, year, venue, doi, url, evidence, one " +
      "formatted citation. full: every field (abstract, keywords, all authors, every citation format).",
  },
  style: {
    type: "string",
    required: false,
    enum: CITATION_STYLES,
    default: DEFAULT_STYLE,
    description: `Citation style for the compact card's \`citation\`: ${CITATION_STYLES.join(", ")}.`,
  },
  evidence: {
    type: "boolean",
    required: false,
    default: true,
    description: "0/false to skip the retraction/integrity lookup (evidence block omitted). On by default.",
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
    description: `detail=full only: extra citation formats per result, comma-separated: ${CITE_FORMATS.join(", ")}.`,
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

// v0.48: the evidence block (G4 — integrity flags). Facts with sources, never judgements.
export const EVIDENCE_FIELDS = {
  status: `One of ${EVIDENCE_STATUSES.join(", ")}. "unknown" = no DOI, or both lookups failed.`,
  retraction: "Retraction notice { notice_doi, date, source } when retracted, else null. source = retraction-watch | publisher | openalex.",
  corrections: "Correction / erratum notices [{ notice_doi, date, source }]. Empty when none.",
  expression_of_concern: "Expression-of-concern notice { notice_doi, date, source } or null.",
  work_type: "Work type from the registering agency (journal-article, preprint, book-chapter, dataset, …).",
  oa_status: "Open-access status: gold | green | hybrid | bronze | diamond | closed, or null.",
  in_doaj: "Whether the venue is listed in the Directory of Open Access Journals (null when unknown).",
  indexed_in: "Curated index lists the venue appears in (e.g. medline, cwts-core). Empty when unknown.",
  license: "Content licence of the primary location when stated (e.g. cc-by), else null.",
  checked: "Which evidence sources answered: subset of [crossref, openalex].",
};

// Compact card (v0.48 default). The agent-sized projection of the full card.
export const COMPACT_FIELDS = {
  id: "Opaque, deterministic result identifier (prefix oc_). Not an upstream id.",
  source: "Upstream database that served this record (e.g. OPENALEX, CROSSREF, DOAJ, NCBI, EUROPEANA).",
  doi: "DOI, when known.",
  title: "Work title.",
  authors: "Up to three author display names, then \"et al.\".",
  year: "Publication year.",
  venue: "Containing journal / venue / collection title.",
  url: "Canonical URL to the work.",
  type: "Work type (article, book-chapter, dataset, …).",
  citedBy: "Citation count, when the work carries one (else null).",
  evidence: "Integrity flags (see evidence fields). Omitted when evidence=0.",
  citation: "The work formatted in the requested `style` (string; an object for csl-json).",
};

// Full card (detail=full) — the v2 card plus `evidence`.
// v0.46 (contract v2): ORIGIN-TRANSPARENT. `source` names the upstream database that served the
// record. Provenance is what grounding buyers select for, and the MCP directories require the
// underlying APIs to be disclosed. `id` stays opaque (a stable hash, not an upstream id).
export const RESULT_FIELDS = {
  id: COMPACT_FIELDS.id,
  source: COMPACT_FIELDS.source,
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
  evidence: COMPACT_FIELDS.evidence,
  citations: "Formatted citations: { mla, apa, …extra requested formats }.",
};

// Per-source outcome row (v0.48, G3 — completeness). No latencies, no upstream URLs.
export const SOURCE_ROW_FIELDS = {
  source: "Source id (as in each card's `source`); EVIDENCE_CROSSREF / EVIDENCE_OPENALEX for the integrity lookups; VERIFY_LOOKUPS for /api/verify's resolution legs.",
  status: `One of ${SOURCE_STATUSES.join(", ")}.`,
  returned: "Records this source contributed before dedup (0 when it did not answer).",
};

// Billing + provenance metadata on every JSON response.
export const META_FIELDS = {
  requestId: "Server-issued id for this answer. Quote it in support requests; it is journaled.",
  retrieved_at: "ISO-8601 time the answer was assembled (cache hits keep the original time).",
  creditsCharged: "Credits spent on this call (coverage-prorated; 0 for unmetered tiers).",
  balance: "The caller's remaining balance (omitted when unavailable).",
};

// Top-level response envelope for /api/search (format=json).
export const RESPONSE_SHAPE = {
  query: "Echo of the q parameter.",
  terms: "Parsed keyword terms.",
  coverage: `Corpus-weighted coverage band for this request: one of ${COVERAGE_BANDS.join(", ")}.`,
  sources: "Per-source outcome for this request (see source row fields) — which sources answered, failed or timed out.",
  count: "Number of results returned.",
  totalCandidates: "Total deduped candidates considered before the limit.",
  tookMs: "Server processing time in milliseconds.",
  results: "Array of result cards (compact by default; see card fields).",
  meta: "Billing + provenance metadata (see meta fields).",
};

export const API_CONTRACT = {
  endpoint: "/api/search",
  method: "GET",
  version: API_VERSION,
  description:
    "One deduped, citation-ready call across 250M+ open-access papers plus museum, library, " +
    "manuscript and Islamicate archives. Each result names its source database, carries DOI/URL " +
    "provenance, an integrity check (retracted / corrected / expression of concern, work type, OA " +
    "status) and a formatted citation. The response says which sources answered. Billed 1 credit " +
    "per call, prorated by the coverage actually delivered; requires an API key.",
  params: PARAMS,
  response: { shape: RESPONSE_SHAPE, resultFields: RESULT_FIELDS, compactFields: COMPACT_FIELDS, evidenceFields: EVIDENCE_FIELDS, coverageBands: COVERAGE_BANDS },
};

// ── v0.48: the other public endpoints, described once so OpenAPI + MCP tools derive from here ──
// `units` is the billing weight relative to one search call (plans.js ENDPOINT_UNITS is the
// authoritative number; this is the human-readable statement of the same policy).

const ID_PARAM = {
  type: "string",
  required: true,
  description: "A DOI (10.…), PMID (digits), PMCID (PMC…), or OpenAlex work id (W…). DOI URLs are accepted.",
};

export const ENDPOINTS = {
  search: API_CONTRACT,
  works: {
    endpoint: "/api/works",
    method: "GET",
    description:
      "Fetch one work by any identifier: its canonical record (compact or full card), every known " +
      "identifier (doi, pmid, pmcid, openalex), its integrity evidence, and optionally the works that " +
      "cite it or its reference list. 0.1 credit for the record alone; 1 credit when a citation " +
      "direction is included.",
    params: {
      id: ID_PARAM,
      include: {
        type: "string",
        required: false,
        enum: ["cited-by", "refs"],
        description: "Also return the citation graph in one direction: cited-by (works citing it) or refs (its bibliography).",
      },
      limit: { type: "integer", required: false, min: 1, max: 200, default: 25, description: "Max graph edges when include is set (1–200)." },
      minCitations: { type: "integer", required: false, description: "cited-by only: drop citing works below this cited-by count." },
      sort: { type: "string", required: false, enum: ["impact", "year"], default: "impact", description: "Graph order: impact (cited-by count) or year (newest first)." },
      detail: PARAMS.detail,
      style: PARAMS.style,
      evidence: PARAMS.evidence,
    },
    response: {
      work: "The resolved work card (null when the id is unknown to every source).",
      ids: "{ doi, pmid, pmcid, openalex } — every identifier found for the work (null where unknown).",
      graph: "When include is set: { direction, count, results[] } of cards.",
      coverage: "Band for the lookups made (limited = every upstream failed → free).",
      sources: RESPONSE_SHAPE.sources,
      meta: RESPONSE_SHAPE.meta,
    },
  },
  citations: {
    endpoint: "/api/citations",
    method: "GET",
    description:
      "Walk a work's citation network: works that cite it (dir=cited-by) or its reference list (dir=refs). " +
      "Cards carry evidence flags. 1 credit per call; free when every upstream failed.",
    params: {
      id: ID_PARAM,
      dir: { type: "string", required: false, enum: ["cited-by", "refs"], default: "cited-by", description: "cited-by (default) or refs." },
      limit: { type: "integer", required: false, min: 1, max: 200, default: 25, description: "Max edges, 1–200." },
      minCitations: { type: "integer", required: false, description: "cited-by only: drop citing works below this count." },
      sort: { type: "string", required: false, enum: ["impact", "year"], default: "impact", description: "impact (default) or year." },
      detail: PARAMS.detail,
      style: PARAMS.style,
      evidence: PARAMS.evidence,
    },
    response: { id: "Echo of id.", direction: "cited-by | refs.", count: "Cards returned.", coverage: "Band for the lookups made.", sources: RESPONSE_SHAPE.sources, results: "Cards.", meta: RESPONSE_SHAPE.meta },
  },
  ids: {
    endpoint: "/api/ids",
    method: "GET",
    description: "Crosswalk DOI ↔ PMID ↔ PMCID for up to 200 identifiers in one call. 0.1 credit per call; free when the resolver was unreachable.",
    params: {
      ids: { type: "string", required: true, description: "Comma-separated DOIs, PMIDs and/or PMCIDs (any mix, max 200)." },
    },
    response: { count: "Resolved inputs.", requested: "Inputs received.", results: "{ [inputId]: { doi, pmid, pmcid } }", coverage: "Band for the lookups made.", meta: RESPONSE_SHAPE.meta },
  },
  verify: {
    endpoint: "/api/verify",
    method: "POST",
    description:
      "Verify a list of references before you cite them. For each reference (a DOI, PMID, PMCID, or a " +
      "free-text citation string) returns a verdict — verified, mismatch (the identifier is real but the " +
      "supplied title/authors/year disagree), not_found (likely fabricated), ambiguous — plus the canonical " +
      "record, its integrity evidence (retracted / corrected) and a corrected citation in the requested " +
      `style. Up to ${MAX_VERIFY_REFS} references per call; 0.1 credit per reference.`,
    params: {
      refs: { type: "array", required: true, description: `References to check (max ${MAX_VERIFY_REFS}): DOIs, PMIDs, PMCIDs, DOI URLs, or free-text citation strings.` },
      style: PARAMS.style,
      detail: PARAMS.detail,
    },
    response: {
      results: "[{ input, verdict, confidence, mismatched_fields[], record, evidence, citation, candidates[] }] in input order.",
      summary: "{ verified, mismatch, not_found, ambiguous, retracted } counts.",
      coverage: "Band for the lookups made (limited = every upstream failed → free).",
      sources: RESPONSE_SHAPE.sources,
      meta: RESPONSE_SHAPE.meta,
    },
  },
  credits: {
    endpoint: "/api/credits",
    method: "GET",
    description: "The caller's balance and plan. Free, unmetered. Accepts an API key or a browser session.",
    params: {},
    response: { credits: "Remaining credits (null + unlimited:true for unmetered tiers).", tier: "Plan id.", unlimited: "true for unmetered tiers." },
  },
};

// Build the self-documenting `usage` payload returned for a no-query request.
// Flat param summary mirrors the prior USAGE block, generated from the contract.
export function buildUsage(key = "search") {
  const ep = ENDPOINTS[key] || API_CONTRACT;
  const params = Object.fromEntries(
    Object.entries(ep.params || {}).map(([name, p]) => {
      const tag = p.required ? "required" : "optional";
      return [name, `${tag} — ${p.description}`];
    })
  );
  return {
    endpoint: ep.endpoint,
    method: ep.method,
    description: ep.description,
    params,
    example: key === "search" ? "/api/search?q=machine%20learning&limit=10&style=bibtex" : undefined,
    docs: "https://citation.today/docs/",
  };
}
