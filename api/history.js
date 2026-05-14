// OpenCITE — Search History API
// Route: /api/history
// Runtime: Node.js (Prisma)
// Auth: session cookie via Auth.js — unauthenticated requests rejected
//
// GET    /api/history  → load all entries for user (ordered ts DESC)
// POST   /api/history  → add entry  { query }
// DELETE /api/history  → remove one { query } or clear all { clear: true }

import { prisma } from "./_shared/prisma.js";
import { setCorsHeaders, getSession } from "./_shared/auth.js";

// ── Body parser — req.body is undefined in raw Node.js serverless functions ──
async function parseBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

export default async function handler(req, res) {
  setCorsHeaders(req, res, "GET, POST, DELETE, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();

  const user = await getSession(req);
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const userId = user.id;

  // ── GET — load history ──────────────────────────────────────────────────────
  if (req.method === "GET") {
    const rows = await prisma.search_history.findMany({
      where:   { user_id: userId },
      orderBy: { ts: "desc" },
      select:  { query: true, ts: true },
    });
    // BigInt cannot be JSON-serialized — convert ts to Number
    return res.status(200).json(rows.map(r => ({ ...r, ts: Number(r.ts) })));
  }

  // ── POST — add entry ────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const { query } = await parseBody(req);
    const q = (query ?? "").trim();
    if (!q) return res.status(400).json({ error: "Missing query" });

    await prisma.search_history.upsert({
      where:  { user_id_query: { user_id: userId, query: q } },
      update: { ts: Date.now() },
      create: { user_id: userId, query: q, ts: Date.now() },
    });

    // Fire-and-forget trim to HISTORY_MAX (50)
    prisma.search_history.findMany({
      where:   { user_id: userId },
      orderBy: { ts: "desc" },
      skip:    50,
      select:  { id: true },
    }).then((overflow) => {
      if (overflow.length) {
        prisma.search_history.deleteMany({
          where: { id: { in: overflow.map(r => r.id) } },
        });
      }
    });

    return res.status(200).json({ ok: true });
  }

  // ── DELETE — remove one or clear all ───────────────────────────────────────
  if (req.method === "DELETE") {
    const { query, clear } = await parseBody(req);

    if (clear) {
      await prisma.search_history.deleteMany({ where: { user_id: userId } });
      return res.status(200).json({ ok: true });
    }

    if (query) {
      await prisma.search_history.deleteMany({ where: { user_id: userId, query } });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Provide query or clear:true" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
