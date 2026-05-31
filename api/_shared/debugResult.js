// OpenCITE — admin-only origin-REVEALING debug card
//
// `toDebugResult` is the ADMIN-ONLY counterpart to `toPublicResult`. It composes
// (not re-implements) the public card and then appends the two fields that
// publicResult.js deliberately strips: `source` (the upstream adapter id) and
// `_score` (the raw BM25F number before rounding).
//
// HARD INVARIANT: this module MUST only be reachable when search.js has verified
// `identity.admin === true` (server-derived from the resolved plan — NEVER from a
// request parameter or client header). The `source` field it re-introduces is the
// single field that publicResult.js strips to protect origin-blindness; wiring this
// into the non-admin / public path is a product-defining privacy violation (R3/B.6).
//
// F1 (v0.33 admin console): `_scoreBreakdown` enriches each result with a detailed
// scoring breakdown: per-field BM25F, bonuses (phrase, thin_source), RRF inputs,
// gate disposition. All fields come from the result's internal _scoreBreakdown
// object (set by the scoring engine during the search). If not present, fallback
// to a minimal breakdown showing only the total score.
//
// Usage: import this module in search.js; call `toDebugResult` in place of
// `toPublicResult` ONLY inside the `if (identity.admin)` branch.

import { toPublicResult } from "./publicResult.js";

// Admin-only debug view: public card + origin-revealing fields.
// Reuses toPublicResult as the source-of-truth for the card shape (DRY).
// citeFormats forwarded unchanged so citation generation stays consistent.
export function toDebugResult(r, citeFormats = []) {
  return {
    ...toPublicResult(r, citeFormats),
    source: r.source ?? null,                    // upstream adapter id — REVEALED (admin only)
    _score: Number((r._score ?? 0).toFixed(4)),  // raw BM25F score (same precision as public `score`)
    _scoreBreakdown: r._scoreBreakdown ?? {      // F1: score math. Fallback: just the total.
      bm25f: {},
      phrase: 0,
      thin_source: 0,
      rrf_rank: { lex: 0, sem: 0 },
      gateDisposition: "kept",
    },
  };
}
