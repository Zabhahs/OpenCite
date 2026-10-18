// OpenCITE — credit billing SSOT (WS3; rewritten v0.48 Phase 2)
//
// Three buckets on the user row, spent IN THIS ORDER by one guarded SQL statement:
//   1. allowance_credits — the plan's monthly allowance (Student/Pro/api), RESET each period
//   2. total_credits     — PURCHASED credits (packs); never expire
//   3. metered           — postpaid usage (the `api` plan only), counted in metered_usage for
//                          the period and queued in metered_unreported for the daily Stripe
//                          meter report; capped by metered_cap_usd and gated on an active sub
// Two-phase, coverage-prorated charge so a customer is never billed for the unavailable portion
// of the eligible library:
//   1. preAuthorize(userId, cost, ctx)       — before fan-out; { ok:false, reason } ⇒ 402
//   2. (run the work, compute the band)
//   3. settle(userId, cost, band, { split }) — refund the diff, bucket by bucket, so the net
//      charge is cost × coverageMultiplier(band)
// The multiplier comes from coverage.js (band-derived), so the amount charged and the band
// reported stay consistent.
//
// JOURNAL (sprint v0.45 T1): every balance mutation writes a credit_events row in the SAME
// transaction as the balance write. The journal is evidence, not balance — no read path derives
// a balance from it. `split` = { allowance, purchased, metered } (positive = taken from bucket).
//
// All ledger writes are atomic conditional statements, so concurrent requests can't overspend.
// Table/column names are the @@map'd ones (users.internal_id, …).

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";
import { coverageMultiplier } from "./coverage.js";

const dec = (n) => new Prisma.Decimal(n);
// round4: settlement arithmetic only. Every DB write goes through Postgres-side Decimal math.
const round4 = (n) => Math.round(Number(n) * 1e4) / 1e4;
const num = (v) => (v == null ? 0 : Number(v));

export const ZERO_SPLIT = Object.freeze({ allowance: 0, purchased: 0, metered: 0 });
const sumSplit = (s) => round4(num(s?.allowance) + num(s?.purchased) + num(s?.metered));

// Calendar-month key (UTC) — the shape stamped into credits_period / metered_period.
export const periodOf = (d = new Date()) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

// ── Journal ─────────────────────────────────────────────────────────────────────────────────
// Writes one credit_events row through the given client (pass the transaction client so the
// row commits with the balance write). `amount` is the signed total; deltas default to it being
// a purchased-bucket move when no split is given.
export async function journal(db, { userId, kind, amount, split, band, endpoint, requestId, source, keyId }) {
  if (!userId) return;
  const s = split || { allowance: 0, purchased: amount, metered: 0 };
  await db.creditEvent.create({
    data: {
      id: randomUUID(),
      user_id: userId,
      key_id: keyId && keyId !== "master" && keyId !== "session-admin" ? keyId : null,
      kind,
      amount: dec(round4(amount)),
      allowance_delta: dec(round4(s.allowance)),
      purchased_delta: dec(round4(s.purchased)),
      metered_delta: dec(round4(s.metered)),
      band: band || null,
      endpoint: endpoint || null,
      request_id: requestId || null,
      source: source || null,
    },
  });
}

