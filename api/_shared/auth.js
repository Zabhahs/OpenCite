// OpenCITE — Server-side auth helpers
// Imported by: api/auth/handler.js, api/history.js, api/library.js, api/settings.js
// Never duplicate these inline in route files.

// ── Trusted origins ───────────────────────────────────────────────────────────
// SSOT for both the Auth.js redirect callback and CORS headers.
// Add new domains here only.

export const TRUSTED_ORIGINS = [
  "https://citation.today",
  "https://opencite.space",
];

// ── CORS ──────────────────────────────────────────────────────────────────────
// Sets origin-aware CORS headers. Wildcard is intentionally avoided —
// browsers reject cookies with credentials:include when origin is *.

export function setCorsHeaders(req, res, methods = "GET, POST, DELETE, OPTIONS") {
  const origin = req.headers.origin;
  if (
    origin &&
    (TRUSTED_ORIGINS.includes(origin) || origin.endsWith(".vercel.app"))
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", methods);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}

// ── getSession ────────────────────────────────────────────────────────────────
// Resolves the Auth.js session from the incoming request's cookie.
// Returns the user object ({ id, name, email }) or null.
// x-forwarded-proto split handles Vercel edge "https,https" format.

export async function getSession(req) {
  const protocol = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim();
  try {
    const res = await fetch(`${protocol}://${host}/api/auth/session`, {
      headers: { cookie: req.headers.cookie ?? "" },
    });
    const data = await res.json();
    return data?.user?.id ? data.user : null;
  } catch {
    return null;
  }
}
