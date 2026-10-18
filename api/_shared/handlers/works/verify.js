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
//
// v0.48 Phase 2 — the TRIAL (directive 3b / D-4): this is the ONE endpoint that answers without
// a credential or a card. A keyless call, or a free-plan key with nothing to spend, is served
// from the daily trial counter (api/_shared/trial.js: TRIAL.refsPerDay refs per identity per UTC
// day) and carries `meta.trial`. Paid plans are charged as before; every other endpoint stays
// 401/402.

import { verifyReferences } from "../../verify.js";
import { renderCard, cardOptsFrom, citationIn } from "../../compact.js";
import { authAndLimitOptional, charge, sendJson, firstParam, meterMeta, legBand, sourceRow, clientIp } from "../../meter.js";
import { logMachineSignal, withBudget, SIGNAL } from "../../searchLog.js"; // v0.50: an agent's "click"
import { claimTrial, trialIdentity, trialMeta, trialExhausted } from "../../trial.js";
import { serverInjectedKeys } from "../../serverKeys.js";
import { parseBody } from "../../parseBody.js";
import { API_VERSION, MAX_VERIFY_REFS, ENDPOINTS } from "../../apiContract.js";
import { DEFAULT_PLAN_ID } from "../../plans.js";

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

  // Credential optional (trial). false = 429 already written; null = no credential → trial.
  const identity = await authAndLimitOptional(req, res);
  if (identity === false) return;

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

  const work = () => verifyReferences(refs, { mailto, openAlexKey: keys.openAlexKey, ncbiApiKey: keys.ncbiApiKey, health, evidence: cardOpts.evidence });

  // Paid path first; a free-plan 402 (or no credential at all) falls through to the trial.
  let outcome = identity
    ? await charge(identity, work, { endpoint: "verify", qty: refs.length, band: () => legBand(health) })
    : null;
  let trial = null;
  const eligibleForTrial = !identity || (outcome?.status === 402 && identity.plan.id === DEFAULT_PLAN_ID);
  if (!outcome?.ok && eligibleForTrial) {
    const claim = await claimTrial(trialIdentity({ userId: identity?.userId, ip: clientIp(req) }), refs.length);
    if (!claim.ok) return sendJson(res, claim.unavailable ? 503 : 402, claim.unavailable ? { error: "Trial temporarily unavailable.", code: "trial_unavailable" } : trialExhausted(claim));
    try {
      outcome = { ok: true, result: await work(), creditsCharged: 0, balance: null, band: legBand(health) };
      trial = claim;
    } catch {
      return sendJson(res, 500, { error: "Request failed.", code: "upstream_error" });
    }
  }
  if (!outcome.ok) return sendJson(res, outcome.status, outcome.body);

  const { results, summary, evidenceSources } = outcome.result;
  // v0.50: one signal per reference — a verified ref that we surfaced earlier is the strongest
  // relevance label an agent can give; a not_found ref we never surfaced is hallucination data.
  // identity may be null (keyless trial): the join then falls back to the daily actor hash.
  await withBudget(Promise.all(results.map((r) =>
    logMachineSignal({ identity, req, ref: r.input, record: r.record, action: SIGNAL.verify_ref, meta: { op: "verify", verdict: r.verdict, confidence: r.confidence, trial: !!trial } })
  )));
  const render = (r, forceCompact = false) =>
    renderCard(r, { ...cardOpts, detail: forceCompact ? "compact" : cardOpts.detail, debug: !!identity?.admin && cardOpts.detail === "full" });
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
    meta: trial ? { ...meterMeta(outcome), ...trialMeta(trial) } : meterMeta(outcome),
  });
}
