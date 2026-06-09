---
machine_ids: [api.shared.billing, api.shared.plans, api.shared.ratelimit, api.shared.cache, api.shared.kv, api.checkout, api.stripe.webhook, lib.checkout]
findings: [F-403, F-415, F-416, F-417]
runtime: server
status: healthy
tags: [billing, credits, stripe, plans, ratelimit, cache, webhook]
---

# Billing & Credits

> Prepaid credit ledger (Postgres), two-phase coverage-prorated charges, Stripe for subscription and PAYG top-ups, and a KV-backed rate limiter as a secondary burst cap.

## What it is

OpenCITE's billing model is a **prepaid credit ledger** on `User.total_credits` (Decimal(12,4)). Credits are entitlements, not a usage counter. Every `/api/search` call either charges credits (from `creditCost × coverageMultiplier`) or passes free (admin/cost-0 plan, or a waived sub-threshold result).

The model has two acquisition rails:
- **Subscription (humans):** monthly allowance replenished by Stripe invoice.paid events.
- **PAYG (machines/agents):** one-time credit packs purchased via Stripe Checkout.

Both rails write to the same `User.total_credits` column; `api/search.js` bills identically regardless of how credits arrived.

## Plans (`api/_shared/plans.js`)

| Plan | Tier | Monthly grant | Rate limit (req/min) | `freeBelowBand` |
|---|---|---|---|---|
| `free` | core | 20 | 30 | `limited` |
| `student` | all | 500 | 60 | `limited` |
| `pro` | all | 1000 | 120 | `limited` |
| `machine` | all | 0 (PAYG) | 300 | `limited` |
| `admin` | all | 0 (unmetered) | 0 (uncapped) | `limited` |

**Tier:** `core` = `[OPENALEX, CROSSREF, DOAJ, CURATED]`. `all` = the full server-safe adapter set.

**`creditCost`:** Always 1 per query for all plans. Plans differ by allowance size and source breadth, not unit price.

**`freeBelowBand: "limited"`:** A query whose coverage band is `limited` (< 50% corpus-weight covered) is charged 0. A half-blind answer is not a sellable result. `billing.settle()` checks this via `isAtOrBelow(band, freeBelowBand)`.

**Admin plan:** `creditCost: 0`, `rateLimit.max: 0` → `preAuthorize` and `checkRateLimit` both short-circuit. Admin is the only plan never offered for purchase — provisioned by setting `User.plan = 'admin'` out-of-band.

**Student tier note:** `requiresStudentVerification: true` — `api/checkout.js` checks `User.is_student_verified` before creating a student subscription session.

## Credit packs (`api/_shared/plans.js:94–98`)

| Pack | Credits | USD | Stripe Price env |
|---|---|---|---|
| `pack_10k` | 10,000 | $10 | `STRIPE_PRICE_PACK_10K` |
| `pack_60k` | 60,000 | $50 | `STRIPE_PRICE_PACK_60K` |
| `pack_300k` | 300,000 | $200 | `STRIPE_PRICE_PACK_300K` |

## Credit lifecycle

### Full search (live fan-out)

```
1. resolveApiKey / resolveSessionAdmin       → identity (plan, userId)
2. checkRateLimit(keyId, plan)               → 429 if burst exceeded
3. readCache(ck)                             → if hit: chargeForBand(identity, cached.coverage) → return cached
4. preAuthorize(userId, plan.creditCost)     → 402 if insufficient; decrements balance atomically
5. runSearch fan-out + score + dedup + gate  → if ANY throw: refund(userId, creditCost) → 500
6. computeCoverage(adapters, failed)         → coverageBand
7. settle(userId, creditCost, coverageBand)  → refunds the diff; net charge = creditCost × coverageMultiplier(band)
8. writeCache(ck, publicBody)                → best-effort
```

### Cache hit

```
chargeForBand(identity, cached.coverage):
  preAuthorize(userId, creditCost)    → 402 if short
  settle(userId, creditCost, band)    → prorated charge using the stored band
```

### Admin / cost-0 path

`preAuthorize` returns `{ok:true}` without DB touch when `userId` is null or `amount ≤ 0`. `settle` similarly no-ops. No ledger writes occur.

### Failure path

Any throw inside the try/catch at `api/search.js:253–383` triggers `refund(userId, creditCost)` before returning 500. This ensures a failed search never consumes credits.

## Coverage-prorated billing (`api/_shared/coverage.js`, `api/_shared/billing.js`)

Coverage multipliers:

| Band | Multiplier | Corpus ratio threshold |
|---|---|---|
| `full` | 1.0 | 0 failures |
| `near-full` | 0.99 | ≥ 99% |
| `high` | 0.95 | ≥ 95% |
| `partial` | 0.5 | ≥ 50% |
| `limited` | 0.0 | < 50% |

`computeCoverage` weights each adapter by `capability.corpusSize` (order-of-magnitude). Core scholarly sources dominate the denominator. A niche heritage source failing is a genuinely small coverage loss.

Net charge = `round4(creditCost × multiplier)`. The multiplier uses the band's floor coverage — never overstates coverage, so the customer is never overcharged on a borderline ratio.

## Monthly allowance (`billing.applyMonthlyGrant`)

Idempotent per calendar month via `User.credits_period` (format `"YYYY-MM"`). Only tops the balance UP TO the grant amount — a larger purchased balance is not reduced. If `credits_period` already matches the current month, the function returns `{granted: false}` without any DB write.

The Stripe webhook calls this inside a transaction with `{client: tx}` so the grant and the `processedEvent` claim commit atomically.

## Rate limiting (`api/_shared/ratelimit.js`)

Fixed-window KV counter. Key: `oc:rl:<identity>:<epoch>` where `epoch = floor(now/window)`. `incrWithTtl` sets the TTL only on the first increment (count === 1) to auto-expire the window.

