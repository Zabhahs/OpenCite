// OpenCITE — Auth Client
// Thin fetch wrappers for Vite frontend ↔ /api/auth/* serverless handler.
// Import these in AuthContext.jsx — do not call /api/auth/* directly elsewhere.

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
    return data?.user ? data : null;
  } catch {
    return null;
  }
}

// ─── postForm ─────────────────────────────────────────────────────────────────
// Auth.js v5 requires POST with a CSRF token for all auth actions.
// Submits a hidden form — fetch() cannot follow cross-origin OAuth redirects.

async function postForm(action, fields = {}) {
  const csrfRes = await fetch(`${BASE}/csrf`, { credentials: "include" });
  const { csrfToken } = await csrfRes.json();

  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;

  for (const [name, value] of Object.entries({ csrfToken, ...fields })) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

// ─── signIn ───────────────────────────────────────────────────────────────────

export async function signIn(provider, { callbackUrl = window.location.href } = {}) {
  try {
    await postForm(`${BASE}/signin/${provider}`, { callbackUrl });
  } catch {
    window.location.href = `${BASE}/signin/${provider}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }
}

// ─── signOut ──────────────────────────────────────────────────────────────────

export async function signOut({ callbackUrl = window.location.href } = {}) {
  try {
    await postForm(`${BASE}/signout`, { callbackUrl });
  } catch {
    window.location.href = `${BASE}/signout?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }
}

// ─── getCsrfToken ─────────────────────────────────────────────────────────────
// Exported for Phase 4 SIWE use.

export async function getCsrfToken() {
  try {
    const res = await fetch(`${BASE}/csrf`, { credentials: "include" });
    const { csrfToken } = await res.json();
    return csrfToken ?? null;
  } catch {
    return null;
  }
}
