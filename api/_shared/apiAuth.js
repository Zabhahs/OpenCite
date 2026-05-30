// OpenCITE — API-key auth SSOT (WS3)
//
// Resolves an incoming /api/search request to a billing identity. AI callers send
// `x-api-key` (no cookies); this maps the key → { userId, plan, keyId } by looking
// up the sha256 hash (never the plaintext) in the api_keys table.
//
// Origin-blind / no-leak: a bad key yields null (caller returns a generic 401) —
// we never reveal whether a key existed-but-revoked vs. never-existed.
//
// Dormant until WS3 is wired: search.js does NOT call this yet. The optional
// OPENCITE_API_KEY master key is retained for internal/admin access and bypasses
// the ledger (treated as the paid tier, no userId).

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
  const master = process.env.OPENCITE_API_KEY;
  if (master && key === master) {
    return { userId: null, keyId: "master", plan: getPlan("paid"), master: true };
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

  return { userId: row.user_id, keyId: row.id, plan: getPlan(row.user?.plan) };
}
