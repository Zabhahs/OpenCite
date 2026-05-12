// OpenCITE — Settings API
// Route: /api/settings
// Runtime: Node.js (Prisma)
// Auth: session cookie via Auth.js — unauthenticated requests rejected
//
// Stores user API keys + custom journals as an AES-256-GCM encrypted blob
// in users.settings (JSONB). Key lives in SETTINGS_ENCRYPTION_KEY env var only.
//
// GET  /api/settings  → decrypt and return settings object
// POST /api/settings  → encrypt and upsert settings object

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { prisma } from "./_shared/prisma.js";
import { setCorsHeaders, getSession } from "./_shared/auth.js";

// ── Encryption ────────────────────────────────────────────────────────────────
// AES-256-GCM: authenticated encryption — ciphertext is tamper-proof.
// Blob layout: [12 bytes IV][16 bytes GCM auth tag][N bytes ciphertext] → base64

function getKey() {
  const hex = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error("SETTINGS_ENCRYPTION_KEY missing or invalid — must be 32-byte hex string");
  return Buffer.from(hex, "hex");
}

function encrypt(obj) {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(blob) {
  const key = getKey();
  const buf = Buffer.from(blob, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8")
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCorsHeaders(req, res, "GET, POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();

  const user = await getSession(req);
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const userId = user.id;

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const row = await prisma.user.findUnique({
      where:  { id: userId },
      select: { settings: true },
    });

    if (!row?.settings) return res.status(200).json({ settings: null });

    try {
      const blob = typeof row.settings === "string" ? row.settings : JSON.stringify(row.settings);
      return res.status(200).json({ settings: decrypt(blob) });
    } catch {
      // Wrong key or corrupted blob — fall back to localStorage on client
      return res.status(200).json({ settings: null });
    }
  }

  // ── POST ────────────────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const { settings } = req.body ?? {};
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return res.status(400).json({ error: "settings must be a plain object" });
    }

    try {
      await prisma.user.update({
        where: { id: userId },
        data:  { settings: encrypt(settings) },
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("[settings] save error:", e.message);
      return res.status(500).json({ error: "Failed to save settings" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
