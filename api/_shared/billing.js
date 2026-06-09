// OpenCITE — credit billing SSOT (WS3)
//
// Prepaid credit ledger on User.total_credits (Decimal(12,4)). Entitlement =
// credits, not a usage counter. Two-phase, coverage-prorated charge so a customer
// is never billed for the unavailable portion of the eligible library:
//
//   1. preAuthorize(userId, plan.creditCost)        — before fan-out; 402 if short.
//   2. (run search, compute coverage band)
//   3. settle(userId, plan.creditCost, band)         — refund the diff so the net
//      charge is creditCost × coverageMultiplier(band).
//
// The multiplier comes from coverage.js (band-derived), so the amount charged and
// the band reported stay consistent. All ledger writes are atomic conditional
// updates so concurrent requests can't overspend.
//
// Dormant until WS3 is wired: search.js does NOT call these yet.

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { coverageMultiplier } from "./coverage.js";

const dec = (n) => new Prisma.Decimal(n);

// Atomically debit `amount` credits IFF the balance covers it. Returns
// { ok, balance? }. ok:false means insufficient funds → caller responds 402.
// Free plans (creditCost 0) short-circuit to ok:true without touching the ledger.
export async function preAuthorize(userId, amount) {
  if (!userId || !(amount > 0)) return { ok: true, charged: 0 };
  // updateMany with a balance guard = atomic compare-and-decrement (no overspend).
  const res = await prisma.user.updateMany({
    where: { id: userId, total_credits: { gte: dec(amount) } },
    data: { total_credits: { decrement: dec(amount) } },
  });
  if (res.count === 0) return { ok: false, charged: 0 };
  return { ok: true, charged: amount };
}

// Refund credits to a user (used to settle the pre-auth difference, and to undo a
// pre-auth if the search itself fails). Best-effort, atomic increment.
export async function refund(userId, amount) {
  if (!userId || !(amount > 0)) return;
  await prisma.user.update({
    where: { id: userId },
    data: { total_credits: { increment: dec(amount) } },
  });
}

// Settle a pre-authorized charge against the realized coverage band. Refunds the
// difference between the pre-auth (full creditCost) and the prorated final charge.
// freeBelowBand (from the plan) lets sub-threshold coverage be fully waived.
// Returns the net creditsCharged (surface this in the API response).
export async function settle(userId, preAuthAmount, band, { freeBelowBand } = {}) {
  if (!userId || !(preAuthAmount > 0)) return 0;
  let multiplier = coverageMultiplier(band);
  if (freeBelowBand && isAtOrBelow(band, freeBelowBand)) multiplier = 0;
  const finalCharge = round4(preAuthAmount * multiplier);
  const diff = round4(preAuthAmount - finalCharge);
  if (diff > 0) await refund(userId, diff);
  return finalCharge;
}

// Current credit balance, for surfacing in the API response `meta.balance`. The
// ledger module owns ledger reads (SSOT); search.js stays decoupled from Prisma.
// Best-effort: null on no-user / DB hiccup so the response can omit balance gracefully.
export async function getBalance(userId) {
  if (!userId) return null;
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { total_credits: true },
    });
    return u ? Number(u.total_credits) : null;
  } catch {
    return null;
  }
}

// Credit grant (Stripe top-up / monthly allowance). Pure atomic increment —
// idempotency is the CALLER's job (the webhook claims the Stripe event id in the
// processed_events table first; the monthly grant guards on credits_period). This
// keeps the ledger primitive simple and the dedupe durable in Postgres.
export async function grantCredits(userId, credits) {
  if (!userId || !(credits > 0)) return { granted: false };
  await prisma.user.update({
    where: { id: userId },
    data: { total_credits: { increment: dec(credits) } },
  });
  return { granted: true };
}

// Monthly allowance top-up. Idempotent per calendar month via User.credits_period:
// tops the balance UP TO `grant` (doesn't stack monthly allowance, but never reduces
// a larger purchased balance) and stamps the period so a re-run this month no-ops.
//
// Pass { client: tx } to run inside a caller's transaction (the Stripe webhook does
// this so the grant and the processed_events claim commit atomically — a partial
// failure rolls back BOTH, and the Stripe retry re-applies safely). Called without a
// client it opens its own transaction so the read-then-write stays atomic.
export async function applyMonthlyGrant(userId, grant, period, { client } = {}) {
  if (!userId || !(grant > 0)) return { granted: false };
  // Guarded update: only when this period hasn't been granted yet.
  const run = async (tx) => {
    const u = await tx.user.findUnique({
      where: { id: userId },
      select: { total_credits: true, credits_period: true },
    });
    if (!u || u.credits_period === period) return { granted: false };
    const floor = dec(grant);
    const data = { credits_period: period };
    if (u.total_credits.lessThan(floor)) data.total_credits = floor; // top up to allowance
    await tx.user.update({ where: { id: userId }, data });
    return { granted: true };
  };
  return client ? run(client) : prisma.$transaction(run);
}

// ── helpers ────────────────────────────────────────────────────────────────────

const BAND_ORDER = ["limited", "partial", "high", "near-full", "full"];
function isAtOrBelow(band, threshold) {
  const a = BAND_ORDER.indexOf(band);
  const b = BAND_ORDER.indexOf(threshold);
  return a !== -1 && b !== -1 && a <= b;
}
// round4: settlement arithmetic only — creditCost (≈0.01–10.0) × multiplier (0.0–1.0).
// Plain JS float precision is adequate at these magnitudes and the result is never
// written back to the ledger directly: every DB credit write goes through atomic
// Prisma increment/decrement (Postgres-side Decimal math). If creditCost ever scales
// past ~10^6 this should move to Prisma.Decimal arithmetic. (F-505 audit: no unsafe
// total_credits arithmetic found across billing.js / stripe/webhook.js.)
const round4 = (n) => Math.round(n * 1e4) / 1e4;
