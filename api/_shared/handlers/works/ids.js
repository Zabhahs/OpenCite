// OpenCITE — Identifier crosswalk REST API (DOI ↔ PMID ↔ PMCID)
// Route: /api/ids → /api/works/ids (rewrite; mounted via api/works/[op].js, v0.48)
//
// Wraps the NCBI PMC ID Converter via src/lib/idResolve.js (isomorphic). Up to 200 ids per call,
// any mix of types; the resolver groups them into homogeneous batches internally. Auth + metering
// mirror /api/search. v0.48: billed at the `ids` weight (0.1 unit — plans.js ENDPOINT_UNITS), and
// free when the resolver was unreachable (leg health → band "limited"). Never bills a failed call.
//
// GET /api/ids?ids=<comma-separated DOIs / PMIDs / PMCIDs>
//
// Approach adapted (clean-room) from neuromechanist/opencite (MIT): clients/id_converter.py (§6, v0.43).

import { resolveIds } from "../../../../src/lib/idResolve.js";
import { authAndLimit, charge, sendJson, firstParam, meterMeta, legBand } from "../../meter.js";
import { logMachineSignal, withBudget, SIGNAL } from "../../searchLog.js"; // v0.50: an agent's "click"
import { API_VERSION } from "../../apiContract.js";

const MAX_IDS = 200; // NCBI's per-request homogeneous-batch cap; also the sane request ceiling.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");
  res.setHeader("X-OpenCITE-API-Version", API_VERSION);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed. Use GET." });

  const identity = await authAndLimit(req, res);
  if (!identity) return; // 401/429 already written

  const ids = firstParam(req.query?.ids)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) return sendJson(res, 400, { error: "Missing 'ids' (comma-separated DOIs/PMIDs/PMCIDs).", code: "bad_request" });
  if (ids.length > MAX_IDS) return sendJson(res, 400, { error: `Too many ids (max ${MAX_IDS}).`, code: "bad_request" });

  const startMs = Date.now();
  // Server reads the optional NCBI key from env (raises 3→10 req/s); the browser has none.
  const apiKey = process.env.NCBI_API_KEY || undefined;
  const mailto = process.env.OPENCITE_MAILTO || undefined;
  const health = { attempted: 0, failed: 0 };

  const outcome = await charge(identity, () => resolveIds(ids, { apiKey, email: mailto, health }), {
    endpoint: "ids",
    band: () => legBand(health),
  });
  if (!outcome.ok) return sendJson(res, outcome.status, outcome.body);

  // Map → plain object keyed by input id for JSON serialization.
  const results = Object.fromEntries(outcome.result);
  // v0.50: one signal per id that resolved to a DOI (the only identifier `works` can join on).
  // Capped at 25 per call so a 200-id crosswalk cannot turn into 200 inserts. Bounded, fail-open.
  await withBudget(Promise.all(ids.slice(0, 25).map((ref) => {
    const doi = results[ref]?.doi || (/^10\.\d{4,9}\//.test(ref) ? ref : null);
    return doi ? logMachineSignal({ identity, req, ref: doi, action: SIGNAL.resolve_ids, meta: { op: "ids", input: ref.slice(0, 120) } }) : null;
  })));
  return sendJson(res, 200, {
    count: Object.keys(results).length,
    requested: ids.length,
    coverage: outcome.band,
    tookMs: Date.now() - startMs,
    results,
    meta: meterMeta(outcome),
  });
}
