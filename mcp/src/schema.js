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
