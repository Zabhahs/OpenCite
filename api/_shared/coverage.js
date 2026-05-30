// OpenCITE — coverage / attrition SSOT
// Single source of truth for BOTH:
//   1. the origin-blind `coverage` band emitted in the API response (WS0), and
//   2. the `coverageMultiplier` used to coverage-prorate a credit charge (WS3).
// Keeping both off the same band guarantees the reported coverage and the amount
// charged stay consistent and equally fingerprint-resistant.
//
// Corpus-weighted: a source's impact on coverage is proportional to its
// `capability.corpusSize` (order-of-magnitude record count). The core scholarly
// sources dominate the denominator by design — a niche heritage source dropping is
// a genuinely small coverage loss.
//
// What leaves the server: ONLY the band string. Never the raw %, the failed count,
// or any upstream name (R3/R19 — anti-fingerprint, origin-blind).

// Conservative fallback when an adapter has no declared corpusSize: treat it as
// negligible weight rather than zero, so it still counts but can't dominate.
const FALLBACK_CORPUS = 1;

const weightOf = (adapter) => {
  const n = adapter?.capability?.corpusSize;
  return Number.isFinite(n) && n > 0 ? n : FALLBACK_CORPUS;
};

const sumWeight = (adapters) => adapters.reduce((acc, a) => acc + weightOf(a), 0);

// Bucket a coverage ratio into a coarse band. Rounding is in the customer's favor:
// coverage is floored into its band (we never overstate coverage, and the billing
// multiplier derived from the band therefore never overcharges).
//   full      — no eligible source failed at all
//   near-full — >= 0.99 of corpus weight covered
//   high      — >= 0.95
//   partial   — >= 0.50
//   limited   — < 0.50
export function bandFor(coverage, failedCount) {
  if (failedCount === 0) return "full";
  if (coverage >= 0.99) return "near-full";
  if (coverage >= 0.95) return "high";
  if (coverage >= 0.5) return "partial";
  return "limited";
}

// computeCoverage(eligibleAdapters, failedAdapters)
//   eligibleAdapters — the plan-eligible / selected adapter set for THIS request
//                      (the denominator: coverage is honest relative to what the
//                       caller asked for, not always the full 22).
//   failedAdapters   — the subset that errored / timed out (empty results is NOT a
//                      failure — it means "no match", full coverage).
// Returns { attrition, coverage, band }. attrition/coverage are internal-only raw
// numbers; only `band` is safe to emit.
export function computeCoverage(eligibleAdapters = [], failedAdapters = []) {
  const total = sumWeight(eligibleAdapters);
  const failed = sumWeight(failedAdapters);
  const attrition = total > 0 ? Math.min(failed / total, 1) : 0;
  const coverage = 1 - attrition;
  return { attrition, coverage, band: bandFor(coverage, failedAdapters.length) };
}

// Charge multiplier derived from the band (WS3 proration). Uses the band's FLOOR
// coverage so the customer is never billed for the unavailable portion of the
// eligible library and a borderline ratio rounds in their favor.
//   limited → 0 : a sub-half-coverage answer isn't a sellable result (free).
const BAND_MULTIPLIER = {
  full: 1,
  "near-full": 0.99,
  high: 0.95,
  partial: 0.5,
  limited: 0,
};

export function coverageMultiplier(band) {
  return BAND_MULTIPLIER[band] ?? 1;
}
