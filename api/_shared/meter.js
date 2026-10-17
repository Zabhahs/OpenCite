// OpenCITE — metered-endpoint scaffolding (SSOT for every metered surface except the search
// fan-out itself).
//
// /api/works (citations · ids · verify · get) shares /api/search's auth + billing posture but not
// its coverage machinery. This module factors out the common identity + rate-limit + two-phase
// credit charge so no endpoint re-implements it. /api/search keeps its own inline path (cache-hit
// charge + a real computed coverage band) and is intentionally NOT refactored onto this — that
// path is billing-critical and out of scope.
//
// v0.48: also the SSOT for (a) every error body an agent can see — one builder per status so the
// MCP tools, OpenAPI and docs all describe the same thing; (b) `legBand`, the single rule that
// turns "how many upstream legs failed" into a coverage band for the single-source endpoints
// (sprint v0.45 T5: we never sell a blind answer); (c) per-endpoint unit pricing via plans.js.

import { randomUUID } from "node:crypto";
import { resolveApiKey, resolveSessionAdmin } from "./apiAuth.js";
import { checkRateLimit, ANON_PLAN } from "./ratelimit.js";
import { preAuthorize, settle, refund, getBalance } from "./billing.js";
import { unitCost, CREDIT_PACKS } from "./plans.js";

export const UPGRADE_URL = "https://citation.today/#developers";
export const DOCS_URL = "https://citation.today/docs/";

// Pack summary quoted in money errors — derived from plans.js, never hand-typed.
const packSummary = () =>
  Object.values(CREDIT_PACKS).map(({ id, usd, credits }) => ({ id, usd, credits }));

// 402 — tells an agent WHERE to top up and what it costs. `balance` is included when known.
export const insufficientCredits = ({ balance } = {}) => ({
  error: "Insufficient credits.",
  code: "insufficient_credits",
  upgrade_url: UPGRADE_URL,
  docs_url: DOCS_URL,
  packs: packSummary(),
  ...(balance != null ? { balance } : {}),
});

// 401 — one body for every metered surface (search.js used to carry its own literal).
export const unauthorized = () => ({
  error: "Invalid or missing API key. Send it as the x-api-key header (or Authorization: Bearer).",
  code: "unauthorized",
  signup_url: UPGRADE_URL,
  docs_url: DOCS_URL,
});

// 429 — carries the retry hint in the body too (headers are dropped by some MCP clients).
export const rateLimited = (retryAfter) => ({
  error: "Rate limit exceeded. Please retry later.",
  code: "rate_limited",
  retry_after: retryAfter,
});

export const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

export const isTruthy = (v) => v === "1" || v === "true" || v === "yes";
export const isFalsy = (v) => v === "0" || v === "false" || v === "no";
export const firstParam = (v) => (Array.isArray(v) ? v[0] : v) ?? "";

export const clientIp = (req) => {
  const xff = req.headers?.["x-forwarded-for"];
  const first = Array.isArray(xff) ? xff[0] : xff;
  return (first || "").split(",")[0].trim() || "anon";
};

// Resolve identity (API key or session-admin), then rate-limit. On failure, writes the 401/429
// response and returns null. On success returns the billing identity. Mirrors /api/search §1+§3.
export async function authAndLimit(req, res) {
  // v0.46: per-IP window BEFORE any DB touch, so the 401 path is throttled too.
  const ipRl = await checkRateLimit(`ip:${clientIp(req)}`, ANON_PLAN);
  if (!ipRl.ok) {
    res.setHeader("Retry-After", String(ipRl.retryAfter));
    sendJson(res, 429, rateLimited(ipRl.retryAfter));
    return null;
  }
  const identity = (await resolveApiKey(req)) || (await resolveSessionAdmin(req));
  if (!identity) {
    sendJson(res, 401, unauthorized());
    return null;
  }
  const rl = await checkRateLimit(identity.keyId ?? clientIp(req), identity.plan);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    sendJson(res, 429, rateLimited(rl.retryAfter));
    return null;
  }
  return identity;
}

// v0.48 (sprint v0.45 T5): upstream leg health → coverage band for a single-logical-source call.
//   every leg failed   → "limited" (multiplier 0 via coverage.js + freeBelowBand ⇒ FREE)
//   some legs failed   → "high"    (0.95 — a degraded but real answer)
//   none failed        → "full"
// A "not found" is NOT a failed leg (it is a sold answer, like a no-match search). Callers pass
// a `health = { attempted, failed }` tally that the upstream helpers fill in.
export function legBand(health) {
  const attempted = Number(health?.attempted) || 0;
  const failed = Number(health?.failed) || 0;
  if (attempted > 0 && failed >= attempted) return "limited";
  if (failed > 0) return "high";
  return "full";
}

// One `sources[]` row for a single-logical-source endpoint, derived from the same leg tally
// (contract v3 SOURCE_STATUSES: ok | empty | failed | timeout | circuit_open).
export function sourceRow(source, health, returned = 0) {
  const band = legBand(health);
  const status = band === "limited" ? "failed" : returned > 0 ? "ok" : "empty";
  return { source, status, returned };
}

// Run `work()` inside a pre-authorized, settle-on-success / refund-on-throw credit charge.
//   endpoint — plans.js ENDPOINT_UNITS key (default weight 1); qty scales it (verify = refs).
//   band     — a band string, or a function (result) → band evaluated after work() so the charge
//              can reflect realized upstream health (legBand). Default "full".
// Returns { ok:true, result, creditsCharged, balance, band }, or { ok:false, status, body } for the
// caller to relay. NEVER bills a failed call (refund-on-throw). Admin cost 0 → ledger untouched.
export async function charge(identity, work, { band = "full", endpoint = "search", qty = 1 } = {}) {
  const cost = unitCost(identity.plan, endpoint, qty);
  const pre = await preAuthorize(identity.userId, cost);
  if (!pre.ok) {
    const balance = await getBalance(identity.userId);
    return { ok: false, status: 402, body: insufficientCredits({ balance }) };
  }
  let result;
  try {
    result = await work();
  } catch {
    await refund(identity.userId, cost).catch(() => {});
    return { ok: false, status: 500, body: { error: "Request failed.", code: "upstream_error" } };
  }
  const resolvedBand = typeof band === "function" ? band(result) : band;
  // v0.46: settle is outside the work() try — a DB failure here used to escape as a 500 with the
  // pre-auth still debited. Now it attempts the refund and reports the failure honestly.
  let creditsCharged;
  try {
    creditsCharged = await settle(identity.userId, cost, resolvedBand, { freeBelowBand: identity.plan.freeBelowBand });
  } catch {
    await refund(identity.userId, cost).catch(() => {});
    return { ok: false, status: 500, body: { error: "Billing failed; no credits were charged.", code: "billing_error" } };
  }
  const balance = await getBalance(identity.userId);
  return { ok: true, result, creditsCharged, balance, band: resolvedBand };
}

// Standard billing + provenance meta block for the response envelope (omits balance when
// unavailable). v0.48: every answer carries a requestId and the assembly time (contract v3).
export function meterMeta({ creditsCharged, balance, requestId, retrievedAt }) {
  const meta = {
    requestId: requestId || randomUUID(),
    retrieved_at: retrievedAt || new Date().toISOString(),
    creditsCharged,
  };
  if (balance != null) meta.balance = balance;
  return meta;
}
