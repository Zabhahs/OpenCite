// OpenCITE — Reference verification REST API (v0.48, the anti-hallucination path)
// Route: /api/verify → /api/works/verify (rewrite; mounted via api/works/[op].js)
//
// POST /api/verify  { refs: [...], style?, detail?, evidence? }      (JSON, ≤ 64 KB)
// GET  /api/verify?refs=<ref>|<ref>|…&style=&detail=&evidence=       (simple clients)
//
// For each reference — a DOI, PMID, PMCID, DOI URL, or free-text citation string — returns a
// verdict (verified | mismatch | not_found | ambiguous), the canonical record, its integrity
// evidence (retracted / corrected / expression of concern) and a corrected citation in the
// requested style. See api/_shared/verify.js for the resolution + scoring rules.
//
// Billing: `verify` weight × number of references (plans.js ENDPOINT_UNITS: 0.1 unit each). A
// call whose upstream lookups ALL failed bills 0 (leg health → band "limited"). Never bills a
// failed call. Admin unmetered.

import { verifyReferences } from "../../verify.js";
import { renderCard, cardOptsFrom, citationIn } from "../../compact.js";
import { authAndLimit, charge, sendJson, firstParam, meterMeta, legBand, sourceRow } from "../../meter.js";
import { serverInjectedKeys } from "../../serverKeys.js";
import { parseBody } from "../../parseBody.js";
import { API_VERSION, MAX_VERIFY_REFS, ENDPOINTS } from "../../apiContract.js";

const MAX_REF_CHARS = 1000;

// Accept an array, a newline-separated string, or a '|'-separated string (GET).
function toRefList(raw) {
  const arr = Array.isArray(raw) ? raw : String(raw || "").split(/\r?\n|\|/);
  return arr.map((s) => String(s ?? "").trim()).filter(Boolean);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");
  res.setHeader("X-OpenCITE-API-Version", API_VERSION);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET" && req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed. Use POST (or GET with ?refs=)." });

  const identity = await authAndLimit(req, res);
  if (!identity) return; // 401/429 already written

  let src = req.query || {};
  if (req.method === "POST") {
    const body = await parseBody(req, res);
    if (body === null) return; // 413 already written
    src = { ...req.query, ...body };
  }
  const refs = toRefList(src.refs);
  if (!refs.length) return sendJson(res, 400, { error: "Missing 'refs' (array of DOIs / PMIDs / PMCIDs / citation strings).", code: "bad_request", usage: ENDPOINTS.verify.params });
  if (refs.length > MAX_VERIFY_REFS) return sendJson(res, 400, { error: `Too many refs (max ${MAX_VERIFY_REFS} per call).`, code: "bad_request" });
  if (refs.some((r) => r.length > MAX_REF_CHARS)) return sendJson(res, 400, { error: `A reference exceeds ${MAX_REF_CHARS} characters.`, code: "bad_request" });

  const cardOpts = cardOptsFrom(src);
  const keys = serverInjectedKeys();
  const mailto = process.env.OPENCITE_MAILTO || undefined;
  const startMs = Date.now();
  const health = { attempted: 0, failed: 0 };

  const outcome = await charge(
    identity,
    () => verifyReferences(refs, { mailto, openAlexKey: keys.openAlexKey, ncbiApiKey: keys.ncbiApiKey, health, evidence: cardOpts.evidence }),
    { endpoint: "verify", qty: refs.length, band: () => legBand(health) }
  );
  if (!outcome.ok) return sendJson(res, outcome.status, outcome.body);

  const { results, summary, evidenceSources } = outcome.result;
  const render = (r, forceCompact = false) =>
    renderCard(r, { ...cardOpts, detail: forceCompact ? "compact" : cardOpts.detail, debug: !!identity.admin && cardOpts.detail === "full" });
  const out = results.map((r) => ({
    input: r.input,
    verdict: r.verdict,
    confidence: r.confidence,
    mismatched_fields: r.mismatched_fields,
    record: r.record ? render(r.record) : null,
    evidence: r.record?.evidence ?? null,
    citation: r.record ? citationIn(r.record, cardOpts.style) : null,
    // Alternatives only when the verdict needs them (mismatch / ambiguous / not_found); always compact.
    candidates: r.verdict === "verified" ? [] : (r.candidates || []).map((c) => render(c, true)),
  }));
  const matched = out.filter((r) => r.record).length;
  return sendJson(res, 200, {
    count: out.length,
    summary,
    coverage: outcome.band,
    sources: [sourceRow("VERIFY_LOOKUPS", health, matched), ...evidenceSources],
    tookMs: Date.now() - startMs,
    results: out,
    meta: meterMeta(outcome),
  });
}
