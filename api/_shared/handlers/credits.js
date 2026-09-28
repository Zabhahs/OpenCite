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
//   - otherwise getSession(req) returns the flat Auth.js user ({ id, name, email }) or null.
// Reads User.total_credits + User.plan (the same columns billing.js settles against).

import { getSession } from "../auth.js";
import { prisma } from "../prisma.js";
import { resolveSessionAdmin } from "../apiAuth.js";
import { getPlan } from "../plans.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Admin (allowlist) → unmetered. resolveSessionAdmin reads the request itself.
  const admin = await resolveSessionAdmin(req);
  if (admin) return res.status(200).json({ credits: null, unlimited: true, tier: "admin" });

  // getSession returns the user object directly (not { user }) or null.
  const user = await getSession(req);
  if (!user?.id) return res.status(401).json({ error: "Unauthenticated" });

  try {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { total_credits: true, plan: true },
    });
    if (!row) return res.status(404).json({ error: "User not found" });
    const tier = row.plan || "free";
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
