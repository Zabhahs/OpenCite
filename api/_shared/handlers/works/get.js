// OpenCITE — GET /api/works?id=…  (v0.48; mounted via api/works/[op].js as op=get)
//
// One work by ANY identifier (DOI, DOI URL, PMID, PMCID, OpenAlex W-id): the canonical card,
// every identifier we can find, its integrity evidence, and optionally one direction of the
// citation graph. This is the MCP `get_paper` tool's endpoint — it folds the old resolve_ids +
// search_citations use-cases into one call so an agent needs fewer tools.
//
// Billing: `works_meta` (0.1 unit) for the record alone; `works` (1 unit) with a graph
// (plans.js ENDPOINT_UNITS). Free when every upstream leg failed (meter.legBand).

import { getWork, getReferences, getCitations } from "../../citationGraph.js";
import { resolveIds, detectIdType, normalizeId } from "../../../../src/lib/idResolve.js";
import { renderCard, cardOptsFrom } from "../../compact.js";
import { enrichEvidence } from "../../evidence.js";
import { authAndLimit, charge, sendJson, firstParam, meterMeta, legBand, sourceRow } from "../../meter.js";
import { logMachineSignal, withBudget, SIGNAL } from "../../searchLog.js"; // v0.50: an agent's "click"
import { serverInjectedKeys } from "../../serverKeys.js";
import { ENDPOINTS, API_VERSION } from "../../apiContract.js";

const INCLUDES = new Set(["cited-by", "refs"]);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");
  res.setHeader("X-OpenCITE-API-Version", API_VERSION);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed. Use GET." });

  const identity = await authAndLimit(req, res);
  if (!identity) return; // 401/429 already written

  const rawId = firstParam(req.query?.id).trim();
  if (!rawId) return sendJson(res, 400, { error: "Missing 'id'.", code: "bad_request", usage: ENDPOINTS.works.params });
  const include = firstParam(req.query?.include).trim().toLowerCase();
  if (include && !INCLUDES.has(include)) return sendJson(res, 400, { error: `Unknown include "${include}".`, allowed: [...INCLUDES] });
  const limit = firstParam(req.query?.limit);
  const minCitations = firstParam(req.query?.minCitations);
  const sort = firstParam(req.query?.sort).trim().toLowerCase() === "year" ? "year" : "impact";
  const cardOpts = cardOptsFrom(req.query);
  const keys = serverInjectedKeys();
  const mailto = process.env.OPENCITE_MAILTO || undefined;
  const startMs = Date.now();
  const health = { attempted: 0, failed: 0 };

  const outcome = await charge(identity, async () => {
    // 1. Any PMID/PMCID → DOI first (OpenAlex is keyed by DOI / W-id).
    let lookup = rawId;
    const isOa = /^W\d+$/i.test(rawId) || /openalex\.org\/W/i.test(rawId);
    const ncbi = {};
    if (!isOa) {
      const t = detectIdType(rawId);
      if (t === "pmid" || t === "pmcid") {
        const map = await resolveIds([rawId], { apiKey: keys.ncbiApiKey, email: mailto, health });
        const hit = map.get(rawId);
        if (hit) { Object.assign(ncbi, hit); if (hit.doi) lookup = hit.doi; }
        if (!hit?.doi) return { work: null, ids: { doi: null, pmid: hit?.pmid ?? (t === "pmid" ? normalizeId(rawId) : null), pmcid: hit?.pmcid ?? (t === "pmcid" ? normalizeId(rawId) : null), openalex: null }, graph: null, evSources: [] };
      }
    }
    // 2. Canonical record + identifiers.
    const found = await getWork(lookup, { mailto, health });
    if (!found) return { work: null, ids: { doi: isOa ? null : normalizeId(lookup), pmid: ncbi.pmid ?? null, pmcid: ncbi.pmcid ?? null, openalex: isOa ? rawId.split("/").pop() : null }, graph: null, evSources: [] };
    const ids = { ...found.ids, pmid: found.ids.pmid ?? ncbi.pmid ?? null, pmcid: found.ids.pmcid ?? ncbi.pmcid ?? null };
    // 3. Optional graph.
    let graph = null;
    if (include) {
      const cards = include === "refs"
        ? await getReferences(found.ids.openalex, { limit, sort, mailto, health })
        : await getCitations(found.ids.openalex, { limit, minCitations, sort, mailto, health });
      graph = { direction: include, cards };
    }
    // 4. Evidence on the work + graph cards in one batched lookup (failure-isolated).
    const evSources = cardOpts.evidence
      ? await enrichEvidence([found.card, ...(graph?.cards || [])], { openAlexKey: keys.openAlexKey, mailto })
      : [];
    return { work: found.card, ids, graph, evSources };
  }, { endpoint: include ? "works" : "works_meta", band: () => legBand(health) });
  if (!outcome.ok) return sendJson(res, outcome.status, outcome.body);

  const { work, ids, graph, evSources } = outcome.result;
  // v0.50: fetching a work after a search is the machine equivalent of a click. Joins to the
  // caller's latest search that showed it (searchLog.logMachineSignal). Bounded, fail-open.
  await withBudget(logMachineSignal({ identity, req, ref: rawId, record: work, action: SIGNAL.get_work, meta: { op: "get", include: include || null, found: !!work } }));
  const render = (r) => renderCard(r, { ...cardOpts, debug: !!identity.admin && cardOpts.detail === "full" });
  return sendJson(res, 200, {
    id: rawId,
    work: work ? render(work) : null,
    ids,
    graph: graph ? { direction: graph.direction, count: graph.cards.length, results: graph.cards.map(render) } : null,
    coverage: outcome.band,
    sources: [sourceRow("OPENALEX", health, (work ? 1 : 0) + (graph?.cards.length || 0)), ...evSources],
    tookMs: Date.now() - startMs,
    meta: meterMeta(outcome),
  });
}
