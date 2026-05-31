// OpenCITE — pricing DISPLAY model (client)
//
// Human-facing copy for the Plans panel. The AUTHORITATIVE billing numbers and
// entitlement logic live server-side in api/_shared/plans.js (the SSOT the webhook,
// checkout, and search middleware read). This module is presentation ONLY — it never
// gates access. Keep the figures below in sync with plans.js when they change:
//   free 20/mo (verification unlocks the $5 plan, no free bump)· student $5 → 500 · pro $10 → 1,000
//   packs $10/10k · $50/60k · $200/300k
//
// `rail` encodes HOW each item is sold so the CTA can route correctly:
//   - subscriptions: "stripe" on web/desktop, Apple/Google IAP on native mobile
//     (resolved at runtime via lib/platform.subscriptionRail).
//   - packs: always "stripe" — developer/agent facing, bought on the web dashboard.

export const SOURCE_COUNT = { core: 4, all: 22 };

// Human subscriptions (flat monthly allowance).
export const SUBSCRIPTION_PLANS = [
  {
    id: "free",
    label: "Free",
    price: "$0",
    cadence: "forever",
    tagline: "Casual research",
    credits: "20 searches / month",
    sources: `${SOURCE_COUNT.core} core databases`,
    features: [
      "20 searches every month",
      "Core scholarly databases",
      "Saved library + search history sync",
    ],
    cta: null, // current/default plan — no checkout
  },
  {
    id: "student",
    label: "Student",
    price: "$5",
    cadence: "/ month",
    tagline: "Students & early researchers",
    credits: "500 searches / month",
    sources: `All ${SOURCE_COUNT.all} databases`,
    requiresVerification: true,
    features: [
      "500 searches every month",
      `All ${SOURCE_COUNT.all} databases`,
      "Requires valid student verification",
      "Everything in Free",
    ],
    cta: "Verify & subscribe",
  },
  {
    id: "pro",
    label: "Pro",
    price: "$10",
    cadence: "/ month",
    tagline: "Power users & professionals",
    credits: "1,000 searches / month",
    sources: `All ${SOURCE_COUNT.all} databases`,
    highlight: true,
    features: [
      "1,000 searches every month",
      `All ${SOURCE_COUNT.all} databases`,
      "Priority rate limits",
      "Everything in Student, no verification",
    ],
    cta: "Subscribe",
  },
];

// Machine / API credit packs (pay-as-you-go, one-time). For developers wiring the
// origin-blind grounding API and AI agents making per-query calls.
export const CREDIT_PACKS = [
  { id: "pack_10k",  price: "$10",  credits: "10,000 queries",  unit: "$0.0010 / query" },
  { id: "pack_60k",  price: "$50",  credits: "60,000 queries",  unit: "$0.00083 / query", best: true },
  { id: "pack_300k", price: "$200", credits: "300,000 queries", unit: "$0.00067 / query" },
];

// Coverage-prorated billing: a query is charged in proportion to how much of the
// eligible library answered; results below ~50% coverage are free. Surfaced as a
// footnote so buyers understand they're not billed for blind answers.
export const COVERAGE_NOTE =
  "1 credit = 1 search. Charges are coverage-prorated — low-coverage answers (under ~50% of eligible sources) are free.";
