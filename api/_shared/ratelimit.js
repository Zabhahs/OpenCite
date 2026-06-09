// OpenCITE — rate limit SSOT (WS3)
//
// Burst control, SEPARATE from credits: credits are the durable Postgres quota;
// the rate limit is an ephemeral KV fixed-window counter that stops a single key
// from hammering the endpoint. Built on kv.js → FAIL-OPEN: if KV is down or
// unconfigured, the request is allowed (never block a paid call on the limiter).
//
// Dormant until WS3 is wired: search.js does NOT call this yet.

import { incrWithTtl } from "./kv.js";

// ── In-process fallback (F-403) ────────────────────────────────────────────────
// Decision: the limiter stays FAIL-OPEN on a KV outage for BILLING (credits are the
// durable Postgres quota and can't be bypassed via KV), but a KV outage shouldn't drop
// burst protection entirely. This per-instance counter gives best-effort fixed-window
// limiting when KV is unavailable. Caveats: it resets on cold start and is NOT shared
// across instances, so it's a degraded fallback, not a KV replacement. If the
// burst-protection gap is ever deemed unacceptable, the alternative is to fail CLOSED
// and accept rare false-positive 429s on valid paid requests.
const _local = new Map(); // key → { count, epoch }
function localIncr(key, windowSeconds) {
  if (_local.size > 10_000) _local.clear(); // crude bound; entries are tiny & cold-start-scoped
  const epoch = Math.floor(Date.now() / 1000 / windowSeconds);
  const entry = _local.get(key);
  if (!entry || entry.epoch !== epoch) { _local.set(key, { count: 1, epoch }); return 1; }
  entry.count++;
  return entry.count;
}

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

  // KV is the primary counter; on outage (null) fall back to the in-process counter
  // so burst protection degrades rather than disappearing (F-403).
  const count = (await incrWithTtl(key, window)) ?? localIncr(key, window);

  const remaining = Math.max(0, cfg.max - count);
  if (count > cfg.max) {
    // Seconds left in this fixed window.
    const retryAfter = window - (Math.floor(Date.now() / 1000) % window);
    return { ok: false, remaining: 0, retryAfter };
  }
  return { ok: true, remaining, retryAfter: 0 };
}
