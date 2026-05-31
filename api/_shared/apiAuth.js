// OpenCITE — API-key auth SSOT (WS3)
//
// Resolves an incoming /api/search request to a billing identity. AI callers send
// `x-api-key` (no cookies); this maps the key → { userId, plan, keyId } by looking
// up the sha256 hash (never the plaintext) in the api_keys table.
//
// Origin-blind / no-leak: a bad key yields null (caller returns a generic 401) —
// we never reveal whether a key existed-but-revoked vs. never-existed.
//
// The optional OPENCITE_API_KEY master key is retained as documented break-glass
// internal/admin access: it resolves to the `admin` plan (creditCost 0, no rate
// cap, all-tier) with admin:true and no userId — bypassing the ledger.
//
// `admin` is SERVER-DERIVED here (master key, or a user whose plan is 'admin');
// it is NEVER read from the request. search.js gates the origin-revealing debug=1
// mode strictly on this flag, so an ordinary caller can never pierce origin-blindness.

import { prisma } from "./prisma.js";
import { hashApiKey } from "./crypto.js";
import { getPlan } from "./plans.js";
import { getSession } from "./auth.js";

const firstParam = (v) => (Array.isArray(v) ? v[0] : v) ?? "";

// Server-side admin allowlist. Reads the SAME VITE_ADMIN_EMAILS that gates the client
// admin console UI (src/lib/admin.js) — serverless functions can read VITE_-prefixed env
// at runtime; the prefix only governs client-bundle inlining. ADMIN_EMAILS (unprefixed) is
// accepted as a fallback name. Comma-separated, lowercased.
const ADMIN_EMAILS = (process.env.VITE_ADMIN_EMAILS || process.env.ADMIN_EMAILS || "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

// Extract the presented key from header or ?key= (header preferred).
export function presentedKey(req) {
  return req.headers?.["x-api-key"] || firstParam(req.query?.key) || "";
}

// Resolve a request to a billing identity, or null if unauthenticated.
// Returns { userId, keyId, plan } — plan is a PLANS entry (see plans.js).
export async function resolveApiKey(req) {
  const key = presentedKey(req);
  if (!key) return null;

  // Internal/admin master key — full access, no ledger attribution.
  // NOTE: getPlan("admin") (not the old "paid", which fell back to free → the master
  // key was silently metered + core-only). The `admin` plan zeroes cost + rate cap.
  const master = process.env.OPENCITE_API_KEY;
  if (master && key === master) {
    return { userId: null, keyId: "master", plan: getPlan("admin"), master: true, admin: true };
  }

  // Customer key — constant-format hash lookup. The effective plan comes from the
  // USER (their subscription), not the key, so a tier change applies to all keys.
  let row;
  try {
    row = await prisma.apiKey.findUnique({
      where: { key_hash: hashApiKey(key) },
      select: { id: true, user_id: true, revoked: true, user: { select: { plan: true } } },
    });
  } catch {
    return null; // DB hiccup → treat as unauthenticated (caller fails closed on auth)
  }
  if (!row || row.revoked) return null;

  // Best-effort last-used stamp; never block auth on it.
  prisma.apiKey
    .update({ where: { id: row.id }, data: { last_used_at: new Date() } })
    .catch(() => {});

  return {
    userId: row.user_id,
    keyId: row.id,
    plan: getPlan(row.user?.plan),
    admin: row.user?.plan === "admin",
  };
}

// Session-based admin break-glass for the browser admin console (Score Explainer / Gold-Set
// Harness). /api/search is API-key-only for normal, billed traffic — but those tools run from
// the signed-in admin's browser with a session cookie and no API key. This grants an ADMIN
// identity (plan='admin' → creditCost 0, no rate cap, all-tier, admin:true so debug/simple
// unlock) when the request carries a valid Auth.js session whose email is in ADMIN_EMAILS
// (the SAME VITE_ADMIN_EMAILS list that gates the client console UI). A non-admin or anonymous
// session returns null, so the caller falls through to the standard 401 — sessions never open
// the metered endpoint for anyone but an allowlisted admin. The real userId is preserved so
// the (cost-0) traffic stays attributable.
export async function resolveSessionAdmin(req) {
  if (!ADMIN_EMAILS.length) return null;
  const user = await getSession(req);
  const email = user?.email?.toLowerCase();
  if (!email || !ADMIN_EMAILS.includes(email)) return null;
  return { userId: user.id ?? null, keyId: "session-admin", plan: getPlan("admin"), admin: true };
}
