-- OpenCITE — sprint v0.48 Phase 2, leak L2 backfill (users.pack_purchased_at).
-- ONE-OFF DATA CHANGE — NOT a migration, NOT run automatically. Shahbaz runs it after the Phase 2
-- deploy (the column exists from migration 20261018000000). Idempotent.
--
-- Part A (derivable from our own data): plan = 'machine' is set ONLY by a pack purchase
-- (api/stripe/webhook.js, PACK_BUYER_PLAN_ID), so every machine-plan user bought at least one pack.
UPDATE "users"
   SET "pack_purchased_at" = COALESCE("pack_purchased_at", "updatedAt", now())
 WHERE "plan" = 'machine' AND "pack_purchased_at" IS NULL;

-- Part B (needs Stripe): a Student/Pro subscriber who ALSO bought a pack keeps plan = student/pro,
-- so the purchase is only visible in Stripe. List paid mode=payment Checkout Sessions with
-- metadata.pack in the live account (Stripe MCP / Dashboard → Payments, filter metadata.pack) and
-- stamp each matching user:
--   UPDATE "users" SET "pack_purchased_at" = COALESCE("pack_purchased_at", to_timestamp(<session.created>))
--    WHERE "stripe_customer_id" = '<cus_…>';
-- As of 2026-10-17 the user base is 13 accounts; expected matches: 0–1.

-- Verify:
-- SELECT internal_id, plan, pack_purchased_at FROM users WHERE plan = 'machine' OR pack_purchased_at IS NOT NULL;
