// OpenCITE — /api/credits
//   GET   metered user → { credits, allowance, purchased, tier, subscription_status, metered, trial }
//         admin/unmetered → { credits: null, unlimited: true, tier }
//   PATCH (session only) { cap_usd } → set the metered-plan monthly spend cap (v0.48 D-12)
//
// Surfaces the caller's balance + billing tier. Session-cookie auth (BillingProvider, the
// Developers panel) OR an API key / Bearer token (agents, the MCP `get_balance`-style read:
// per-key rate-limited, never metered). It never spends, only reads — except PATCH, which only
// changes the user's own cap.
//
// Contract (v0.44 T3): `unlimited: true` with `credits: null` is the explicit unmetered signal.
// We never serialize Infinity. DB failures are an honest 503, not a fake 200.
// v0.48: three-bucket detail from billing.getBalanceDetail; the free lazy grant is gone (D-14).

import { getSession } from "../auth.js";
import { prisma } from "../prisma.js";
import { resolveSessionAdmin, resolveApiKey } from "../apiAuth.js";
import { getPlan, TRIAL, API_UNIT_PRICE_USD } from "../plans.js";
import { getBalanceDetail } from "../billing.js";
import { checkRateLimit } from "../ratelimit.js";
import { parseBody } from "../parseBody.js";

const CAP_MIN_USD = 5;
const CAP_MAX_USD = 1000;
const UPGRADE_URL = "https://citation.today/#developers";

async function detailFor(userId, tier) {
  const d = await getBalanceDetail(userId);
  if (!d) return null;
  const plan = getPlan(tier);
  return {
    credits: d.credits,
    allowance: d.allowance,
    purchased: d.purchased,
    tier,
    subscription_status: d.subscription_status,
    metered: plan.postpaid
      ? { ...d.metered, est_usd: Math.round(d.metered.usage_units * API_UNIT_PRICE_USD * 100) / 100, unit_price_usd: API_UNIT_PRICE_USD }
      : null,
    trial: { endpoint: TRIAL.endpoint, refs_per_day: TRIAL.refsPerDay },
    upgrade_url: UPGRADE_URL,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Admin (allowlist) → unmetered. resolveSessionAdmin reads the request itself.
  const admin = await resolveSessionAdmin(req);
  if (admin && req.method === "GET") return res.status(200).json({ credits: null, unlimited: true, tier: "admin" });

  // v0.48: API-key path (agents). Same plan/limit semantics as the metered endpoints, cost 0.
  const keyed = req.method === "GET" ? await resolveApiKey(req) : null;
  if (keyed) {
    const rl = await checkRateLimit(keyed.keyId, keyed.plan);
    if (!rl.ok) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ error: "Rate limit exceeded. Please retry later.", code: "rate_limited", retry_after: rl.retryAfter });
    }
    if (keyed.plan.creditCost === 0) return res.status(200).json({ credits: null, unlimited: true, tier: keyed.plan.id });
    const d = await detailFor(keyed.userId, keyed.plan.id);
    if (!d) return res.status(503).json({ error: "Credit balance unavailable" });
    return res.status(200).json(d);
  }

  // getSession returns the user object directly (not { user }) or null.
  const user = await getSession(req);
  if (!user?.id) return res.status(401).json({ error: "Unauthenticated" });

  if (req.method === "PATCH") {
    const body = await parseBody(req, res);
    if (body === null) return; // 413 written
    const cap = Number(body?.cap_usd);
    if (!Number.isFinite(cap)) return res.status(400).json({ error: "cap_usd must be a number", code: "bad_request" });
    const clamped = Math.min(CAP_MAX_USD, Math.max(CAP_MIN_USD, Math.round(cap * 100) / 100));
    try {
      await prisma.user.update({ where: { id: user.id }, data: { metered_cap_usd: clamped } });
      return res.status(200).json({ ok: true, cap_usd: clamped, min_usd: CAP_MIN_USD, max_usd: CAP_MAX_USD });
    } catch {
      return res.status(503).json({ error: "Could not update the cap" });
    }
  }

  try {
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { plan: true } });
    if (!row) return res.status(404).json({ error: "User not found" });
    const tier = row.plan || "free";
    // Out-of-band unmetered rows (plan='admin' provisioned directly, plans.js creditCost 0) get
    // the same explicit unlimited shape as allowlist admins.
    if (getPlan(tier).creditCost === 0) return res.status(200).json({ credits: null, unlimited: true, tier });
    const d = await detailFor(user.id, tier);
    if (!d) return res.status(503).json({ error: "Credit balance unavailable" });
    return res.status(200).json(d);
  } catch {
    // DB down → say so. A fake 200 free-tier body masks the outage and shows
    // signed-in users a wrong balance; the client treats non-200 as "unknown".
    return res.status(503).json({ error: "Credit balance unavailable" });
  }
}
