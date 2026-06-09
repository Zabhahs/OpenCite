import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext.jsx";
import { apiCall } from "../lib/api.js";

/**
 * BillingContext — surfaces the user's credit balance + tier to the client.
 *
 * v0.41 (F-300): mounted in App.jsx and wired to GET /api/credits. On sign-in it
 * reads the real balance/tier from Postgres; anonymous (or any failure) falls back
 * to the Infinity/"free" stub so the UI never blocks. Credit gating itself stays
 * server-side (api/_shared/billing.js); deduct() is still a no-op here — spend-side
 * wiring is a later sprint (v0.42, F-311).
 */

// Stub fallback — anonymous users, or any fetch/DB failure. Infinity credits => UI
// shows no limit; the server is the real gate.
const STUB = { credits: Infinity, tier: "free" };

const BillingContext = createContext({ ...STUB, deduct: () => Promise.resolve(true) });

export function BillingProvider({ children }) {
  const { user, status } = useAuth();
  const [credits, setCredits] = useState(STUB.credits);
  const [tier, setTier] = useState(STUB.tier);

  useEffect(() => {
    // Reset to the stub whenever the user is not authenticated.
    if (status !== "authenticated") { setCredits(STUB.credits); setTier(STUB.tier); return; }
    let cancelled = false;
    apiCall("/api/credits", "GET")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data) return;
        setCredits(data.credits);
        setTier(data.tier);
      })
      .catch(() => {}); // network error → keep the stub
    return () => { cancelled = true; };
  }, [status, user?.id]);

  // No-op for now — spend goes through the server. v0.42 wires real deduction.
  const deduct = useCallback(() => Promise.resolve(true), []);

  return (
    <BillingContext.Provider value={{ credits, tier, deduct }}>
      {children}
    </BillingContext.Provider>
  );
}

export function useBilling() {
  return useContext(BillingContext);
}
