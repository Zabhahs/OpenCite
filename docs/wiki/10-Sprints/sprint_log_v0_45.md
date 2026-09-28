# Sprint v0.45 — Money-Path Hardening

**Date authored:** 2026-06-09 (v0.44 T4 deliverable) · **Status:** PLANNED — AWAITING SHAHBAZ APPROVAL · **Execute only after the open decisions below are confirmed.**

## Rationale (one paragraph)

The credit ledger is a single mutable number. `User.total_credits` is the only billing record in the system (`prisma/schema.prisma:32`); `ApiUsage` is an explicit non-truth analytics rollup (`prisma/schema.prisma:160-170`) and `ProcessedEvent` only dedupes Stripe deliveries (`prisma/schema.prisma:174-180`). That means: no spend can be itemized for a dispute, a leak can't be investigated, and Stripe payouts can't be reconciled against grants. Around that missing journal sit five live defects verified against current source: (1) a platform kill between `preAuthorize` and `settle` eats a credit invisibly — refund only fires on a JS `catch` (`api/_shared/meter.js:57-60`, `api/search.js:373-375`); (2) the Stripe webhook treats **any** P2002 as "duplicate event" and ACKs 200 (`api/stripe/webhook.js:202-206`) even though the same transaction writes the unique `stripe_customer_id` / `stripe_subscription_id` columns (`webhook.js:126`, `webhook.js:147`; uniques at `schema.prisma:27,39`) — a collision there permanently swallows a paid grant because Stripe never retries a 200; (3) `applyMonthlyGrant` does a read-then-absolute-SET (`api/_shared/billing.js:103-111`) that loses a concurrent pack purchase; (4) `/api/search` prorates by coverage band while `/api/citations` and `/api/ids` bill full price for `{count:0}` during a total upstream outage — `citationGraph.js` swallows every failure (`api/_shared/citationGraph.js:63-67,95,132-135,215-217`), `idResolve.js` returns empty batches on failure (`src/lib/idResolve.js:122-124`), and `meter.charge` settles at band `"full"` unconditionally (`api/_shared/meter.js:50`); (5) assorted smaller leaks: unthrottled 401 path, vestigial `ApiKey.plan`, a 2-write cache-hit charge, and undisclosed non-stacking allowances. This sprint gives the money path an append-only evidence journal and closes every verified hole on top of it.

## Prior art — do NOT re-plan (fixed in v0.44, in flight)

- `handlers/credits.js` `Infinity` → `{ credits: null, unlimited: true }` serialization (v0.44 T3).
- `handlers/settings.js` body now routed through `parseBody` 64 KB cap (v0.44 T3, closes F-405).
- `auth.js` `getSession` HTTP loopback replaced with in-process session resolution (v0.44 T3).
- F-505 (v0.40) already audited `total_credits` arithmetic: all ledger writes are Postgres-side Decimal increments/decrements (`billing.js:125-131` comment) — T1 must preserve that property.

## Findings corrected against live code (vs. the audit brief)

- **Cache-hit double-write is at `api/search.js:139-147`** (`chargeForBand`), not ~123-131 as audited — the v0.44 pass-through rewrite shifted lines. Defect itself confirmed: `preAuthorize` (decrement) + `settle` (increment of the diff) = 2 ledger writes per cache hit where the band is already known.
- **The outage-billing finding also covers `/api/ids`**, not just `/api/citations`: `resolveIds`' `convertChunk` returns `[]` on any fetch failure or NCBI 429 (`src/lib/idResolve.js:98-124`), so a total NCBI outage produces `{count:0}` billed at band `"full"` through the same `meter.charge` default. T5 scope widened accordingly.
- **`resolveSeed` cannot distinguish "DOI unknown to OpenAlex" (404 — a legitimate, billable answer) from an OpenAlex outage** — both paths return `null` via the same catch (`citationGraph.js:63-67`). The fix must branch on the thrown status (`oaFetch` throws `` `OpenAlex ${status}` ``, `citationGraph.js:46-50`).
- All other audited claims verified true as stated (webhook lines 202-206 ✓, `applyMonthlyGrant` ✓, rate-limit ordering ✓ — `checkRateLimit` is imported ONLY by `search.js` and `meter.js`, and in both it runs after auth: `search.js:167` vs `search.js:255`, `meter.js:32` vs `meter.js:37`; no session route is throttled at all).

