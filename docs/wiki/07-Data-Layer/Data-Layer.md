---
machine_ids: [prisma.schema, api.shared.prisma, scripts.migrate]
findings: [F-502, F-503, F-504, F-505]
runtime: server
status: healthy
tags: [database, prisma, supabase, postgres, localStorage, billing, auth]
---

# Data Layer

> PostgreSQL (Supabase) via Prisma for all server-authoritative data; `localStorage` for ephemeral client preferences and admin tooling state. No KV persistence yet (rate-limit KV is fail-open).

## What it is

OpenCITE has three distinct persistence tiers:

| Tier | Technology | Who owns it | What lives here |
|---|---|---|---|
| **Postgres** (Supabase) | Prisma Client | Server | Auth sessions, user records, billing state, API keys, library items, search history, gold-set labels |
| **localStorage** | `src/lib/storage.js` | Client | User preferences (theme, settings, enabled sources), admin harness state (gold queries, test runs), one-time tooltip flags |
| **KV / Redis** | Upstash (planned/wired) | Server | Rate-limit counters, response cache | 

The Postgres layer is the **billing source of truth**. All credit debit/credit operations and Stripe event idempotency rely on Postgres atomics, not KV.

## Prisma schema (`prisma/schema.prisma`)

Provider: `postgresql`. Connection: pgBouncer pooler (`POSTGRES_PRISMA_URL`, port 6543) for runtime queries; direct (`POSTGRES_URL_NON_POOLING`, port 5432) for migrations only.

`postinstall` in `package.json` runs `prisma generate` so the client is always regenerated after `npm install`.

### Model inventory

#### `User` (table: `users`)

The core user record. PK is `internal_id` (uuid, not `id`) — critical for FK references in raw SQL (see billing migration).

| Column | Type | Notes |
|---|---|---|
| `id` / `internal_id` | String UUID | PK; Auth.js adapter maps this as `id` but the column is `internal_id` |
| `email` | String? unique | Google OAuth email |
| `stripe_customer_id` | String? unique | Phase 3 hook |
| `agent_wallet_address` | String? unique | Phase 4 hook (SIWE/Base L2) — not yet used |
| `total_credits` | Decimal(12,4) | Billing ledger; seeded at 10 on signup |
| `plan` | String default "free" | Billing tier: `free\|student\|pro\|machine\|admin` |
| `is_student_verified` | Boolean | Gate for $5 student plan |
| `credits_period` | String? | YYYY-MM of last monthly grant (top-up idempotency) |
| `stripe_subscription_id` | String? unique | Active Stripe subscription |
| `demographics` | Json? | Analytics/preferences blob |
| `settings` | Json? | AES-256-GCM encrypted blob — user API keys + custom journals |

Relations: `accounts[]`, `sessions[]`, `search_history[]`, `library_items[]`, `api_keys[]`.

#### `Account` / `Session` / `VerificationToken`

Auth.js required shape — field names are **fixed** by `@auth/prisma-adapter`. Do not rename. `userId` FK references `users.id` (which maps to `internal_id`). `onDelete: Cascade` on both.

#### `search_history` (table: `search_history`)

One row per unique `(user_id, query)` pair. `ts` is BigInt (epoch ms). Unique constraint `user_id_query`. No index beyond the unique constraint — hot query is user-scoped lookup which the unique index covers.

#### `library_items` (table: `library_items`)

Saved result cards. `result` is `Json` (the full public result card blob). `library_key` is the opaque `oc_` id. Unique `(user_id, library_key)`. `saved_at` BigInt.

#### `ApiKey` (table: `api_keys`)

| Column | Notes |
|---|---|
| `key_hash` | SHA-256(pepper + plaintext); plaintext **never stored** |
| `key_prefix` | First ~12 chars for display |
| `user_id` | FK → `users.internal_id` |
| `plan` | Vestigial for entitlement; effective plan derives from `users.plan` |
| `revoked` | Soft-delete |
| `last_used_at` | Updated on successful auth |

Index: `[user_id]`. The hash lookup path is a unique index on `key_hash` — O(1) auth.

#### `ApiUsage` (table: `api_usage`)

Per-day rollup for analytics. One row per `(key_id, day)` where `day` is `YYYY-MM-DD` UTC. **Not the billing source of truth** — that's `users.total_credits`. No FK from `key_id` to `api_keys.id` in the Prisma schema — a dangling `key_id` would silently accumulate (see F-502).

