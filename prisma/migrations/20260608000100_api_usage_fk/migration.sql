-- OpenCITE — add FK from api_usage.key_id → api_keys.id (F-502)
-- Non-destructive + idempotent. Makes key_id nullable, drops any orphan refs to
-- NULL, then adds the FK with ON DELETE SET NULL so historical usage rows survive
-- key deletion (analytics value) instead of being silently dropped.

-- Step 1: make key_id nullable (no data change; existing non-null values preserved).
ALTER TABLE "api_usage" ALTER COLUMN "key_id" DROP NOT NULL;

-- Step 2: null out pre-existing orphan rows so the FK constraint can be added.
--         These reference already-deleted api_keys and can never be joined — the FK
--         would simply set them NULL on the next delete anyway. (R4 preflight.)
UPDATE "api_usage" u
   SET "key_id" = NULL
 WHERE "key_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "api_keys" k WHERE k."id" = u."key_id");

-- Step 3: add the FK constraint (idempotent via existence check).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_usage_key_id_fkey'
  ) THEN
    ALTER TABLE "api_usage"
      ADD CONSTRAINT "api_usage_key_id_fkey"
      FOREIGN KEY ("key_id")
      REFERENCES "api_keys"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$$;