// ── Pre-authorize ───────────────────────────────────────────────────────────────────────────
// Atomically debit `amount` across the three buckets IFF they cover it. ONE statement under the
// row lock: the split is computed and applied in the same UPDATE, so two concurrent calls can
// never both succeed against the same last credit. The metered remainder is accepted only when
// the plan is postpaid, the subscription is `active`, and this period's usage stays under the
// user's cap (cap_usd / unit price).
//   ctx: { plan, requestId, endpoint, keyId }
// Returns { ok:true, charged, split } or { ok:false, reason, balance } where reason is one of
// insufficient_credits | spend_cap_reached | payment_failed (the 402 code to send).
export async function preAuthorize(userId, amount, ctx = {}) {
  if (!userId || !(amount > 0)) return { ok: true, charged: 0, split: ZERO_SPLIT };
  const postpaid = !!ctx.plan?.postpaid;
  const unitPrice = postpaid ? Number(ctx.plan?.unitPriceUsd) || 0 : 0;
  const period = periodOf();
  const amt = round4(amount);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      WITH u AS (
        SELECT internal_id, allowance_credits, total_credits, subscription_status,
               metered_period, metered_usage, metered_cap_usd
          FROM "users" WHERE internal_id = ${userId} FOR UPDATE
      ), c AS (
        SELECT internal_id, subscription_status, metered_cap_usd,
               LEAST(allowance_credits, ${amt}::decimal) AS a,
               LEAST(total_credits, ${amt}::decimal - LEAST(allowance_credits, ${amt}::decimal)) AS p,
               CASE WHEN metered_period = ${period} THEN metered_usage ELSE 0 END AS usage_now
          FROM u
      ), c2 AS (
        SELECT *, (${amt}::decimal - a - p) AS m FROM c
      )
      UPDATE "users" SET
        allowance_credits  = "users".allowance_credits - c2.a,
        total_credits      = "users".total_credits - c2.p,
        metered_period     = CASE WHEN c2.m > 0 THEN ${period} ELSE "users".metered_period END,
        metered_usage      = CASE WHEN c2.m > 0 THEN c2.usage_now + c2.m ELSE "users".metered_usage END,
        metered_unreported = CASE WHEN c2.m > 0 THEN "users".metered_unreported + c2.m ELSE "users".metered_unreported END
      FROM c2
      WHERE "users".internal_id = c2.internal_id
        AND (c2.m <= 0 OR (${postpaid}::boolean AND c2.subscription_status = 'active'
             AND c2.usage_now + c2.m <= c2.metered_cap_usd / NULLIF(${unitPrice}::decimal, 0)))
      RETURNING c2.a AS from_allowance, c2.p AS from_purchased, c2.m AS from_metered`;

    if (!rows.length) {
      // Diagnose the refusal (read-only) so the caller can send the right 402 code.
      const u = await tx.user.findUnique({
        where: { id: userId },
        select: { allowance_credits: true, total_credits: true, subscription_status: true, metered_period: true, metered_usage: true, metered_cap_usd: true },
      });
      const balance = u ? round4(num(u.allowance_credits) + num(u.total_credits)) : null;
      let reason = "insufficient_credits";
      if (postpaid && u) {
        if (u.subscription_status !== "active") reason = "payment_failed";
        else {
          const usage = u.metered_period === period ? num(u.metered_usage) : 0;
          const capUnits = unitPrice > 0 ? num(u.metered_cap_usd) / unitPrice : 0;
          if (usage + (amt - balance) > capUnits) reason = "spend_cap_reached";
        }
      }
      return { ok: false, charged: 0, reason, balance };
    }
    const r = rows[0];
    const split = { allowance: round4(num(r.from_allowance)), purchased: round4(num(r.from_purchased)), metered: round4(num(r.from_metered)) };
    await journal(tx, { userId, kind: "preauth", amount: -amt, split: { allowance: -split.allowance, purchased: -split.purchased, metered: -split.metered }, endpoint: ctx.endpoint, requestId: ctx.requestId, keyId: ctx.keyId });
    return { ok: true, charged: amt, split };
  });
}

// Give `amount` back, reversing the buckets of `split` in the order metered → purchased →
// allowance (the metered bucket is reversed first so a refunded call never reaches the Stripe
// meter). Without a split (legacy callers, reconcile) the purchased bucket is credited.
function reverseSplit(split, amount) {
  let left = round4(amount);
  const out = { allowance: 0, purchased: 0, metered: 0 };
  for (const k of ["metered", "purchased", "allowance"]) {
    const take = Math.min(left, round4(num(split?.[k])));
    if (take > 0) { out[k] = take; left = round4(left - take); }
  }
  if (left > 0) out.purchased = round4(out.purchased + left);
  return out;
}

async function applyReverse(db, userId, give) {
  await db.$executeRaw`
    UPDATE "users" SET
      allowance_credits  = allowance_credits + ${give.allowance}::decimal,
      total_credits      = total_credits + ${give.purchased}::decimal,
      metered_usage      = GREATEST(metered_usage - ${give.metered}::decimal, 0),
      metered_unreported = GREATEST(metered_unreported - ${give.metered}::decimal, 0)
    WHERE internal_id = ${userId}`;
}

// Refund credits to a user (undo a pre-auth when the work fails, or the settle diff).
//   ctx: { split, kind = "refund", requestId, endpoint, keyId, source, client }
export async function refund(userId, amount, ctx = {}) {
  if (!userId || !(amount > 0)) return;
  const give = reverseSplit(ctx.split, amount);
  const run = async (db) => {
    await applyReverse(db, userId, give);
    await journal(db, { userId, kind: ctx.kind || "refund", amount: round4(amount), split: give, band: ctx.band, endpoint: ctx.endpoint, requestId: ctx.requestId, keyId: ctx.keyId, source: ctx.source });
  };
  return ctx.client ? run(ctx.client) : prisma.$transaction(run);
}

// Settle a pre-authorized charge against the realized coverage band. Refunds the difference
// between the pre-auth (full cost) and the prorated final charge. freeBelowBand (from the plan)
// lets sub-threshold coverage be fully waived. ALWAYS journals a `settle` row (amount = refund
// diff, possibly 0) so every preauth pair is closed — the orphan sweep depends on this.
// Returns the net creditsCharged (surface this in the API response).
export async function settle(userId, preAuthAmount, band, { freeBelowBand, split, requestId, endpoint, keyId } = {}) {
  if (!userId || !(preAuthAmount > 0)) return 0;
  let multiplier = coverageMultiplier(band);
  if (freeBelowBand && isAtOrBelow(band, freeBelowBand)) multiplier = 0;
  const finalCharge = round4(preAuthAmount * multiplier);
  const diff = round4(preAuthAmount - finalCharge);
  const give = diff > 0 ? reverseSplit(split, diff) : { allowance: 0, purchased: 0, metered: 0 };
  await prisma.$transaction(async (tx) => {
    if (diff > 0) await applyReverse(tx, userId, give);
    await journal(tx, { userId, kind: "settle", amount: diff, split: give, band, endpoint, requestId, keyId });
  });
  return finalCharge;
}

// ── Reads ───────────────────────────────────────────────────────────────────────────────────
// Spendable balance (allowance + purchased) for `meta.balance`. Best-effort: null on DB hiccup.
export async function getBalance(userId) {
  const d = await getBalanceDetail(userId);
  return d ? d.credits : null;
}

// Full picture for /api/credits and the Developers panel.
export async function getBalanceDetail(userId) {
  if (!userId) return null;
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { allowance_credits: true, total_credits: true, plan: true, subscription_status: true, metered_period: true, metered_usage: true, metered_cap_usd: true },
    });
    if (!u) return null;
    const period = periodOf();
    return {
      credits: round4(num(u.allowance_credits) + num(u.total_credits)),
      allowance: round4(num(u.allowance_credits)),
      purchased: round4(num(u.total_credits)),
      plan: u.plan || "free",
      subscription_status: u.subscription_status || null,
      metered: {
        period,
        usage_units: u.metered_period === period ? round4(num(u.metered_usage)) : 0,
        cap_usd: num(u.metered_cap_usd),
      },
    };
  } catch {
    return null;
  }
}

// ── Grants (purchases + allowances) ─────────────────────────────────────────────────────────
// Pack purchase: pure atomic increment of the PURCHASED bucket. Idempotency is the CALLER's job
// (the webhook claims the Stripe event id in processed_events first).
export async function grantCredits(userId, credits, { client, source } = {}) {
  if (!userId || !(credits > 0)) return { granted: false };
  const run = async (db) => {
    await db.user.update({ where: { id: userId }, data: { total_credits: { increment: dec(credits) } } });
    await journal(db, { userId, kind: "purchase", amount: credits, split: { allowance: 0, purchased: credits, metered: 0 }, source });
  };
  await (client ? run(client) : prisma.$transaction(run));
  return { granted: true };
}

// Monthly allowance: RESET the allowance bucket to `grant` once per calendar period. Never
// touches purchased credits (v0.48 D-13 closes the GREATEST-swallows-the-allowance leak: a
// subscriber holding pack credits now receives the full allowance every month). Idempotent per
// period via credits_period; re-runs this month no-op. Pass { client: tx } to run inside the
// webhook's transaction. The RETURNING CTE yields the old allowance so the journal records the
// real delta.
export async function applyMonthlyGrant(userId, grant, period, { client, source } = {}) {
  if (!userId || !(grant > 0)) return { granted: false };
  const run = async (db) => {
    const rows = await db.$queryRaw`
      WITH old AS (SELECT allowance_credits FROM "users" WHERE internal_id = ${userId})
      UPDATE "users" SET allowance_credits = ${grant}::decimal, credits_period = ${period}
        FROM old
       WHERE "users".internal_id = ${userId} AND "users".credits_period IS DISTINCT FROM ${period}
      RETURNING old.allowance_credits AS old_allowance`;
    if (!rows.length) return { granted: false };
    const delta = round4(grant - num(rows[0].old_allowance));
    await journal(db, { userId, kind: "grant", amount: delta, split: { allowance: delta, purchased: 0, metered: 0 }, source: source || `period:${period}` });
    return { granted: true, delta };
  };
  return client ? run(client) : prisma.$transaction(run);
}

// Plan UPGRADE top-up (free → Student/Pro/api at checkout, Student → Pro in the Portal): raise
// the allowance to the new grant now (GREATEST — never reduces a larger current allowance) and
// stamp the period so this month's renewal is a no-op. Callers invoke it only when the grant
// strictly increases, which Stripe has already charged for.
export async function applyUpgradeGrant(userId, grant, period, { client, source } = {}) {
  if (!userId || !(grant > 0)) return { granted: false };
  const run = async (db) => {
    const rows = await db.$queryRaw`
      WITH old AS (SELECT allowance_credits FROM "users" WHERE internal_id = ${userId})
      UPDATE "users" SET allowance_credits = GREATEST("users".allowance_credits, ${grant}::decimal), credits_period = ${period}
        FROM old
       WHERE "users".internal_id = ${userId}
      RETURNING old.allowance_credits AS old_allowance`;
    if (!rows.length) return { granted: false };
    const delta = round4(Math.max(0, grant - num(rows[0].old_allowance)));
    if (delta > 0) await journal(db, { userId, kind: "grant", amount: delta, split: { allowance: delta, purchased: 0, metered: 0 }, source: source || `upgrade:${period}` });
    return { granted: true, delta };
  };
  return client ? run(client) : prisma.$transaction(run);
}

// Reverse a pack grant after a Stripe refund or dispute: PURCHASED bucket only (that is what was
// refunded), clamped at zero — the customer may already have spent part of it.
export async function clawbackCredits(userId, credits, { client, source } = {}) {
  if (!userId || !(credits > 0)) return;
  const run = async (db) => {
    const rows = await db.$queryRaw`
      WITH old AS (SELECT total_credits FROM "users" WHERE internal_id = ${userId})
      UPDATE "users" SET total_credits = GREATEST("users".total_credits - ${credits}::decimal, 0)
        FROM old WHERE "users".internal_id = ${userId}
      RETURNING old.total_credits AS old_total`;
    const taken = rows.length ? round4(Math.min(credits, num(rows[0].old_total))) : 0;
    if (taken > 0) await journal(db, { userId, kind: "clawback", amount: -taken, split: { allowance: 0, purchased: -taken, metered: 0 }, source });
  };
  return client ? run(client) : prisma.$transaction(run);
}

// ── Metered reporting (daily sweep) ─────────────────────────────────────────────────────────
// Postpaid users with ≥1 whole unreported unit. The sweep reports floor(units) to the Stripe
// meter and then consumes them; the fractional remainder carries forward.
export async function listUnreportedUsage(postpaidPlanIds) {
  return prisma.user.findMany({
    where: { plan: { in: postpaidPlanIds }, metered_unreported: { gte: dec(1) }, stripe_customer_id: { not: null } },
    select: { id: true, stripe_customer_id: true, metered_unreported: true },
  });
}

// Consume `units` from metered_unreported AFTER the meter accepted them (idempotent on our side:
// the guard refuses if the counter already dropped). Journals a `report` row.
export async function consumeReported(userId, units, { source } = {}) {
  if (!userId || !(units > 0)) return false;
  return prisma.$transaction(async (tx) => {
    const n = await tx.$executeRaw`
      UPDATE "users" SET metered_unreported = metered_unreported - ${units}::decimal
       WHERE internal_id = ${userId} AND metered_unreported >= ${units}::decimal`;
    if (n !== 1) return false;
    await journal(tx, { userId, kind: "report", amount: 0, split: ZERO_SPLIT, source });
    return true;
  });
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────

const BAND_ORDER = ["limited", "partial", "high", "near-full", "full"];
function isAtOrBelow(band, threshold) {
  const a = BAND_ORDER.indexOf(band);
  const b = BAND_ORDER.indexOf(threshold);
  return a !== -1 && b !== -1 && a <= b;
}
export { sumSplit as splitTotal };
