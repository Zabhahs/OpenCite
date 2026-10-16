// OpenCITE — pricing DISPLAY model (client)
//
// Human-facing copy for the Plans panel. The AUTHORITATIVE billing numbers and entitlement
// logic live server-side in api/_shared/plans.js (the SSOT the webhook, checkout, and search
// middleware read). This module is presentation ONLY — it never gates access. Credit counts
// and the subscription flag are IMPORTED from plans.js so the two can never drift.
//
// v0.46 product decision of record: the web app is free and unmetered (it is the demo); the one
// paid SKU is prepaid API/MCP credit packs for developers and AI-native researchers. The human
// subscription rail is hidden behind SUBSCRIPTIONS_ENABLED (plans.js) until the web app has a
// paid-only feature to sell — the old cards advertised quotas and sources the browser already
// gave away for free.

import { CREDIT_PACKS as PACKS, SUBSCRIPTIONS_ENABLED } from "../../api/_shared/plans.js";
import { ADAPTERS } from "../adapters/index.js";

export { SUBSCRIPTIONS_ENABLED };

// Derived from the registry — never a hand-typed number (the old literals drifted to 20/22/29).
export const SOURCE_COUNT = {
  core: ADAPTERS.filter((a) => a.category === "core").length,
  all: ADAPTERS.filter((a) => a.capability?.serverSafe).length, // what the paid API can reach
  web: ADAPTERS.length,                                          // what the free web app can reach
};

// Human subscriptions — rendered only when SUBSCRIPTIONS_ENABLED (plans.js) is true.
export const SUBSCRIPTION_PLANS = [
  {
    id: "free",
    label: "Free",
    price: "$0",
    cadence: "forever",
    tagline: "Casual research",
    credits: "20 API credits / month",
    sources: `${SOURCE_COUNT.web} databases on the web`,
    features: [
      "Unlimited web search across every source",
      "Saved library + search history sync",
      "20 free API credits every month to try the API",
    ],
    cta: null, // current/default plan — no checkout
  },
  {
    id: "student",
    label: "Student",
    price: "$5",
    cadence: "/ month",
    tagline: "Students & early researchers",
    credits: "500 API credits / month",
    sources: `All ${SOURCE_COUNT.all} API sources`,
    requiresVerification: true,
    features: ["500 API credits every month", "Requires valid student verification", "Everything in Free"],
    cta: "Verify & subscribe",
  },
  {
    id: "pro",
    label: "Pro",
    price: "$10",
    cadence: "/ month",
    tagline: "Power users & professionals",
    credits: "1,000 API credits / month",
    sources: `All ${SOURCE_COUNT.all} API sources`,
    highlight: true,
    features: ["1,000 API credits every month", "Priority rate limits", "Everything in Free, no verification"],
    cta: "Subscribe",
  },
];

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
export const COVERAGE_NOTE =
  "1 credit = 1 API call (search, citations, or ID resolution). Charges are coverage-prorated — low-coverage answers (under ~50% of eligible sources) are free. Credits never expire. Prices in USD.";
