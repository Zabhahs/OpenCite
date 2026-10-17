// OpenCITE MCP — contract bridge (DRY-4)
//
// The MCP surface does NOT redefine the API. It imports the single contract
// SSOT (api/_shared/apiContract.js) and derives everything from it:
//   - the agent-facing tool input sets (curated, friendlier-named subsets)
//   - the request mapping back to the REST query params / JSON body
// Descriptions, enums, defaults, and limits all come from the contract — change
// them once there and every MCP/OpenAPI/function surface follows.
//
// v0.48: THREE tools (sprint_log_v0_48 D-10). Fewer, clearly-described tools are what a
// model picks reliably; `get_paper` folds the old resolve_ids + search_citations use-cases.

import {
  API_CONTRACT,
  ENDPOINTS,
  PARAMS,
  RESULT_FIELDS,
  COMPACT_FIELDS,
  EVIDENCE_FIELDS,
  RESPONSE_SHAPE,
  COVERAGE_BANDS,
  MAX_VERIFY_REFS,
  API_VERSION,
} from "./apiContract.js"; // vendored copy of api/_shared/apiContract.js (npm run sync-contract)

export { API_CONTRACT, ENDPOINTS, PARAMS, RESULT_FIELDS, COMPACT_FIELDS, EVIDENCE_FIELDS, RESPONSE_SHAPE, COVERAGE_BANDS, MAX_VERIFY_REFS, API_VERSION };

export const VERIFY_TOOL_NAME = "verify_citations";
export const SEARCH_TOOL_NAME = "search_papers";
export const GET_TOOL_NAME = "get_paper";

// Agent-facing search params, in display order. Each maps to a REST param in PARAMS.
// `q` is exposed under the friendlier name `query`; the rest keep their names. Operational
// params (sources, authors, cite, format) stay REST-only — the compact card already carries
// one formatted citation, so an agent never needs the flat-bibliography formats.
export const SEARCH_PARAM_MAP = {
  query: "q",
  limit: "limit",
  style: "style",
  detail: "detail",
  evidence: "evidence",
};

// The contract definition for each agent-facing search param, keyed by the agent-facing name.
export function searchParamDefs() {
  const defs = {};
  for (const [toolName, restName] of Object.entries(SEARCH_PARAM_MAP)) {
    const src = PARAMS[restName];
    if (!src) continue;
    defs[toolName] = { ...src };
  }
  return defs;
}

// Translate validated search tool arguments into REST query params (agent name → REST name).
export function toSearchQuery(args = {}) {
  const out = {};
  for (const [toolName, restName] of Object.entries(SEARCH_PARAM_MAP)) {
    const v = args[toolName];
    if (v === undefined || v === null || v === "") continue;
    out[restName] = v;
  }
  return out;
}

// get_paper args → /api/works query. Names are already aligned with the contract.
export function toWorksQuery(args = {}) {
  const out = {};
  for (const k of ["id", "include", "limit", "minCitations", "sort", "style", "detail", "evidence"]) {
    const v = args[k];
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}

// verify_citations args → /api/verify JSON body.
export function toVerifyBody(args = {}) {
  const body = { refs: Array.isArray(args.refs) ? args.refs : [] };
  for (const k of ["style", "detail", "evidence"]) if (args[k] !== undefined && args[k] !== null && args[k] !== "") body[k] = args[k];
  return body;
}
