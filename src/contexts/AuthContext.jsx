// OpenCITE — AuthContext
// Replaces the Phase 0 stub with a live session backed by Auth.js v5 + Supabase.
//
// Phase 4 hook: SIWE / Base L2 wallet auth — marked below.
// BillingContext reads: user?.id (internal_id UUID)
// runSearch() reads: nothing directly — BillingContext mediates credits.

import { createContext, useContext, useEffect, useState } from "react";
import { getSession, signIn, signOut } from "../lib/auth-client";

// ─── Context shape ────────────────────────────────────────────────────────────

const AuthContext = createContext({
  user: null,               // { id, name, email, image } | null
  status: "loading",        // "loading" | "authenticated" | "unauthenticated"
  signIn,                   // (provider) => void
  signOut,                  // () => void
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;

    getSession().then((session) => {
      if (cancelled) return;
      if (session?.user) {
        setUser(session.user);
        setStatus("authenticated");
      } else {
        setUser(null);
        setStatus("unauthenticated");
      }
    });

    return () => { cancelled = true; };
  }, []);

  // ── PHASE 4 HOOK — SIWE / Base L2 ──────────────────────────────────────────
  // Add wallet connection state here.
  // On successful SIWE verification, call getSession() to sync internal_id.
  // Both OIDC and SIWE sessions resolve to the same user.id (internal_id UUID).
  // ── END PHASE 4 HOOK ───────────────────────────────────────────────────────

  return (
    <AuthContext.Provider value={{ user, status, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}
