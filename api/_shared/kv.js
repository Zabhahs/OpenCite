// OpenCITE — KV SSOT (WS3 rate limit + WS5 cache)
//
// Thin REST client for Upstash Redis / Vercel KV. Dependency-free: talks the
// Upstash REST protocol over fetch, so no package install is required.
//
// CONFIG (provision any one pair; checked in this order):
//   KV_REST_API_URL        + KV_REST_API_TOKEN          (Vercel KV)
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (Upstash direct)
//
// FAIL-OPEN by contract: if KV is not configured or a call errors, every method
// resolves to a miss/no-op (get→null, incr→null, set→false). Callers must treat
// a null/false as "KV unavailable" and proceed WITHOUT blocking the request — a
// paid search must never fail because the cache or limiter is down.

import { log } from "./log.js";

function config() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

export function isConfigured() {
  return config() !== null;
}

// Run one Upstash REST command, e.g. cmd(["GET", key]) or cmd(["SET", k, v, "EX", 60]).
// Returns the parsed `result` field, or null on any failure (fail-open).
async function cmd(parts) {
  const cfg = config();
  if (!cfg) return null;
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parts.map(String)),
    });
    if (!res.ok) {
      log.warn("kv", "http-error", { status: res.status });
      return null;
    }
    const json = await res.json();
    return json?.result ?? null;
  } catch (err) {
    log.warn("kv", "unavailable", { msg: err.message });
    return null;
  }
}

export async function get(key) {
  return cmd(["GET", key]);
}

// Set with optional TTL (seconds). Returns true on confirmed OK, false otherwise.
export async function set(key, value, ttlSeconds) {
  const parts = ["SET", key, value];
  if (Number.isFinite(ttlSeconds) && ttlSeconds > 0) parts.push("EX", Math.floor(ttlSeconds));
  const result = await cmd(parts);
  return result === "OK";
}

// Atomic increment; sets TTL only on first increment (value became 1). Returns the
// new count, or null if KV is unavailable (caller fails open → allow the request).
export async function incrWithTtl(key, ttlSeconds) {
  const count = await cmd(["INCR", key]);
  if (count === 1 && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
    await cmd(["EXPIRE", key, Math.floor(ttlSeconds)]);
  }
  return typeof count === "number" ? count : null;
}

// Seconds until `key` expires (-1 no TTL, -2 missing); null if KV unavailable.
export async function ttl(key) {
  const t = await cmd(["TTL", key]);
  return typeof t === "number" ? t : null;
}

// Atomic "claim once" idempotency primitive, built on INCR so the result is
// UNAMBIGUOUS (unlike SET NX, whose null reply collides with a KV outage):
//   true  → we claimed it first (count became 1)   → safe to do the side effect
//   false → already claimed (count > 1)             → duplicate, skip
//   null  → KV unavailable                          → caller decides fail open/closed
export async function claimOnce(key, ttlSeconds) {
  const count = await incrWithTtl(key, ttlSeconds);
  if (count === null) return null;
  return count === 1;
}
