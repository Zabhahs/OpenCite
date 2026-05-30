// OpenCITE — API key management
// Route: /api/keys
// Runtime: Node.js (Prisma)
// Auth: session cookie via Auth.js — a signed-in HUMAN provisions keys; the AGENT
//       later consumes them on /api/search. Single identity (User), two surfaces.
//
// GET    /api/keys        → list the caller's keys (PREFIXES ONLY, never the secret)
// POST   /api/keys        → mint a new key; returns the plaintext EXACTLY ONCE
// DELETE /api/keys?id=..  → revoke one of the caller's keys
//
// Dormant until WS3 ships: harmless if api_keys table is absent (calls just error
// out under try/catch). No plaintext key is ever stored or logged.

import { prisma } from "./_shared/prisma.js";
import { setCorsHeaders, getSession } from "./_shared/auth.js";
import { generateApiKey } from "./_shared/crypto.js";
import { getPlan, DEFAULT_PLAN_ID } from "./_shared/plans.js";

const firstParam = (v) => (Array.isArray(v) ? v[0] : v) ?? "";

const publicView = (row) => ({
  id: row.id,
  prefix: row.key_prefix,
  plan: row.plan,
  revoked: row.revoked,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
});

export default async function handler(req, res) {
  setCorsHeaders(req, res, "GET, POST, DELETE, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();

  const user = await getSession(req);
  if (!user) return res.status(401).json({ error: "Unauthenticated" });
  const userId = user.id;

  // ── GET — list keys (prefixes only) ──────────────────────────────────────────
  if (req.method === "GET") {
    const rows = await prisma.apiKey.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
    });
    return res.status(200).json({ keys: rows.map(publicView) });
  }

  // ── POST — mint a new key ────────────────────────────────────────────────────
  if (req.method === "POST") {
    // Plan defaults to free; a paid plan is assigned only after a credit purchase
    // flow (not selectable client-side — entitlement is server-authoritative).
    const planId = DEFAULT_PLAN_ID;
    const { key, hash, prefix } = generateApiKey();
    const row = await prisma.apiKey.create({
      data: { key_hash: hash, key_prefix: prefix, user_id: userId, plan: getPlan(planId).id },
    });
    // The ONLY time the plaintext key is ever returned. Not stored, not logged.
    return res.status(201).json({ key, ...publicView(row) });
  }

  // ── DELETE — revoke a key (scoped to the caller) ─────────────────────────────
  if (req.method === "DELETE") {
    const id = firstParam(req.query?.id).trim();
    if (!id) return res.status(400).json({ error: "Missing key id" });
    const result = await prisma.apiKey.updateMany({
      where: { id, user_id: userId },
      data: { revoked: true },
    });
    if (result.count === 0) return res.status(404).json({ error: "Key not found" });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
