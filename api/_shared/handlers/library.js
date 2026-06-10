// OpenCITE — Library API
// Route: /api/library
// Runtime: Node.js (Prisma)
// Auth: session cookie via Auth.js — unauthenticated requests rejected
//
// GET    /api/library  → load all saved items (ordered saved_at DESC)
// POST   /api/library  → save item   { result: UnifiedResult }
// DELETE /api/library  → remove one  { library_key } or clear all { clear: true }

import { prisma } from "../prisma.js";
import { setCorsHeaders, getSession } from "../auth.js";
import { parseBody } from "../parseBody.js";

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

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCorsHeaders(req, res, "GET, POST, DELETE, OPTIONS");
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
    // BigInt cannot be JSON-serialized — convert saved_at to Number
    const items = rows.map(r => ({ ...r.result, savedAt: Number(r.saved_at) }));
    return res.status(200).json(items);
  }

  // ── POST — save item ────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const body = await parseBody(req, res);
    if (!body) return; // 413 already sent (F-400)
    const { result } = body;
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
    const body = await parseBody(req, res);
    if (!body) return; // 413 already sent (F-400)
    const { library_key, clear } = body;

    if (clear) {
      await prisma.library_items.deleteMany({ where: { user_id: userId } });
      return res.status(200).json({ ok: true });
    }

    if (library_key) {
      await prisma.library_items.deleteMany({ where: { user_id: userId, library_key } });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Provide library_key or clear:true" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