#### `ProcessedEvent` (table: `processed_events`)

Stripe webhook idempotency. PK is `event_id` (Stripe's own event id). A unique insert (fail on conflict) is the concurrency-safe guard: double-delivery of a webhook never double-grants credits. R11 guardrail.

#### `relevance_labels` (table: `relevance_labels`)

Gold-set relevance grades for the admin console F2 harness (v0.33). Fields: `query`, `doi` (or title fingerprint), `grade` 0–3. Index: `(query, grade)`. No FK to any user model — labels are global, not per-user. The F2 harness loads them by query string.

### Indexes summary

| Table | Index | Type | Purpose |
|---|---|---|---|
| `users` | `email` | unique | Auth lookup |
| `users` | `stripe_customer_id` | unique | Stripe webhook lookup |
| `users` | `stripe_subscription_id` | unique | Subscription query |
| `api_keys` | `key_hash` | unique | O(1) auth |
| `api_keys` | `user_id` | index | User→keys listing |
| `api_usage` | `(key_id, day)` | unique | Idempotent rollup |
| `api_usage` | `key_id` | index | Per-key history |
| `search_history` | `(user_id, query)` | unique | User history |
| `library_items` | `(user_id, library_key)` | unique | Saved item lookup |
| `relevance_labels` | `(query, grade)` | index | Gold-set load |

**Missing indexes:** `search_history` lacks an index on `user_id` alone — pagination/listing queries that don't know the exact query string will scan. `library_items` similarly. Both unique indexes cover the exact-match case but not range/sort queries.

## Billing migration (`prisma/migrations/20260530120000_billing/migration.sql`)

The single migration file. All statements use `IF NOT EXISTS` guards — the SQL is **idempotent**. Applying it twice is a no-op.

What it adds:
- Billing columns on `users`: `stripe_customer_id`, `plan`, `is_student_verified`, `student_verified_at`, `credits_period`, `stripe_subscription_id` + unique indexes.
- `api_keys` table with FK to `users(internal_id)` typed as `UUID` (matches the live Supabase column type, not Prisma's `TEXT` mapping).
- `api_usage` table.
- `processed_events` table.

**Note:** the migration does **not** add `relevance_labels` — that table was added via `prisma db push` or a separate step in v0.33. If re-provisioning from scratch, `relevance_labels` must be created separately (see F-503).

## migrate.mjs — P3005-safe runner (`scripts/migrate.mjs`)

The prod DB was originally synced with `prisma db push` (no `_prisma_migrations` history). `prisma migrate deploy` refuses this state (P3005). `migrate.mjs` handles the transition:

1. **Happy path** (`migrate deploy` succeeds): clean no-op after first deploy. Exit 0.
2. **P3005 fallback**: applies the migration SQL directly via `prisma db execute` (using `POSTGRES_URL_NON_POOLING` for DDL-safe direct connection), then baselines with `prisma migrate resolve --applied`.
3. **Baseline guard**: if the SQL apply itself fails, it does NOT baseline — preventing the permanent "history says done, schema is incomplete" trap that would silently break auth queries on the next deploy.
4. **Always exits 0** — a migration hiccup must not block the deploy and take down Google OAuth. This is the hard rule from the prod OAuth incident.

**Migration safety assessment:** non-destructive. The SQL is additive (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). No `DROP`, `ALTER COLUMN TYPE`, `TRUNCATE`, or `DELETE` anywhere. The only data-loss scenario would be a misconfigured `POSTGRES_URL_NON_POOLING` pointing at the wrong DB, which is an ops misconfiguration, not a code defect. The baseline-guard in step 3 prevents the worst silent-failure mode.

## Client-side persistence (`localStorage`)

All client `localStorage` access goes through `src/lib/storage.js` (namespaced) or direct `localStorage` calls (for legacy keys). Namespace prefix: `"opencite:"` (from `STORAGE_NS` constant in `src/constants/defaults.js`).

### localStorage key inventory

| Key (raw) | Namespace | Set by | Purpose |
|---|---|---|---|
| `opencite:*` | `storage.js` wrapper | `src/lib/storage.js` | Generic namespaced storage for structured values |
| `themeKey` | (bare) | `src/hooks/useTheme.js:39` | UI theme selection (e.g. "oled") |
| `opencite_auth_prompted` | (bare) | `src/App.jsx:120` | One-time auth modal flag |
| `europeanaKey` | (bare) | `src/hooks/useSettings.js:29` | Legacy user-provided Europeana key (superseded by backend env in v0.34) |
| `openAlexKey` | (bare) | `src/hooks/useSettings.js:30` | Legacy user OpenAlex key |
| `openAlexEmail` | (bare) | `src/hooks/useSettings.js:31` | Legacy mailto |
| `crossrefEmail` | (bare) | `src/hooks/useSettings.js:32` | Crossref polite-pool email |
| `s2Key` | (bare) | `src/hooks/useSettings.js:33` | Semantic Scholar key |
| `enabledSources` | (bare) | `src/hooks/useSettings.js:44` | User-selected source set |
| `curatedJournals` | (bare) | `src/hooks/useSettings.js:50` | User custom journal list |
| `viewMode` | (bare) | `src/hooks/useSettings.js:54` | "unified" or "source" |
| `opencite_gold_queries` | (bare) | `admin/GoldSetHarness.jsx:32` | Admin: gold query list (JSON) |
| `opencite_test_runs` | (bare) | `admin/GoldSetHarness.jsx:37` | Admin: regression test run history |
| `<tooltip_flag_key>` | (bare) | `src/hooks/useEagleTooltip.js:30` | One-time eagle tooltip flag |
| `<TOOLTIP_KEY>` | (bare) | `src/components/Layout.jsx:39` | One-time layout tooltip flag |

**Observation:** most legacy settings keys (`europeanaKey`, `openAlexKey`, etc.) are bare (no namespace prefix). The `storage.js` wrapper is newer. A future migration of all keys to the `opencite:` namespace would prevent collisions with other apps on the same origin but is not yet done (F-504).

**Admin harness data** (`opencite_gold_queries`, `opencite_test_runs`) is entirely client-side — it is **not synced to Postgres**. Gold queries survive browser sessions but not device switches. For multi-device admin use, these need to be migrated to `relevance_labels` DB (currently only grades go to DB, not the query set itself).

## Where each kind of data lives

| Data | Lives in | Notes |
|---|---|---|
| User identity / OAuth tokens | Postgres (`accounts`, `sessions`) | Auth.js controlled |
| Credit balance | Postgres (`users.total_credits`) | Server-authoritative |
| Billing plan | Postgres (`users.plan`) | Server-authoritative |
| API keys (hashed) | Postgres (`api_keys`) | Plaintext never stored |
| Stripe idempotency | Postgres (`processed_events`) | Unique-insert guard |
| Search history | Postgres (`search_history`) | Per-user, deduped by query |
| Saved library | Postgres (`library_items`) | Full result card blob |
| Gold-set grades | Postgres (`relevance_labels`) | Admin console F2 |
| Gold queries / test runs | localStorage | Admin only, device-local |
| UI preferences | localStorage | Theme, view mode, settings |
| Rate-limit counters | KV (Upstash) | Fail-open; not yet in `.env.example` |
| Response cache | KV (Upstash) | Fail-open; not yet in `.env.example` |

## 🩺 Health audit

- **Verdict:** healthy for its scope; two schema gaps worth noting.
- **Findings:**
  - [F-502] `ApiUsage.key_id` has no FK constraint to `api_keys.id` — orphaned usage rows accumulate silently if a key is deleted (Cascade on `api_keys` only applies to the Prisma relation layer, but `api_usage` has no declared `@@relation`).
  - [F-503] `relevance_labels` table is defined in `prisma/schema.prisma` but not in the single migration file (`20260530120000_billing/migration.sql`). Re-provisioning from scratch with `migrate deploy` will fail to create it.
  - [F-504] Most `useSettings.js` localStorage keys use bare names (no `opencite:` namespace prefix), leaving them collision-prone if the app is ever served on a shared origin.
  - [F-505] `users.total_credits` is `Decimal(12,4)` in Prisma but treated as a float in some JS arithmetic. Prisma returns Decimals as strings in some contexts — callers must coerce carefully to avoid silent precision loss.
- **Reuse:** The encrypted `settings` blob (`users.settings`) stores user-managed API keys; the backend `serverInjectedKeys()` system (v0.34) moved CC0 keys server-side, reducing the client-side key surface. These two patterns are now divergent (one encrypted DB blob, one env var injection) — see [[09-Audit/Duplication-and-Reuse#r-501]].

## See also

[[04-Backend-API/Search-Endpoint]] · [[05-Billing/Billing-Credits]] · [[08-Build-Deploy/Build-Deploy]]
