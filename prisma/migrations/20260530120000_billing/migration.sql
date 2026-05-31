-- OpenCITE — WS3 billing migration (additive, idempotent)
--
-- Adds the billing columns to "users" and the three billing tables. Written with
-- IF NOT EXISTS guards so it is safe to apply whether or not the schema was ever
-- synced with `prisma db push` first — applying it twice is a no-op. Auto-applied
-- on every Vercel deploy via `prisma migrate deploy` in the build step.

-- ── users: billing columns ──────────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_customer_id"     TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan"                   TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_student_verified"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "student_verified_at"    TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "credits_period"         TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_stripe_customer_id_key"     ON "users"("stripe_customer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_stripe_subscription_id_key" ON "users"("stripe_subscription_id");

-- ── api_keys ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id"           TEXT NOT NULL,
  "key_hash"     TEXT NOT NULL,
  "key_prefix"   TEXT NOT NULL,
  "user_id"      UUID NOT NULL,  -- matches users.internal_id (native uuid in the live DB)
  "plan"         TEXT NOT NULL DEFAULT 'free',
  "revoked"      BOOLEAN NOT NULL DEFAULT false,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3),
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("internal_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX IF NOT EXISTS "api_keys_user_id_idx" ON "api_keys"("user_id");

-- ── api_usage ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "api_usage" (
  "id"     TEXT NOT NULL,
  "key_id" TEXT NOT NULL,
  "day"    TEXT NOT NULL,
  "count"  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "api_usage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "api_usage_key_id_day_key" ON "api_usage"("key_id", "day");
CREATE INDEX IF NOT EXISTS "api_usage_key_id_idx" ON "api_usage"("key_id");

-- ── processed_events (durable Stripe webhook idempotency) ─────────────────────────
CREATE TABLE IF NOT EXISTS "processed_events" (
  "event_id"     TEXT NOT NULL,
  "type"         TEXT NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id")
);
