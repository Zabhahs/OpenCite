// OpenCITE — keyed browser-shim dispatcher (v0.43.1) · Node runtime
//
// SSOT for the backend-keyed Wave-3 sources (DPLA, Europeana, Smithsonian). The browser app
// cannot hold a secret, so its adapter calls THIS same-origin endpoint instead of the upstream.
// The route reads the source's API key from env (via serverKeys.js), runs the adapter's SERVER
// branch (real keyed fetch + normalize), and returns the SAME { results, hasMore } envelope the
// adapter would have returned directly. The key is NEVER echoed in the response or error.
//
// Why a single dynamic route: each of these was an identical per-source file (api/search/dpla.js,
// /europeana.js, /smithsonian.js). On Vercel Hobby every Node file under /api is its own
// Serverless Function (12-per-deployment cap); collapsing the three into one [source].js frees two
// slots with zero behaviour change. The KEYLESS edge shims (bdh, bl, gallica, mexicana,
// opencontext, openedition) stay as their own static files — Edge Functions don't count toward the
// Serverless cap, and Vercel resolves those exact filenames before this dynamic param.
//
// GET /api/search/<source>?q=&offset=    source ∈ { dpla, europeana, smithsonian }
// Fail-soft: always 200 with { results:[], hasMore:false, error? } so one source erroring never
// 500s a browser search.
import { DPLA_ADAPTER } from "../../src/adapters/extensions/dpla.js";
import { EUROPEANA_ADAPTER } from "../../src/adapters/extensions/europeana.js";
import { SMITHSONIAN_ADAPTER } from "../../src/adapters/extensions/smithsonian.js";
import { serverInjectedKeys } from "../_shared/serverKeys.js";
import { requireInternalOrigin } from "../_shared/requireInternalOrigin.js";

// source slug → adapter. The slug is the same path segment the per-source files used, so the
// browser adapters' existing /api/search/<slug> URLs keep working unchanged.
const ADAPTERS = {
  dpla: DPLA_ADAPTER,
  europeana: EUROPEANA_ADAPTER,
  smithsonian: SMITHSONIAN_ADAPTER,
};

export default async function handler(req, res) {
  if (!requireInternalOrigin(req, res)) return; // F-407: same-origin browser callers only
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const source = (Array.isArray(req.query?.source) ? req.query.source[0] : req.query?.source) || "";
  const adapter = ADAPTERS[source];
  if (!adapter) { res.statusCode = 404; return res.end(JSON.stringify({ results: [], hasMore: false, error: `Unknown source "${source}"` })); }

  const q = (Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q) || "";
  const offset = Number(Array.isArray(req.query?.offset) ? req.query.offset[0] : req.query?.offset) || 0;
  if (!q) { res.statusCode = 400; return res.end(JSON.stringify({ results: [], hasMore: false, error: "No query" })); }

  try {
    const out = await adapter.search(q, serverInjectedKeys(), { offset });
    res.statusCode = 200; res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = 200; res.end(JSON.stringify({ results: [], hasMore: false, error: e.message }));
  }
}
