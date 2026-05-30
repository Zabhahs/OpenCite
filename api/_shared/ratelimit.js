// OpenCITE — rate limit SSOT (WS3)
//
// Burst control, SEPARATE from credits: credits are the durable Postgres quota;
// the rate limit is an ephemeral KV fixed-window counter that stops a single key
// from hammering the endpoint. Built on kv.js → FAIL-OPEN: if KV is down or
// unconfigured, the request is allowed (never block a paid call on the limiter).
//
// Dormant until WS3 is wired: search.js does NOT call this yet.

import { incrWithTtl } from "./kv.js";

// checkRateLimit(identity, plan) → { ok, remaining, retryAfter }
//   identity — stable per-caller id (keyId for customers, ip fallback).
//   plan     — a PLANS entry; uses plan.rateLimit { windowSeconds, max }.
// ok:false means over the limit → caller responds 429 with Retry-After.
export async function checkRateLimit(identity, plan) {
  const cfg = plan?.rateLimit;
  if (!identity || !cfg?.max) return { ok: true, remaining: Infinity, retryAfter: 0 };

  const window = cfg.windowSeconds;
  // Fixed window bucket: one key per (identity, window epoch).
  const epoch = Math.floor(Date.now() / 1000 / window);
  const key = `oc:rl:${identity}:${epoch}`;

  const count = await incrWithTtl(key, window);
  if (count === null) return { ok: true, remaining: Infinity, retryAfter: 0 }; // fail-open

  const remaining = Math.max(0, cfg.max - count);
  if (count > cfg.max) {
    // Seconds left in this fixed window.
    const retryAfter = window - (Math.floor(Date.now() / 1000) % window);
    return { ok: false, remaining: 0, retryAfter };
  }
  return { ok: true, remaining, retryAfter: 0 };
}
