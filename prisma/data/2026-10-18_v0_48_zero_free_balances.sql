-- OpenCITE — sprint v0.48 Phase 2, decision D-14 (no free API credits).
-- ONE-OFF DATA CHANGE — NOT a migration, NOT run automatically. Shahbaz runs it (Supabase SQL
-- editor) AFTER taking a JSON backup and AFTER the Phase 2 deploy is live (so the metered plan
-- and the verify trial exist before the free balances disappear).
--
-- Every credit on a plan='free' row is free-granted (buying a pack moves a user to `machine`,
-- a subscription to student/pro/api), so zeroing free rows removes no purchased credit.
-- Idempotent; journals one `clawback` row per affected user so the change is auditable.

BEGIN;

INSERT INTO "credit_events" ("id", "user_id", "kind", "amount", "allowance_delta", "purchased_delta", "metered_delta", "source", "created_at")
SELECT gen_random_uuid()::text, "internal_id", 'clawback',
       -("total_credits" + "allowance_credits"), -"allowance_credits", -"total_credits", 0,
       'v0.48 D-14 free-tier removal', now()
  FROM "users"
 WHERE "plan" = 'free' AND ("total_credits" > 0 OR "allowance_credits" > 0);

UPDATE "users"
   SET "total_credits" = 0, "allowance_credits" = 0
 WHERE "plan" = 'free' AND ("total_credits" > 0 OR "allowance_credits" > 0);

COMMIT;

-- Verify: expect 0 rows.
-- SELECT internal_id, total_credits, allowance_credits FROM users WHERE plan = 'free' AND (total_credits > 0 OR allowance_credits > 0);
