// OpenCITE — plans SSOT (WS3)
//
// One definition of every billing plan: which sources it may search, what a
// query costs in credits, its burst rate limit, and the free-coverage floor.
// search.js, billing.js, ratelimit.js, and the UI all read entitlement FROM
// HERE — never from the client settings blob (a client can't grant itself a tier).
//
// Source gating is expressed as a TIER, resolved against the live server-safe set
// at call time (so adding a server-safe adapter doesn't require editing this file):
//   - "core"  → the 4 core scholarly adapters only (free tier)
//   - "all"   → the entire derived server-safe set (paid tier)

export const CORE_SOURCE_IDS = ["OPENALEX", "CROSSREF", "DOAJ", "CURATED"];

// freeBelowBand: if a query's coverage band is at or below this, charge 0 — a
// half-blind answer isn't a sellable result (ties to coverage.coverageMultiplier,
// where "limited" already → 0). Set to "partial" to also waive partial-coverage.
export const PLANS = {
  free: {
    id: "free",
    label: "Free",
    tier: "core",
    creditCost: 0,           // free tier doesn't bill credits (loss-leader)
    rateLimit: { windowSeconds: 60, max: 30 },
    freeBelowBand: "limited",
  },
  paid: {
    id: "paid",
    label: "Pay-as-you-go",
    tier: "all",
    creditCost: 1,           // credits per billable query (pre-proration)
    rateLimit: { windowSeconds: 60, max: 120 },
    freeBelowBand: "limited",
  },
};

export const DEFAULT_PLAN_ID = "free";

export function getPlan(planId) {
  return PLANS[planId] || PLANS[DEFAULT_PLAN_ID];
}

// Resolve a plan's tier to concrete adapter IDs, intersected with the live
// server-safe set passed in by the caller (search.js owns the derived set).
export function allowedSourceIds(plan, serverSafeIds) {
  const safe = new Set(serverSafeIds);
  if (plan.tier === "all") return [...safe];
  return CORE_SOURCE_IDS.filter((id) => safe.has(id));
}
