// OpenCITE MCP — HTTP executor
//
// Calls the public REST API over HTTP. It does NOT import the search pipeline: the MCP boundary
// is the same HTTP contract any customer uses, so it auto-inherits the response contract and
// credit billing.
//
// v0.48: `httpExecutor` returns { status, headers, body | text } for EVERY response and never
// throws on a non-2xx. The old client threw `body.error` on failure, which dropped the 402's
// `upgrade_url` / `code` — the one thing an agent needs when it runs out of credits. Shaping
// (success trailer, actionable errors) lives in tools.js `toToolResult`.
//
// Security (R15): TLS only — a non-https base URL is rejected. The customer's API key is
// forwarded as the `x-api-key` header and is NEVER logged or echoed (error messages carry no
// headers).

import { createRequire } from "node:module";

export const DEFAULT_BASE_URL = "https://citation.today";
const REQUEST_TIMEOUT_MS = 30000;
// v0.50: `opencite-mcp/<version>` — read from package.json so it can never go stale.
const { name: PKG_NAME, version: PKG_VERSION } = createRequire(import.meta.url)("../package.json");
export const CLIENT_ID = `${PKG_NAME}/${PKG_VERSION}`;

export function resolveBaseUrl(raw) {
  const base = (raw || DEFAULT_BASE_URL).replace(/\/+$/, "");
  let u;
  try {
    u = new URL(base);
  } catch {
    throw new Error(`Invalid OPENCITE_API_BASE_URL: ${base}`);
  }
  // TLS only. Allow http for localhost dev against a preview, nothing else.
  const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !isLocal) {
    throw new Error("OPENCITE_API_BASE_URL must use https (TLS required).");
  }
  return base;
}

/**
 * httpExecutor({ baseUrl, apiKey }) → execute({ method, path, query?, body?, signal? })
 * Resolves to { status, headers: Headers, body } for JSON responses or { status, headers, text }
 * for text ones. Throws only when the request itself could not be made (network / timeout).
 */
export function httpExecutor({ baseUrl, apiKey } = {}) {
  const base = resolveBaseUrl(baseUrl);
  return async function execute({ method = "GET", path, query, body, signal, tool } = {}) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    const qs = params.toString();
    const url = `${base}${path}${qs ? `?${qs}` : ""}`;

    const headers = { Accept: "application/json" };
    if (apiKey) headers["x-api-key"] = apiKey; // forwarded, never logged
    // v0.50: surface attribution for the server-side search log (api/_shared/searchLog.js) —
    // `client` says this call came through the MCP package (not raw curl on the same key);
    // `tool` names the MCP tool the model invoked. Neither carries user data.
    headers["X-OpenCITE-Client"] = CLIENT_ID;
    if (tool) headers["X-OpenCITE-Tool"] = String(tool);
    const init = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
    init.signal = controller.signal;

    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      // Surface a clean message — never include headers (would leak the key).
      throw new Error(`OpenCITE request failed: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    try {
      return { status: res.status, headers: res.headers, body: JSON.parse(text) };
    } catch {
      // Non-JSON (bibliography formats, or an HTML error page) — pass the text through.
      return { status: res.status, headers: res.headers, text };
    }
  };
}
