// OpenCITE — GET /api/credits → { credits: number, tier: string }
//
// Surfaces the signed-in user's prepaid credit balance + billing tier to the client
// (BillingProvider). Session-cookie auth only — this is the browser counterpart to the
// API-key-gated /api/search billing path; it never spends, only reads.
//
// Identity resolution mirrors api/search.js:
//   - resolveSessionAdmin(req) → an allowlisted admin gets unmetered { Infinity, "admin" }.
//   - otherwise getSession(req) returns the flat Auth.js user ({ id, name, email }) or null.
// Reads User.total_credits + User.plan (the same columns billing.js settles against).

import { getSession } from "../auth.js";
import { prisma } from "../prisma.js";
import { resolveSessionAdmin } from "../apiAuth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Admin (allowlist) → unmetered. resolveSessionAdmin reads the request itself.
  const admin = await resolveSessionAdmin(req);
  if (admin) return res.status(200).json({ credits: Infinity, tier: "admin" });

  // getSession returns the user object directly (not { user }) or null.
  const user = await getSession(req);
  if (!user?.id) return res.status(401).json({ error: "Unauthenticated" });

  try {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { total_credits: true, plan: true },
    });
    if (!row) return res.status(404).json({ error: "User not found" });
    return res.status(200).json({
      credits: Number(row.total_credits),
      tier: row.plan || "free",
    });
  } catch {
    // DB hiccup → degrade gracefully so the UI falls back to the stub, never blocks.
    return res.status(200).json({ credits: Infinity, tier: "free" });
  }
}
