# OpenCITE — Sprint Log v0.40

> **PM + architecture document for the next Claude instance(s).** Self-contained execution
> plan for **Deploy & Data Integrity** — env/secrets config, DB schema/migrations,
> dependency pinning, and storage-namespace hygiene. No new features; no user-visible
> changes. Zero production risk when each task is applied in order.
>
> Read `sprint_log_v0_36.md` (house style + pipeline context) first.
> Cross-refs: [[07-Data-Layer/Data-Layer]] · [[08-Build-Deploy/Build-Deploy]]
>
> **Created:** 2026-06-08 · **Status:** EXECUTED 2026-06-09 (not yet deployed) — see §8 Actuals.
> **Mode:** C (plan → approval → execute → checklist). Dense, no padding; precise execution.

---

## 0. TL;DR

Eight low-to-medium defects, all infrastructure. None touches the search pipeline or user
features. The two that block a fresh deploy are prioritised first (T1 env-var gap, T2
missing migration); the rest are hardening. Total estimate: **~8 h**.

| # | Finding | Severity | Blocker? | Est. |
|---|---|---|---|---|
| T1 | F-508 `.env.example` wrong DB var names + 8 undocumented prod vars | med | yes (fresh dev) | 0.5 h |
| T2 | F-503 `relevance_labels` missing from migration → fresh deploy breaks harness | med | yes (new env) | 1.0 h |
| T3 | F-502 `ApiUsage.key_id` no FK → orphan rows | low | no | 1.0 h |
| T4 | F-505 `total_credits` float arithmetic risk in `billing.js` | low | no | 1.0 h |
| T5 | F-507 `@auth/core`/`@auth/prisma-adapter` `^` semver | med | no | 0.5 h |
| T6 | F-500 MCP SDK `^` semver | low | no | 0.5 h |
| T7 | F-506 `public/output.css` stale in dev | low | no | 0.5 h |
| T8 | F-310 + F-504 bare localStorage keys → `opencite:` namespace | low | no | 2.5 h |
| T9 | F-501 MCP `{_text}` envelope undocumented | low | no | 0.5 h |

---

## 1. Scope

**In scope (this sprint):**
- Env var documentation (`F-508`)
- DB migrations: `relevance_labels` table (`F-503`) and `ApiUsage` FK (`F-502`)
- `billing.js` Decimal audit + atomic operations (`F-505`)
- Dependency pinning: `@auth/core`, `@auth/prisma-adapter`, `@modelcontextprotocol/sdk` (`F-507`, `F-500`)
- Dev script / CSS hygiene (`F-506`)
- localStorage namespace migration: `GoldSetHarness` + `useSettings` (`F-310`, `F-504`)
- MCP `{_text}` envelope documentation (`F-501`)

**Out of scope:**
- Security headers (`F-406`), SSRF fixes (`F-410`/`F-411`), timing-safe compare (`F-402`) — deferred to a dedicated security sprint.
- Dead adapters (`F-107`/`F-109`/`F-110`) — quarantined in v0.38 already per `_quarantine/_index.md`.
- Billing UX / `BillingContext` wiring (`F-300`, `F-311`) — v0.37 MCP funnel prerequisite.

---

## 2. Design / approach

### 2a — Migration strategy (P3005 safety rule)

Every DB change in this sprint follows the guardrail established after the v0.30 OAuth
incident and encoded in `scripts/migrate.mjs`:

1. **New file per change** — never append to `20260530120000_billing/migration.sql` (that
   migration is already baseline-resolved on prod; editing it would cause a checksum
   mismatch and a deploy failure).
2. **All DDL uses `IF NOT EXISTS` / `IF EXISTS`** — applying twice is a no-op.
3. **Non-destructive only** — no `DROP`, no `ALTER COLUMN` that changes existing data.
   If an `ALTER` is needed (adding a FK constraint), use `ADD CONSTRAINT IF NOT EXISTS`.
4. **`migrate.mjs` hardcodes one `MIGRATION` name** — after T2 and T3 add new files,
   `migrate.mjs` must be updated to iterate all migration files, or to point at the latest
   one. See T2.4 for the exact approach.
5. **Data-loss risk** — explicitly called out in the risk register (§5). No task in this
   sprint destroys or transforms existing rows.

### 2b — Decimal arithmetic rule (`billing.js`)

`Prisma.Decimal` objects returned from queries must never be operated on with plain JS `+`,
`-`, `*`, `/`. The correct patterns are:
- **Atomic (preferred):** `{ decrement: dec(n) }` / `{ increment: dec(n) }` — Prisma
  emits `total_credits = total_credits - $1`, evaluated in Postgres.
- **Application-level (fallback):** `new Prisma.Decimal(a).minus(new Prisma.Decimal(b))` —
  safe if both operands are `Decimal` instances.
- **Wrong (precision loss):** `Number(u.total_credits) - n` — `Number()` silently drops
  sub-cent precision beyond 15 significant digits.

