import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext.jsx";
import { apiCall } from "../lib/api.js";

/**
 * BillingContext — surfaces the user's credit balance + tier to the client.
 *
 * v0.41 (F-300): mounted in App.jsx and wired to GET /api/credits. On sign-in it
 * reads the real balance/tier from Postgres. Credit gating itself stays server-side
 * (api/_shared/billing.js); deduct() is still a no-op here.
 *
 * v0.44 (T3) contract — mirrors handlers/credits.js, no Infinity anywhere:
 *   - metered 200   → { credits: number, tier }            → credits: N, unlimited: false
 *   - unmetered 200 → { credits: null, unlimited: true }   → credits: null, unlimited: true
 *   - anonymous, non-200 (401/404/503), or network error   → credits UNKNOWN
 *     (credits: null, unlimited: false). Consumers must treat that as "don't show a
 *     number" — never a fake 0 or a fake free balance. Tier stays "free" as the
 *     neutral default (PricingPanel's "Current" badge, F-315).
 */

const UNKNOWN = { credits: null, unlimited: false, tier: "free" };

const BillingContext = createContext({ ...UNKNOWN, deduct: () => Promise.resolve(true) });

export function BillingProvider({ children }) {
  const { user, status } = useAuth();
  const [credits, setCredits] = useState(UNKNOWN.credits);
  const [unlimited, setUnlimited] = useState(UNKNOWN.unlimited);
  const [tier, setTier] = useState(UNKNOWN.tier);

  useEffect(() => {
    // Anonymous → no balance to show; reset to unknown.
    if (status !== "authenticated") {
      setCredits(UNKNOWN.credits); setUnlimited(UNKNOWN.unlimited); setTier(UNKNOWN.tier);
      return;
    }
    let cancelled = false;
    apiCall("/api/credits", "GET")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        if (!data) {
          // Non-200 (e.g. 503 DB outage) → balance unknown. Do NOT fabricate 0/free.
          setCredits(null); setUnlimited(false);
          return;
        }
        if (data.unlimited) {
          setCredits(null); setUnlimited(true);
        } else {
          setCredits(Number(data.credits)); setUnlimited(false);
        }
        if (data.tier) setTier(data.tier);
      })
      .catch(() => {}); // network error → stay unknown
    return () => { cancelled = true; };
  }, [status, user?.id]);

  // No-op for now — spend goes through the server.
  const deduct = useCallback(() => Promise.resolve(true), []);

  return (
    <BillingContext.Provider value={{ credits, unlimited, tier, deduct }}>
      {children}
    </BillingContext.Provider>
  );
}

export function useBilling() {
  return useContext(BillingContext);
}
