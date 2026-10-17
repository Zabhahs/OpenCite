// OpenCITE MCP — schema generators (DRY-4)
//
// Pure generators from the one contract SSOT (contract.js → vendored apiContract.js):
//   - paramsToJsonSchema()  → JSON Schema object nodes for tool inputs (used by tools.js)
//   - openApiSpec()         → OpenAPI 3.1 doc for EVERY public REST endpoint (ENDPOINTS)
// Nothing re-describes a param. `public/openapi.json` is generated from openApiSpec() by
// scripts/gen-openapi.mjs — never hand-edited. SDK-free on purpose so api/ can import it.

import { pathToFileURL } from "node:url";
import {
  ENDPOINTS,
  RESULT_FIELDS,
  COMPACT_FIELDS,
  EVIDENCE_FIELDS,
  RESPONSE_SHAPE,
  COVERAGE_BANDS,
  API_VERSION,
} from "./contract.js";

// Map a contract param descriptor to a JSON Schema property.
export function paramToJsonSchemaProp(p) {
  const prop = { type: p.type, description: p.description };
  if (p.type === "array") prop.items = { type: "string" };
  if (p.enum) prop.enum = [...p.enum];
  if (p.type === "integer") {
    if (typeof p.min === "number") prop.minimum = p.min;
    if (typeof p.max === "number") prop.maximum = p.max;
  }
  if (p.default !== undefined) prop.default = p.default;
  return prop;
}

// Turn a {name: contractParam} map into a JSON Schema object node.
export function paramsToJsonSchema(defs) {
  const properties = {};
  const required = [];
  for (const [name, p] of Object.entries(defs)) {
    properties[name] = paramToJsonSchemaProp(p);
    if (p.required) required.push(name);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

// Describe a card from a field map (best-effort JSON types).
function cardSchema(fields) {
  const arrayFields = new Set(["authors", "editors", "keywords", "subjects"]);
  const boolFields = new Set(["isOA"]);
  const numFields = new Set(["citedBy"]);
  const objFields = new Set(["citations", "evidence"]);
  const properties = {};
  for (const [name, description] of Object.entries(fields)) {
    let node;
    if (arrayFields.has(name)) node = { type: "array", items: { type: "string" } };
    else if (boolFields.has(name)) node = { type: "boolean" };
    else if (numFields.has(name)) node = { type: ["number", "null"] };
    else if (name === "evidence") node = evidenceSchema();
    else if (objFields.has(name)) node = { type: "object", additionalProperties: { type: "string" } };
    else if (name === "citation") node = { type: ["string", "object"] };
    else node = { type: ["string", "null"] };
    node.description = description;
    properties[name] = node;
  }
  return { type: "object", properties };
}

function evidenceSchema() {
  const properties = {};
  for (const [name, description] of Object.entries(EVIDENCE_FIELDS)) {
    let node;
    if (name === "corrections" || name === "indexed_in" || name === "checked") node = { type: "array", items: name === "corrections" ? { type: "object" } : { type: "string" } };
    else if (name === "in_doaj") node = { type: ["boolean", "null"] };
    else if (name === "retraction" || name === "expression_of_concern") node = { type: ["object", "null"] };
    else node = { type: ["string", "null"] };
    node.description = description;
    properties[name] = node;
  }
  return { type: "object", properties };
}

// /api/search JSON envelope, from RESPONSE_SHAPE.
function searchResponseSchema() {
  const properties = {};
  for (const [name, description] of Object.entries(RESPONSE_SHAPE)) {
    if (name === "results") properties.results = { type: "array", items: { oneOf: [cardSchema(COMPACT_FIELDS), cardSchema(RESULT_FIELDS)] }, description };
    else if (name === "coverage") properties.coverage = { type: "string", enum: [...COVERAGE_BANDS], description };
    else if (name === "terms") properties.terms = { type: "array", items: { type: "string" }, description };
    else if (name === "sources") properties.sources = { type: "array", items: { type: "object" }, description };
    else if (name === "count" || name === "totalCandidates" || name === "tookMs") properties[name] = { type: "integer", description };
    else if (name === "meta") properties.meta = { type: "object", description };
    else properties[name] = { type: "string", description };
  }
  return { type: "object", properties };
}

// Generic envelope for the other endpoints: the contract's `response` map as object props.
function genericResponseSchema(ep) {
  const properties = {};
  for (const [name, description] of Object.entries(ep.response || {})) properties[name] = { description };
  return { type: "object", properties };
}

const ERRORS = {
  400: { description: "Invalid request (bad parameter)." },
  401: { description: "Missing or invalid credential — body carries { code: \"unauthorized\", signup_url }. Send x-api-key or Authorization: Bearer." },
  402: { description: "Insufficient credits — body carries { code: \"insufficient_credits\", balance, upgrade_url, packs }." },
  429: { description: "Rate limited (per key, and per IP before auth). Retry-After header + body.retry_after." },
};

// OpenAPI 3.1 for every public REST endpoint, derived from ENDPOINTS.
export function openApiSpec({ servers } = {}) {
  const paths = {};
  for (const [key, ep] of Object.entries(ENDPOINTS)) {
    const method = ep.method.toLowerCase();
    const op = {
      operationId: key === "search" ? "searchPapers" : key === "works" ? "getPaper" : key === "verify" ? "verifyCitations" : key,
      summary: ep.description.split(". ")[0] + ".",
      description: ep.description,
      security: key === "credits" ? [{ ApiKeyHeader: [] }, { BearerKey: [] }] : [{ ApiKeyHeader: [] }, { BearerKey: [] }],
      responses: {
        200: {
          description: ep.response?.results || ep.response?.work || ep.response?.credits || "OK",
          content: { "application/json": { schema: key === "search" ? searchResponseSchema() : genericResponseSchema(ep) } },
        },
        ...ERRORS,
      },
    };
    if (method === "post") {
      op.requestBody = {
        required: true,
        content: { "application/json": { schema: paramsToJsonSchema(ep.params) } },
      };
    } else {
      op.parameters = Object.entries(ep.params || {}).map(([name, p]) => ({
        name, in: "query", required: !!p.required, description: p.description, schema: paramToJsonSchemaProp(p),
      }));
    }
    paths[ep.endpoint] = { [method]: op };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "OpenCITE Scholarly Evidence API",
      version: String(API_VERSION),
      description:
        "Verifiable scholarly evidence for agents: search 250M+ open-access papers and heritage archives, " +
        "fetch any work by id, and verify references before citing them. Every card names its source and " +
        "carries integrity evidence (retracted / corrected / expression of concern); every response says " +
        "which sources answered. Docs: https://citation.today/docs/ · llms.txt: https://citation.today/llms.txt",
    },
    servers: servers || [{ url: "https://citation.today", description: "Production" }],
    paths,
    components: {
      securitySchemes: {
        ApiKeyHeader: { type: "apiKey", in: "header", name: "x-api-key" },
        BearerKey: { type: "http", scheme: "bearer", description: "The same oc_live_ API key as a Bearer token." },
      },
    },
  };
}

// `node src/schema.js` → print the OpenAPI doc.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(openApiSpec(), null, 2) + "\n");
}
