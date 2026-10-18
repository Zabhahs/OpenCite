// OpenCITE — GET /api/usage (v0.48 Phase 2; mounted via api/user/[resource].js)
//
// Usage export from the credit_events journal, for finance teams and the Developers panel.
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD   (default: last 30 days; max 366 days)
//   ?group=day|key|endpoint           (default day; the other dimensions are still returned as
//                                      columns — `group` only picks the primary ordering/collapse)
//   ?format=json|csv
// Auth: browser session, or an API key / Bearer token (D-8: a key sees its own account, per key).
// Net spend per request = the preauth + settle/refund/reconcile rows sharing a request_id, so a
// refunded or reconciled call nets to zero. Grants/purchases are reported separately.

import { prisma } from "../prisma.js";
import { getSession } from "../auth.js";
import { resolveApiKey, resolveSessionAdmin } from "../apiAuth.js";
import { checkRateLimit } from "../ratelimit.js";

const MAX_DAYS = 366;
const first = (v) => (Array.isArray(v) ? v[0] : v) ?? "";
const isoDay = (d) => d.toISOString().slice(0, 10);
const parseDay = (s, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : fallback);
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.setHeader("Content-Type", "application/json");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Identity: admin session → own account too; key → its account (rate-limited); else session.
  let userId = null;
  const admin = await resolveSessionAdmin(req);
  if (admin?.userId) userId = admin.userId;
  if (!userId) {
    const keyed = await resolveApiKey(req);
    if (keyed) {
      const rl = await checkRateLimit(keyed.keyId, keyed.plan);
      if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); res.setHeader("Content-Type", "application/json"); return res.status(429).json({ error: "Rate limit exceeded. Please retry later.", code: "rate_limited", retry_after: rl.retryAfter }); }
      userId = keyed.userId;
    }
  }
  if (!userId) {
    const user = await getSession(req);
    if (!user?.id) { res.setHeader("Content-Type", "application/json"); return res.status(401).json({ error: "Unauthenticated", code: "unauthorized" }); }
    userId = user.id;
  }

  const today = new Date();
  const defFrom = new Date(today.getTime() - 30 * 86400000);
  const to = parseDay(first(req.query?.to).trim(), isoDay(today));
  const from = parseDay(first(req.query?.from).trim(), isoDay(defFrom));
  const span = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (span < 0 || span > MAX_DAYS) { res.setHeader("Content-Type", "application/json"); return res.status(400).json({ error: `Range must be 0–${MAX_DAYS} days.`, code: "bad_request" }); }
  const group = ["day", "key", "endpoint"].includes(first(req.query?.group)) ? first(req.query?.group) : "day";
  const format = first(req.query?.format).toLowerCase() === "csv" ? "csv" : "json";

  let rows;
  try {
    rows = await prisma.$queryRaw`
      SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
             COALESCE(key_id, '') AS key_id,
             COALESCE(endpoint, '') AS endpoint,
             COUNT(DISTINCT request_id) FILTER (WHERE kind = 'preauth') AS requests,
             COALESCE(-SUM(amount) FILTER (WHERE kind IN ('preauth', 'settle', 'refund', 'reconcile')), 0) AS credits_charged,
             COALESCE(SUM(amount) FILTER (WHERE kind IN ('grant', 'purchase')), 0) AS credits_granted,
             COALESCE(-SUM(metered_delta) FILTER (WHERE kind IN ('preauth', 'settle', 'refund', 'reconcile')), 0) AS metered_units
        FROM "credit_events"
       WHERE user_id = ${userId}
         AND created_at >= ${from}::date
         AND created_at < (${to}::date + 1)
       GROUP BY 1, 2, 3
       ORDER BY 1, 2, 3`;
  } catch {
    res.setHeader("Content-Type", "application/json");
    return res.status(503).json({ error: "Usage unavailable" });
  }

  // Key labels/prefixes for the user's keys (never the secret).
  const keys = await prisma.apiKey.findMany({ where: { user_id: userId }, select: { id: true, key_prefix: true, label: true } }).catch(() => []);
  const keyInfo = Object.fromEntries(keys.map((k) => [k.id, { prefix: k.key_prefix, label: k.label || "" }]));

  const items = rows.map((r) => ({
    date: r.day instanceof Date ? isoDay(r.day) : String(r.day),
    key_id: r.key_id || null,
    key_prefix: keyInfo[r.key_id]?.prefix || null,
    key_label: keyInfo[r.key_id]?.label || null,
    endpoint: r.endpoint || null,
    requests: Number(r.requests),
    credits_charged: Number(r.credits_charged),
    credits_granted: Number(r.credits_granted),
    metered_units: Number(r.metered_units),
  }));
  // Collapse to the requested primary dimension.
  const keyOf = (i) => (group === "key" ? i.key_id || "" : group === "endpoint" ? i.endpoint || "" : i.date);
  const collapsed = new Map();
  for (const i of items) {
    const k = keyOf(i);
    const c = collapsed.get(k) || { ...i, requests: 0, credits_charged: 0, credits_granted: 0, metered_units: 0 };
    if (group !== "day") c.date = null;
    if (group !== "key") { c.key_id = null; c.key_prefix = null; c.key_label = null; }
    if (group !== "endpoint") c.endpoint = null;
    c.requests += i.requests; c.credits_charged += i.credits_charged; c.credits_granted += i.credits_granted; c.metered_units += i.metered_units;
    collapsed.set(k, c);
  }
  const out = [...collapsed.values()].map((c) => ({ ...c, credits_charged: Math.round(c.credits_charged * 1e4) / 1e4, credits_granted: Math.round(c.credits_granted * 1e4) / 1e4, metered_units: Math.round(c.metered_units * 1e4) / 1e4 }));
  const totals = out.reduce((t, c) => ({ requests: t.requests + c.requests, credits_charged: t.credits_charged + c.credits_charged, credits_granted: t.credits_granted + c.credits_granted, metered_units: t.metered_units + c.metered_units }), { requests: 0, credits_charged: 0, credits_granted: 0, metered_units: 0 });

  if (format === "csv") {
    const cols = ["date", "key_label", "key_prefix", "endpoint", "requests", "credits_charged", "credits_granted", "metered_units"];
    const lines = [cols.join(","), ...out.map((c) => cols.map((k) => csvCell(c[k])).join(","))];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="opencite-usage-${from}-${to}.csv"`);
    return res.status(200).send(lines.join("\n") + "\n");
  }
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({ from, to, group, count: out.length, totals, items: out });
}
