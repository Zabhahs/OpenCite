// OpenCITE MCP server
//
// Exposes one tool — search_scholarly_sources — that calls the public
// /api/search endpoint over HTTPS and returns origin-blind result cards.
// The tool's input schema is generated from the API contract SSOT (schema.js),
// so the MCP surface never drifts from the REST surface.
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

import { TOOL_NAME } from "./contract.js";
import { mcpToolDefinition } from "./schema.js";
import { searchScholarlySources, DEFAULT_BASE_URL } from "./client.js";

export function createServer({ apiKey, baseUrl } = {}) {
  const server = new Server(
    { name: "opencite", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [mcpToolDefinition()],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    if (name !== TOOL_NAME) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      };
    }
    try {
      const body = await searchScholarlySources(args, { apiKey, baseUrl });
      return {
        content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
      };
    } catch (err) {
      // err.message is built in client.js without headers, so the key can't leak.
      return { isError: true, content: [{ type: "text", text: err.message }] };
    }
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
