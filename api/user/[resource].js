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

const HANDLERS = { credits, history, keys, library, settings };

export default async function handler(req, res) {
  const resource = (Array.isArray(req.query?.resource) ? req.query.resource[0] : req.query?.resource) || "";
  const fn = HANDLERS[resource];
  if (!fn) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: `Unknown resource "${resource}"` }));
  }
  return fn(req, res);
}
