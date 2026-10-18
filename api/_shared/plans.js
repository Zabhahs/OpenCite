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

// v0.48 (D-14): NO free API credits. The free plan is the web app (FREE_WEB_DAILY_SEARCHES) plus
// the verify trial (TRIAL); API/MCP calls need a paid plan or purchased credits. Both constants
// stay named so a future free allowance is a one-number change.
export const FREE_MONTHLY_GRANT = 0;
export const FREE_STUDENT_MONTHLY_GRANT = 0;

// v0.48 (directive 3b / D-4): the keyless, card-less trial — `verify` only, per identity per UTC
// day. Enforced by api/_shared/trial.js (Postgres counter). Every other endpoint stays metered.
export const TRIAL = { endpoint: "verify", refsPerDay: 25 };

// v0.48 metered plan price (display SSOT; the Stripe Price is the billing truth and M4 keeps
// them equal). $2.50 per 1,000 search calls = half of Brave's search rate.
export const API_UNIT_PRICE_USD = 0.0025;

// v0.47: web searches per UTC day for anyone NOT on a paid plan (signed-out visitors and the
// free plan). Web search runs in the browser, so this is a soft client-side cap
// (src/lib/searchQuota.js), not server-enforced — it is the visible reason to subscribe.
export const FREE_WEB_DAILY_SEARCHES = 10;

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
    // v0.47: honor system — no verification flow ever existed to set users.is_student_verified,
    // so the old gate made Student unpurchasable. Misuse is handled by downgrading the account.
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
    label: "Prepaid credits",
    tier: "all",
    monthlyGrant: 0,                    // no allowance — agents buy credit packs
    creditCost: 1,
    rateLimit: { windowSeconds: 60, max: 300 },
    freeBelowBand: "limited",
    payg: true,
  },
  // v0.48 (Brave model, directive 2/3a): the metered API subscription. $0 base, a card at Checkout,
  // usage invoiced monthly in arrears at API_UNIT_PRICE_USD per unit, and — like Brave's included
  // credit — an allowance of 1,000 units a month (= $2.50) that resets each period. Spending order
  // is allowance → purchased packs → metered (billing.js preAuthorize). Postpaid plans serve only
  // while subscription_status = active, and never unlock unlimited web search (D-1/D-8).
  api: {
    id: "api",
    label: "API (pay as you go)",
    tier: "all",
    monthlyGrant: 1000,
    creditCost: 1,
    rateLimit: { windowSeconds: 60, max: 300 },
    freeBelowBand: "limited",
    subscription: true,
    postpaid: true,
    priceEnv: "STRIPE_PRICE_API_METERED", // Stripe metered Price id (meter-backed) — set in Vercel env
    unitPriceUsd: API_UNIT_PRICE_USD,
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

// v0.48: per-endpoint billing weight, in units of ONE search call (plan.creditCost). Cheap
// lookups (NCBI id crosswalk, a single-reference verification) cost a tenth of a search so
// the anti-hallucination path is the low-cost entry point. `qty` scales the weight (verify
// bills per reference). This is the ONLY place the per-endpoint price lives — meter.js and
// search.js read it; docs/pricing copy quote it.
export const ENDPOINT_UNITS = {
  search: 1,
  citations: 1,
  works: 1,       // one work + its citation graph
  works_meta: 0.1, // one work's record + ids only (no graph)
  ids: 0.1,
  verify: 0.1,    // per reference
};

export function unitCost(plan, endpoint, qty = 1) {
  const units = ENDPOINT_UNITS[endpoint] ?? 1;
  const n = Number.isFinite(qty) && qty > 0 ? qty : 1;
  // round4 mirrors billing.js settlement precision (Decimal(12,4) ledger).
  return Math.round((plan?.creditCost ?? 1) * units * n * 1e4) / 1e4;
}

// v0.47: personal subscriptions (Student/Pro) are the headline offer on the Plans panel; credit
// packs move under a "volume users & organizations" disclosure. What a subscription now buys a
// browser user: unlimited web search (free = FREE_WEB_DAILY_SEARCHES/day) + the monthly API
// allowance. (v0.46 had hidden this rail because the web app was unmetered.) checkout.js refuses
// plan checkouts and PricingPanel hides the cards while this is false.
export const SUBSCRIPTIONS_ENABLED = true;

// True when a plan id (BillingContext `tier`) searches the web without the daily cap: a FLAT-FEE
// subscription (Student/Pro) or an internal plan. v0.48 (D-8, closes leak L1): neither a prepaid
// pack (`machine`) nor the $0-base metered `api` plan unlocks unlimited web — a $10 pack used to
// buy it forever, undercutting Pro at $10/month. Unknown/missing ids resolve to free → capped.
export function hasUnlimitedWebSearch(planId) {
  const p = getPlan(planId);
  return !!((p.subscription && !p.postpaid) || p.internal);
}

// v0.48: postpaid (metered) plans bill usage in arrears; billing.js spends their third bucket.
export function isPostpaid(planId) {
  return !!getPlan(planId).postpaid;
}

// v0.48 (closes leak L2): the plan a user falls back to when a subscription ends. A user who ever
// bought a pack keeps the `machine` tier (their credits are still theirs); everyone else → free.
export function downgradePlanFor(user) {
  return user?.pack_purchased_at ? PACK_BUYER_PLAN_ID : DEFAULT_PLAN_ID;
}

// True when a plan id implies the user has paid through Stripe (subscriber or pack buyer), i.e.
// there is a Stripe Customer whose billing the Customer Portal can manage (v0.47).
export function isPaidPlan(planId) {
  const p = getPlan(planId);
  return !!(p.subscription || p.payg);
}

// One-time credit packs for PAYG / machine callers. `priceEnv` names the Stripe Price id env
// var; `credits` are granted on checkout.session.completed (webhook), which ALSO moves a free
// user to the `machine` plan so the credits are spendable across the full tier.
//
// v0.46 repricing (cost-plus): OpenAlex bills $0.001 per search call (since Feb 2026), so the old
// $0.00067–$0.001/query packs lost money on the flagship source alone. The Stripe Prices (env var
// names) are unchanged — only the credits granted per price change. Pack ids keep their
// historical names so existing checkout metadata keeps resolving.
// v0.48 (D-12): repriced to the metered rate ($2.50 / 1k = API_UNIT_PRICE_USD) so packs are the
// prepaid option for buyers who can't run postpaid card billing, never a discount below metered:
// $10 → 4,000 · $50 → 20,000 · $150 → 60,000 (the live Stripe price for the top pack is $150).
export const CREDIT_PACKS = {
  pack_10k:  { id: "pack_10k",  credits: 4000,  usd: 10,  priceEnv: "STRIPE_PRICE_PACK_10K" },
  pack_60k:  { id: "pack_60k",  credits: 20000, usd: 50,  priceEnv: "STRIPE_PRICE_PACK_60K" },
  pack_300k: { id: "pack_300k", credits: 60000, usd: 150, priceEnv: "STRIPE_PRICE_PACK_300K" },
};

// Plan a pack buyer lands on when they are still on the free tier: the full server-safe set at the
// machine burst cap. Subscribers keep their plan (packs never downgrade).
export const PACK_BUYER_PLAN_ID = "machine";

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
