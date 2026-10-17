// OpenCITE MCP — tool registry SSOT (v0.48)
//
// The THREE tools every OpenCITE agent surface exposes (stdio MCP today; the remote MCP and any
// A2A skill derive from the same table). Each entry owns:
//   name / title / description — the discovery mechanism: a model picks a tool by its description,
//                                so each one says WHEN to call it, not just what it does
//   inputSchema()              — generated from the contract (schema.js), never hand-typed
//   toRequest(args)            — the REST call: { method, path, query?, body? }
//   annotations                — MCP tool hints (read-only, open-world) the directories require
// `toToolResult` is the ONE shaper that turns an HTTP response into an MCP result: payload block +
// billing/trust trailer on success; a structured, actionable error (where to pay, when to retry)
// on failure. SDK-free on purpose so api/ can import it.
//
// Run `node src/tools.js` to print the tool definitions, OpenAI/Anthropic function schemas and
// the OpenAPI doc.

import { pathToFileURL } from "node:url";
import { paramsToJsonSchema, openApiSpec } from "./schema.js";
import {
  ENDPOINTS,
  MAX_VERIFY_REFS,
  VERIFY_TOOL_NAME,
  SEARCH_TOOL_NAME,
  GET_TOOL_NAME,
  searchParamDefs,
  toSearchQuery,
  toWorksQuery,
  toVerifyBody,
} from "./contract.js";

const ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export const TOOLS = [
  {
    name: VERIFY_TOOL_NAME,
    title: "Verify citations",
    description:
      "Use BEFORE outputting any reference list, bibliography or in-text citation. Checks each reference " +
      "(DOI, PMID, PMCID, DOI URL, or a free-text citation string) against the scholarly record and returns, " +
      "per reference: a verdict — verified · mismatch (the identifier is real but the title/authors/year you " +
      "supplied disagree) · not_found (likely fabricated) · ambiguous — plus the canonical record, whether it " +
      "is RETRACTED / corrected / under an expression of concern, and a corrected citation in your style. " +
      `Up to ${MAX_VERIFY_REFS} references per call; 0.1 credit each. Replace or drop anything not 'verified'.`,
    inputSchema: () => paramsToJsonSchema({
      refs: ENDPOINTS.verify.params.refs,
      style: ENDPOINTS.verify.params.style,
      detail: ENDPOINTS.verify.params.detail,
    }),
    toRequest: (args) => ({ method: "POST", path: "/api/verify", body: toVerifyBody(args) }),
    annotations: ANNOTATIONS,
  },
  {
    name: SEARCH_TOOL_NAME,
    title: "Search papers",
    description:
      "Use when you need real, citable sources on a topic. One call across 250M+ open-access papers " +
      "(OpenAlex, Crossref, DOAJ, PubMed) plus museum, library, manuscript and Islamicate archives, deduplicated. " +
      "Every result names its source database, carries a DOI/URL, an integrity check (retracted / corrected " +
      "status, work type, open-access status) and one formatted citation; the response says which sources " +
      "answered. Prefer the compact default; ask for detail=full only when you need abstracts. 1 credit per " +
      "call, prorated by the coverage delivered.",
    inputSchema: () => paramsToJsonSchema(searchParamDefs()),
    toRequest: (args) => ({ method: "GET", path: "/api/search", query: toSearchQuery(args) }),
    annotations: ANNOTATIONS,
  },
  {
    name: GET_TOOL_NAME,
    title: "Get paper",
    description:
      "Use when you already have an identifier (DOI, DOI URL, PMID, PMCID or OpenAlex W-id) and need the " +
      "canonical record: full metadata, every identifier (doi / pmid / pmcid / openalex), its integrity " +
      "evidence (retracted / corrected), and optionally the works that cite it (include=cited-by) or its " +
      "reference list (include=refs). 0.1 credit for the record alone, 1 credit with a citation direction.",
    inputSchema: () => paramsToJsonSchema({
      id: ENDPOINTS.works.params.id,
      include: ENDPOINTS.works.params.include,
      limit: ENDPOINTS.works.params.limit,
      minCitations: ENDPOINTS.works.params.minCitations,
      sort: ENDPOINTS.works.params.sort,
      style: ENDPOINTS.works.params.style,
      detail: ENDPOINTS.works.params.detail,
    }),
    toRequest: (args) => ({ method: "GET", path: "/api/works", query: toWorksQuery(args) }),
    annotations: ANNOTATIONS,
  },
];

