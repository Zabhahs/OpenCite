// OpenCITE MCP — transport-neutral method dispatch
//
// The ONE implementation of the two MCP methods that touch tools. Both transports call it:
//   stdio   — server.js (the npm package, via the MCP SDK)
//   hosted  — api/mcp.js (Streamable HTTP on Vercel, for Claude web / iOS custom connectors)
// so the local and the hosted server can never answer differently. SDK-free on purpose, like
// tools.js: api/ imports it without pulling @modelcontextprotocol/sdk into the function bundle.
//
// `execute` is an executor from client.js (`httpExecutor`): ({ method, path, query?, body?, tool })
// → { status, headers, body | text }.

import { toolDefinitions, toolByName, toToolResult } from "./tools.js";
import { PKG_NAME, PKG_VERSION } from "./client.js";

// MCP `tools/list` result.
export const handleToolsList = () => ({ tools: toolDefinitions() });

// MCP `tools/call` result. Never throws: an unknown tool or a failed request is an `isError`
// result the model can read, not a protocol error.
export async function handleToolsCall({ name, args = {}, execute }) {
  const tool = toolByName(name);
  if (!tool) return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  try {
    // The tool name rides along as X-OpenCITE-Tool (client.js) for the search log.
    return toToolResult(await execute({ ...tool.toRequest(args), tool: name }));
  } catch (err) {
    // err.message is built in client.js without headers, so the key can't leak.
    return { isError: true, content: [{ type: "text", text: err.message }] };
  }
}

// ── JSON-RPC envelope (hosted transport only) ─────────────────────────────────────────────────
// stdio gets this from the MCP SDK. The hosted endpoint is a stateless Streamable HTTP server and
// needs only what a tools-only server answers: initialize, ping, tools/list, tools/call. No
// sessions, no server-initiated messages — which is why it needs no SDK and no stored state.

// MCP revisions this server speaks, newest first. `initialize` echoes the client's version when it
// is listed, otherwise offers the newest (the client then decides whether to continue).
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

// Standard JSON-RPC 2.0 error codes.
export const RPC_ERROR = Object.freeze({ invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602 });

export const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
export const rpcError = (id, code, message, data) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

/**
 * handleRpcMessage(msg, { execute }) → a JSON-RPC response object, or null when the message
 * needs no reply (a notification, or a client's response to something we never sent).
 * Never throws.
 */
export async function handleRpcMessage(msg, { execute }) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0") {
    return rpcError(msg?.id, RPC_ERROR.invalidRequest, "Invalid Request: expected a JSON-RPC 2.0 message.");
  }
  if (typeof msg.method !== "string") return null;         // a response, not a request
  if (msg.id === undefined || msg.id === null) return null; // a notification (e.g. notifications/initialized)

  const params = msg.params && typeof msg.params === "object" ? msg.params : {};
  switch (msg.method) {
    case "initialize": {
      const asked = params.protocolVersion;
      return rpcResult(msg.id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: PKG_NAME, version: PKG_VERSION },
      });
    }
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, handleToolsList());
    case "tools/call":
      if (typeof params.name !== "string" || !params.name) {
        return rpcError(msg.id, RPC_ERROR.invalidParams, "Invalid params: 'name' (the tool to call) is required.");
      }
      return rpcResult(msg.id, await handleToolsCall({ name: params.name, args: params.arguments ?? undefined, execute }));
    default:
      return rpcError(msg.id, RPC_ERROR.methodNotFound, `Method not found: ${msg.method}`);
  }
}
