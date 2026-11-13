// OpenCITE MCP server (stdio)
//
// The LOCAL transport: runs on the user's machine (Claude Desktop, Claude Code, Cursor). The
// HOSTED transport for clients that cannot launch a process (Claude web / iOS) is api/mcp.js;
// both answer through dispatch.js.
//
// Exposes the three tools in tools.js:
//   verify_citations — POST /api/verify; check references before citing them (the anti-hallucination path)
//   search_papers    — GET  /api/search; compact, evidence-flagged cards
//   get_paper        — GET  /api/works;  one work by any id, every identifier, optional citation graph
//
// Every tool's input schema is generated from the API contract SSOT (schema.js ← contract.js ←
// vendored apiContract.js), so the MCP surface never drifts from the REST surface. Responses are
// shaped by tools.js `toToolResult`: payload + a billing/trust trailer, or an actionable error.
//
// Config (via MCP client `env`):
//   OPENCITE_API_KEY        customer key, forwarded as x-api-key. REQUIRED — every call is metered.
//   OPENCITE_API_BASE_URL   override endpoint (default https://citation.today; TLS only)
//
// The API key is read once from the environment and NEVER logged (R15).

import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { handleToolsList, handleToolsCall } from "./dispatch.js";
import { httpExecutor, DEFAULT_BASE_URL } from "./client.js";

// Server version = package version (was a stale "0.1.0" literal before v0.48).
const { name: PKG_NAME, version: PKG_VERSION } = createRequire(import.meta.url)("../package.json");

export function createServer({ apiKey, baseUrl } = {}) {
  const execute = httpExecutor({ apiKey, baseUrl });
  const server = new Server(
    { name: PKG_NAME, version: PKG_VERSION },
    { capabilities: { tools: {} } }
  );

  // Both methods live in dispatch.js, shared with the hosted endpoint (api/mcp.js).
  server.setRequestHandler(ListToolsRequestSchema, async () => handleToolsList());

  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    handleToolsCall({ name: req.params.name, args: req.params.arguments, execute }));

  return server;
}

export async function startStdioServer() {
  const apiKey = process.env.OPENCITE_API_KEY || undefined;
  const baseUrl = process.env.OPENCITE_API_BASE_URL || DEFAULT_BASE_URL;
  const server = createServer({ apiKey, baseUrl });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — never stdout (that channel is the MCP protocol stream).
  process.stderr.write(`${PKG_NAME} ${PKG_VERSION} ready (endpoint: ${baseUrl}${apiKey ? "" : "; WARNING: OPENCITE_API_KEY unset — every call will return 401"})\n`);
}
