-- OpenCITE — sprint v0.48 Phase 2: metered billing, spend journal, verify trial
-- Additive + idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS). Zero rewrites of live rows.
-- Applied by scripts/migrate.mjs at build (prisma migrate deploy, or the direct-SQL fallback).
--
-- users: three-bucket balance (allowance → purchased → metered), metered-plan state, pack marker.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "allowance_credits"  DECIMAL(12,4) NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_status" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "metered_period"     TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "metered_usage"      DECIMAL(12,4) NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "metered_unreported" DECIMAL(12,4) NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "metered_cap_usd"    DECIMAL(10,2) NOT NULL DEFAULT 25;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pack_purchased_at"  TIMESTAMPTZ;
-- v0.48 D-14: no free API credits. New rows start at 0 (the old 10-credit seed is gone).
ALTER TABLE "users" ALTER COLUMN "total_credits" SET DEFAULT 0;

-- api_keys: human label + the OAuth client that minted the key (Phase 3 fills it).
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "label"           TEXT;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "oauth_client_id" TEXT;
CREATE INDEX IF NOT EXISTS "api_keys_oauth_client_id_idx" ON "api_keys"("oauth_client_id");

-- credit_events: append-only money journal (sprint v0.45 T1 design + key/bucket/endpoint).
-- Evidence, NOT balance: users.allowance_credits / total_credits stay authoritative.
CREATE TABLE IF NOT EXISTS "credit_events" (
  "id"               TEXT PRIMARY KEY,
  "user_id"          TEXT NOT NULL REFERENCES "users"("internal_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "key_id"           TEXT,
  "kind"             TEXT NOT NULL,            -- preauth | settle | refund | reconcile | grant | purchase | clawback | report | trial
  "amount"           DECIMAL(12,4) NOT NULL,   -- SIGNED total delta applied (preauth < 0)
  "allowance_delta"  DECIMAL(12,4) NOT NULL DEFAULT 0,
  "purchased_delta"  DECIMAL(12,4) NOT NULL DEFAULT 0,
  "metered_delta"    DECIMAL(12,4) NOT NULL DEFAULT 0,
  "band"             TEXT,
  "endpoint"         TEXT,
  "request_id"       TEXT,
  "source"           TEXT,                     -- Stripe event id, meter identifier, or sweep run id
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "credit_events_user_created_idx" ON "credit_events"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "credit_events_request_idx"      ON "credit_events"("request_id");
CREATE INDEX IF NOT EXISTS "credit_events_kind_created_idx" ON "credit_events"("kind", "created_at");

-- trial_usage: keyless / card-less verify trial counter (per identity per UTC day). Durable in
-- Postgres on purpose — the KV limiter is per-instance when KV is unprovisioned.
CREATE TABLE IF NOT EXISTS "trial_usage" (
  "identity"   TEXT NOT NULL,                  -- ip:<addr> | user:<id>
  "day"        DATE NOT NULL,
  "refs"       INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("identity", "day")
);
