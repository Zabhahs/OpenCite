// OpenCITE — crypto SSOT (DRY-1)
//
// One module, two clearly-separated primitive families:
//
//   1. Reversible AES-256-GCM encrypt/decrypt — for the user SETTINGS blob only.
//      Key: SETTINGS_ENCRYPTION_KEY (32-byte hex). Blob layout is preserved
//      byte-for-byte from the original settings.js so existing rows still
//      decrypt (R16): [12-byte IV][16-byte GCM tag][ciphertext] → base64.
//
//   2. One-way sha256 hashApiKey + generateApiKey — for API KEYS only.
//      We persist only the hash (never the plaintext); an optional
//      API_KEY_PEPPER is mixed in so a DB leak alone can't be brute-forced
//      against a known key format.
//
// Settings code uses (1); billing/key code uses (2). Never cross them.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// ── (1) Reversible AES-256-GCM — SETTINGS ONLY ─────────────────────────────────

function getSettingsKey() {
  const hex = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("SETTINGS_ENCRYPTION_KEY missing or invalid — must be 32-byte hex string");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(obj) {
  const key = getSettingsKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(blob) {
  const key = getSettingsKey();
  const buf = Buffer.from(blob, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8")
  );
}

// ── (2) One-way API-key hashing — KEYS ONLY ────────────────────────────────────

// F-404/F-509: fail fast in production if the pepper is missing. Without it, key
// hashes are bare sha256(key) — a DB leak makes them offline-brute-forceable against
// the known `oc_live_<...>` format. This throws at module load (deploy time) rather
// than silently degrading to unpepped hashes at runtime.
// HARD CONSTRAINT: API_KEY_PEPPER must be set in prod BEFORE this deploys, and must
// NEVER change once keys are issued — rotating it invalidates every stored key_hash.
if (process.env.NODE_ENV === "production" && !process.env.API_KEY_PEPPER) {
  throw new Error(
    "[crypto] API_KEY_PEPPER must be set in production. Generate with: openssl rand -hex 32 " +
    "(must not change after keys are issued)."
  );
}

// Public, human-recognizable prefix. Live keys: oc_live_<random>.
export const API_KEY_LIVE_PREFIX = "oc_live_";
// Characters kept for display (the bit shown in dashboards / logs). Safe because
// it's only a prefix, never the secret tail.
export const KEY_DISPLAY_PREFIX_LEN = 12;

// Generate a fresh API key. Returns { key, hash, prefix }:
//   key    — the full plaintext, shown to the user EXACTLY ONCE, never stored.
//   hash   — sha256(pepper + key), the only thing persisted (key_hash).
//   prefix — first KEY_DISPLAY_PREFIX_LEN chars, persisted for display (key_prefix).
export function generateApiKey() {
  const secret = randomBytes(24).toString("base64url"); // 32 url-safe chars
  const key = `${API_KEY_LIVE_PREFIX}${secret}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, KEY_DISPLAY_PREFIX_LEN) };
}

// Deterministic one-way hash of a presented key, for constant-format DB lookup.
// Optional API_KEY_PEPPER (any string) is prepended before hashing.
export function hashApiKey(key) {
  const pepper = process.env.API_KEY_PEPPER || "";
  return createHash("sha256").update(pepper + key).digest("hex");
}