## Decisions to confirm with Shahbaz (genuinely open product choices)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D-1 | **Outage billing philosophy for `/api/citations` + `/api/ids`** | (a) all-upstream-legs-failed → band `limited` → multiplier 0 → **free** (mirrors search's `freeBelowBand: "limited"`, `plans.js:37`, `coverage.js:63-69`); (b) full refund via explicit error + 502; (c) keep billing full (status quo) | **(a)** — one billing philosophy across all metered surfaces: "we never sell a blind answer." Partial degradation (some hydrate chunks failed but results returned) → band `high` (0.95). A resolved-but-zero-edges answer and a genuine OpenAlex 404 stay band `full` (a "not found" is a sold answer, same as a no-match search). |
| D-2 | **Journal retention** | (a) keep forever; (b) prune after 12 months; (c) prune after 90 days | **(b)** 12 months — comfortably covers the Stripe dispute window (~120 days) and a tax year; prune via the same sweep endpoint as T2. No personal data beyond `user_id` FK. |
| D-3 | **Journal rows on user deletion** | (a) `onDelete: Cascade` (consistent with every other relation, GDPR-clean); (b) `SetNull` to preserve aggregate evidence | **(a)** Cascade — Stripe's own records remain the financial system of record for deleted users. |
| D-4 | **`ApiKey.plan` column** | (a) drop the column (entitlement already comes from `User.plan`, `apiAuth.js:67-84`); (b) wire it as a per-key plan override | **(a)** drop — per-key plans were superseded by user-level plans by design ("a tier change applies to all keys", `apiAuth.js:62-63`); a dead-but-displayed column is a future mis-wire waiting to happen. |
| D-5 | **Reconciliation trigger** | (a) Vercel cron (Hobby: max 2 cron jobs, **daily** granularity only) hitting the sweep endpoint with a `CRON_SECRET`; (b) admin-triggered only; (c) both | **(c)** both — cron for steady-state, admin trigger for incident response. Daily cadence is acceptable: the worst case is one orphaned credit per killed request, refunded within 24 h. |
| D-6 | **Surface `meta.requestId` in API responses?** | yes / no | **yes** — gives support tickets a correlation id that joins directly to the journal. Cheap, origin-blind. |

## Tasks

### T1 — `credit_events` append-only spend journal
**Owner files:** `prisma/schema.prisma`, new `prisma/migrations/<ts>_credit_events/migration.sql`, `api/_shared/billing.js`, `api/_shared/meter.js`, `api/search.js`, `api/stripe/webhook.js`

**Design.** New table — journal is **evidence, not balance**; `User.total_credits` stays the single authoritative balance, and no read path ever computes balance from events.

```prisma
// Append-only money journal. Every ledger mutation writes one row in the SAME
// transaction as the balance write. Balance authority stays on User.total_credits.
model CreditEvent {
  id         String   @id @default(uuid())
  user_id    String
  kind       String   // preauth | settle | refund | reconcile | charge | grant | purchase | adjust
  amount     Decimal  @db.Decimal(12, 4) // SIGNED delta applied to total_credits (preauth < 0)
  band       String?  // coverage band, on settle/charge only
  request_id String?  // correlation id pairing preauth ↔ settle/refund/reconcile
  source     String?  // endpoint ("search"|"citations"|"ids") or Stripe event id
  created_at DateTime @default(now())
  user       User     @relation(fields: [user_id], references: [id], onDelete: Cascade) // D-3
  @@index([user_id, created_at])
  @@index([request_id])
  @@index([kind, created_at]) // T2 orphan sweep
  @@map("credit_events")
}
```

Migration is purely additive (`CREATE TABLE` + indexes) — zero risk to live rows. Mirror the idempotent style of `prisma/migrations/20260608000100_api_usage_fk/migration.sql`.

