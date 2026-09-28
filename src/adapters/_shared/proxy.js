// OpenCITE — proxiedFetch SSOT (v.19)
// Pass ctx = { adapterId: "NDLI" } to get per-adapter proxy logs.
import { log } from "../../lib/log.js";

const PROXY_BASE = "/api/proxy";

// v0.44 T5 — client-side timeout discipline. Before this, NO adapter fetch carried a
// timeout, so one hung upstream pinned its result section forever. Single shared budget
// for every adapter fetch. AbortSignal.timeout: all modern browsers + Node 18+, so the
// same helper works in both runtimes (browser adapters and the server fan-out).
export const FETCH_TIMEOUT_MS = 15000;

/**
 * fetchWithTimeout — drop-in fetch wrapper for adapters that call upstream APIs (or
 * same-origin shim routes) directly instead of via proxiedFetch. Preserves the caller's
 * options untouched; an explicit caller-supplied options.signal wins over the default.
 */
// AbortSignal.timeout is missing on Safari/iOS < 16; fall back to a manual controller so those
// browsers still search instead of throwing a TypeError before the request is issued.
export function timeoutSignal(ms = FETCH_TIMEOUT_MS) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

export function fetchWithTimeout(url, options = {}) {
  return fetch(url, { signal: timeoutSignal(FETCH_TIMEOUT_MS), ...options });
}

export async function proxiedFetch(url, options = {}, ctx = {}) {
  const adapterId = ctx.adapterId;
  const startMs = Date.now();
  if (adapterId) log(adapterId, "proxy-attempt", { url: url.slice(0, 120) });

  if (typeof window === "undefined") {
    // ── Server branch (Node / Edge serverless) ───────────────────────────────
    // No browser, no CORS — fetch the target URL directly.
    // Spoof headers mirror api/proxy.js lines 69-73; duplication is accepted
    // and documented because api/proxy.js (Edge function) and src/ cannot
    // import each other (standing project constraint).
    const targetHostname = new URL(url).hostname;
    const spoofHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": `https://${targetHostname}/`,
    };
    // Caller headers win over spoof defaults.
    const mergedHeaders = { ...spoofHeaders, ...(options.headers || {}) };
    const fetchOpts = {
      method: options.method || "GET",
      headers: mergedHeaders,
      redirect: "follow",
    };
    if (options.body !== undefined) fetchOpts.body = options.body;

    try {
      const response = await fetchWithTimeout(url, fetchOpts); // v0.44 T5: 15s budget
      if (adapterId) {
        const ms = Date.now() - startMs;
        if (response.ok) log(adapterId, "proxy-ok", { status: response.status, ms });
        else log.err(adapterId, "proxy-fail", { status: response.status, ms });
      }
      return response;
    } catch (err) {
      if (adapterId) log.err(adapterId, "proxy-throw", { err: err.name, msg: err.message, ms: Date.now() - startMs });
      throw err;
    }
  }

  // ── Browser branch (unchanged) ───────────────────────────────────────────
  const proxyUrl =
    `${PROXY_BASE}?url=${encodeURIComponent(url)}` +
    (options.method && options.method !== "GET" ? `&method=${options.method}` : "");
  const fetchOpts =
    options.method === "POST"
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: options.body }
      : {};

  try {
    const response = await fetchWithTimeout(proxyUrl, fetchOpts); // v0.44 T5: 15s budget
    if (adapterId) {
      const ms = Date.now() - startMs;
      if (response.ok) log(adapterId, "proxy-ok", { status: response.status, ms });
      else log.err(adapterId, "proxy-fail", { status: response.status, ms });
    }
    return response;
  } catch (err) {
    if (adapterId) log.err(adapterId, "proxy-throw", { err: err.name, msg: err.message, ms: Date.now() - startMs });
    throw err;
  }
}
