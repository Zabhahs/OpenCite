// OpenCITE — Identifier-resolution REST API
// Route: /api/ids  (Node.js runtime)
//
// Converts between scholarly identifiers (DOI ↔ PMID ↔ PMCID) in one batched call via the NCBI
// PMC ID Converter (src/lib/idResolve.js). Mixed-type input is split internally into homogeneous
// ≤200-id batches. Auth + metering mirror /api/search: API-key or session-admin; admin unmetered;
// otherwise one credit per call. Never bills a failed call.
//
// GET /api/ids?ids=<comma-separated ids>
//   ids  required — comma-separated DOIs, PMIDs, and/or PMCIDs (any mix; max 200 total).
//
// Response: { count, results: { [inputId]: { doi, pmid, pmcid } }, meta }. No `source` field —
// this surface is inherently origin-blind (a single resolver, no upstream catalog to leak).
//
// Approach adapted (clean-room) from neuromechanist/opencite (MIT): id_converter.py (§6, v0.43).

import { resolveIds } from "../src/lib/idResolve.js";
import { authAndLimit, charge, sendJson, firstParam, meterMeta } from "./_shared/meter.js";

const MAX_IDS = 200; // NCBI's per-request homogeneous-batch cap; also the sane request ceiling.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed. Use GET." });

  const identity = await authAndLimit(req, res);
  if (!identity) return; // 401/429 already written

  const ids = firstParam(req.query?.ids)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) return sendJson(res, 400, { error: "Missing 'ids' (comma-separated DOIs/PMIDs/PMCIDs)." });
  if (ids.length > MAX_IDS) return sendJson(res, 400, { error: `Too many ids (max ${MAX_IDS}).` });

  const startMs = Date.now();
  // Server reads the optional NCBI key from env (raises 3→10 req/s); the browser has none.
  const apiKey = process.env.NCBI_API_KEY || undefined;
  const mailto = process.env.OPENCITE_MAILTO || undefined;

  const outcome = await charge(identity, () => resolveIds(ids, { apiKey, email: mailto }));
  if (!outcome.ok) return sendJson(res, outcome.status, { error: outcome.error });

  // Map → plain object keyed by input id for JSON serialization.
  const results = Object.fromEntries(outcome.result);
  return sendJson(res, 200, {
    count: Object.keys(results).length,
    requested: ids.length,
    tookMs: Date.now() - startMs,
    results,
    meta: meterMeta(outcome),
  });
}
