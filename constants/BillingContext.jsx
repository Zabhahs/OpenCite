import React, { createContext, useContext } from "react";

/**
 * BillingContext — Phase 3/4 hook point.
 *
 * Currently a stub with Infinity credits (all searches pass).
 * When Phase 2 (Rate Limiting) ships:
 *   - deduct() calls Vercel KV via /api/credits to decrement the leaky bucket
 *   - credits reflects the real balance from Postgres
 *   - tier gates which extension adapters are available to the user
 *
 * When Phase 3 (Stripe) ships:
 *   - tier is populated from the Stripe subscription status
 *   - credits refills on invoice.paid webhook
 *
 * When Phase 4 (Agent billing) ships:
 *   - deduct() routes to Base L2 micropayment for agent actors
 *   - useAuth().isAgent determines which deduction path to take
 *
 * The registry's runSearch() calls deduct() — adapter files are untouched.
 */
const BillingContext = createContext({
  credits: Infinity,
  tier: "free",
  deduct: () => Promise.resolve(true),
});

export function BillingProvider({ children }) {
  // Phase 2+: replace stub with real KV credit balance + tier from auth
  const value = {
    credits: Infinity,
    tier: "free",
    deduct: () => Promise.resolve(true),
  };
  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  return useContext(BillingContext);
}
