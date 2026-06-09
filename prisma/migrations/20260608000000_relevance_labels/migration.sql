-- OpenCITE — add relevance_labels table (F-503; F2 gold-set harness)
-- Additive + idempotent. Safe to apply over an existing DB that may already have
-- this table (e.g. synced via `prisma db push` in v0.33). IF NOT EXISTS guards
-- mean applying twice is a no-op. Mirrors model relevance_labels (schema.prisma).

CREATE TABLE IF NOT EXISTS "relevance_labels" (
  "id"         SERIAL                   NOT NULL,
  "query"      TEXT                     NOT NULL,
  "doi"        TEXT                     NOT NULL,
  "grade"      INTEGER                  NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "relevance_labels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "relevance_labels_query_grade_idx"
  ON "relevance_labels"("query", "grade");
