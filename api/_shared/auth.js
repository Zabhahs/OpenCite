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

// OpenCITE's own Vercel deployments: the production domains above PLUS any preview
// under the `opencite` project — `opencite.vercel.app` and `opencite-<branch|hash>.vercel.app`
// (preview hosts contain hyphens). SSOT for every "is this one of ours?" check below
// and in checkout.js / requireInternalOrigin.js (F-415). NOTE this replaces the old
// `endsWith(".vercel.app")` test, which trusted *any* Vercel project (incl. evil.vercel.app).
export const OWN_VERCEL_HOST_RE = /^opencite[a-z0-9-]*\.vercel\.app$/;

// True if `origin` (a full "https://host" string) is one of ours.
export function isTrustedOrigin(origin) {
  if (!origin) return false;
  if (TRUSTED_ORIGINS.includes(origin)) return true;
  try { return OWN_VERCEL_HOST_RE.test(new URL(origin).host); } catch { return false; }
}

// True if `host` (a bare "host[:port]") is one of ours, or a local dev host. Used to
// pin the getSession loopback below to a known host (F-401).
export function isTrustedHost(host) {
  if (!host) return false;
  if (host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1")) return true;
  if (TRUSTED_ORIGINS.some((o) => new URL(o).host === host)) return true;
  return OWN_VERCEL_HOST_RE.test(host);
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// Sets origin-aware CORS headers. Wildcard is intentionally avoided —
// browsers reject cookies with credentials:include when origin is *.

export function setCorsHeaders(req, res, methods = "GET, POST, DELETE, OPTIONS") {
  const origin = req.headers.origin;
  if (isTrustedOrigin(origin)) {
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
  // F-401: the loopback fetch carries the session cookie, so an attacker-spoofed
  // x-forwarded-host could redirect it to a host they control. Pin to a known-good
  // host (prod domains, our Vercel previews, or localhost); otherwise fall back to
  // the canonical prod origin. On Vercel this header is platform-set, so this is
  // defence-in-depth for non-Vercel/edge-case deployments.
  const rawHost = (req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim();
  const host = isTrustedHost(rawHost) ? rawHost : new URL(TRUSTED_ORIGINS[0]).host;
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
