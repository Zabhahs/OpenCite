// OpenCITE — pricing DISPLAY model (client)
//
// Human-facing copy for the Plans panel. The AUTHORITATIVE billing numbers and entitlement
// logic live server-side in api/_shared/plans.js (the SSOT the webhook, checkout, and search
// middleware read). This module is presentation ONLY — it never gates access. Credit counts
// and the subscription flag are IMPORTED from plans.js so the two can never drift.
//
// v0.47: the two personal subscriptions (Student/Pro) are the headline offer — they lift the free
// web cap (FREE_WEB_DAILY_SEARCHES/day) and carry a monthly API allowance. Prepaid credit packs
// are the volume/organization offer, shown under a disclosure. SUBSCRIPTIONS_ENABLED (plans.js)
// remains the kill switch for the subscription cards.

import { CREDIT_PACKS as PACKS, PLANS, SUBSCRIPTIONS_ENABLED, FREE_WEB_DAILY_SEARCHES, isPaidPlan } from "../../api/_shared/plans.js";
import { ADAPTERS } from "../adapters/index.js";

export { SUBSCRIPTIONS_ENABLED, isPaidPlan };

// Derived from the registry — never a hand-typed number (the old literals drifted to 20/22/29).
export const SOURCE_COUNT = {
  core: ADAPTERS.filter((a) => a.category === "core").length,
  all: ADAPTERS.filter((a) => a.capability?.serverSafe).length, // what the paid API can reach
  web: ADAPTERS.length,                                          // what the free web app can reach
};

// The two personal subscriptions — rendered only when SUBSCRIPTIONS_ENABLED (plans.js) is true.
// Free is not a card: the panel intro states the free daily allowance. Credit counts come from
// plans.js; prices must match the Stripe Prices behind STRIPE_PRICE_STUDENT / STRIPE_PRICE_PRO.
const monthly = (planId) => `${PLANS[planId].monthlyGrant.toLocaleString()} API credits every month`;
export const SUBSCRIPTION_PLANS = [
  {
    id: "student",
    label: "Student",
    price: "$5",
    cadence: "/ month",
    tagline: "Students & early researchers",
    features: [
      "Unlimited web search",
      monthly("student"),
      `All ${SOURCE_COUNT.all} API sources`,
      "For enrolled students (honor system)",
    ],
    cta: "Subscribe — $5/mo",
  },
  {
    id: "pro",
    label: "Pro",
    price: "$10",
    cadence: "/ month",
    tagline: "Researchers & professionals",
    highlight: true,
    features: [
      "Unlimited web search",
      monthly("pro"),
      `All ${SOURCE_COUNT.all} API sources`,
      "Higher API rate limits",
    ],
    cta: "Subscribe — $10/mo",
  },
];

export const FREE_TIER_NOTE =
  `Free: ${FREE_WEB_DAILY_SEARCHES} web searches a day plus ${PLANS.free.monthlyGrant} API credits a month — no card needed.`;

// Machine / API credit packs (pay-as-you-go, one-time). For developers wiring the grounding API
// and AI agents making per-query calls. Credits come from plans.js (SSOT); only the copy is here.
const perK = (usd, credits) => `$${(usd / (credits / 1000)).toFixed(2)} / 1k queries`;
export const CREDIT_PACKS = [
  { id: "pack_10k",  price: `$${PACKS.pack_10k.usd}`,  credits: `${PACKS.pack_10k.credits.toLocaleString()} queries`,  unit: perK(PACKS.pack_10k.usd,  PACKS.pack_10k.credits) },
  { id: "pack_60k",  price: `$${PACKS.pack_60k.usd}`,  credits: `${PACKS.pack_60k.credits.toLocaleString()} queries`,  unit: perK(PACKS.pack_60k.usd,  PACKS.pack_60k.credits), best: true },
  { id: "pack_300k", price: `$${PACKS.pack_300k.usd}`, credits: `${PACKS.pack_300k.credits.toLocaleString()} queries`, unit: perK(PACKS.pack_300k.usd, PACKS.pack_300k.credits) },
];

// Coverage-prorated billing: a query is charged in proportion to how much of the eligible
// library answered; results below ~50% coverage are free. Surfaced as a footnote so buyers
// understand they're not billed for blind answers.
// v0.48: per-endpoint weights come from plans.js ENDPOINT_UNITS (SSOT) — quoted, never retyped.
export const COVERAGE_NOTE =
  "1 credit = one search or citation-graph call; verifying a reference or resolving an identifier costs 0.1. Charges are coverage-prorated — low-coverage answers (under ~50% of eligible sources) are free, and a call whose sources all failed is never charged. Credits never expire. Prices in USD.";
