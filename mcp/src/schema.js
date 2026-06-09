// OpenCITE MCP — schema generators (DRY-4)
//
// Every schema the world sees is generated here from the one contract SSOT:
//   - mcpInputSchema()      → MCP tool input JSON Schema (agent-facing params)
//   - functionSchemas()     → OpenAI + Anthropic function/tool definitions
//   - openApiSpec()         → OpenAPI 3.1 doc for the raw REST endpoint
// Nothing re-describes a param. Run `node src/schema.js` to print all three.

import {
  API_CONTRACT,
  PARAMS,
  RESULT_FIELDS,
  RESPONSE_SHAPE,
  COVERAGE_BANDS,
  TOOL_NAME,
  CITATIONS_TOOL_NAME,
  IDS_TOOL_NAME,
  toolParamDefs,
} from "./contract.js";

// Map a contract param descriptor to a JSON Schema property.
function paramToJsonSchemaProp(p) {
  const prop = { type: p.type, description: p.description };
  if (p.enum) prop.enum = [...p.enum];
  if (p.type === "integer") {
    if (typeof p.min === "number") prop.minimum = p.min;
    if (typeof p.max === "number") prop.maximum = p.max;
  }
  if (p.default !== undefined) prop.default = p.default;
  return prop;
}

// Turn a {name: contractParam} map into a JSON Schema object node.
function paramsToJsonSchema(defs) {
  const properties = {};
  const required = [];
  for (const [name, p] of Object.entries(defs)) {
    properties[name] = paramToJsonSchemaProp(p);
    if (p.required) required.push(name);
  }
  const schema = {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
  return schema;
}

// MCP tool input schema — agent-facing (curated, q→query) param set.
export function mcpInputSchema() {
  return paramsToJsonSchema(toolParamDefs());
}

export const TOOL_DESCRIPTION = API_CONTRACT.description;

// MCP tool descriptor (name + description + inputSchema) — what the server registers.
export function mcpToolDefinition() {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    inputSchema: mcpInputSchema(),
  };
}

// OpenAI function-calling + Anthropic tool-use definitions — same input schema,
// the two providers just nest it under different keys.
export function functionSchemas() {
  const parameters = mcpInputSchema();
  return {
    openai: {
      type: "function",
      function: {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        parameters,
      },
    },
    anthropic: {
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      input_schema: parameters,
    },
  };
}

// Describe the origin-blind result card from RESULT_FIELDS (best-effort JSON types).
function resultCardSchema() {
  const arrayFields = new Set(["authors", "editors", "keywords", "subjects"]);
  const boolFields = new Set(["isOA", "lowConfidence"]);
  const numFields = new Set(["citedBy", "score"]);
  const objFields = new Set(["citations"]);
  const properties = {};
  for (const [name, description] of Object.entries(RESULT_FIELDS)) {
    let node;
    if (arrayFields.has(name)) node = { type: "array", items: { type: "string" } };
    else if (boolFields.has(name)) node = { type: "boolean" };
    else if (numFields.has(name)) node = { type: ["number", "null"] };
    else if (objFields.has(name)) node = { type: "object", additionalProperties: { type: "string" } };
    else node = { type: "string" };
    node.description = description;
    properties[name] = node;
  }
  return { type: "object", properties };
}

// Top-level JSON response envelope schema, from RESPONSE_SHAPE.
function responseSchema() {
  const properties = {};
  for (const [name, description] of Object.entries(RESPONSE_SHAPE)) {
    if (name === "results") {
      properties.results = { type: "array", items: resultCardSchema(), description };
    } else if (name === "coverage") {
      properties.coverage = { type: "string", enum: [...COVERAGE_BANDS], description };
    } else if (name === "terms") {
      properties.terms = { type: "array", items: { type: "string" }, description };
    } else if (name === "lowConfidence") {
      properties.lowConfidence = { type: "boolean", description };
    } else if (name === "count" || name === "totalCandidates" || name === "tookMs") {
      properties[name] = { type: "integer", description };
    } else {
      properties[name] = { type: "string", description };
    }
  }
  return { type: "object", properties };
}

