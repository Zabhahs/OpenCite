// OpenCITE — Europeana browser-shim route (v0.34) · Node runtime
// The browser app cannot hold a secret, so its Europeana adapter calls THIS same-origin
// endpoint instead of the upstream. The endpoint reads EUROPEANA_API_KEY from env (via
// serverKeys.js), runs the adapter's SERVER branch (real keyed fetch + normalize), and
// returns the SAME { results, hasMore } envelope the adapter would have returned directly.
// Fail-soft: always 200 with { results:[], hasMore:false, error? } so one source erroring
// never 500s a browser search. The key is NEVER echoed in the response or error.
import { EUROPEANA_ADAPTER } from "../../src/adapters/extensions/europeana.js";
import { serverInjectedKeys } from "../_shared/serverKeys.js";
import { requireInternalOrigin } from "../_shared/requireInternalOrigin.js";

export default async function handler(req, res) {
  if (!requireInternalOrigin(req, res)) return; // F-407: same-origin browser callers only
  const q = (Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q) || "";
  const offset = Number(Array.isArray(req.query?.offset) ? req.query.offset[0] : req.query?.offset) || 0;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!q) { res.statusCode = 400; return res.end(JSON.stringify({ results: [], hasMore: false, error: "No query" })); }
  try {
    const out = await EUROPEANA_ADAPTER.search(q, serverInjectedKeys(), { offset });
    res.statusCode = 200; res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = 200; res.end(JSON.stringify({ results: [], hasMore: false, error: e.message }));
  }
}