**Fail-open (F-403):** `incrWithTtl` returns null on KV unavailability → `checkRateLimit` returns `{ok:true}`. This is intentional: a paid search must never fail because the rate limiter is down. The credit ledger is the durable quota; the rate limiter is only a burst cap.

**Admin plan bypass:** `plan.rateLimit.max === 0` → `checkRateLimit` returns `{ok:true}` immediately (no KV access).

## Stripe Checkout (`api/checkout.js`, `src/lib/checkout.js`)

**Server route:** `POST /api/checkout { plan? | pack? }` — requires a human session.

1. Resolves the item (plan or pack) from `PLANS` / `CREDIT_PACKS` — server-authoritative; the client cannot pass an arbitrary Price ID.
2. For student subscriptions: checks `User.is_student_verified` in DB before proceeding.
3. Reuses or creates a Stripe Customer by `User.stripe_customer_id`.
4. Creates a Stripe Checkout Session with `client_reference_id: user.id` (primary webhook attribution) and `metadata: { plan|pack }` (carried to subscription events).
5. Returns `{ url }` — the browser redirects to Stripe-hosted Checkout.

**Client wrapper (`src/lib/checkout.js`):** Thin `POST /api/checkout` wrapper; returns `{ url }` or `{ error, code }`. Never constructs Stripe objects on the client side.

**SSRF note:** `baseUrl(req)` for success/cancel redirects is derived from the request `origin` header, validated against `TRUSTED_ORIGINS` or `*.vercel.app`. A crafted origin that passes this check could redirect the post-checkout browser to an attacker-controlled domain — but the `*.vercel.app` pattern here is broad (any Vercel preview URL is accepted). See F-415.

## Stripe Webhook (`api/stripe/webhook.js`)

**Route:** `POST /api/stripe/webhook`. Raw body is required for signature verification; `export const config = { api: { bodyParser: false } }` disables Vercel body parsing.

**Signature verification:** `stripe.webhooks.constructEvent(raw, sig, webhookSecret)` at `webhook.js:95` — rejects any request without a valid `stripe-signature`. No bypass path.

**Idempotency:** Each event is claimed in `processedEvent` (unique PK = `event.id`) within the same transaction as the billing side effect. A `P2002` (unique constraint violation) means the event was already processed — the handler acknowledges with `{received:true, duplicate:true}` without re-applying. A non-unique-constraint error rolls back the claim, making a Stripe retry safe to re-apply.

**Events handled:**

| Event | Action |
|---|---|
| `checkout.session.completed` | Grant pack credits; set subscription plan; persist stripe_customer_id |
| `invoice.paid` / `invoice.payment_succeeded` | `applyMonthlyGrant` for the billing period |
| `customer.subscription.updated` | Re-sync `User.plan` from the live Price id; downgrade to free if inactive |
| `customer.subscription.deleted` | Downgrade to free |
| `invoice.payment_failed` | No credit change (Stripe handles dunning) |

**Double-grant protection:** `invoice.paid` and `invoice.payment_succeeded` may both fire for one renewal. `applyMonthlyGrant` checks `credits_period` — only one wins; the other is a no-op.

**`resolveUserId`:** Prefers `client_reference_id` (set on checkout.session), falls back to `stripe_customer_id` lookup. If neither resolves, the event is claimed (no duplicate) but no credit/plan update occurs — logging only (`webhook.js:104`).

**F-416:** If `client_reference_id` is absent AND the Stripe customer is not in the DB (e.g., manual Stripe customer creation), the event is silently acknowledged with no user update. This is low risk in practice since `client_reference_id` is always set by the checkout route.

**F-417:** The `pack` and `plan` are derived from `obj.metadata` (set by the checkout route). If Stripe metadata were tampered with (hypothetically), the webhook would grant the attacker-specified pack/plan. In practice, Stripe metadata is only writable by the Stripe secret key — so this is only a risk if `STRIPE_SECRET_KEY` is compromised.

## KV (`api/_shared/kv.js`)

Upstash/Vercel Redis REST client. Two consumers:
- `cache.js` — result cache (`oc:cache:v1:<hash>`, 6h TTL)
- `ratelimit.js` — rate limit counters (`oc:rl:<id>:<epoch>`, 1-window TTL)

Both are fail-open: KV unavailability never blocks a search.

## 🩺 Health audit

- **Verdict:** healthy — two-phase billing, idempotent webhook, and atomic pre-auth/settle are correctly implemented.
- **Findings:**
  - [F-403] Rate limiter fail-open on KV outage — burst protection disabled when KV is down.
  - [F-415] `baseUrl(req)` in `api/checkout.js:28` accepts any `*.vercel.app` origin for post-checkout redirects — broad pattern; a Vercel preview URL from any team could be used as a redirect target.
  - [F-416] Webhook silently no-ops if `client_reference_id` is absent and `stripe_customer_id` has no DB match (`webhook.js:104`).
  - [F-417] Webhook trusts `obj.metadata.pack` / `obj.metadata.plan` for pack/plan attribution — safe only if `STRIPE_SECRET_KEY` is uncompromised.
- **Smells:**
  - `monthlyGrantFor` in `plans.js:110` returns `FREE_STUDENT_MONTHLY_GRANT` (20) for a verified-but-free user — the same as the unverified free allowance. The comment says "equal to free" intentionally but it could surprise if the constant is ever changed.
  - No credit balance is cached on the server — every post-search balance read hits Prisma. Low volume currently; worth caching for high-concurrency.

## See also

[[04-Backend-API/Search-Endpoint]] · [[04-Backend-API/Shared-Modules]] · [[07-Data-Layer/Data-Layer]] · [[09-Audit/Security]]
