// OpenCITE — Auth Client
// Thin fetch wrappers for Vite frontend ↔ /api/auth/* serverless handler.
// Mirrors the surface of next-auth/react without requiring Next.js.
// Import these in AuthContext.jsx — do not call fetch("/api/auth/...") directly anywhere else.
//
// FIX v.16: Auth.js v5 requires POST to /api/auth/signin/{provider}, not GET.
//           Previous implementation used window.location.href (GET) → UnknownAction error.
//           Now submits a hidden form with CSRF token to satisfy Auth.js POST requirement.

const BASE = "/api/auth";

// ─── getSession ───────────────────────────────────────────────────────────────

export async function getSession() {
  try {
    const res = await fetch(`${BASE}/session`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.user) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── signIn ───────────────────────────────────────────────────────────────────
// Auth.js v5 requires a POST to /api/auth/signin/{provider} with a CSRF token.
// We fetch the CSRF token first, then submit a hidden form — this satisfies
// Auth.js's CSRF check and triggers the OAuth redirect correctly.

export async function signIn(provider, { callbackUrl = window.location.href } = {}) {
  try {
    // 1. Get CSRF token from Auth.js
    const csrfRes = await fetch(`${BASE}/csrf`, { credentials: "include" });
    const { csrfToken } = await csrfRes.json();

    // 2. POST via hidden form — fetch() can't follow cross-origin OAuth redirects
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${BASE}/signin/${provider}`;

    const fields = { csrfToken, callbackUrl };
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }

    document.body.appendChild(form);
    form.submit();
  } catch {
    // Fallback: direct redirect (no CSRF — may fail on some Auth.js versions)
    window.location.href = `${BASE}/signin/${provider}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }
}

// ─── signOut ──────────────────────────────────────────────────────────────────
// Auth.js v5 requires POST for signout too — same hidden-form pattern as signIn.

export async function signOut({ callbackUrl = window.location.href } = {}) {
  try {
    const csrfRes = await fetch(`${BASE}/csrf`, { credentials: "include" });
    const { csrfToken } = await csrfRes.json();

    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${BASE}/signout`;

    const fields = { csrfToken, callbackUrl };
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }

    document.body.appendChild(form);
    form.submit();
  } catch {
    window.location.href = `${BASE}/signout?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }
}

// ─── getCsrfToken ─────────────────────────────────────────────────────────────

export async function getCsrfToken() {
  try {
    const res = await fetch(`${BASE}/csrf`, { credentials: "include" });
    const { csrfToken } = await res.json();
    return csrfToken ?? null;
  } catch {
    return null;
  }
}