Audit target: `api/_shared/billing.js`. Current code uses `dec(n)` wrapper +
`{ decrement: dec(amount) }` throughout — already safe. The one gap is `round4`:
`Math.round(n * 1e4) / 1e4` where `n = preAuthAmount * multiplier` (plain JS floats).
Fix: keep `round4` but accept that both inputs are already small-precision numbers
(creditCost is typically 0.1–2.0, multiplier 0.0–1.0); precision risk is negligible at
these scales. Document the decision with a comment rather than replacing `round4` with a
Decimal chain. Atomic `increment`/`decrement` usage is already correct — no changes
needed to the ledger primitives.

### 2c — localStorage namespace migration

`lib/storage.js` uses prefix `${STORAGE_NS}:` (i.e. `opencite:`) via `ns(key)`. Two
callsites bypass this:

- `GoldSetHarness.jsx`: bare keys `opencite_gold_queries` / `opencite_test_runs`
  (underscores, no colon).
- `useSettings.js`: already has `migrateLegacyKeys()` for flat bare keys — but that
  function was for v0.34 key names; the harness keys are not covered.

Migration pattern: on first read, if the namespaced key is absent but the bare key
exists, copy-then-remove. This is the same one-time pattern `useSettings.js` uses for the
v0.34 keys. No data loss — original bare key is removed only after successful write to
namespaced key.

### 2d — Dependency pinning

