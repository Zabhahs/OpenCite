import React, { createContext, useContext } from "react";

/**
 * AuthContext — Phase 1 hook point.
 *
 * Currently a stub. When Phase 1 (Identity) ships:
 *   - Replace the stub value with a real NextAuth.js session for OIDC users
 *   - Add SIWE (Sign-In with Ethereum) for autonomous agent actors
 *   - Both paths map to the same internal_id in Postgres
 *
 * Nothing else in the tree needs to change — consumers already call useAuth().
 */
const AuthContext = createContext({
  user: null,
  isAgent: false,
  signIn: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
});

export function AuthProvider({ children }) {
  // Phase 1: replace this stub with NextAuth SessionProvider + SIWE resolver
  const value = {
    user: null,
    isAgent: false,
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
