// OpenCITE MCP — contract bridge (DRY-4)
//
// The MCP surface does NOT redefine the API. It imports the single contract
// SSOT (api/_shared/apiContract.js) and derives everything from it:
//   - the agent-facing tool input set (a curated, friendlier-named subset)
//   - the request mapping back to the REST query params
// Descriptions, enums, defaults, and limits all come from the contract — change
// them once there and every MCP/OpenAPI/function surface follows.

import {
  API_CONTRACT,
  PARAMS,
  RESULT_FIELDS,
  RESPONSE_SHAPE,
  COVERAGE_BANDS,
} from "../../api/_shared/apiContract.js";

export { API_CONTRACT, PARAMS, RESULT_FIELDS, RESPONSE_SHAPE, COVERAGE_BANDS };

export const TOOL_NAME = "search_scholarly_sources";

// Agent-facing params, in display order. Each maps to a REST param in PARAMS.
// `q` is exposed under the friendlier name `query`; the rest keep their names.
// We surface the high-value subset an agent needs (query, limit, format) and
// leave operational/advanced params (sources, mailto) to direct REST callers —
// `sources` in particular is de-emphasized by the origin-blind positioning.
export const TOOL_PARAM_MAP = {
  query: "q",
  limit: "limit",
  format: "format",
};

// The contract definition for each agent-facing param, pulled from the SSOT.
// Returns objects shaped like PARAMS entries, keyed by the agent-facing name.
export function toolParamDefs() {
  const defs = {};
  for (const [toolName, restName] of Object.entries(TOOL_PARAM_MAP)) {
    const src = PARAMS[restName];
    if (!src) continue;
    defs[toolName] = { ...src };
  }
  // The tool's `query` description should read naturally as a tool arg.
  if (defs.query) defs.query.description = PARAMS.q.description;
  return defs;
}

// Translate validated tool arguments into REST query params (agent name -> REST name).
export function toRestQuery(args = {}) {
  const out = {};
  for (const [toolName, restName] of Object.entries(TOOL_PARAM_MAP)) {
    const v = args[toolName];
    if (v === undefined || v === null || v === "") continue;
    out[restName] = v;
  }
  return out;
}
