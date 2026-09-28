// OpenCITE — Server-side auth helpers
// Imported by: api/auth/handler.js, api/checkout.js, api/_shared/apiAuth.js, and the
// session-authed handlers (history, library, settings, keys, credits).
// Never duplicate these inline in route files.

import { prisma } from "./prisma.js";

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
// Resolves the Auth.js session from the incoming request's cookie, IN-PROCESS.
//
// v0.44 T3: replaces the old loopback self-fetch (`fetch https://<host>/api/auth/session`),
// which doubled serverless invocations and added a full HTTP round-trip of latency to
// every session-authed request — and needed host-pinning (isTrustedHost, F-401) purely
// to stop the cookie-bearing loopback being redirected via a spoofed x-forwarded-host.
// With the loopback gone, that pinning helper is gone too (nothing else used it).
//
// We use DATABASE sessions: api/auth/handler.js configures PrismaAdapter with no
// `session.strategy` override, so the Auth.js v5 default for adapter setups applies —
// the cookie (`authjs.session-token`, or `__Secure-authjs.session-token` over HTTPS)
// carries an opaque sessionToken that maps to a `sessions` row (prisma/schema.prisma:
// Session.sessionToken → userId + expires). One indexed SELECT replaces the loopback;
// expiry is enforced the same way Auth.js does (expires > now).
//
// Returns the SAME flat-user shape the loopback produced — { id, name, email, image }
// or null. Callers (handlers/*, apiAuth.resolveSessionAdmin, checkout, meter) read
// user.id / user.email directly; do not change this contract.

// Secure-prefixed name first: when both are somehow present, the HTTPS cookie wins.
const SESSION_COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"];

// Minimal cookie-header parse — first occurrence of a name wins (RFC 6265 order:
// most specific path first), value percent-decoded when possible.
function sessionTokenFromCookies(cookieHeader) {
  if (!cookieHeader) return null;
  const jar = Object.create(null);
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name in jar) continue;
    let value = part.slice(eq + 1).trim();
    try { value = decodeURIComponent(value); } catch { /* keep raw */ }
    jar[name] = value;
  }
  for (const name of SESSION_COOKIE_NAMES) {
    if (jar[name]) return jar[name];
  }
  return null;
}

export async function getSession(req) {
  const sessionToken = sessionTokenFromCookies(req.headers?.cookie);
  if (!sessionToken) return null;
  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      select: {
        expires: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
    if (!session?.user?.id) return null;
    if (new Date(session.expires).getTime() <= Date.now()) return null;
    return session.user;
  } catch {
    // DB hiccup → unauthenticated, matching the old loopback's catch behavior.
    return null;
  }
}