// ─── search_citations tool ────────────────────────────────────────────────────
// Hand-written schema: /api/citations is NOT in the apiContract SSOT.
export function citationsToolDefinition() {
  return {
    name: CITATIONS_TOOL_NAME,
    description:
      "Walk a paper's citation network in one call. " +
      "Given a DOI or OpenAlex work ID, returns origin-blind result cards for " +
      "works that cite it (cited-by) or for its own bibliography (refs). " +
      "Ideal for discovering impact, related work, or the full reference list " +
      "of a specific paper without any extra round-trips. " +
      "Costs 1 credit per call (admin unmetered).",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "A DOI (e.g. 10.1038/s41586-021-03819-2) or an OpenAlex work ID " +
            "(e.g. W2741809809). Required.",
        },
        direction: {
          type: "string",
          enum: ["cited-by", "refs"],
          default: "cited-by",
          description:
            '"cited-by" (default) returns works that cite this paper; ' +
            '"refs" returns this paper\'s own reference list.',
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          default: 25,
          description: "Maximum number of edges to return (1–200, default 25).",
        },
        minCitations: {
          type: "integer",
          description:
            "Cited-by only: drop citing works whose own cited-by count is below " +
            "this threshold. Useful to surface high-impact citers only.",
        },
        sort: {
          type: "string",
          enum: ["impact", "year"],
          default: "impact",
          description:
            '"impact" (default) sorts by cited-by count descending; ' +
            '"year" sorts by publication year descending.',
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  };
}

// ─── resolve_ids tool ─────────────────────────────────────────────────────────
// Hand-written schema: /api/ids is NOT in the apiContract SSOT.
export function idsToolDefinition() {
  return {
    name: IDS_TOOL_NAME,
    description:
      "Crosswalk scholarly identifiers (DOI ↔ PMID ↔ PMCID) in one batched call. " +
      "Accepts any mix of identifier types (up to 200 total) and returns a " +
      "lookup map of all resolved equivalents per input ID. " +
      "Essential for stitching together citation records that only carry one " +
      "identifier type, or for validating/enriching a reference list before display. " +
      "Costs 1 credit per call (admin unmetered).",
    inputSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
          description:
            "DOIs, PMIDs, and/or PMCIDs to cross-resolve; any mix, max 200. " +
            "Example: [\"10.1038/nbt.3642\", \"27571352\", \"PMC5034905\"].",
        },
      },
      required: ["ids"],
      additionalProperties: false,
    },
  };
}

// OpenAPI 3.1 spec for the REST endpoint itself (documents the raw `q`-named params).
export function openApiSpec({ servers } = {}) {
  const parameters = Object.entries(PARAMS).map(([name, p]) => ({
    name,
    in: "query",
    required: !!p.required,
    description: p.description,
    schema: paramToJsonSchemaProp(p),
  }));
  return {
    openapi: "3.1.0",
    info: {
      title: "OpenCITE Scholarly Search API",
      version: "1.0.0",
      description: API_CONTRACT.description,
    },
    servers: servers || [
      { url: "https://citation.today", description: "Production" },
    ],
    paths: {
      [API_CONTRACT.endpoint]: {
        get: {
          operationId: "searchScholarlySources",
          summary: "Search open-access scholarly sources (origin-blind).",
          description: API_CONTRACT.description,
          parameters,
          security: [{ ApiKeyHeader: [] }, {}],
          responses: {
            200: {
              description: "Ranked, deduped, origin-blind result cards.",
              content: { "application/json": { schema: responseSchema() } },
            },
            400: { description: "Invalid request (e.g. no valid sources selected)." },
            401: { description: "Invalid or missing API key (when key auth is enabled)." },
            405: { description: "Method not allowed — use GET." },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyHeader: { type: "apiKey", in: "header", name: "x-api-key" },
      },
    },
  };
}

// `node src/schema.js` → print all generated schemas (handy for docs/registries).
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = {
    mcpTool: mcpToolDefinition(),
    functionSchemas: functionSchemas(),
    openApi: openApiSpec(),
  };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}
