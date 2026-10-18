// OpenCITE — Citation-graph REST API
// Route: /api/citations → /api/works/citations (rewrite; mounted via api/works/[op].js, v0.48)
//
// Walks a work's citation network in one call:
//   dir=cited-by → forward edges (works that cite it), cited_by_count-ranked
//   dir=refs     → backward edges (its bibliography)
//
// Backbone OpenAlex + OpenCitations fallback (api/_shared/citationGraph.js). Returns the SAME
// cards as /api/search (compact.renderCard — compact by default, `detail=full` for the v2 card),
// each with its integrity evidence. Auth + metering mirror /api/search: API-key or session-admin;
// admin unmetered; everyone else spends one credit per call. v0.48 (sprint v0.45 T5): the charge
// follows upstream leg health — every leg failed → band "limited" → free. Never bills a failed call.
//
// GET /api/citations?id=<doi|openalex>&dir=<refs|cited-by>&limit=&minCitations=&sort=&detail=&style=&evidence=
//   id           required — a DOI (10.x/…) or an OpenAlex work id (W…).
//   dir          optional — "cited-by" (default) | "refs".
//   limit        optional — max edges, 1..200 (default 25).
//   minCitations optional — cited-by only: drop citing works below this count.
//   sort         optional — "impact" (default) | "year".
//   detail/style/evidence — card shaping (apiContract.js PARAMS).
//
// Approach adapted (clean-room) from neuromechanist/opencite (MIT): citations.py (§6, v0.43).

import { getReferences, getCitations } from "../../citationGraph.js";
import { renderCard, cardOptsFrom } from "../../compact.js";
import { enrichEvidence } from "../../evidence.js";
import { authAndLimit, charge, sendJson, firstParam, meterMeta, legBand, sourceRow } from "../../meter.js";
import { logMachineSignal, withBudget, SIGNAL } from "../../searchLog.js"; // v0.50: an agent's "click"
import { serverInjectedKeys } from "../../serverKeys.js";
import { API_VERSION } from "../../apiContract.js";

const DIRS = new Set(["refs", "cited-by"]);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");
  res.setHeader("X-OpenCITE-API-Version", API_VERSION);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed. Use GET." });

  const identity = await authAndLimit(req, res);
  if (!identity) return; // 401/429 already written

  const id = firstParam(req.query?.id).trim();
  if (!id) return sendJson(res, 400, { error: "Missing 'id' (a DOI or OpenAlex work id).", code: "bad_request" });

  const dir = (firstParam(req.query?.dir).trim().toLowerCase()) || "cited-by";
  if (!DIRS.has(dir)) return sendJson(res, 400, { error: `Unknown dir "${dir}".`, allowed: [...DIRS] });

  const limit = firstParam(req.query?.limit);
  const minCitations = firstParam(req.query?.minCitations);
  const sort = (firstParam(req.query?.sort).trim().toLowerCase()) === "year" ? "year" : "impact";
  const cardOpts = cardOptsFrom(req.query);
  const keys = serverInjectedKeys();
  const mailto = process.env.OPENCITE_MAILTO || undefined;
  const startMs = Date.now();
  const health = { attempted: 0, failed: 0 };

  const outcome = await charge(identity, async () => {
    const cards = dir === "refs"
      ? await getReferences(id, { limit, sort, mailto, health })
      : await getCitations(id, { limit, minCitations, sort, mailto, health });
    const evSources = cardOpts.evidence ? await enrichEvidence(cards, { openAlexKey: keys.openAlexKey, mailto }) : [];
    return { cards, evSources };
  }, { endpoint: "citations", band: () => legBand(health) });
  if (!outcome.ok) return sendJson(res, outcome.status, outcome.body);

  const { cards, evSources } = outcome.result;
  // v0.50: walking a work's graph after a search = machine click on that work (DOI / oc_ join;
  // an OpenAlex W-id we never surfaced becomes an UNSEEN stub). Bounded, fail-open.
  await withBudget(logMachineSignal({ identity, req, ref: id, action: SIGNAL.citations_graph, meta: { op: "citations", dir, edges: cards.length } }));
  const results = cards.map((r) => renderCard(r, { ...cardOpts, debug: !!identity.admin && cardOpts.detail === "full" }));
  return sendJson(res, 200, {
    id,
    direction: dir,
    sort,
    count: results.length,
    coverage: outcome.band,
    sources: [sourceRow("OPENALEX", health, cards.length), ...evSources],
    tookMs: Date.now() - startMs,
    results,
    meta: meterMeta(outcome),
  });
}
