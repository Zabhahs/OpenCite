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

const firstParam = (v) => (Array.isArray(v) ? v[0] : v) ?? "";

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
