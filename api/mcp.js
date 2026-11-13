// OpenCITE — hosted MCP endpoint (Streamable HTTP, stateless) · Node runtime
//
// The REMOTE transport for the three OpenCITE tools, so clients that cannot launch a local
// process — Claude on the web and on iOS/Android, via a custom connector — can use them. The
// local transport is the npm package (mcp/src/server.js, stdio); both answer through
// mcp/src/dispatch.js, so the two can never drift.
//
// Routes:
//   POST /api/mcp/<oc_live_key>   key in the path — the form a claude.ai custom connector uses
//                                 (it has no field for a request header). vercel.json rewrites it
//                                 to /api/mcp?key=<key>.
//   POST /api/mcp                 key as `x-api-key` or `Authorization: Bearer` — for clients that
//                                 can set headers (Claude Code, Cursor). Preferred where possible:
//                                 the key stays out of the URL.
//
// What this function does: HTTP concerns only — CORS, method, key shape, body, status codes.
// What it does NOT do: resolve the key, meter, bill or search. It forwards the key to the public
// REST API over HTTPS (client.js `httpExecutor`), exactly as the npm package does, so there is ONE
// auth + metering path (api/_shared/meter.js) for every surface.
//
// Stateless: every POST is answered on its own with a JSON body. No session id, no SSE stream,
// so GET (which would open a server→client stream) answers 405 as the spec allows.
//
// Security: the key is never logged, echoed or cached (Cache-Control: no-store). A key in the URL
// path is still visible in the platform's request log and in the user's connector settings — the
// docs tell users to mint a dedicated, revocable key for a connector. OAuth (phase 2) removes it.
//
// Function budget: this is one more Serverless Function (Vercel Hobby caps a deployment at 12;
// see api/works/[op].js). Its vercel.json `functions` entry sets two things:
//   maxDuration 60        — it waits on an upstream call that client.js allows 30 s.
//   includeFiles          — client.js reads mcp/package.json at runtime through createRequire,
//                           which the build's import tracer is not guaranteed to follow.

import { handleRpcMessage, rpcError, RPC_ERROR, SUPPORTED_PROTOCOL_VERSIONS } from "../mcp/src/dispatch.js";
import { httpExecutor, HOSTED_CLIENT_ID } from "../mcp/src/client.js";
import { presentedKey, CUSTOMER_KEY_RE } from "./_shared/apiAuth.js";
import { parseBody } from "./_shared/parseBody.js";
import { sendJson, firstParam, unauthorized } from "./_shared/meter.js";

// JSON-RPC server-defined error code (-32000..-32099) for "no usable credential".
const RPC_UNAUTHORIZED = -32001;

const KEY_HELP =
  "Missing or malformed OpenCITE API key. Connect to https://citation.today/api/mcp/<your oc_live_ key> " +
  "(Claude web / iOS custom connector), or send the key as the x-api-key header or Authorization: Bearer.";

export default async function handler(req, res) {
  // No cookies or ambient credentials are involved (the key is explicit), so any origin may call.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, x-api-key, Authorization, Mcp-Protocol-Version, Mcp-Session-Id");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendJson(res, 405, rpcError(null, RPC_ERROR.invalidRequest, "Method not allowed. This MCP endpoint is stateless: send JSON-RPC over POST."));
  }

  // Key: path form first (the connector URL), then the same headers the REST API accepts.
  // Shape-checked here so a malformed key never costs an upstream call; whether it is a LIVE key
  // is decided upstream, per tool call, by the one resolver (apiAuth.js resolveApiKey).
  const apiKey = firstParam(req.query?.key) || presentedKey(req);
  if (!CUSTOMER_KEY_RE.test(apiKey)) {
    return sendJson(res, 401, rpcError(null, RPC_UNAUTHORIZED, KEY_HELP, unauthorized()));
  }

  // A client that names a protocol revision we do not speak gets a 400 (MCP Streamable HTTP rule).
  // The header is absent on `initialize` and from older clients — both fine.
  const version = firstParam(req.headers?.["mcp-protocol-version"]);
  if (version && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
    return sendJson(res, 400, rpcError(null, RPC_ERROR.invalidRequest, `Unsupported MCP-Protocol-Version "${version}". Supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}.`));
  }

  const message = await parseBody(req, res);
  if (message === null) return; // 413 already written

  const execute = httpExecutor({ apiKey, clientId: HOSTED_CLIENT_ID });

  // A JSON array is a batch (allowed by the 2025-03-26 revision): answer each element.
  if (Array.isArray(message)) {
    if (!message.length) return sendJson(res, 400, rpcError(null, RPC_ERROR.invalidRequest, "Invalid Request: empty batch."));
    const replies = (await Promise.all(message.map((m) => handleRpcMessage(m, { execute })))).filter(Boolean);
    if (!replies.length) { res.statusCode = 202; return res.end(); }
    return sendJson(res, 200, replies);
  }

  const reply = await handleRpcMessage(message, { execute });
  if (!reply) { res.statusCode = 202; return res.end(); } // notification / response: accepted, no body
  // A body that is not a JSON-RPC message at all (including unparseable JSON, which parseBody
  // resolves to {}) is the caller's error → 400. Every other reply — tool errors included — is a
  // well-formed JSON-RPC answer → 200.
  const malformed = reply.error?.code === RPC_ERROR.invalidRequest;
  return sendJson(res, malformed ? 400 : 200, reply);
}
