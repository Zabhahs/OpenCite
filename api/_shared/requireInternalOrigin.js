// OpenCITE — internal-origin guard for the keyed browser-shim routes (F-407)
//
// api/search/{europeana,dpla,smithsonian}.js run real keyed upstream fetches on the
// project's API quota. They are ONLY ever called same-origin from the SPA's adapter
// (`fetch('/api/search/<src>?q=...')`), so a direct curl/script from outside should be
// rejected before it can burn quota.
//
// These are same-origin GET requests, and browsers DO NOT send an `Origin` header on
// those — so an `Origin`-only check would 403 every legitimate search. We therefore
// accept any one of three browser-set signals, strongest first:
//   1. Sec-Fetch-Site: same-origin | same-site — set by the browser, NOT forgeable by
//      page JS (a forbidden header). Modern Chromium/Firefox/Safari 16.4+ send it.
//   2. Origin — present on CORS/POST; matched against our trusted set.
//   3. Referer host — present on same-origin GET; matched against our trusted set.
// A direct call with none of these (or cross-site values) is rejected.
//
// This is a SOFT quota guard, not an auth boundary: Origin/Referer are forgeable by a
// non-browser client, so a determined attacker can still spoof them. It stops drive-by
// quota burning from the discoverable URLs; real metering lives on /api/search.

import { isTrustedOrigin } from "./auth.js";

// Returns true if the request may proceed. On rejection, sends a 403 and returns false
// (Node runtime — these routes use res.statusCode/res.end).
export function requireInternalOrigin(req, res) {
  const h = req.headers;
  const site = h["sec-fetch-site"];

  let ok = false;
  if (site) {
    ok = site === "same-origin" || site === "same-site";
  } else if (h.origin) {
    ok = isTrustedOrigin(h.origin);
  } else if (h.referer) {
    try { ok = isTrustedOrigin(new URL(h.referer).origin); } catch { ok = false; }
  }

  if (!ok) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Forbidden" }));
    return false;
  }
  return true;
}
