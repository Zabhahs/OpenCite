// OpenCITE MCP — REST client
//
// Calls the public /api/search endpoint over HTTP. It does NOT import the
// search pipeline: the MCP boundary is the same HTTP contract any customer
// uses, so it auto-inherits the origin-blind response and (later) billing.
//
// Security (R15): TLS only — a non-https base URL is rejected. The customer's
// API key is forwarded as the `x-api-key` header and is NEVER logged or echoed.

import { toRestQuery, toCitationsQuery, toIdsQuery } from "./contract.js";

export const DEFAULT_BASE_URL = "https://citation.today";
const REQUEST_TIMEOUT_MS = 30000;

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

// Run a search. `args` are agent-facing params (query, limit, format); they're
// mapped to REST query params here. Returns the parsed JSON response body.
export async function searchScholarlySources(args, { baseUrl, apiKey, signal } = {}) {
  const base = resolveBaseUrl(baseUrl);
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(toRestQuery(args))) {
    params.set(name, String(value));
  }
  const url = `${base}/api/search?${params.toString()}`;

  const headers = { Accept: "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey; // forwarded, never logged

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  let res;
  try {
    res = await fetch(url, { method: "GET", headers, signal: controller.signal });
  } catch (err) {
    // Surface a clean message — never include headers (would leak the key).
    throw new Error(`Search request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON formats (mla/apa/bibtex/ris) return text/plain — pass through.
    if (!res.ok) throw new Error(`Search failed (HTTP ${res.status}).`);
    return { _text: text };
  }

  if (!res.ok) {
    const msg = (body && body.error) || `Search failed (HTTP ${res.status}).`;
    throw new Error(msg);
  }
  return body;
}

// Shared fetch helper to avoid repeating the AbortController/timeout/error pattern.
// `url` is fully-built; `label` is used in the thrown error message (no headers).
async function _get(url, headers, label, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  let res;
  try {
    res = await fetch(url, { method: "GET", headers, signal: controller.signal });
  } catch (err) {
    // Surface a clean message — never include headers (would leak the key).
    throw new Error(`${label} request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  let body;
  try {
    body = JSON.parse(await res.text());
  } catch {
    throw new Error(`${label} returned non-JSON (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    const msg = (body && body.error) || `${label} failed (HTTP ${res.status}).`;
    throw new Error(msg);
  }
  return body;
}

// Walk a paper's citation network. `args` are agent-facing (id, direction, limit,
// minCitations, sort); they're mapped to REST params by toCitationsQuery.
// Returns the parsed JSON response: { id, direction, sort, count, tookMs, results[], meta }.
export async function getCitations(args, { baseUrl, apiKey, signal } = {}) {
  const base = resolveBaseUrl(baseUrl);
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(toCitationsQuery(args))) {
    params.set(name, String(value));
  }
  const url = `${base}/api/citations?${params.toString()}`;
  const headers = { Accept: "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey; // forwarded, never logged
  return _get(url, headers, "Citations", signal);
}

// Crosswalk scholarly identifiers (DOI ↔ PMID ↔ PMCID). `args.ids` is an array;
// the REST endpoint expects a comma-joined `ids` param.
// Returns the parsed JSON response: { count, requested, tookMs, results:{}, meta }.
export async function resolveIds(args, { baseUrl, apiKey, signal } = {}) {
  const base = resolveBaseUrl(baseUrl);
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(toIdsQuery(args))) {
    params.set(name, String(value));
  }
  const url = `${base}/api/ids?${params.toString()}`;
  const headers = { Accept: "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey; // forwarded, never logged
  return _get(url, headers, "ID resolution", signal);
}
