// OpenCITE — Search History API
// Route: /api/history
// Runtime: Node.js (Prisma)
// Auth: session cookie via Auth.js — unauthenticated requests rejected
//
// GET    /api/history          → load all entries for user (ordered ts DESC)
// POST   /api/history          → add entry  { query }
// DELETE /api/history          → remove one { query } or clear all { clear: true }
//
// FIX v.16: replaced Access-Control-Allow-Origin: * with origin-aware CORS.
//           Wildcard + credentials: "include" = browsers reject the cookie.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ── Trusted origins for CORS ──────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://citation.today",
  "https://opencite.space",
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.some((o) => origin === o || origin.endsWith(".vercel.app"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}

// ── Auth session helper ───────────────────────────────────────────────────────

async function getSession(req) {
  const protocol = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim();
  const sessionUrl = `${protocol}://${host}/api/auth/session`;
  try {
    const res = await fetch(sessionUrl, {
      headers: { cookie: req.headers.cookie ?? "" },
    });
    const data = await res.json();
    return data?.user?.id ? data.user : null;
  } catch {
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();

  const user = await getSession(req);
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const userId = user.id;

  // ── GET — load history ──────────────────────────────────────────────────────
  if (req.method === "GET") {
    const rows = await prisma.search_history.findMany({
      where: { user_id: userId },
      orderBy: { ts: "desc" },
      select: { query: true, ts: true },   // minimal — no id, no meta
    });
    return res.status(200).json(rows);
  }

  // ── POST — add entry ────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const { query } = req.body ?? {};
    const q = (query ?? "").trim();
    if (!q) return res.status(400).json({ error: "Missing query" });

    // Upsert: update ts if query already exists (mirrors localStorage filter+prepend)
    await prisma.search_history.upsert({
      where:  { user_id_query: { user_id: userId, query: q } },
      update: { ts: Date.now() },
      create: { user_id: userId, query: q, ts: Date.now() },
    });

    // Fire-and-forget trim to HISTORY_MAX (50) — no await, doesn't block response
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
    const { query, clear } = req.body ?? {};

    if (clear) {
      await prisma.search_history.deleteMany({ where: { user_id: userId } });
      return res.status(200).json({ ok: true });
    }

    if (query) {
      await prisma.search_history.deleteMany({
        where: { user_id: userId, query },
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Provide query or clear:true" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