export const toolByName = (name) => TOOLS.find((t) => t.name === name) || null;

// MCP `tools/list` entries.
export function toolDefinitions() {
  return TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema(), annotations: t.annotations }));
}

// OpenAI function-calling + Anthropic tool-use definitions — same input schemas, nested differently.
export function functionSchemas() {
  return {
    openai: TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema() } })),
    anthropic: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema() })),
  };
}

// ── Result shaping ────────────────────────────────────────────────────────────────────────────

const header = (headers, name) => {
  if (!headers) return undefined;
  const v = typeof headers.get === "function" ? headers.get(name) : headers[name] ?? headers[name.toLowerCase()];
  return v == null ? undefined : String(v);
};

// Billing/trust trailer: from meta (JSON) or the billing headers (text formats).
function trailer(body, headers) {
  const meta = body && typeof body === "object" ? body.meta || {} : {};
  const charged = meta.creditsCharged ?? header(headers, "x-opencite-credits");
  const balance = meta.balance ?? header(headers, "x-opencite-balance");
  const requestId = meta.requestId ?? header(headers, "x-opencite-request-id");
  const parts = [];
  if (charged !== undefined) parts.push(`charged ${charged} credit${Number(charged) === 1 ? "" : "s"}`);
  if (balance !== undefined) parts.push(`balance ${balance}`);
  if (body?.coverage) parts.push(`coverage ${body.coverage}`);
  if (requestId) parts.push(`request ${requestId}`);
  return parts.length ? `OpenCITE · ${parts.join(" · ")}` : null;
}

// Human-readable error text with the action the agent (or its human) should take.
function errorText(status, body) {
  const b = body && typeof body === "object" ? body : {};
  const base = b.error || `OpenCITE request failed (HTTP ${status}).`;
  switch (b.code || status) {
    case "insufficient_credits":
    case 402: {
      const packs = Array.isArray(b.packs) ? b.packs.map((p) => `$${p.usd} → ${p.credits.toLocaleString()} credits`).join(" · ") : "";
      return `${base} Balance: ${b.balance ?? "unknown"}. A human must top up at ${b.upgrade_url || "https://citation.today/#developers"}.${packs ? ` Packs: ${packs}.` : ""}`;
    }
    case "unauthorized":
    case 401:
      return `${base} Get a key at ${b.signup_url || "https://citation.today/#developers"} and set OPENCITE_API_KEY.`;
    case "rate_limited":
    case 429:
      return `${base} Retry after ${b.retry_after ?? "a few"} seconds.`;
    default:
      return base;
  }
}

/**
 * toToolResult({ status, headers, body | text }) → MCP CallTool result.
 * Success: content[0] = payload (pretty JSON, or the raw text for bibliography formats),
 *          content[1] = billing/trust trailer; structuredContent = the envelope minus results.
 * Failure: isError + actionable text; structuredContent = the error body.
 */
export function toToolResult(resp) {
  const { status, headers } = resp;
  const body = resp.body;
  const ok = status >= 200 && status < 300;
  if (!ok) {
    return {
      isError: true,
      content: [{ type: "text", text: errorText(status, body) }],
      structuredContent: body && typeof body === "object" ? { status, ...body } : { status, error: resp.text || String(status) },
    };
  }
  const content = [];
  if (typeof resp.text === "string") content.push({ type: "text", text: resp.text });
  else content.push({ type: "text", text: JSON.stringify(body, null, 2) });
  const t = trailer(body, headers);
  if (t) content.push({ type: "text", text: t });
  const structured = body && typeof body === "object" ? { ...body } : {};
  delete structured.results; // keep structuredContent small — the cards are in content[0]
  return { content, structuredContent: structured };
}

// `node src/tools.js` → print everything an integrator might paste elsewhere.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify({ tools: toolDefinitions(), functionSchemas: functionSchemas(), openApi: openApiSpec() }, null, 2) + "\n");
}
