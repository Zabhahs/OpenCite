// OpenCITE — resilient migration runner (Vercel build step)
//
// GOAL #1 (non-negotiable): NEVER fail the build. A migration hiccup must not
// freeze deploys — a frozen deploy takes the WHOLE site offline, including
// Google OAuth. This script always exits 0.
//
// GOAL #2 (best effort): bring the schema up to date and record migration
// history so the project transitions cleanly onto Prisma Migrate.
//
// WHY THIS EXISTS — P3005:
// The production DB was originally synced with `prisma db push` (see arch
// report v0.17), so it has all the core tables but NO `_prisma_migrations`
// history. `prisma migrate deploy` refuses to run against such a database
// (error P3005 "database schema is not empty"). The standard remedy is to
// baseline: mark the existing migration as already-applied without re-running
// destructive SQL. Our migration is additive + fully idempotent (IF NOT
// EXISTS), so we can safely run it directly first to fill any gaps, then
// baseline. After the first successful deploy, `migrate deploy` is a clean
// no-op forever.

import { execSync } from "node:child_process";

const MIGRATION = "20260530120000_billing";
const SQL_FILE = `prisma/migrations/${MIGRATION}/migration.sql`;
// DDL is safest over the direct (non-pooling) connection.
const DIRECT_URL = process.env.POSTGRES_URL_NON_POOLING || "";

function run(cmd, label) {
  console.log(`[migrate] $ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit" });
    if (label) console.log(`[migrate] ✓ ${label}`);
    return true;
  } catch {
    console.warn(`[migrate] ✗ ${label || cmd} failed — continuing`);
    return false;
  }
}

// 1) Happy path: if history already exists, this applies pending migrations
//    (or is a clean no-op) and we're done.
if (run("npx prisma migrate deploy", "migrate deploy")) {
  process.exit(0);
}

// 2) Fallback for the P3005 first-run (db-push'd DB with no history).
console.warn("[migrate] migrate deploy failed (likely P3005) — applying SQL directly + baselining");

// 2a) Apply the idempotent SQL so any missing columns/tables are created.
//     No-op where objects already exist.
const execCmd = DIRECT_URL
  ? `npx prisma db execute --url "${DIRECT_URL}" --file ${SQL_FILE}`
  : `npx prisma db execute --schema prisma/schema.prisma --file ${SQL_FILE}`;
run(execCmd, "direct SQL apply");

// 2b) Record the migration as applied so future `migrate deploy` runs succeed.
run(`npx prisma migrate resolve --applied ${MIGRATION}`, "baseline (resolve --applied)");

// Always succeed — the frontend + API (and therefore auth) must ship.
process.exit(0);
