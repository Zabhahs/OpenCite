// OpenCITE — plans SSOT (WS3)
//
// One definition of every billing plan. search.js, billing.js, ratelimit.js,
// checkout, the webhook, and the UI all read entitlement FROM HERE — never from
// the client settings blob (a client can't grant itself a tier).
//
// Two orthogonal levers per plan:
//   - tier        → which sources it may search ("core" = 4, "all" = full safe set)
//   - monthlyGrant→ credits topped up each calendar month (the recurring allowance)
// Per-query cost is always 1 credit (pre coverage-proration); plans differ by the
// size of the monthly allowance and the breadth of sources, not the unit price.
//
// Money split: HUMANS subscribe (flat monthly allowance via Stripe subscription);
// AGENTS buy credit PACKS per-query (one-time Stripe checkout). Both spend the same
// credit ledger, so search.js bills identically regardless of how credits arrived.

export const CORE_SOURCE_IDS = ["OPENALEX", "CROSSREF", "DOAJ", "CURATED"];

// Free tier monthly allowance. Verification on the free tier does NOT bump the
// allowance — it only unlocks the $5 Student subscription (500/mo). Kept as a
// named constant (equal to free) so a free-student bump can be re-introduced
// later by changing one number.
export const FREE_MONTHLY_GRANT = 20;
export const FREE_STUDENT_MONTHLY_GRANT = 20;

// freeBelowBand: a query whose coverage band is at/below this is charged 0 — a
// half-blind answer isn't a sellable result (ties to coverage.coverageMultiplier,
// where "limited" already → 0).
export const PLANS = {
  free: {
    id: "free",
    label: "Free",
    tier: "core",
    monthlyGrant: FREE_MONTHLY_GRANT,
    creditCost: 1,
    rateLimit: { windowSeconds: 60, max: 30 },
    freeBelowBand: "limited",
  },
  student: {
    id: "student",
    label: "Student",
    tier: "all",
    monthlyGrant: 500,
    creditCost: 1,
    rateLimit: { windowSeconds: 60, max: 60 },
    freeBelowBand: "limited",
    subscription: true,
    priceEnv: "STRIPE_PRICE_STUDENT",   // Stripe Price id ($5/mo) — set in Vercel env
    requiresStudentVerification: true,
  },
  pro: {
    id: "pro",
    label: "Pro",
    tier: "all",
    monthlyGrant: 1000,
    creditCost: 1,
    rateLimit: { windowSeconds: 60, max: 120 },
    freeBelowBand: "limited",
    subscription: true,
    priceEnv: "STRIPE_PRICE_PRO",       // Stripe Price id ($10/mo)
  },
  machine: {
    id: "machine",
    label: "Machine (pay-as-you-go)",
    tier: "all",
    monthlyGrant: 0,                    // no allowance — agents buy credit packs
    creditCost: 1,
    rateLimit: { windowSeconds: 60, max: 300 },
    freeBelowBand: "limited",
    payg: true,
  },
  // Internal/admin tier — never offered for purchase, provisioned out-of-band
  // (a real user row with plan='admin', or the OPENCITE_API_KEY master key).
  // creditCost 0 + rateLimit.max 0 ⇒ the meter and burst cap are no-ops, so admin
  // traffic is unmetered, uncapped, and all-tier — while STILL attributable to a
  // real userId/keyId (see apiAuth.js Shape B). `admin: true` on the resolved
  // identity (server-derived, never request-honored) is what gates debug=1.
  admin: {
    id: "admin",
    label: "Admin",
    tier: "all",
    monthlyGrant: 0,
    creditCost: 0,
    rateLimit: { windowSeconds: 60, max: 0 },
    freeBelowBand: "limited",
    internal: true,
  },
};

export const DEFAULT_PLAN_ID = "free";

// One-time credit packs for PAYG / machine callers. `priceEnv` names the Stripe
// Price id env var; `credits` are granted on checkout.session.completed.
export const CREDIT_PACKS = {
  pack_10k:  { id: "pack_10k",  credits: 10000,  usd: 10,  priceEnv: "STRIPE_PRICE_PACK_10K" },
  pack_60k:  { id: "pack_60k",  credits: 60000,  usd: 50,  priceEnv: "STRIPE_PRICE_PACK_60K" },
  pack_300k: { id: "pack_300k", credits: 300000, usd: 200, priceEnv: "STRIPE_PRICE_PACK_300K" },
};

export function getPlan(planId) {
  return PLANS[planId] || PLANS[DEFAULT_PLAN_ID];
}

export function getPack(packId) {
  return CREDIT_PACKS[packId] || null;
}

// Effective monthly grant for a user: their plan's allowance, with the free-tier
// student bump applied when they're verified but not on a paid plan.
export function monthlyGrantFor({ plan, isStudentVerified } = {}) {
  const p = getPlan(plan);
  if (p.id === "free" && isStudentVerified) return FREE_STUDENT_MONTHLY_GRANT;
  return p.monthlyGrant;
}

// Resolve a plan's tier to concrete adapter IDs, intersected with the live
// server-safe set passed in by the caller (search.js owns the derived set).
export function allowedSourceIds(plan, serverSafeIds) {
  const safe = new Set(serverSafeIds);
  if (getPlan(plan?.id ?? plan).tier === "all") return [...safe];
  return CORE_SOURCE_IDS.filter((id) => safe.has(id));
}

// Look up the Stripe Price id for a subscription plan or a credit pack, from env.
export function stripePriceId(planOrPack) {
  const env = planOrPack?.priceEnv;
  return env ? process.env[env] || null : null;
}

// Reverse map: a Stripe Price id (from a subscription item or invoice line) → our
// plan id. Used by the webhook to re-sync User.plan on subscription.updated and to
// pick the right allowance on invoice.paid — authoritative from Stripe, not the
// client. Returns null if no subscription plan's price env matches (e.g. env unset).
export function planIdForPriceId(priceId) {
  if (!priceId) return null;
  for (const p of Object.values(PLANS)) {
    if (p.subscription && p.priceEnv && process.env[p.priceEnv] === priceId) return p.id;
  }
  return null;
}
