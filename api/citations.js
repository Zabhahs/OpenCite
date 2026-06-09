// OpenCITE — Citation-graph REST API
// Route: /api/citations  (Node.js runtime)
//
// Walks a work's citation network in one call:
//   dir=cited-by → forward edges (works that cite it), cited_by_count-ranked
//   dir=refs     → backward edges (its bibliography)
//
// Backbone OpenAlex + OpenCitations fallback (api/_shared/citationGraph.js). Returns the SAME
// origin-blind UnifiedResult cards as /api/search (toPublicResult — no `source` leakage). Auth +
// metering mirror /api/search: API-key or session-admin; admin unmetered; everyone else spends
// one credit per call (full coverage → band "full"). Never bills a failed call.
//
// GET /api/citations?id=<doi|openalex>&dir=<refs|cited-by>&limit=&minCitations=&sort=
//   id           required — a DOI (10.x/…) or an OpenAlex work id (W…).
//   dir          optional — "cited-by" (default) | "refs".
//   limit        optional — max edges, 1..200 (default 25).
//   minCitations optional — cited-by only: drop citing works below this count.
//   sort         optional — "impact" (default) | "year".
//
// Approach adapted (clean-room) from neuromechanist/opencite (MIT): citations.py (§6, v0.43).

import { getReferences, getCitations } from "./_shared/citationGraph.js";
import { toPublicResult } from "./_shared/publicResult.js";
import { authAndLimit, charge, sendJson, firstParam, meterMeta } from "./_shared/meter.js";

const DIRS = new Set(["refs", "cited-by"]);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed. Use GET." });

  const identity = await authAndLimit(req, res);
  if (!identity) return; // 401/429 already written

  const id = firstParam(req.query?.id).trim();
  if (!id) return sendJson(res, 400, { error: "Missing 'id' (a DOI or OpenAlex work id)." });

  const dir = (firstParam(req.query?.dir).trim().toLowerCase()) || "cited-by";
  if (!DIRS.has(dir)) return sendJson(res, 400, { error: `Unknown dir "${dir}".`, allowed: [...DIRS] });

  const limit = firstParam(req.query?.limit);
  const minCitations = firstParam(req.query?.minCitations);
  const sort = (firstParam(req.query?.sort).trim().toLowerCase()) === "year" ? "year" : "impact";
  const startMs = Date.now();

  const outcome = await charge(identity, () =>
    dir === "refs"
      ? getReferences(id, { limit, sort })
      : getCitations(id, { limit, minCitations, sort })
  );
  if (!outcome.ok) return sendJson(res, outcome.status, { error: outcome.error });

  const results = outcome.result.map((r) => toPublicResult(r));
  return sendJson(res, 200, {
    id,
    direction: dir,
    sort,
    count: results.length,
    tookMs: Date.now() - startMs,
    results,
    meta: meterMeta(outcome),
  });
}
