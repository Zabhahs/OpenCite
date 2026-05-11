// OpenCITE — Settings API
// Route: /api/settings
// Runtime: Node.js (Prisma)
// Auth: session cookie via Auth.js — unauthenticated requests rejected
//
// Stores user API keys + custom journals as an AES-256-GCM encrypted blob
// in users.settings (JSONB). The encryption key lives only in the
// SETTINGS_ENCRYPTION_KEY Vercel env var — never in the DB.
//
// GET  /api/settings  → decrypt and return settings object
// POST /api/settings  → encrypt and upsert settings object

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

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
  const iv  = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(blob) {
  const key = getKey();
  const buf       = Buffer.from(blob, "base64");
  const iv        = buf.subarray(0, 12);
  const tag       = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher  = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return JSON.parse(plain);
}

// ── Auth session helper ───────────────────────────────────────────────────────

async function getSession(req) {
  const url = new URL(req.url ?? `http://localhost${req.url}`, "http://localhost");
  try {
    const res = await fetch(`${url.origin}/api/auth/session`, {
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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();

  const user = await getSession(req);
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const userId = user.id;

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const row = await prisma.user.findUnique({
      where:  { internal_id: userId },
      select: { settings: true },
    });

    if (!row?.settings) return res.status(200).json({ settings: null });

    try {
      // settings column stores the encrypted blob as a JSON string value
      const blob      = typeof row.settings === "string" ? row.settings : JSON.stringify(row.settings);
      const decrypted = decrypt(blob);
      return res.status(200).json({ settings: decrypted });
    } catch {
      // Wrong key or corrupted blob — return null so client falls back to localStorage
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
      const encrypted = encrypt(settings);
      await prisma.user.update({
        where: { internal_id: userId },
        data:  { settings: encrypted },
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("Settings save error:", e.message);
      return res.status(500).json({ error: "Failed to save settings" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
