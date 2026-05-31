# Admin debug test loop

End-to-end procedure for verifying the v0.32 admin/debug path and the
origin-blind regression guardrail on a Supabase preview branch.

---

## 1. Seed test users and keys

Create one **admin** user and one **non-admin** (free) user on the branch.
The `users.plan` column is a free-form string; `'admin'` is a valid value.

> **Schema note:** the Postgres tables are Prisma-`@@map`'d to **`users`** and
> **`api_keys`** (not `"User"`/`"ApiKey"`), and the user PK column is
> **`internal_id`** — a native **uuid** with a default. So let the ids default
> (omit them) and thread the generated uuid via `RETURNING`. The `api_keys.plan`
> column is vestigial for entitlement (the effective plan derives from
> `users.plan`); set it for clarity only.

First generate a plaintext key for each user locally (run once; the plaintext is
never stored — `API_KEY_PEPPER` must match the branch Vercel env). Capture the
`hash` for the SQL below:

```sh
API_KEY_PEPPER=<branch-pepper> node --input-type=module -e \
  "import { generateApiKey } from './api/_shared/crypto.js'; console.log(generateApiKey());"
# → { key: 'oc_live_…', hash: '…sha256…', prefix: 'oc_live_…' }
```

(Or hash an existing plaintext key: replace the body with
`import { hashApiKey } from './api/_shared/crypto.js'; console.log(hashApiKey('oc_live_…'));`)

Seed each user + key atomically (uuid PK defaults; FK threaded via `RETURNING`):

```sql
-- On the Supabase branch (SQL editor). Admin user + key:
WITH u AS (
  INSERT INTO users (email, plan, total_credits, credits_period)
  VALUES ('admin@test.local', 'admin', 0, NULL)
  RETURNING internal_id
)
INSERT INTO api_keys (user_id, key_hash, key_prefix, plan, revoked)
SELECT internal_id, '<admin-sha256-hash>', 'oc_live_xxxx', 'admin', false FROM u;

-- Non-admin (free) user + key (100 credits so we can watch the ledger debit):
WITH u AS (
  INSERT INTO users (email, plan, total_credits, credits_period)
  VALUES ('free@test.local', 'free', 100, NULL)
  RETURNING internal_id
)
INSERT INTO api_keys (user_id, key_hash, key_prefix, plan, revoked)
SELECT internal_id, '<free-sha256-hash>', 'oc_live_yyyy', 'free', false FROM u;
```

---

## 2. Run the admin debug probe

Inspect ranking, per-adapter latency, and the dedup trace:

```sh
OPENCITE_ADMIN_KEY=oc_live_<plaintext_admin_key> \
  BASE=https://<preview-url>/api/search \
  node scripts/admin/probe.mjs "climate change" 10
```

Expected output sections:

| Section | What to check |
|---|---|
| Top envelope | HTTP 200, coverage band, count, tookMs |
| `meta.creditsCharged` | Should be `0` — admin traffic is unmetered |
| `meta.debug.perAdapter` | Per-adapter table: id, ms, candidates, errored |
| `meta.debug.dedup` | raw → afterDoi → afterTitle attrition |
| `meta.debug.coverage` | rawPercent, failedCount, band |
| Result rows | `source` column shows real adapter IDs (e.g. `OPENALEX`) |

Add `--assert-admin` to fail the script (exit 1) if the admin envelope did
not materialize — useful as a CI smoke check:

```sh
OPENCITE_ADMIN_KEY=... BASE=... \
  node scripts/admin/probe.mjs "climate change" 10 --assert-admin
```

---

## 3. Run the origin-blind regression check

Proves a non-admin identity **cannot** pierce origin-blindness via `debug=1`.
This **must** print `PASS` before any v0.32 deployment.

```sh
OPENCITE_TEST_KEY=oc_live_<plaintext_free_key> \
  BASE=https://<preview-url>/api/search \
  node scripts/admin/probe-blind-check.mjs "climate change"
```

Expected: `PASS — origin-blind invariant held for non-admin identity with debug=1.`

If it prints `FAIL`, the error message describes exactly what leaked:

- `LEAK(a)` — `meta.debug` was returned to a non-admin caller.
- `LEAK(b)` — one or more result cards carry a `source` field for a non-admin caller.

---

## 4. Assert the ledger delta (non-admin user spends credits; admin spends 0)

Check credit balance before and after the non-admin probe run:

```sql
-- Before (record this) and again After running the probes:
SELECT internal_id, email, plan, total_credits
FROM users
WHERE email IN ('admin@test.local', 'free@test.local');
```

Expected delta:

| User | Delta |
|---|---|
| admin (`admin@test.local`) | `0` — `creditCost=0` in the admin plan; ledger untouched |
| free (`free@test.local`) | `-1 × coverageMultiplier(band)` per query (e.g. −1 for full, −0.5 for partial) |

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `BASE` | both probes | Override the endpoint (default `https://citation.today/api/search`) |
| `OPENCITE_ADMIN_KEY` | `probe.mjs` | Plaintext admin API key — REQUIRED |
| `OPENCITE_TEST_KEY` | `probe-blind-check.mjs` | Plaintext non-admin key — REQUIRED |
| `API_KEY_PEPPER` | key generation / hashing | Must match the value set in the branch Vercel env |

---

## Admin plan properties

Admin traffic is **unmetered, uncapped, and all-tier** by plan definition
(`api/_shared/plans.js`, plan id `'admin'`):

- `creditCost: 0` — no credit is pre-authorized or settled.
- `rateLimit.max: 0` — burst cap is a no-op (0 is treated as disabled in ratelimit.js).
- `tier: 'all'` — all adapters are eligible regardless of source set.
- `identity.admin === true` is set **server-side** when the resolved plan id is
  `'admin'` (or when the `OPENCITE_API_KEY` master key is presented). It is never
  accepted from a request parameter or client header.
