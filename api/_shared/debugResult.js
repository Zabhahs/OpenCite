// OpenCITE — admin-only origin-REVEALING debug card
//
// `toDebugResult` is the ADMIN-ONLY counterpart to `toPublicResult`. It composes
// (not re-implements) the public card and then appends the one field that
// publicResult.js deliberately strips: `source` (the upstream adapter id).
//
// HARD INVARIANT: this module MUST only be reachable when search.js has verified
// `identity.admin === true` (server-derived from the resolved plan — NEVER from a
// request parameter or client header). The `source` field it re-introduces is the
// single field that publicResult.js strips to protect origin-blindness; wiring this
// into the non-admin / public path is a product-defining privacy violation (R3/B.6).
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
    source: r.source ?? null, // upstream adapter id — REVEALED (admin only)
  };
}
