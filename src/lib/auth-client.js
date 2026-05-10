// OpenCITE — Auth Client
// Thin fetch wrappers for Vite frontend ↔ /api/auth/* serverless handler.
// Mirrors the surface of next-auth/react without requiring Next.js.
// Import these in AuthContext.jsx — do not call fetch("/api/auth/...") directly anywhere else.

const BASE = "/api/auth";

// ─── getSession ───────────────────────────────────────────────────────────────
// Returns the current session object or null.
// Shape: { user: { id, name, email, image }, expires } | null

export async function getSession() {
  try {
    const res = await fetch(`${BASE}/session`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Auth.js returns {} (empty object) when no session — normalise to null
    if (!data || !data.user) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── signIn ───────────────────────────────────────────────────────────────────
// Redirects to the provider OAuth flow.
// provider: "google" | "apple" | "microsoft-entra-id"
// callbackUrl: where to land after auth (defaults to current page)

export function signIn(provider, { callbackUrl = window.location.href } = {}) {
  const params = new URLSearchParams({ callbackUrl });
  window.location.href = `${BASE}/signin/${provider}?${params}`;
}

// ─── signOut ──────────────────────────────────────────────────────────────────
// Ends session server-side then redirects.

export function signOut({ callbackUrl = window.location.href } = {}) {
  const params = new URLSearchParams({ callbackUrl });
  window.location.href = `${BASE}/signout?${params}`;
}

// ─── getCsrfToken ─────────────────────────────────────────────────────────────
// Needed if you POST to /api/auth/* endpoints directly (e.g. credentials provider).
// Unused in Phase 1 (OIDC only) — exported for Phase 4 SIWE use.

export async function getCsrfToken() {
  try {
    const res = await fetch(`${BASE}/csrf`, { credentials: "include" });
    const { csrfToken } = await res.json();
    return csrfToken ?? null;
  } catch {
    return null;
  }
}
