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
import { claimOnce } from "./kv.js";
import { log } from "./log.js";

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

// Idempotent credit grant (Stripe top-up). `eventId` dedupes replays (R11): the
// first grant for an event wins; later replays are no-ops. Idempotency is enforced
// via KV set-if-absent — if KV is unavailable we still grant (fail-open) but log it.
export async function grantCredits(userId, credits, eventId) {
  if (!userId || !(credits > 0)) return { granted: false };
  if (eventId) {
    const fresh = await claimOnce(`oc:stripe:evt:${eventId}`, 60 * 60 * 24 * 30);
    // fresh === false → event already processed → skip (idempotent replay).
    // fresh === null  → KV unavailable → proceed but flag (rare double-grant risk).
    if (fresh === false) return { granted: false, duplicate: true };
    if (fresh === null) log.warn("billing", "grant-no-idempotency", { eventId });
  }
  await prisma.user.update({
    where: { id: userId },
    data: { total_credits: { increment: dec(credits) } },
  });
  return { granted: true };
}

// ── helpers ────────────────────────────────────────────────────────────────────

const BAND_ORDER = ["limited", "partial", "high", "near-full", "full"];
function isAtOrBelow(band, threshold) {
  const a = BAND_ORDER.indexOf(band);
  const b = BAND_ORDER.indexOf(threshold);
  return a !== -1 && b !== -1 && a <= b;
}
const round4 = (n) => Math.round(n * 1e4) / 1e4;
