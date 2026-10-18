// OpenCITE — user-data dispatcher (v0.43.1) · Node runtime
//
// One Serverless Function fronting the five session-authed, Prisma-backed user-data resources
// that were each their own /api file: credits, history, keys, library, settings. On Vercel Hobby
// every Node file under /api is its own Serverless Function (12-per-deployment cap); folding these
// five into one [resource].js frees four slots. The per-resource handlers are unchanged — they
// were moved verbatim to api/_shared/handlers/ (each still does its own session auth + method
// routing); this file only picks the right one by path segment.
//
// Routing: the legacy paths are preserved by vercel.json rewrites
//   /api/credits  → /api/user/credits   (and history | keys | library | settings)
// so the browser keeps calling /api/<resource> and nothing client-side changes.

import credits from "../_shared/handlers/credits.js";
import history from "../_shared/handlers/history.js";
import keys from "../_shared/handlers/keys.js";
import library from "../_shared/handlers/library.js";
import settings from "../_shared/handlers/settings.js";
import health from "../_shared/handlers/health.js";
import telemetry from "../_shared/handlers/telemetry.js";
import usage from "../_shared/handlers/usage.js";
import billingSweep from "../_shared/handlers/billingSweep.js";
import { checkRateLimit, ANON_PLAN } from "../_shared/ratelimit.js";

// v0.46: `health` rides this dispatcher too (see handlers/health.js) — no new function file.
// v0.50: `telemetry` (search-capture beacon + admin views) likewise — see handlers/telemetry.js.
// v0.48: `usage` (journal export) and `billing-sweep` (daily cron: reconcile + meter report +
// prune) likewise — see handlers/usage.js, handlers/billingSweep.js.
const HANDLERS = { credits, history, keys, library, settings, health, telemetry, usage, "billing-sweep": billingSweep };

const clientIp = (req) => {
  const xff = req.headers?.["x-forwarded-for"];
  const first = Array.isArray(xff) ? xff[0] : xff;
  return (first || "").split(",")[0].trim() || "anon";
};

export default async function handler(req, res) {
  const resource = (Array.isArray(req.query?.resource) ? req.query.resource[0] : req.query?.resource) || "";
  const fn = HANDLERS[resource];
  if (!fn) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: `Unknown resource "${resource}"` }));
  }
  // v0.48 (sprint v0.45 T7 remainder): the same pre-auth per-IP window the metered endpoints use,
  // once here for every session route — these used to be entirely unthrottled, so a bad-cookie
  // spray drove unbounded Prisma session lookups. Fail-open on a KV outage (ratelimit.js).
  const rl = await checkRateLimit(`ip:${clientIp(req)}`, ANON_PLAN);
  if (!rl.ok) {
    res.statusCode = 429;
    res.setHeader("Retry-After", String(rl.retryAfter));
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Rate limit exceeded. Please retry later.", code: "rate_limited", retry_after: rl.retryAfter }));
  }
  return fn(req, res);
}
