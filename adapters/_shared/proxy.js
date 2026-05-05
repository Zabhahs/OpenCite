const PROXY_BASE = "/api/proxy";

/**
 * proxiedFetch — routes requests through the Vercel CORS proxy.
 * Use for adapters that are CORS-blocked in browsers (pattern 2)
 * or as a fallback after a direct fetch fails (pattern 3).
 *
 * The proxy handles:
 *   - Setting the polite User-Agent OpenContext requires
 *   - Access-Control-Allow-Origin: *
 *   - GET and POST forwarding
 *   - Domain allowlist gating
 */
export async function proxiedFetch(url, options = {}) {
  const proxyUrl =
    `${PROXY_BASE}?url=${encodeURIComponent(url)}` +
    (options.method && options.method !== "GET" ? `&method=${options.method}` : "");
  const fetchOpts =
    options.method === "POST"
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: options.body }
      : {};
  return fetch(proxyUrl, fetchOpts);
}
