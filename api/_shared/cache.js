// OpenCITE — result cache SSOT (WS5)
//
// Caches the FINAL origin-blind JSON payload of /api/search, keyed by a
// canonicalization of the request inputs that affect the result. Built on the
// KV SSOT (kv.js), so it inherits the same fail-open contract: a cache miss or a
// KV outage NEVER blocks a search — it just falls through to a live fan-out.
//
// Placement (per WS3 middleware order): after rate-limit, before fan-out / charge.
// Charge-on-hit is a billing decision made in search.js (default yes) — the cache
// stores the coverage band inside the payload so the hit can be charged the same
// coverage-prorated amount as the original.

import { createHash } from "crypto";
import { get, set, isConfigured } from "./kv.js";

const KEY_PREFIX = "oc:cache:v1:";
// Default TTL — 6h. Scholarly results are slow-moving; tune in 1–24h range.
export const DEFAULT_TTL_SECONDS = 6 * 60 * 60;

export { isConfigured };

// Canonicalize the result-affecting inputs into a stable key. Anything that can
// change the response body must be included; anything cosmetic must be excluded.
//   query    — raw q string (kept verbatim; ';' multi-term is part of the query)
//   sources  — SORTED + upper-cased selected adapter IDs (order-independent)
//   limit, authors, format — all change the payload
// mailto is excluded (polite-pool contact only; doesn't change results).
export function cacheKey({ query, sources = [], limit, authors, format }) {
  const canonical = JSON.stringify({
    q: String(query ?? "").trim(),
    s: [...sources].map((x) => String(x).toUpperCase()).sort(),
    l: Number(limit) || 0,
    a: authors ? 1 : 0,
    f: String(format || "json").toLowerCase(),
  });
  const hash = createHash("sha256").update(canonical).digest("base64url").slice(0, 32);
  return `${KEY_PREFIX}${hash}`;
}

// Read a cached payload. Returns the parsed object, or null on miss / KV down.
export async function readCache(key) {
  const raw = await get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null; // corrupted entry → treat as miss
  }
}

// Store a payload. Best-effort: returns true if confirmed written. Never throws.
export async function writeCache(key, payload, ttlSeconds = DEFAULT_TTL_SECONDS) {
  try {
    return await set(key, JSON.stringify(payload), ttlSeconds);
  } catch {
    return false;
  }
}
