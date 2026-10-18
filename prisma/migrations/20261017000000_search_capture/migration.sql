-- OpenCITE — v0.50 search data capture: works · search_events · search_signals
-- Additive + idempotent (IF NOT EXISTS everywhere) so scripts/migrate.mjs can apply it
-- directly AND baseline it. Mirrors the three v0.50 models in schema.prisma.
--
-- Design: references not cards. `works` = one row per distinct paper (anonymizeId key);
-- `search_events` = one row per search with the displayed page as parallel int arrays;
-- `search_signals` = what the user/agent did with a result. lz4 TOAST on the two wide
-- tables so abstracts and arrays compress for free. Retention indefinite.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS "works" (
  "id"         SERIAL         NOT NULL,
  "oc_id"      TEXT           NOT NULL,
  "doi"        TEXT,
  "source"     TEXT           NOT NULL,
  "title"      TEXT,
  "authors"    TEXT[]         NOT NULL DEFAULT '{}',
  "year"       SMALLINT,
  "venue"      TEXT,
  "type"       TEXT,
  "abstract"   TEXT,
  "keywords"   TEXT[]         NOT NULL DEFAULT '{}',
  "url"        TEXT,
  "is_oa"      BOOLEAN,
  "cited_by"   INTEGER,
  "first_seen" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "seen_n"     INTEGER        NOT NULL DEFAULT 1,
  CONSTRAINT "works_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "works_oc_id_key" ON "works"("oc_id");
CREATE INDEX IF NOT EXISTS "works_doi_idx" ON "works"("doi");
ALTER TABLE "works" SET (toast_compression = lz4);

CREATE TABLE IF NOT EXISTS "search_events" (
  "id"          BIGSERIAL      NOT NULL,
  "ts"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "query"       TEXT           NOT NULL,
  "terms"       TEXT[]         NOT NULL DEFAULT '{}',
  "surface"     SMALLINT       NOT NULL,
  "user_id"     TEXT,
  "key_id"      TEXT,
  "plan"        TEXT,
  "actor"       BYTEA,
  "ip_hash"     BYTEA,
  "ua"          TEXT,
  "client"      TEXT,
  "tool"        TEXT,
  "settings"    JSONB,
  "experiment"  TEXT,
  "eligible"    TEXT[]         NOT NULL DEFAULT '{}',
  "failed"      TEXT[]         NOT NULL DEFAULT '{}',
  "coverage"    TEXT,
  "n_raw"       SMALLINT,
  "n_dedup"     SMALLINT,
  "n_returned"  SMALLINT,
  "latency_ms"  INTEGER,
  "cache_hit"   BOOLEAN        NOT NULL DEFAULT false,
  "page"        SMALLINT       NOT NULL DEFAULT 0,
  "dwell_ms"    INTEGER,
  "top"         INTEGER[]      NOT NULL DEFAULT '{}',
  "top_src"     INTEGER[]      NOT NULL DEFAULT '{}',
  "scores"      INTEGER[]      NOT NULL DEFAULT '{}',
  CONSTRAINT "search_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "search_events_ts_idx"      ON "search_events"("ts");
CREATE INDEX IF NOT EXISTS "search_events_user_id_idx" ON "search_events"("user_id");
CREATE INDEX IF NOT EXISTS "search_events_query_trgm"  ON "search_events" USING gin ("query" gin_trgm_ops);
-- GIN on the ranked-page array: machine-signal join (`top @> ARRAY[work_id]`) + per-work history.
CREATE INDEX IF NOT EXISTS "search_events_top_gin"     ON "search_events" USING gin ("top");
ALTER TABLE "search_events" SET (toast_compression = lz4);

CREATE TABLE IF NOT EXISTS "search_signals" (
  "id"       BIGSERIAL      NOT NULL,
  "event_id" BIGINT,
  "work_id"  INTEGER        NOT NULL,
  "rank"     SMALLINT       NOT NULL,
  "action"   SMALLINT       NOT NULL,
  "ts"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "meta"     JSONB,
  CONSTRAINT "search_signals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "search_signals_event_id_idx" ON "search_signals"("event_id");
CREATE INDEX IF NOT EXISTS "search_signals_work_id_idx"  ON "search_signals"("work_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'search_signals_event_id_fkey') THEN
    ALTER TABLE "search_signals" ADD CONSTRAINT "search_signals_event_id_fkey"
      FOREIGN KEY ("event_id") REFERENCES "search_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'search_signals_work_id_fkey') THEN
    ALTER TABLE "search_signals" ADD CONSTRAINT "search_signals_work_id_fkey"
      FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
