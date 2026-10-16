// OpenCITE — GET /api/health (v0.46)
//
// The one unauthenticated endpoint that exercises the database. Every other DB-touching path
// converts a connection failure into a benign 401/null, which is how a paused Supabase project
// went unnoticed for ~10 weeks (the audit's F3). Two jobs:
//   1. Uptime monitors get a truthful signal: 200 {ok:true, db:true} or 503.
//   2. The daily Vercel cron (vercel.json) hits it so the free-tier database never idles into a
//      pause again (Supabase pauses free projects after ~7 days without activity).
// No auth, no PII, no query params honoured. Mounted through api/user/[resource].js (no new
// Serverless Function — Hobby caps a deploy at 12).

import { prisma } from "../prisma.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ ok: true, db: true, dbMs: Date.now() - t0 });
  } catch (e) {
    return res.status(503).json({ ok: false, db: false, error: "database unreachable", detail: String(e?.code || e?.name || "error") });
  }
}
