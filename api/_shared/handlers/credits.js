// OpenCITE — GET /api/credits
//   metered user → { credits: number, tier: string }
//   admin/unmetered → { credits: null, unlimited: true, tier: string }
//
// Surfaces the signed-in user's prepaid credit balance + billing tier to the client
// (BillingProvider). Session-cookie auth only — this is the browser counterpart to the
// API-key-gated /api/search billing path; it never spends, only reads.
//
// Contract (v0.44 T3): `unlimited: true` with `credits: null` is the explicit unmetered
// signal. We never serialize Infinity — JSON.stringify(Infinity) silently becomes null,
// which is exactly the bug this replaces (admins got {"credits":null} with no marker).
// DB failures are an honest 503, not a fake 200 free-tier body that masks outages.
//
// Identity resolution mirrors api/search.js:
//   - resolveSessionAdmin(req) → an allowlisted admin gets the unmetered shape.
//   - v0.48: resolveApiKey(req) → an API-key holder (x-api-key or Bearer) reads its own balance
//     without a browser session. This is the MCP/agent balance read; rate-limited per key,
//     never metered.
//   - otherwise getSession(req) returns the flat Auth.js user ({ id, name, email }) or null.
// Reads User.total_credits + User.plan (the same columns billing.js settles against).

import { getSession } from "../auth.js";
import { prisma } from "../prisma.js";
import { resolveSessionAdmin, resolveApiKey, periodOf } from "../apiAuth.js";
import { getPlan, monthlyGrantFor } from "../plans.js";
import { applyMonthlyGrant, getBalance } from "../billing.js";
import { checkRateLimit } from "../ratelimit.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Admin (allowlist) → unmetered. resolveSessionAdmin reads the request itself.
  const admin = await resolveSessionAdmin(req);
  if (admin) return res.status(200).json({ credits: null, unlimited: true, tier: "admin" });

  // v0.48: API-key path (agents). Same plan/limit semantics as the metered endpoints, cost 0.
  const keyed = await resolveApiKey(req);
  if (keyed) {
    const rl = await checkRateLimit(keyed.keyId, keyed.plan);
    if (!rl.ok) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ error: "Rate limit exceeded. Please retry later.", code: "rate_limited", retry_after: rl.retryAfter });
    }
    if (keyed.plan.creditCost === 0) return res.status(200).json({ credits: null, unlimited: true, tier: keyed.plan.id });
    const credits = await getBalance(keyed.userId);
    if (credits == null) return res.status(503).json({ error: "Credit balance unavailable" });
    return res.status(200).json({ credits, tier: keyed.plan.id, upgrade_url: "https://citation.today/#developers" });
  }

  // getSession returns the user object directly (not { user }) or null.
  const user = await getSession(req);
  if (!user?.id) return res.status(401).json({ error: "Unauthenticated" });

  try {
    let row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { total_credits: true, plan: true, credits_period: true },
    });
    if (!row) return res.status(404).json({ error: "User not found" });
    const tier = row.plan || "free";
    // v0.46: lazy monthly allowance for free users (idempotent per calendar month) — the browser
    // is the first place a returning free user looks for their balance, so grant here too.
    if (tier === "free" && row.credits_period !== periodOf()) {
      const r = await applyMonthlyGrant(user.id, monthlyGrantFor({ plan: tier }), periodOf());
      if (r.granted) row = await prisma.user.findUnique({ where: { id: user.id }, select: { total_credits: true, plan: true, credits_period: true } });
    }
    // Out-of-band unmetered rows (plan='admin' provisioned directly, plans.js
    // creditCost 0) get the same explicit unlimited shape as allowlist admins —
    // their numeric balance is meaningless because the meter never spends it.
    if (getPlan(tier).creditCost === 0) {
      return res.status(200).json({ credits: null, unlimited: true, tier });
    }
    return res.status(200).json({
      credits: Number(row.total_credits),
      tier,
    });
  } catch {
    // DB down → say so. A fake 200 free-tier body masks the outage and shows
    // signed-in users a wrong balance; the client treats non-200 as "unknown".
    return res.status(503).json({ error: "Credit balance unavailable" });
  }
}