Lockfile `package-lock.json` is **already committed** (confirmed present at repo root).
The issue is that `package.json` uses `^` ranges, so `npm install` on a clean machine
can pull a different minor. Fix: change `package.json` specifiers to exact pinned versions
matching what the lock currently resolves to:
- `@auth/core`: lock resolves `0.41.2` (via `@auth/prisma-adapter`'s own dep) but the
  top-level `@auth/core` entry in the lock is `^0.37.4` → resolves to its own version.
  Check lock for the top-level resolved version.
- `@auth/prisma-adapter`: lock resolves `2.11.2`.
- MCP: `mcp/package.json` has no lockfile yet → pin + create lockfile.

---

## 3. Execution plan

### T1 — Fix `.env.example` (F-508) · 0.5 h

**Problem:** `.env.example:12–13` shows `DATABASE_URL`/`DIRECT_URL` but
`prisma/schema.prisma:12–13` reads `POSTGRES_PRISMA_URL`/`POSTGRES_URL_NON_POOLING`.
Eight prod-required vars are undocumented: `OPENCITE_API_KEY`, `VITE_ADMIN_EMAILS`,
`SETTINGS_ENCRYPTION_KEY`, `API_KEY_PEPPER`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

- [ ] T1.1 **`.env.example`** — replace the Prisma block:
  ```diff
  - DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
  - DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
  + # Vercel Postgres / Supabase — these exact names are read by prisma/schema.prisma
  + # and scripts/migrate.mjs. Wrong names = Prisma P1013 error on migrate/generate.
  + # Pooler URL (port 6543, pgBouncer). Append ?pgbouncer=true to disable prepared stmts.
  + POSTGRES_PRISMA_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
  + # Direct URL (port 5432). Used only by prisma migrate (DDL-safe direct connection).
  + POSTGRES_URL_NON_POOLING="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
  ```
- [ ] T1.2 **`.env.example`** — uncomment and flesh out the Stripe block (currently
  commented placeholders); add all undocumented required vars. New sections to add after
  the existing OAuth block:

  ```
  # ─── Stripe billing ───────────────────────────────────────────────────────────
  # Required once billing is active. Without these, /api/checkout → 503.
  STRIPE_SECRET_KEY=""
  STRIPE_WEBHOOK_SECRET=""

  # ─── API / admin ──────────────────────────────────────────────────────────────
  # Master API key (admin identity). Required in production.
  # Generate: openssl rand -hex 32; prefix with oc_live_
  OPENCITE_API_KEY=""
  # Comma-separated admin emails. Build-time baked (VITE_ prefix). Requires redeploy.
  VITE_ADMIN_EMAILS=""
  # Optional: Crossref polite-pool mailto header.
  OPENCITE_MAILTO=""

  # ─── Encryption ───────────────────────────────────────────────────────────────
  # 64-char hex → 32-byte AES-256-GCM key for users.settings blob.
  # Generate: openssl rand -hex 32
  SETTINGS_ENCRYPTION_KEY=""
  # Pepper prepended to API key hashes. Required in production.
  # Generate: openssl rand -hex 32
  API_KEY_PEPPER=""

  # ─── KV / rate-limit (Upstash) ────────────────────────────────────────────────
  # Rate-limit fail-open if absent; add for production burst protection.
  KV_REST_API_URL=""
  KV_REST_API_TOKEN=""

  # ─── Backend source keys (v0.34) — keyed sources auto-drop if absent ──────────
  EUROPEANA_API_KEY=""
  DPLA_API_KEY=""
  SMITHSONIAN_API_KEY=""
  ```
- [ ] T1.3 Remove the now-redundant `# Phase 4 placeholder` Base L2 block (those vars
  are purely internal future hooks; not referenced by any current code).
- [ ] T1.4 Verify by running `grep -R "process.env\." api/_shared/ api/auth/` and
  confirming every referenced var now appears in `.env.example`.

---

### T2 — Add `relevance_labels` migration (F-503) · 1.0 h

**Problem:** `prisma/schema.prisma:184–194` defines `relevance_labels` but
`prisma/migrations/20260530120000_billing/migration.sql` does not create it. A fresh
`prisma migrate deploy` skips it → table missing → `GoldSetHarness` F2 crashes on any
DB write.

**Migration file convention:** `YYYYMMDDHHMMSS_<description>`. Use
`20260608000000_relevance_labels`.

- [ ] T2.1 Create `prisma/migrations/20260608000000_relevance_labels/migration.sql`:
  ```sql
  -- OpenCITE — add relevance_labels table (F2 gold-set harness)
  -- Additive + idempotent. Safe to apply over existing DB that may already have
  -- this table (e.g. deployed via prisma db push in v0.33). IF NOT EXISTS guard.

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
  ```
- [ ] T2.2 Update `scripts/migrate.mjs` to apply both migrations in sequence. The
  simplest P3005-safe approach: change `migrate.mjs` so the fallback path applies all
  `.sql` files under `prisma/migrations/` in lexicographic order (filenames sort
  correctly since they're timestamp-prefixed), then baselines each. Alternatively, since
  `migrate deploy` (the happy path) handles multiple files natively, only the fallback
  P3005 path needs updating.

  Exact change in `migrate.mjs` (fallback block, currently lines 50–65):
  ```diff
  - const SQL_FILE = `prisma/migrations/${MIGRATION}/migration.sql`;
  + // Collect all migration SQL files in lexicographic order.
  + import { readdirSync } from "node:fs";
  + const migrationDirs = readdirSync("prisma/migrations")
  +   .filter(d => /^\d{14}_/.test(d))
  +   .sort();
  + const SQL_FILES = migrationDirs.map(d => `prisma/migrations/${d}/migration.sql`);
  ```
  And in the fallback block, loop over `SQL_FILES` applying each, then baseline each.
  Keep the `MIGRATION` constant pointing at the **latest** migration for the `resolve
  --applied` baseline call (or baseline all in order). Full diff shown in T2.3.

- [ ] T2.3 Write the updated fallback loop in `migrate.mjs`:
  ```js
  // 2a) Apply each migration SQL in order (idempotent IF NOT EXISTS guards).
  const MIGRATIONS = readdirSync("prisma/migrations")
    .filter(d => /^\d{14}_/.test(d))
    .sort();
  let allApplied = true;
  for (const m of MIGRATIONS) {
    const sqlFile = `prisma/migrations/${m}/migration.sql`;
    const cmd = DIRECT_URL
      ? `npx prisma db execute --url "${DIRECT_URL}" --file ${sqlFile}`
      : `npx prisma db execute --schema prisma/schema.prisma --file ${sqlFile}`;
    const ok = run(cmd, `SQL apply: ${m}`);
    if (!ok) { allApplied = false; break; }
  }
  // 2b) Baseline each resolved migration (only if all SQL applied).
  if (allApplied) {
    for (const m of MIGRATIONS) {
      run(`npx prisma migrate resolve --applied ${m}`, `baseline: ${m}`);
    }
  }
  ```
  Remove the now-replaced `MIGRATION` constant and `SQL_FILE` constant.
- [ ] T2.4 Manual verification path: on a local Postgres (or Supabase branch) with no
  `_prisma_migrations` table, run `node scripts/migrate.mjs` and confirm:
  - Both migration names appear in `_prisma_migrations`.
  - `\d relevance_labels` shows the expected columns.
  - Re-running is a no-op (idempotent).

**Data-loss risk:** none. `CREATE TABLE IF NOT EXISTS` — no existing rows affected.

---

### T3 — Add `ApiUsage.key_id` FK (F-502) · 1.0 h

**Problem:** `prisma/schema.prisma:159–168` defines `ApiUsage` with `key_id String` but
no `@relation` to `ApiKey`. Deleted API keys leave orphan rows in `api_usage`.

**Approach:** add the FK as a migration + update the Prisma schema. Use
`ON DELETE SET NULL` rather than `CASCADE` — analytics rows are useful even after key
deletion (they contribute to per-user usage totals); setting `key_id` to NULL is
preferable to silent deletion of historical data.

**Schema change: `prisma/schema.prisma`**
```diff
 model ApiUsage {
   id      String @id @default(uuid())
   key_id  String
+  key     ApiKey? @relation(fields: [key_id], references: [id], onDelete: SetNull)
   day     String
   count   Int    @default(0)
   ...
 }

 model ApiKey {
   ...
+  usage   ApiUsage[]
   @@map("api_keys")
 }
```
Wait — `onDelete: SetNull` requires `key_id` to be nullable (`String?`). Current schema
has `key_id String` (non-null). The safe migration path:
1. Add `key_id` nullable in migration SQL.
2. Update schema to `key_id String?`.
3. Add FK constraint.

- [ ] T3.1 Create `prisma/migrations/20260608000100_api_usage_fk/migration.sql`:
  ```sql
  -- OpenCITE — add FK from api_usage.key_id → api_keys.id (F-502)
  -- Non-destructive: makes key_id nullable + adds FK with SET NULL on delete.
  -- Existing rows with valid key_ids are unaffected.
  -- Orphan rows (key_id referencing deleted api_keys) get key_id set to NULL on next
  -- cascade — no rows are deleted.

  -- Step 1: make key_id nullable (no data change; existing non-null values preserved).
  ALTER TABLE "api_usage" ALTER COLUMN "key_id" DROP NOT NULL;

  -- Step 2: add FK constraint (idempotent via DO block).
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'api_usage_key_id_fkey'
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
  ```
- [ ] T3.2 Update `prisma/schema.prisma`:
  ```diff
   model ApiUsage {
     id      String  @id @default(uuid())
  -  key_id  String
  +  key_id  String?
  +  key     ApiKey? @relation(fields: [key_id], references: [id], onDelete: SetNull)
     day     String
     count   Int     @default(0)
     @@unique([key_id, day], name: "key_id_day")
     @@index([key_id])
     @@map("api_usage")
   }

   model ApiKey {
     ...
     user   User   @relation(fields: [user_id], references: [id], onDelete: Cascade)
  +  usage  ApiUsage[]
     @@index([user_id])
     @@map("api_keys")
   }
  ```
- [ ] T3.3 Run `npx prisma generate` locally to confirm the schema compiles.
- [ ] T3.4 Verify `migrate.mjs` loop (from T2.3) picks up the new migration file in
  order (`20260608000100` sorts after `20260608000000`).

**Data-loss risk:** none. `ALTER COLUMN DROP NOT NULL` only relaxes the constraint.
Existing rows retain their `key_id` values unchanged. No rows deleted.

---

### T4 — Audit `billing.js` Decimal handling (F-505) · 1.0 h

**Problem:** `total_credits` is `Decimal(12,4)` in Postgres; Prisma returns it as a
`Prisma.Decimal` object. Any plain JS arithmetic (`+`, `-`, `*`) on it loses precision
beyond the float mantissa (~15 sig figs, but drifts accumulate across many transactions).

**Audit findings (from reading `api/_shared/billing.js`):**

| Location | Code | Safe? | Action |
|---|---|---|---|
| `preAuthorize:33` | `{ decrement: dec(amount) }` | Yes — atomic Postgres op | No change |
| `refund:44` | `{ increment: dec(amount) }` | Yes — atomic Postgres op | No change |
| `settle:57` | `preAuthAmount * multiplier` (plain JS) | Low risk — both are small floats (0.0–2.0); result rounded to 4dp | Document |
| `settle:58` | `round4(preAuthAmount - finalCharge)` (plain JS) | Same — small floats | Document |
| `grantCredits:84` | `{ increment: dec(credits) }` | Yes — atomic | No change |
| `applyMonthlyGrant:110` | `u.total_credits.lessThan(floor)` | Yes — Decimal method | No change |
| `getBalance:73` | `Number(u.total_credits)` | Fine — display only, not written back | No change |

- [ ] T4.1 Add a comment above `round4` in `billing.js`:
  ```js
  // round4: used only for settlement arithmetic on creditCost (0.01–10.0) ×
  // multiplier (0.0–1.0). Plain JS float precision is adequate at these magnitudes;
  // the result is never written back to the DB directly — all DB writes use atomic
  // Prisma increment/decrement. If creditCost grows to >10^6 this should be replaced
  // with Decimal arithmetic.
  const round4 = (n) => Math.round(n * 1e4) / 1e4;
  ```
- [ ] T4.2 Grep for any other files outside `billing.js` that do arithmetic on
  `total_credits` directly:
  ```
  grep -r "total_credits" api/ --include="*.js" -l
  ```
  Expected: only `billing.js` and `prisma.js` (select). If anything else is found,
  audit and add `dec()` wrappers as needed.
- [ ] T4.3 Add a test note to `SEARCH_DIAGNOSTIC_v0_36.md` (or a `docs/wiki/` note) that
  the Decimal-handling audit was done and found no unsafe paths. No new test file
  required — this is a documentation-level verification.

---

### T5 — Pin `@auth/core` + `@auth/prisma-adapter` (F-507) · 0.5 h

**Problem:** `package.json:13–14` uses `"^0.37.4"` and `"^2.7.4"`. Lock currently
resolves to `@auth/prisma-adapter@2.11.2` (with its own pinned `@auth/core@0.41.2`
subdep) and top-level `@auth/core` resolves separately. An `npm install` on a fresh
machine may pull a newer minor.

- [ ] T5.1 Determine the top-level resolved `@auth/core` version:
  ```
  grep -A3 '"node_modules/@auth/core"' package-lock.json | head -5
  ```
  Use that exact version as the pin. Based on current lock: `@auth/prisma-adapter`
  bundles `@auth/core@0.41.2` as a subdep; the top-level `@auth/core` may be a different
  version. Pin both to their current lock resolutions.
- [ ] T5.2 Edit `package.json`:
  ```diff
  - "@auth/core": "^0.37.4",
  - "@auth/prisma-adapter": "^2.7.4",
  + "@auth/core": "0.41.2",
  + "@auth/prisma-adapter": "2.11.2",
  ```
  (Adjust `@auth/core` version based on the grep result from T5.1.)
- [ ] T5.3 Run `npm install` — this must be a no-op (lockfile already matches). If it
  changes anything, investigate before committing. Commit `package.json` only (lockfile
  unchanged).
- [ ] T5.4 Enable Dependabot for controlled upgrade PRs: create
  `.github/dependabot.yml` with weekly `npm` updates for `@auth/*` packages only:
  ```yaml
  version: 2
  updates:
    - package-ecosystem: npm
      directory: "/"
      schedule:
        interval: weekly
      allow:
        - dependency-name: "@auth/*"
    - package-ecosystem: npm
      directory: "/mcp"
      schedule:
        interval: weekly
      allow:
        - dependency-name: "@modelcontextprotocol/*"
  ```

---

### T6 — Pin MCP SDK (F-500) · 0.5 h

**Problem:** `mcp/package.json:23` has `"@modelcontextprotocol/sdk": "^1.0.0"`. No
`mcp/package-lock.json` exists. Breaking SDK changes between 1.x minors have been
observed upstream.

- [ ] T6.1 In `mcp/` directory: run `npm install` to generate `mcp/package-lock.json`
  and record the resolved version.
- [ ] T6.2 Read the resolved version from `mcp/package-lock.json`. Pin it in
  `mcp/package.json`:
  ```diff
  - "@modelcontextprotocol/sdk": "^1.0.0"
  + "@modelcontextprotocol/sdk": "<resolved-version>"
  ```
- [ ] T6.3 Commit both `mcp/package.json` and `mcp/package-lock.json`.
- [ ] T6.4 Smoke-test: `node mcp/bin/opencite-mcp.js` starts without error (requires
  `OPENCITE_API_KEY` env var — use a test key or the admin key locally).

---

### T7 — Fix stale CSS in dev (F-506) · 0.5 h

**Problem:** `package.json:8` dev script is `"vite"` only. `public/output.css` is a
committed build artifact. Running `vite` without `tailwindcss --watch` means class
changes in `src/**/*.jsx` are not reflected until a full `npm run build`.

**Option A (preferred — minimal):** add a `dev` script that runs both concurrently.
Requires `concurrently` as a dev dependency.

**Option B (alternative):** import `src/input.css` via Vite instead of linking
`/output.css` in `index.html`. This makes Tailwind work through Vite's CSS pipeline.
Requires removing the `<link>` from `index.html` and adding an `import './input.css'`
to `src/main.jsx`. More invasive — changes the build pipeline.

Proceed with **Option A** (least risk, no pipeline change):

- [ ] T7.1 Add `concurrently` to dev deps:
  ```diff
  // package.json devDependencies
  + "concurrently": "^8.2.2"
  ```
- [ ] T7.2 Update the `dev` script:
  ```diff
  - "dev": "vite",
  + "dev": "concurrently \"vite\" \"tailwindcss -i ./src/input.css -o ./public/output.css --watch\"",
  ```
- [ ] T7.3 Run `npm install` and verify `npm run dev` starts both processes.
- [ ] T7.4 Add a comment in `.env.example` preamble or `README` (if it exists)
  noting that `npm run dev` now requires both processes; `npm run build` remains the
  CSS-authoritative path for production.
- [ ] T7.5 Do **not** remove `public/output.css` from the repo — it is required for
  `vite preview` and the Vercel build step (which runs CSS before Vite). The committed
  file is intentional per `docs/wiki/08-Build-Deploy/Build-Deploy.md:34`.

---

### T8 — Migrate bare localStorage keys to `opencite:` namespace (F-310 + F-504) · 2.5 h

Two separate callsites both bypass `lib/storage.js`:

**Callsite A — `GoldSetHarness.jsx`**
- Lines 16–27: `localStorage.getItem('opencite_gold_queries')` /
  `localStorage.getItem('opencite_test_runs')`
- Lines 32–38: `localStorage.setItem('opencite_gold_queries', ...)` /
  `localStorage.setItem('opencite_test_runs', ...)`
- Target namespaced keys: `storage.get('gold_queries')` / `storage.get('test_runs')`
  → stored as `opencite:gold_queries` / `opencite:test_runs`

**Callsite B — `useSettings.js`**
- `migrateLegacyKeys()` already handles the v0.34 bare keys (flat names like
  `europeanaKey`, `enabledSources` etc.) and writes them into `storage.set('settings')`.
- The function does NOT cover the harness keys — those are separate (`opencite_gold_*`).
- `useSettings.js` itself is already fully on `storage.js` after `migrateLegacyKeys()`
  runs. No additional changes needed there beyond T8.1.

- [ ] T8.1 **Verify** `useSettings.js` has no remaining bare `localStorage.getItem` /
  `localStorage.setItem` calls outside of `migrateLegacyKeys()`:
  ```
  grep -n "localStorage\." src/hooks/useSettings.js
  ```
  Confirm every bare call is inside `migrateLegacyKeys()` (which itself writes to
  `storage.set`). If any stray calls remain, fix them to use `storage.get/set`.
- [ ] T8.2 **`GoldSetHarness.jsx`** — import `storage` and add a one-time migration
  on first load. Replace the `useEffect` at lines 15–28:
  ```js
  import { storage } from "../../lib/storage.js";

  useEffect(() => {
    // One-time migration: move bare legacy keys into opencite: namespace.
    // Safe to run on every mount — reads bare key, writes namespaced key,
    // removes bare key. No-op if bare key is already absent.
    const migrateKey = (bare, nsKey) => {
      const raw = localStorage.getItem(bare);
      if (raw !== null) {
        try {
          storage.set(nsKey, JSON.parse(raw));
        } catch {
          storage.set(nsKey, raw);
        }
        localStorage.removeItem(bare);
      }
    };
    migrateKey("opencite_gold_queries", "gold_queries");
    migrateKey("opencite_test_runs", "test_runs");

    // Now read from namespaced storage.
    const saved = storage.get("gold_queries");
    if (saved) setGoldQueries(saved);
    const runs = storage.get("test_runs");
    if (runs) setTestRuns(runs);
  }, []);
  ```
- [ ] T8.3 Replace the two write `useEffect`s in `GoldSetHarness.jsx`:
  ```diff
  - useEffect(() => {
  -   localStorage.setItem("opencite_gold_queries", JSON.stringify(goldQueries));
  - }, [goldQueries]);
  + useEffect(() => {
  +   storage.set("gold_queries", goldQueries);
  + }, [goldQueries]);

  - useEffect(() => {
  -   localStorage.setItem("opencite_test_runs", JSON.stringify(testRuns));
  - }, [testRuns]);
  + useEffect(() => {
  +   storage.set("test_runs", testRuns);
  + }, [testRuns]);
  ```
- [ ] T8.4 **Regression check:** open admin console → GoldSetHarness, create a gold
  query, verify it persists on reload. Open DevTools → Application → Local Storage;
  confirm keys appear as `opencite:gold_queries` and `opencite:test_runs` (not the old
  underscore form).
- [ ] T8.5 **If** there is any existing production admin data (gold queries / test runs)
  stored under the old bare keys, the one-time migration in T8.2 will transparently
  move them. No manual data export/import needed — the migration runs on the next page
  load.

---

### T9 — Document MCP `{_text}` envelope (F-501) · 0.5 h

**Problem:** `mcp/src/client.js:65` returns `{ _text: text }` for non-JSON format
responses (mla/apa/bibtex/ris). The MCP tool description (`mcp/src/server.js`) does not
document this, so AI clients expecting a JSON object receive an unexpected shape.

- [ ] T9.1 Read `mcp/src/server.js` tool description for `cite_scholarly_sources` (or
  the equivalent tool that exposes `format` param). Locate the `description` string.
- [ ] T9.2 Add a sentence to the tool description:
  ```
  When `format` is `mla`, `apa`, `bibtex`, or `ris`, the response is plain text and
  is returned in the `_text` field (not a structured JSON object).
  ```
- [ ] T9.3 **Optional enhancement** (same T9 budget): in `mcp/src/server.js`, detect
  `body._text` after the `client.js` call and surface it as a separate MCP content
  block of type `text` rather than embedding it in the tool result object — this is the
  idiomatic MCP pattern for plain-text responses. Only do this if the server.js already
  distinguishes content block types; otherwise the doc change in T9.2 is sufficient.
- [ ] T9.4 Smoke-test with `format=bibtex`: call the MCP tool, confirm the AI client
  receives a `_text` string with valid BibTeX.

---

## 4. Acceptance criteria

- [ ] `cp .env.example .env.local` + fill in DB creds → `npx prisma generate` succeeds
  with no P1013 "environment variable not found" error.
- [ ] Fresh `prisma migrate deploy` on a clean DB creates all tables: `users`, `accounts`,
  `sessions`, `verification_tokens`, `search_history`, `library_items`, `api_keys`,
  `api_usage`, `processed_events`, `relevance_labels`. (10 tables total.)
- [ ] `relevance_labels` table is present; `GoldSetHarness` F2 harness can write and read
  labels without error.
- [ ] `api_usage.key_id` is nullable; deleting an `ApiKey` row sets `api_usage.key_id`
  to NULL on orphan rows (not DELETE).
- [ ] `billing.js` has a documented comment on `round4`; no new arithmetic on
  `total_credits` outside atomic Prisma ops.
- [ ] `package.json` pinned deps match `package-lock.json` resolved versions for
  `@auth/core` and `@auth/prisma-adapter`.
- [ ] `mcp/package-lock.json` committed; `@modelcontextprotocol/sdk` pinned to exact
  version in `mcp/package.json`.
- [ ] `npm run dev` starts both `vite` and `tailwindcss --watch` concurrently.
- [ ] `GoldSetHarness` reads/writes `opencite:gold_queries` / `opencite:test_runs`
  (confirmed in DevTools). Existing data migrated transparently on first load.
- [ ] MCP tool description documents the `{_text}` envelope for non-JSON formats.
- [ ] No regression: `npm run build` succeeds; `/api/search` returns results; admin
  console loads; gold-set harness loads existing data.

---

## 5. Risk register

| ID | Task | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | T2 | Migration SQL checksum mismatch if `20260530120000_billing` was previously modified | Low | High | Never edit existing migration files. New files only (enforced by this plan). |
| R2 | T2 | `migrate.mjs` loop change breaks the baseline step → P3005 cycles on every deploy | Low | High | Test locally on a clean DB before merging. Keep `process.exit(0)` as final line — deploy always succeeds. |
| R3 | T3 | `ALTER COLUMN DROP NOT NULL` on `api_usage.key_id` — Postgres takes an `ACCESS EXCLUSIVE` lock | Low | Med | Table is analytics-only, not in the hot query path. Lock duration is milliseconds on typical row counts. |
| R4 | T3 | FK `ON DELETE SET NULL` — existing orphan rows have `key_id` pointing to non-existent keys → FK creation fails | Med | Med | Run `DELETE FROM api_usage WHERE key_id NOT IN (SELECT id FROM api_keys)` **before** adding the FK. Add this as a preflight step in the migration SQL (wrapped in a DO block with safety checks). |
| R5 | T5 | Pinning `@auth/core` to `0.41.2` when root dep wanted `0.37.4` — there may be a transitive conflict | Low | Med | Run `npm ls @auth/core` after pin; if two versions appear, that is normal (npm v7+ hoists top-level). Confirm no import errors at build. |
| R6 | T7 | `concurrently` version conflict with existing devDeps | Low | Low | Use `^8.2.2` (current stable). If conflict, try `^7.x`. |
| R7 | T8 | Admin has stored gold queries under old bare keys; migration runs after a page reload but before any code that writes new keys | Low | Low | The migration in T8.2 runs in the initial `useEffect` — before any write effect. Order is: migrate → read → set state → write effects trigger. Correct by React lifecycle. |
| R8 | T9 | MCP tool description change breaks existing MCP client tool discovery | Very low | Low | Description is informational only — no schema change to the tool input params. |

**No data-loss risk in any task.** All DDL is additive. The only transformative step is
T3/R4 (orphan cleanup before FK creation) which removes rows the application already
cannot join to — they are functionally dead.

---

## 6. Definition of done

- [ ] All T1–T9 checklists complete with no skipped items.
- [ ] `npm run build` clean on main.
- [ ] `prisma migrate deploy` tested on a clean schema (Supabase branch or local Postgres).
- [ ] `package-lock.json` and `mcp/package-lock.json` committed; `package.json` and
  `mcp/package.json` pinned.
- [ ] No new `open` findings introduced (findings.json unchanged or amended only to flip
  F-500/F-501/F-502/F-503/F-504/F-505/F-506/F-507/F-508 to `fixed`).
- [ ] Quarantine policy respected — no code deleted without a dossier in
  `docs/wiki/99-Archive/_quarantine/` (no code deletion occurs in this sprint).
- [ ] Sprint log committed to repo root as `sprint_log_v0_40.md`.

---

## 7. Dependencies

| Dependency | Direction | Notes |
|---|---|---|
| v0.33 (F2 harness) | upstream | `relevance_labels` table (T2) enables F2's DB writes. |
| v0.35 relevance integrity | none | T1–T9 are infra-only; no pipeline code touched. |
| v0.37 MCP funnel | downstream | T5 dep-pin does not block v0.37; T9 MCP doc improves v0.37 AI client UX. |
| v0.38 dead adapters | upstream | Quarantine dossiers exist; no adapter code touched here. |

**Cross-sprint note:** T2 unblocks any future deploy to a new environment (staging,
Supabase branch, contributor fork). Until T2 ships, the gold-set harness is broken on
fresh deploys — this is a low-urgency but high-clarity fix worth doing before onboarding
any second developer.

---

---

## 8. Actuals (executed 2026-06-09)

Read the live source first — the repo had drifted from the plan's assumptions. Notable
corrections vs the plan:

- **T1 (F-508):** `.env.example` had already grown most of the "8 undocumented vars"
  (SETTINGS_ENCRYPTION_KEY, API_KEY_PEPPER, KV pair, DPLA/SMITHSONIAN/EUROPEANA, Stripe,
  OPENCITE_API_KEY, VITE_ADMIN_EMAILS, OPENCITE_MAILTO — all present). The **only** real
  bug left was the DB var-name mismatch. Fixed the Prisma block to
  `POSTGRES_PRISMA_URL`/`POSTGRES_URL_NON_POOLING` (what `schema.prisma:12-13` +
  `migrate.mjs` actually read). Verified by grepping every `process.env.*` in `api/` —
  all documented. The Phase-4 placeholder block was left in (harmless, clearly labelled).
- **T2 (F-503):** new `20260608000000_relevance_labels/migration.sql`. `migrate.mjs` now
  `readdirSync`-iterates all `^\d{14}_` migration dirs in order, in both the deploy path
  and the P3005 fallback (apply-all-then-baseline-all, still only baselines if every SQL
  applied — preserves the v0.30 OAuth-incident guard + always-exit-0).
- **T3 (F-502):** new `20260608000100_api_usage_fk/migration.sql` — nullable `key_id`,
  R4 orphan-null preflight, FK `ON DELETE SET NULL`. Schema: `key_id String?` + the
  `key`/`usage` relation. (`prisma generate` NOT run locally — operating rules; schema
  eyeballed, types compatible: `api_keys.id` and `api_usage.key_id` are both TEXT.)
- **T4 (F-505):** audit found ALL ledger writes already atomic (incl. `stripe/webhook.js`
  pack top-up). Only `round4` uses plain JS floats (never written back). Documented with
  a comment. No code change to ledger primitives.
- **T5 (F-507):** lock-resolved versions are **`@auth/core 0.37.4`** + **`@auth/prisma-adapter
  2.11.2`** — the plan's guessed `0.41.2` was wrong. Pinned to the lock values (no-op for
  `npm ci`, so no install needed). Added `.github/dependabot.yml` (@auth/* + MCP SDK).
- **T8 (F-310/F-504):** F-504 was **already done** — `useSettings.js` routes everything
  through `storage.js` (verified no stray bare access outside `migrateLegacyKeys`).
  F-310 fixed: `GoldSetHarness.jsx` now uses `storage.get/set` + a one-time mount
  migration of the legacy bare keys.
- **T9 (F-501):** chose the plan's T9.3 enhancement over T9.2. The tool description is
  `API_CONTRACT.description` (shared REST/OpenAPI SSOT) — documenting an MCP-client-only
  `_text` artifact there would violate DRY. Instead `server.js` now surfaces `body._text`
  as a native MCP text block, so the surprising envelope never reaches the client.

### Deviations requiring Shahbaz (the "no `npm install`" rule)

- **T6 (F-500) — DONE.** Pinned `@modelcontextprotocol/sdk` to exact **`1.29.0`** —
  verified against the npm registry (a web fetch, not `npm install`) as the latest 1.x,
  i.e. exactly what `^1.0.0` already resolves to; the server only imports stable core
  paths (`/server/index.js`, `/server/stdio.js`, `/types.js`) present across all 1.x.
  Dependabot watches `/mcp`. **Optional follow-up (not required to close F-500):** run
  `npm install` in `mcp/` once to commit `mcp/package-lock.json` for contributor-
  reproducible installs — the mcp package is standalone (not in the Vercel build), so
  there's no `npm ci` to break without it.
- **T7 (F-506) — done lockfile-safe, not via `concurrently`.** Adding the `concurrently`
  devDep desyncs `package-lock.json` (needs an `npm install` to re-sync). Instead added a
  zero-dependency `dev:css` script (reuses the already-present `tailwindcss` binary). Run
  `npm run dev:css` alongside `npm run dev` to live-rebuild `output.css`. `public/output.css`
  stays committed (required by `vite preview` + the Vercel build).

### Not done (per rules — needs Shahbaz)
- No `prisma generate` / `npm install` / build / test run locally (operating rules).
- **Migration not yet applied to prod.** Acceptance §4 (fresh `migrate deploy` → 10
  tables; FK SET-NULL behaviour) verifies on the next prod deploy / a Supabase branch.

*End v0.40 sprint plan. All of T1–T9 executed (T6 pinned to 1.29.0; T7 via `dev:css`).
No pipeline changes; no user-facing changes. All 10 findings (F-500–F-508 + F-310) flipped
to `fixed` in the machine layer. Only open item is the OPTIONAL `mcp/package-lock.json`.*
