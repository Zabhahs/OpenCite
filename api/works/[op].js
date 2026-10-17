// OpenCITE — works dispatcher (v0.48) · Node runtime
//
// One Serverless Function fronting the four per-work, API-key-metered operations:
//   /api/works/citations  (was api/citations.js — moved verbatim, then given evidence + leg health)
//   /api/works/ids        (was api/ids.js)
//   /api/works/verify     NEW — reference verification (the anti-hallucination path)
//   /api/works/get        NEW — one work by any id, every identifier, optional graph
// On Vercel Hobby every Node file under /api is its own Serverless Function (12-per-deployment
// cap); folding these into one dispatcher keeps the deploy at 9 while adding two operations.
// The public URLs are preserved by vercel.json rewrites:
//   /api/citations → /api/works/citations · /api/ids → /api/works/ids
//   /api/verify    → /api/works/verify    · /api/works → /api/works/get
// Same pattern as api/user/[resource].js; each handler still does its own auth + method routing.

import citations from "../_shared/handlers/works/citations.js";
import ids from "../_shared/handlers/works/ids.js";
import verify from "../_shared/handlers/works/verify.js";
import get from "../_shared/handlers/works/get.js";
import { sendJson } from "../_shared/meter.js";

const HANDLERS = { citations, ids, verify, get };

export default async function handler(req, res) {
  const op = (Array.isArray(req.query?.op) ? req.query.op[0] : req.query?.op) || "";
  const fn = HANDLERS[op];
  if (!fn) return sendJson(res, 404, { error: `Unknown operation "${op}".`, code: "not_found" });
  return fn(req, res);
}
