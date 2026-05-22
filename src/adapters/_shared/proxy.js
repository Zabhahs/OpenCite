// OpenCITE — proxiedFetch SSOT (v.19)
// Pass ctx = { adapterId: "BDH" } to get per-adapter proxy logs.
import { log } from "../../lib/log.js";

const PROXY_BASE = "/api/proxy";

export async function proxiedFetch(url, options = {}, ctx = {}) {
  const adapterId = ctx.adapterId;
  const startMs = Date.now();
  if (adapterId) log(adapterId, "proxy-attempt", { url: url.slice(0, 120) });

  const proxyUrl =
    `${PROXY_BASE}?url=${encodeURIComponent(url)}` +
    (options.method && options.method !== "GET" ? `&method=${options.method}` : "");
  const fetchOpts =
    options.method === "POST"
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: options.body }
      : {};

  try {
    const response = await fetch(proxyUrl, fetchOpts);
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
