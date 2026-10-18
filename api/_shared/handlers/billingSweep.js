// OpenCITE — daily billing sweep (v0.48 Phase 2; mounted via api/user/[resource].js as
// /api/billing-sweep — no new Serverless Function, Hobby caps a deploy at 12)
//
// Runs once a day from vercel.json `crons` (Vercel sends `Authorization: Bearer $CRON_SECRET`
// when that env var is set) or on demand by an allowlisted admin session. Three jobs, in order:
//   1. RECONCILE (sprint v0.45 T2): a platform kill between preAuthorize and settle leaves a
//      `preauth` journal row with no settle/refund/reconcile partner. After 30 minutes (≫ any
//      Vercel function lifetime) that credit is dead money — give it back, bucket by bucket, and
//      journal a `reconcile` row sharing the request_id so a second sweep sees the pair closed.
//   2. REPORT: for every postpaid user with ≥ 1 whole unreported unit, send floor(units) to the
//      Stripe Billing Meter (identifier = userId:day → Stripe dedups for ≥ 24 h; timestamp = the
//      end of the previous UTC day so usage lands in its own billing period), THEN consume them
//      from metered_unreported (billing.consumeReported — guarded, so a retried sweep can't
//      double-consume). The fractional remainder carries forward.
//   3. PRUNE: credit_events older than 12 months (D-9), trial_usage older than 7 days.
// Never throws to the caller: each job reports its own counts/errors in the response.

import { randomUUID } from "node:crypto";
import { timingSafeEqual, createHash } from "node:crypto";
import { prisma } from "../prisma.js";
import { refund, listUnreportedUsage, consumeReported } from "../billing.js";
import { resolveSessionAdmin } from "../apiAuth.js";
import { PLANS } from "../plans.js";
import { log } from "../log.js";

const ORPHAN_MINUTES = 30;
const ORPHAN_BATCH = 500;
const JOURNAL_RETENTION_MONTHS = 12;
const TRIAL_RETENTION_DAYS = 7;
const METER_EVENT = () => process.env.STRIPE_API_METER_EVENT || "opencite_api_units";

const sameSecret = (a, b) => {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
};

async function authorized(req) {
  const auth = req.headers?.authorization || "";
  const m = /^Bearer\s+(\S+)$/i.exec(Array.isArray(auth) ? auth[0] : auth);
  if (m && process.env.CRON_SECRET && sameSecret(m[1], process.env.CRON_SECRET)) return "cron";
  if (await resolveSessionAdmin(req)) return "admin";
  return null;
}

// 1. Orphaned pre-auths → refund + reconcile row.
async function reconcile(runId) {
  const orphans = await prisma.$queryRaw`
    SELECT p.user_id, p.amount, p.allowance_delta, p.purchased_delta, p.metered_delta, p.request_id, p.endpoint, p.key_id
      FROM "credit_events" p
     WHERE p.kind = 'preauth' AND p.request_id IS NOT NULL
       AND p.created_at < now() - (${ORPHAN_MINUTES} || ' minutes')::interval
       AND NOT EXISTS (SELECT 1 FROM "credit_events" q
                        WHERE q.request_id = p.request_id AND q.kind IN ('settle', 'refund', 'reconcile'))
     LIMIT ${ORPHAN_BATCH}`;
  let refunded = 0, errors = 0;
  for (const o of orphans) {
    const amount = -Number(o.amount);
    const split = { allowance: -Number(o.allowance_delta), purchased: -Number(o.purchased_delta), metered: -Number(o.metered_delta) };
    try {
      await refund(o.user_id, amount, { split, kind: "reconcile", requestId: o.request_id, endpoint: o.endpoint, keyId: o.key_id, source: runId });
      refunded++;
    } catch (e) {
      errors++;
      log.warn("billing", "reconcile-failed", { requestId: o.request_id, msg: e.message });
    }
  }
  return { orphans: orphans.length, refunded, errors };
}

// 2. Report metered usage to Stripe.
async function report(runId) {
  const postpaid = Object.values(PLANS).filter((p) => p.postpaid).map((p) => p.id);
  if (!postpaid.length) return { users: 0, reported: 0, skipped: "no postpaid plans" };
  if (!process.env.STRIPE_SECRET_KEY) return { users: 0, reported: 0, skipped: "stripe not configured" };
  let Stripe;
  try { ({ default: Stripe } = await import("stripe")); } catch { return { users: 0, reported: 0, skipped: "stripe sdk unavailable" }; }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const rows = await listUnreportedUsage(postpaid);
  // Usage accrued before this run belongs to yesterday (the sweep runs early UTC); backdating is
  // allowed up to 35 days and keeps month-end usage in its own period.
  const yesterdayEnd = new Date(); yesterdayEnd.setUTCHours(0, 0, 0, 0); yesterdayEnd.setUTCSeconds(-1);
  const day = yesterdayEnd.toISOString().slice(0, 10);
  let reported = 0, units = 0, errors = 0;
  for (const u of rows) {
    const n = Math.floor(Number(u.metered_unreported));
    if (n < 1) continue;
    const identifier = `${u.id}:${day}`;
    try {
      await stripe.billing.meterEvents.create({
        event_name: METER_EVENT(),
        payload: { stripe_customer_id: u.stripe_customer_id, value: String(n) },
        identifier,
        timestamp: Math.floor(yesterdayEnd.getTime() / 1000),
      });
      if (await consumeReported(u.id, n, { source: identifier })) { reported++; units += n; }
    } catch (e) {
      errors++;
      log.warn("billing", "meter-report-failed", { userId: u.id, msg: e.message, runId });
    }
  }
  return { users: rows.length, reported, units, errors };
}

// 3. Retention.
async function prune() {
  const journal = await prisma.$executeRaw`DELETE FROM "credit_events" WHERE created_at < now() - (${JOURNAL_RETENTION_MONTHS} || ' months')::interval`;
  const trial = await prisma.$executeRaw`DELETE FROM "trial_usage" WHERE day < (now() - (${TRIAL_RETENTION_DAYS} || ' days')::interval)::date`;
  return { journal, trial };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const who = await authorized(req);
  if (!who) return res.status(401).json({ error: "Unauthorized" });

  const runId = `sweep:${new Date().toISOString().slice(0, 10)}:${randomUUID().slice(0, 8)}`;
  const t0 = Date.now();
  const out = { runId, by: who };
  try { out.reconcile = await reconcile(runId); } catch (e) { out.reconcile = { error: e.message }; }
  try { out.report = await report(runId); } catch (e) { out.report = { error: e.message }; }
  try { out.prune = await prune(); } catch (e) { out.prune = { error: e.message }; }
  out.tookMs = Date.now() - t0;
  log("billing", "sweep", out);
  return res.status(200).json(out);
}
