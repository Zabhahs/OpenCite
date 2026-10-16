// OpenCITE — metered-endpoint scaffolding (SSOT for the additive v0.43 surfaces).
//
// The /api/citations and /api/ids endpoints share /api/search's auth + billing posture but not
// its coverage machinery (they're single-logical-source, so coverage is always "full"). This
// module factors out the common identity + rate-limit + two-phase credit charge so neither new
// endpoint re-implements it. /api/search keeps its own inline path (cache-hit charge + a real
// computed coverage band) and is intentionally NOT refactored onto this — that path is billing-
// critical and out of scope for v0.43.

import { resolveApiKey, resolveSessionAdmin } from "./apiAuth.js";
import { checkRateLimit, ANON_PLAN } from "./ratelimit.js";
import { preAuthorize, settle, refund, getBalance } from "./billing.js";

// v0.46: one 402 body for every metered surface — tells an agent WHERE to top up.
export const UPGRADE_URL = "https://citation.today/#developers";
export const insufficientCredits = () => ({
  error: "Insufficient credits.",
  code: "insufficient_credits",
  upgrade_url: UPGRADE_URL,
});

export const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

export const isTruthy = (v) => v === "1" || v === "true" || v === "yes";
export const firstParam = (v) => (Array.isArray(v) ? v[0] : v) ?? "";

const clientIp = (req) => {
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
    sendJson(res, 429, { error: "Rate limit exceeded. Please retry later." });
    return null;
  }
  const identity = (await resolveApiKey(req)) || (await resolveSessionAdmin(req));
  if (!identity) {
    sendJson(res, 401, { error: "Invalid or missing API key." });
    return null;
  }
  const rl = await checkRateLimit(identity.keyId ?? clientIp(req), identity.plan);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    sendJson(res, 429, { error: "Rate limit exceeded. Please retry later." });
    return null;
  }
  return identity;
}

// Run `work()` inside a pre-authorized, settle-on-success / refund-on-throw credit charge.
// Single-source endpoints have full coverage, so band defaults to "full" → 1 unit (admin cost 0
// → ledger untouched). Returns { ok:true, result, creditsCharged, balance }, or { ok:false,
// status, error } for the caller to relay. NEVER bills a failed call (refund-on-throw).
export async function charge(identity, work, { band = "full" } = {}) {
  const cost = identity.plan.creditCost;
  const pre = await preAuthorize(identity.userId, cost);
  if (!pre.ok) return { ok: false, status: 402, body: insufficientCredits() };
  let result;
  try {
    result = await work();
  } catch {
    await refund(identity.userId, cost).catch(() => {});
    return { ok: false, status: 500, body: { error: "Request failed." } };
  }
  // v0.46: settle is outside the work() try — a DB failure here used to escape as a 500 with the
  // pre-auth still debited. Now it attempts the refund and reports the failure honestly.
  let creditsCharged;
  try {
    creditsCharged = await settle(identity.userId, cost, band, { freeBelowBand: identity.plan.freeBelowBand });
  } catch {
    await refund(identity.userId, cost).catch(() => {});
    return { ok: false, status: 500, body: { error: "Billing failed; no credits were charged." } };
  }
  const balance = await getBalance(identity.userId);
  return { ok: true, result, creditsCharged, balance };
}

// Standard billing meta block for the response envelope (omits balance when unavailable).
export function meterMeta({ creditsCharged, balance }) {
  const meta = { creditsCharged };
  if (balance != null) meta.balance = balance;
  return meta;
}
