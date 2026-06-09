// OpenCITE MCP server
//
// Exposes three tools:
//   search_scholarly_sources — calls /api/search; returns origin-blind result cards.
//   search_citations         — calls /api/citations; walks a paper's citation network.
//   resolve_ids              — calls /api/ids; crosswalks DOI ↔ PMID ↔ PMCID.
//
// The search tool's input schema is generated from the API contract SSOT (schema.js),
// so it never drifts from the REST surface. The two newer tools use hand-written
// schemas (their endpoints are not in the apiContract SSOT).
//
// Config (via MCP client `env`):
//   OPENCITE_API_KEY        customer key, forwarded as x-api-key (optional pre-billing)
//   OPENCITE_API_BASE_URL   override endpoint (default https://citation.today; TLS only)
//
// The API key is read once from the environment and NEVER logged (R15).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { TOOL_NAME, CITATIONS_TOOL_NAME, IDS_TOOL_NAME } from "./contract.js";
import { mcpToolDefinition, citationsToolDefinition, idsToolDefinition } from "./schema.js";
import { searchScholarlySources, getCitations, resolveIds, DEFAULT_BASE_URL } from "./client.js";

export function createServer({ apiKey, baseUrl } = {}) {
  const server = new Server(
    { name: "opencite", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [mcpToolDefinition(), citationsToolDefinition(), idsToolDefinition()],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;

    if (name === TOOL_NAME) {
      try {
        const body = await searchScholarlySources(args, { apiKey, baseUrl });
        // Non-JSON formats (mla/apa/bibtex/ris) come back from client.js as { _text }.
        // Surface that raw citation text as the MCP text block directly — the idiomatic
        // plain-text shape an agent expects — instead of a JSON-wrapped envelope. JSON
        // formats (json/csl-json) keep the pretty-printed structured response. (F-501)
        const text =
          body && typeof body._text === "string"
            ? body._text
            : JSON.stringify(body, null, 2);
        return { content: [{ type: "text", text }] };
      } catch (err) {
        // err.message is built in client.js without headers, so the key can't leak.
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }

    if (name === CITATIONS_TOOL_NAME) {
      try {
        const body = await getCitations(args, { apiKey, baseUrl });
        return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }

    if (name === IDS_TOOL_NAME) {
      try {
        const body = await resolveIds(args, { apiKey, baseUrl });
        return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }

    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  });

  return server;
}

export async function startStdioServer() {
  const apiKey = process.env.OPENCITE_API_KEY || undefined;
  const baseUrl = process.env.OPENCITE_API_BASE_URL || DEFAULT_BASE_URL;
  const server = createServer({ apiKey, baseUrl });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — never stdout (that channel is the MCP protocol stream).
  process.stderr.write(`opencite-mcp ready (endpoint: ${baseUrl})\n`);
}