Wiring (the journal write and the balance write must commit or roll back **together**):
- `preAuthorize` (`billing.js:27-36`): the guarded `updateMany` moves inside `prisma.$transaction(async (tx) => …)`; when `count === 1`, `tx.creditEvent.create({ kind:"preauth", amount: -amount, request_id, source })`. Interactive transactions over the pgBouncer pool are already proven by the webhook (`webhook.js:121`).
- `settle` (`billing.js:52-60`): **always** writes a `settle` event (amount = refund diff, possibly `0`, band recorded) so every preauth pair is closed even at full band — T2's sweep depends on this. The diff refund + event share one transaction.
- `refund` (`billing.js:40-46`): writes a `refund` event in the same transaction; gains a `kind` opt so T2 can write `reconcile` through the same primitive.
- `grantCredits` (`billing.js:82-89`): + `purchase` event. Callers inside the webhook tx pass `{ client: tx }` (add the same client-threading `applyMonthlyGrant` already has) so pack grants journal atomically with the `processed_events` claim; `source` = Stripe event id.
- `applyMonthlyGrant`: + `grant` event with the **actual** delta applied (see T4's CTE).
- All three signatures grow an `opts = { requestId, source, client }` tail — additive, no caller breaks. `search.js` and `meter.js` mint `requestId = crypto.randomUUID()` per request and thread it through preAuthorize/settle/refund (and into `meta.requestId` per D-6).
- Admin / cost-0 paths short-circuit before any write (`billing.js:28`) → no journal rows, by design.

**Acceptance.** A billed search produces exactly 2 rows (`preauth` + `settle`) sharing one `request_id`; a thrown search produces `preauth` + `refund`; a webhook pack purchase produces 1 `purchase` row with the Stripe event id; for any user with no pre-journal history, `SUM(amount)` since first event equals `total_credits` change over the same span. Migration applies cleanly via `node scripts/migrate.mjs` against a Supabase branch before prod.

**Effort:** ~3 h.

### T2 — Orphaned pre-auth reconciliation (hard-kill leak)
**Owner files:** `api/user/[resource].js`, new `api/_shared/handlers/reconcile.js`, `vercel.json` (cron + rewrite), `api/_shared/billing.js` (reuse only)

**Design.** Refund-on-throw covers JS exceptions only; a platform kill (function timeout, OOM, deploy) between `preAuthorize` (`search.js:286`, `meter.js:52`) and `settle` leaves a closed-nowhere `preauth` row — which T1 makes *visible* for the first time. Sweep:

1. Find `preauth` events older than **30 minutes** with no `settle`/`refund`/`reconcile` row sharing their `request_id` (the `[kind, created_at]` + `[request_id]` indexes make this one indexed anti-join). 30 min ≫ any Vercel function lifetime, so a "slow settle still coming" double-refund race is structurally impossible.
2. For each orphan, inside one transaction: insert the `reconcile` event (amount = `-preauth.amount`, same `request_id`) **then** increment the balance. The unique pairing query + insert-first ordering makes re-runs idempotent — a second sweep sees the pair closed.

**Routing under the Hobby function cap:** the repo already has ~15 function files under `api/` (cap is 12; v0.44 T5's quarantine of `bdh/bl/mexicana` gets it back under) — **no new `/api` file is allowed.** Follow the established dispatcher pattern (`api/user/[resource].js:20-31`): add `reconcile` to its `HANDLERS` map as a sixth handler in `api/_shared/handlers/`. Auth: `resolveSessionAdmin(req)` (admin browser trigger) **or** `Authorization: Bearer ${process.env.CRON_SECRET}` (Vercel cron sends this automatically when `CRON_SECRET` is set). `vercel.json` gains `{"crons":[{"path":"/api/user/reconcile","schedule":"0 6 * * *"}]}` + the `/api/reconcile` rewrite alias (D-5; Hobby = daily granularity, fine per D-5). D-2 retention pruning rides this same handler.

**Acceptance.** Manually insert a synthetic orphaned `preauth` row >30 min old → one sweep run refunds it, writes exactly one `reconcile` row, and a second run is a no-op. Non-admin/non-cron callers get 401. Function count unchanged.

**Effort:** ~2 h.

### T3 — Webhook P2002 catch scoping
**Owner files:** `api/stripe/webhook.js`

**Design.** Today (`webhook.js:202-206`) any `P2002` → `200 {duplicate:true}`. But the transaction also updates `stripe_customer_id` (`webhook.js:126`) and `stripe_subscription_id` (`webhook.js:147`) — both `@unique` (`schema.prisma:27,39`). A collision there (e.g. a Stripe customer re-attached to a second user row) rolls back the grant, ACKs 200, and Stripe never retries: a paid grant is permanently swallowed. Scope the catch to the `processed_events` claim only:

```js
const isDuplicateClaim = (err) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" &&
  (Array.isArray(err.meta?.target)
    ? err.meta.target.includes("event_id")
    : String(err.meta?.target ?? "").includes("processed_events"));
```
`isDuplicateClaim` → 200 duplicate; **any other P2002 falls through to the existing `log.err` + 500** (`webhook.js:207-209`) so Stripe retries and the collision surfaces in logs with the constraint name (add `target: err.meta?.target` to the log payload).

**Acceptance.** Unit-style reasoning check in review (no local test runs per operating rules): a simulated P2002 with `target: ["stripe_customer_id"]` returns 500; with `target: ["event_id"]` returns 200. Live verification post-deploy: replay a processed event id from the Stripe dashboard → 200 `duplicate:true`.

**Effort:** ~0.5 h.

### T4 — `applyMonthlyGrant` lost-update race
**Owner files:** `api/_shared/billing.js`

**Design.** `billing.js:103-111` reads `total_credits`, then absolutely SETs it — a pack purchase or settle-refund committing between read and write is silently erased (the `$transaction` wrapper doesn't row-lock the `findUnique`). Replace read-then-write with **one atomic statement** — no read. The brief's two-`updateMany` shape works but leaves a stamp-without-topup window if killed between statements; a single raw statement closes it completely and also yields the old balance T1's `grant` event needs:

```js
// One round trip: claim the period AND top the balance up to the allowance,
// returning the pre-update balance so the journal can record the real delta.
// (Table/column names per @@map: users.internal_id / total_credits / credits_period.)
const rows = await client.$queryRaw`
  UPDATE "users" SET
    total_credits  = GREATEST(total_credits, ${grant}::decimal),
    credits_period = ${period}
  WHERE internal_id = ${userId}
    AND credits_period IS DISTINCT FROM ${period}
  RETURNING (SELECT u2.total_credits FROM "users" u2 WHERE u2.internal_id = ${userId}) AS old_balance`;
```
(If the inline-subquery RETURNING proves awkward, the documented alternative is a `WITH old AS (SELECT …) UPDATE … RETURNING` CTE — same single-statement atomicity.) `rows.length === 0` → `{ granted: false }` (period already claimed). Journal delta = `max(grant − old_balance, 0)`. The `{ client: tx }` threading is preserved — the webhook remains the only caller (`webhook.js:167`) and its claim + grant still commit atomically. Postgres evaluates `GREATEST` under the row lock, so a concurrent pack increment lands either before (balance may exceed grant → no top-up) or after (stacks on top) — never lost.

**Acceptance.** Code review confirms no `findUnique` remains in `applyMonthlyGrant`; the period-idempotency contract (`granted:false` on re-run within a month) is unchanged; webhook renewal path still passes its tx client through.

**Effort:** ~1 h.

### T5 — One billing philosophy for upstream outages (citations + ids)
**Owner files:** `api/_shared/citationGraph.js`, `api/_shared/meter.js`, `api/citations.js`, `api/ids.js`, `src/lib/idResolve.js` (return-shape only)

**Design (per D-1).** `citationGraph` must surface leg health instead of swallowing it:
- `getReferences` / `getCitations` return `{ results, legs }` where `legs = { attempted: n, failed: n }` counts upstream calls (seed resolve, hydrate chunks, cited-by pages, OC fallback). Internally: `resolveSeed` distinguishes a thrown `OpenAlex 404` (→ legitimate "unknown work", **not** a failure) from network/5xx/circuit-open (→ failed leg) by branching on the error message its own `oaFetch` throws (`citationGraph.js:46-50`); `hydrate`'s `allSettled` loop (`citationGraph.js:88-97`) and `getCitations`' catch (`citationGraph.js:215-217`) increment `failed` instead of silently returning.
- `resolveIds` similarly returns per-batch health (it already isolates batches in `convertChunk`, `idResolve.js:98-124`) — additive `{ map, batches: { attempted, failed } }` or an opts-out param; the browser callers ignore it.
- `meter.charge` (`meter.js:50`) gains a `bandOf(result)` option replacing the static `band` default: callers map leg health → band. Mapping (D-1): all legs failed → `"limited"` (→ multiplier 0 via `coverage.js:63-69` + `freeBelowBand:"limited"` ⇒ **free**); some failed but results returned → `"high"` (0.95); none failed (including 404-not-found and zero-edge answers) → `"full"`. Endpoint response `coverage` field surfaces the band, matching `/api/search`'s contract.

**Acceptance.** With OpenAlex + OpenCitations unreachable (verified against live prod by querying during a breaker-open window, or by a temporary bogus base URL on a preview-less smoke per the sanctioned pure-fetch exception): `/api/citations` returns `coverage:"limited"`, `meta.creditsCharged: 0`. A valid DOI with zero citing works still charges full. `/api/ids` follows the same matrix.

**Effort:** ~2 h.

### T6 — Cache-hit charge: one conditional write
**Owner files:** `api/search.js`

**Design.** `chargeForBand` (`search.js:139-147`) runs preAuthorize(full) + settle(refund diff) — 2 ledger writes (plus, post-T1, 2 journal rows) for a request whose band is already known from the cached payload (`search.js:272-282`). Replace with a single conditional debit of the **final** amount: compute `finalCharge = round4(cost × multiplier)` (reusing `coverageMultiplier` + the `freeBelowBand` waive — export a small `finalChargeFor(plan, band)` helper from `billing.js` so the proration math stays SSOT), then one `preAuthorize(userId, finalCharge, { kind:"charge", band, requestId })`-style guarded decrement journaling a single self-closing `charge` event. `finalCharge === 0` → no ledger write at all. Insufficient balance → same 402 as today.

**Acceptance.** A cache hit at band `near-full` produces exactly one journal row (`charge`, band recorded) and one balance write; net amount equals the old two-step path to 4 dp; a `limited`-band cache hit writes nothing and returns `creditsCharged: 0`.

**Effort:** ~0.5 h.

### T7 — Rate-limit ordering + unthrottled session routes
**Owner files:** `api/search.js`, `api/_shared/meter.js`, `api/_shared/ratelimit.js`, `api/user/[resource].js`, `api/checkout.js`

**Design.** Two verified gaps:
1. **401 path unthrottled.** Auth precedes the limiter in both metered paths (`search.js:167` → `search.js:255`; `meter.js:32` → `meter.js:37`), so every invalid-key guess costs an unthrottled sha256 + `api_keys` lookup (`apiAuth.js:64-68`) — credential-stuffing hits the DB at full speed. Add a cheap **pre-auth IP window** before `resolveApiKey`: `checkRateLimit(\`ip:${clientIp(req)}\`, { rateLimit: { windowSeconds: 60, max: 120 } })` (constant exported from `ratelimit.js`, e.g. `PREAUTH_IP_LIMIT`, generous enough to never touch legitimate shared-NAT traffic). The existing per-key post-auth limit stays as the plan-tier cap. Keep fail-open semantics (F-403 fallback already handles KV outage, `ratelimit.js:20-28`).
2. **Session routes have no limiter at all** (`checkRateLimit` is imported nowhere outside `search.js`/`meter.js`). Add the same IP window once in the `api/user/[resource].js` dispatcher (covers all five resources in one place) and in `api/checkout.js` (it does Stripe + Prisma work pre-auth-check). Skip the Stripe webhook (signature-gated) and `api/auth/handler.js` (Auth.js owns its own surface — touching it risks the OAuth incident class; explicitly out of scope).

**Acceptance.** Hammering `/api/search` with a bogus key returns 429 after the IP window trips (verify with a short curl loop against prod post-deploy); a valid-key caller under plan limits is unaffected; `/api/credits` returns 429 under the same loop.

**Effort:** ~1.5 h.

### T8 — Drop vestigial `ApiKey.plan` (per D-4)
**Owner files:** `prisma/schema.prisma`, new migration, `api/_shared/handlers/keys.js`

**Design.** `ApiKey.plan` is written at key creation (`handlers/keys.js:63`) and echoed in the keys list (`handlers/keys.js:24`) but **never read for entitlement** — `resolveApiKey` takes the plan from the user row (`apiAuth.js:67`, `apiAuth.js:79-84`). Two-step to stay safe on a live table: (1) this sprint, stop writing/selecting it in `keys.js` and have the list response derive the displayed plan from the user's plan (what the key actually gets); (2) `ALTER TABLE "api_keys" DROP COLUMN "plan"` in the migration **after** code referencing it is deployed (single deploy is fine on Vercel since Prisma client + SQL ship together, but order the migration to run post-build via the existing `scripts/migrate.mjs` flow).

**Acceptance.** `grep -rn "\.plan" api/_shared/handlers/keys.js` → no ApiKey-column references; key list UI shows the user-derived plan; migration applies cleanly on a Supabase branch.

**Effort:** ~1 h.

### T9 — Disclose non-stacking monthly allowance
**Owner files:** `src/constants/pricing.js`, `docs/wiki/05-Billing/Billing-Credits.md` (one line, per wiki rules)

**Design.** `applyMonthlyGrant` tops **up to** the allowance — it never stacks (`billing.js:91-93`), but the Plans panel copy ("500 searches every month", `pricing.js:44`; "1,000 searches every month", `pricing.js:61`) reads as additive. Add one sentence to the existing footnote (`pricing.js:81-82` `COVERAGE_NOTE`, or a sibling `ALLOWANCE_NOTE` rendered next to it): *"Monthly allowances refill your balance up to the plan amount — unused searches don't roll over. Purchased credit packs never expire and are unaffected."* (Second clause is true: pack grants are pure increments, `webhook.js:139`, and the grant floor never reduces a larger balance, `billing.js:110`.)

**Acceptance.** Plans panel renders the disclosure on web; copy reviewed by Shahbaz before commit (pricing copy = product voice).

**Effort:** ~0.5 h.

## Risks

| Risk | Mitigation |
|---|---|
| **Migration on a live ledger.** T1 is additive (new table) — near-zero risk. T8's column drop is destructive. | Ship T8's code change and migration in the same deploy but verify on a Supabase branch first (`apply_migration` on a branch, then merge); the column is read by nothing at runtime once `keys.js` is patched. T4/T6 change no schema. |
| **Webhook replay during the deploy window.** Stripe retries 500s; if T3 deploys mid-retry-storm, previously-misclassified events may replay against the new code. | That is the *desired* behavior — the rolled-back claim makes replays safe (`webhook.js:118-120` invariant unchanged). Watch `log.err("stripe", …)` for new `target:` payloads in the first 24 h. |
| **Journal latency/cost on the hot path.** T1 turns 1-statement ledger writes into 2-statement interactive transactions. | Both statements are single-row, index-targeted; the webhook already runs interactive transactions over the same pgBouncer pool. If p95 regresses, the journal insert can move to a Prisma batch `$transaction([update, create])` for the unconditional paths (refund/grant). |
| **Reconciliation double-refund race** (sweep refunds while a slow settle is in flight). | 30-min orphan threshold ≫ max Vercel function lifetime — a request that hasn't settled in 30 min is dead by construction. Insert-`reconcile`-first ordering makes the sweep itself idempotent. |
| **Hobby platform caps.** 12-function limit; cron is daily-only. | No new `/api` files anywhere in this sprint (T2 rides the `[resource].js` dispatcher); daily cron accepted per D-5 (worst case: a leaked credit is refunded within 24 h, and the journal makes it visible immediately). |
| **Pre-auth IP limiter false positives** (shared NAT, e.g. a university lab). | Generous window (120/min/IP), fail-open on KV outage, and it only gates the *pre-auth* path — a valid key inside the window is untouched. |

## Estimated effort

| Task | Effort |
|---|---|
| T1 journal | ~3 h |
| T2 reconciliation | ~2 h |
| T3 webhook P2002 | ~0.5 h |
| T4 grant race | ~1 h |
| T5 outage philosophy | ~2 h |
| T6 cache-hit single write | ~0.5 h |
| T7 rate-limit ordering | ~1.5 h |
| T8 ApiKey.plan drop | ~1 h |
| T9 allowance copy | ~0.5 h |
| **Total** | **~12 h** |

Suggested execution order: T3 → T4 (independent, highest dollar-risk per hour) → T1 → T2 → T6 (journal-dependent) → T5 → T7 → T8 → T9.

## Acceptance (sprint-level)

- Every `total_credits` mutation in `api/` writes a `credit_events` row in the same transaction (grep: no bare `total_credits` increment/decrement outside `billing.js`).
- A synthetic hard-kill orphan is auto-refunded by the sweep within one cron cycle.
- Stripe replay of a processed event → 200; a forced unique-collision on `stripe_customer_id` → 500 + retry.
- `/api/citations` and `/api/ids` during a total upstream outage charge 0 and report `coverage:"limited"`; `/api/search` behavior unchanged.
- No new files under `api/` except `api/_shared/**` (function count unchanged); `node scripts/wiki/build-machine-map.mjs --check` passes after the findings ledger is updated.
- Working tree only — **no commit, no deploy** until Shahbaz says so; deploy verification against live prod per operating rules.

## Actuals (§filled at close)

_(to be completed at sprint close)_
