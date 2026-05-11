// OpenCITE — Library API
// Route: /api/library
// Runtime: Node.js (Prisma)
// Auth: session cookie via Auth.js — unauthenticated requests rejected
//
// GET    /api/library          → load all saved items (ordered saved_at DESC)
// POST   /api/library          → save item   { result: UnifiedResult }
// DELETE /api/library          → remove one  { library_key } or clear all { clear: true }
//
// FIX v.16: replaced Access-Control-Allow-Origin: * with origin-aware CORS.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ── Citation-essential fields — everything else stripped ──────────────────────

const RESULT_FIELDS = ["title", "authors", "year", "source", "doi", "url", "journal", "publisher", "id"];

function trimResult(result) {
  return RESULT_FIELDS.reduce((acc, key) => {
    acc[key] = result[key] ?? null;
    return acc;
  }, {});
}

// ── libraryKey — mirrors src/lib/library.js exactly ──────────────────────────

function libraryKey(result) {
  if (result.doi) return `doi:${result.doi.toLowerCase()}`;
  return `${result.source}:${result.id}`;
}

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

  // ── GET — load library ──────────────────────────────────────────────────────
  if (req.method === "GET") {
    const rows = await prisma.library_items.findMany({
      where:   { user_id: userId },
      orderBy: { saved_at: "desc" },
      select:  { result: true, saved_at: true, library_key: true },
    });
    // Rehydrate to the shape useLibrary expects: { ...result, savedAt }
    const items = rows.map(r => ({ ...r.result, savedAt: r.saved_at }));
    return res.status(200).json(items);
  }

  // ── POST — save item ────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const { result } = req.body ?? {};
    if (!result) return res.status(400).json({ error: "Missing result" });

    const key = libraryKey(result);
    const trimmed = trimResult(result);

    await prisma.library_items.upsert({
      where:  { user_id_library_key: { user_id: userId, library_key: key } },
      update: { result: trimmed, saved_at: Date.now() },
      create: { user_id: userId, library_key: key, result: trimmed, saved_at: Date.now() },
    });

    return res.status(200).json({ ok: true });
  }

  // ── DELETE — remove one or clear all ───────────────────────────────────────
  if (req.method === "DELETE") {
    const { library_key, clear } = req.body ?? {};

    if (clear) {
      await prisma.library_items.deleteMany({ where: { user_id: userId } });
      return res.status(200).json({ ok: true });
    }

    if (library_key) {
      await prisma.library_items.deleteMany({
        where: { user_id: userId, library_key },
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Provide library_key or clear:true" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
