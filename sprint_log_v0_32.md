# OpenCITE — Sprint Log v0.32

> **PM + architecture document for the next Claude instance(s).** Self-contained execution plan for
> **wiring the credit meter into `/api/search`** (closing the WS3 gap) **and** standing up a
> **privileged admin/agent test path** so Shahbaz's Claude agent(s) can drive and introspect the
> search pipeline directly.
> Read `architecture_report_v0_30.md` first for project context, then this.
> (v0.31 = relevance sliders; v0.33 = admin console — both independent of this sprint.)
>
> **Created:** 2026-05-31 · **Status:** PLANNED — not executed.
> **Mode:** C (plan → approval → execute → checklist). No padding; precise execution.

---

## 0. TL;DR

**The meter is built but not connected.** Every billing primitive exists and is well-tested in
isolation, but `api/search.js` never calls any of it — so today the MCP endpoint (and the REST API
it fronts) serves **unmetered, unattributed, uncapped** searches. Before registering OpenCITE as an
OpenAI/Claude extension we must (A) bolt the meter to the turnstile and (B) give *my* agent a
first-class, non-billing, fully-introspectable way in to test it.

| WS | Workstream | Effort | This sprint? |
|---|---|---|---|
| **A** | Wire `resolveApiKey` + `preAuthorize`/`settle` + rate-limit + cache into `/api/search` | ~1 day | **Yes** |
| **B** | Admin/agent direct-connection: `admin` identity, debug (origin-revealing) mode, test harness | ~1 day | **Yes** |
| **C** | Admin **console UI** for algorithm/adapter tuning | — | **No → `sprint_log_v0_33.md`** |

**Thesis:** WS-A is assembly, not invention — `apiAuth.js`, `billing.js`, `ratelimit.js`, `cache.js`,
`plans.js` are all written and dormant, each with a header that literally says *"search.js does NOT
call this yet."* The risk is entirely in the **wiring order** and **failure/refund semantics**, not
in the parts. WS-B is the multiplier: with the Supabase + Vercel connectors I can now own the data
and ops plane directly (§6), but I still cannot see *inside the pipeline* (origin, score, per-adapter
latency, dedup decisions) — that requires an admin-gated debug envelope the app must emit. WS-B
builds exactly that and nothing more.

---

## 1. The gap (evidence)

`api/search.js` auth is a single shared-secret equality check
([`api/search.js:86-93`](api/search.js)):

```js
const requiredKey = process.env.OPENCITE_API_KEY;
if (requiredKey) {
  const provided = req.headers["x-api-key"] || firstParam(req.query?.key);
  if (provided !== requiredKey) return sendJson(res, 401, ...);
}
```

It never imports `resolveApiKey`, `preAuthorize`, `settle`, `checkRateLimit`, or the cache. Confirmed
by grep across `api/**` — the only references to those symbols are their own definitions plus the
Stripe webhook. Both modules say so themselves:

- [`api/_shared/apiAuth.js:10`](api/_shared/apiAuth.js) — *"Dormant until WS3 is wired: search.js does NOT call this yet."*
- [`api/_shared/billing.js:16`](api/_shared/billing.js) — *"Dormant until WS3 is wired: search.js does NOT call these yet."*
- [`api/_shared/ratelimit.js:8`](api/_shared/ratelimit.js) — *"Dormant until WS3 is wired."*

**Consequences today:** (1) no charge — searches are free regardless of balance; (2) no per-user
identity — customer keys minted by `api/keys.js` (hashed in `api_keys`) are *rejected* by search
because it only compares against the env master key; (3) no tier-gating, no rate-limit. The money-**in**
side did ship (Stripe checkout, the webhook's `applyMonthlyGrant`, plans/packs, key issuance, the
atomic ledger). Only the spend path in search is the missing wire.

---

## 2. Architecture truth (what exists, and the middleware order)

The dormant parts compose into one ordered pipeline. Order is dictated by the modules' own headers
(notably `cache.js`: *"after rate-limit, before fan-out / charge"*):

```
1. resolveApiKey(req)            → identity { userId, keyId, plan, master|admin } | null → 401
2. allowedSourceIds(plan, safe)  → intersect requested sources with the plan's tier
3. checkRateLimit(identity,plan) → 429 + Retry-After  (KV fixed-window, fail-open)
4. readCache(cacheKey)           → HIT (non-debug): charge-on-hit using band in payload, return
5. preAuthorize(userId, cost)    → 402 if short            (atomic compare-and-decrement)
6. fan-out runSearch + score + dedup + coverage           (existing pipeline, unchanged)
7. settle(userId, cost, band, {freeBelowBand}) → refunds to coverage-prorated net charge
8. writeCache(cacheKey, payload)
9. respond { ...envelope, meta: { creditsCharged, coverage, balance? } }
   on any throw between 5–7 → refund(userId, cost)         (never bill a failed search)
```

Ledger facts (from `prisma/schema.prisma`): entitlement is `users.total_credits` `Decimal(12,4)` —
**not** a usage counter (the `api_usage` table is a per-day analytics rollup only). `preAuthorize` is
`updateMany` with a `total_credits >= amount` guard = atomic; no TOCTOU. `creditCost` is `1` for
every plan ([`plans.js`](api/_shared/plans.js)); plans differ by monthly grant + source tier, not
unit price. Coverage proration (`settle` → `coverageMultiplier`) means a half-blind answer is
partly/fully refunded; `freeBelowBand: "limited"` waives no-real-coverage queries entirely.

---

## 3. Decision — admin identity shape (resolve before coding)

**Chosen: Shape B — a dedicated admin *user* + per-purpose `api_keys` rows with `plan='admin'`.**
The master env key is demoted to documented break-glass only.

The identity object from `resolveApiKey(req)` carries three orthogonal things: **who** (`userId`/
`keyId` → attribution), **what they may do** (`plan` → tier/cost/rate cap), and **whether they may
see internals** (`admin`/`master` → gates `debug=1`). The shape decision is how the privileged
tester supplies those without breaking the others.

| Shape | Attribution | Revoke | Verdict |
|---|---|---|---|
| **A** — env master key (`userId:null`) | ❌ one shared secret, no per-agent/run trace | ❌ env change + redeploy | break-glass only |
| **B** — admin user + per-purpose api_keys (`plan='admin'`) | ✅ real userId+keyId, `last_used_at`, `api_usage` | ✅ instant `revoked=true`, per-key | **chosen** |
| **C** — per-*key* `plan` column | ✅ | ✅ | ✗ contradicts SSOT (plan derives from USER) |

**The tension this resolves:** the easy way to bypass the meter is `userId:null` (master) — but that
also discards attribution (no ledger row, no usage rollup, no per-agent revoke, no audit). Shape B
models the bypass as a property of the **plan** (`creditCost:0`, `rateLimit.max:0`, `tier:"all"`,
`admin:true`) while keeping a real user behind it, so attribution survives. **Shape C** is rejected
because `resolveApiKey` derives the effective plan from `row.user.plan`, and `plans.js` states the
rule: *"the effective plan comes from the USER … so a tier change applies to all keys."*

**Two latent bugs this surfaces (both fixed in WS-A):**
1. **`getPlan("paid")` → free.** [`apiAuth.js:34`](api/_shared/apiAuth.js) maps the master key to
   `getPlan("paid")`, but `PLANS` has no `"paid"` key, so it falls back to `free` — today's master
   key is silently metered (`creditCost:1`) and **core-tier only**. Defining the `admin` plan and
   pointing master at it fixes this.
2. **`OPENCITE_API_KEY` is overloaded** — in `search.js` it gates the *whole endpoint*; in
   `apiAuth.js` it's the *master key*. Swapping search to `resolveApiKey` must deliberately retire
   the "gate everything" meaning and keep the var as master-only, or behavior is ambiguous.

`admin: true` must be **server-derived from the resolved identity, never honored from the request** —
that is what keeps `debug=1` from ever leaking origin to an ordinary caller.

---

## 4. WS-A — wire the meter into `/api/search`

**Files touched (4):** `api/_shared/plans.js` (add `admin` plan), `api/_shared/apiAuth.js` (fix
master plan + add `admin` flag), `api/search.js` (the pipeline), `api/_shared/apiContract.js` (add
`meta` to `RESPONSE_SHAPE`). `billing.js`/`ratelimit.js`/`cache.js` are consumed as-is.

**P — pre-flight (connector, no code):**
- [ ] **P.1** Create a Supabase **branch** + a Vercel **preview** so all wiring is validated off
      production (cf. R7 / the prior migration incident).
- [ ] **P.2** Seed test fixtures on the branch via `execute_sql`: (a) a **customer** test user
      (`plan='free'`, known `total_credits`) + an `api_keys` row whose `key_hash` I compute locally
      ([`crypto.js`](api/_shared/crypto.js)); (b) an **admin** test user (`plan='admin'`) + its
      `api_keys` row. Plaintext keys stored locally only. Every write carries `WHERE internal_id=` (R6).

**A — foundation (plans + identity):**
- [ ] **A.1** `plans.js`: add
      `admin: { id:"admin", label:"Admin", tier:"all", monthlyGrant:0, creditCost:0, rateLimit:{ windowSeconds:60, max:0 }, freeBelowBand:"limited" }`.
      *Verify:* `getPlan("admin").creditCost === 0`.
- [ ] **A.2** `apiAuth.js`: master branch (`:34`) → `plan: getPlan("admin"), admin:true` (fixes the
      `"paid"`→free bug). Customer branch (`:55`) → add `admin: row.user?.plan === "admin"`.
      *Verify:* master key and admin-user key both resolve `admin:true`, `creditCost:0`, tier `all`.

**A — auth swap + tiering (`api/search.js`):**
- [ ] **A.3** Replace the env-equality block (`:86-93`) with
      `const identity = await resolveApiKey(req); if (!identity) return sendJson(res,401,{error:"Invalid or missing API key."});`
      Retire `OPENCITE_API_KEY`-as-endpoint-gate (auth is now per-identity, fail-closed). Keep
      OPTIONS/CORS (`:74-84`). *Verify:* an anonymous request gets 401 (R8).
- [ ] **A.4** Source gating (`:118-134`): intersect the selected set with
      `allowedSourceIds(identity.plan, [...SERVER_SAFE_IDS])`; keep the existing "no valid sources"
      400 + origin-blind message. *Verify:* a `free`/core key cannot reach an `all`-tier adapter.

**A — rate limit + cache read:**
- [ ] **A.5** After tiering:
      `const rl = await checkRateLimit(identity.keyId ?? clientIp(req), identity.plan);`
      on `!rl.ok` → 429 + `res.setHeader("Retry-After", rl.retryAfter)`. `max:0` (admin) returns ok.
      Add a small `clientIp(req)` helper (first hop of `x-forwarded-for`).
- [ ] **A.6** Build `cacheKey({query,sources,limit,authors,format})`; `readCache`. On hit **and not
      debug**: run the charge step (A.8) from the band stored in the payload (charge-on-hit), attach
      `meta`, return. Debug requests skip the cache.

**A — charge bracket (around the existing fan-out `:153-205`):**
- [ ] **A.7** Before fan-out:
      `const pre = await preAuthorize(identity.userId, identity.plan.creditCost); if (!pre.ok) return sendJson(res,402,{error:"Insufficient credits."});`
      (admin/master cost 0 → `ok:true`, ledger untouched).
- [ ] **A.8** After `computeCoverage` (`:205`):
      `const creditsCharged = await settle(identity.userId, identity.plan.creditCost, coverage, { freeBelowBand: identity.plan.freeBelowBand });`
      Wrap the fan-out + scoring (`:153-205`) in `try/catch`; on throw →
      `await refund(identity.userId, identity.plan.creditCost)` then 500. *Test the throw path (R1).*

**A — response surface:**
- [ ] **A.9** Add `meta: { creditsCharged, coverage, balance? }` to the JSON envelope (`:230-239`) and
      `X-OpenCITE-Credits` / `X-OpenCITE-Balance` headers on the non-JSON branch (`:212-228`).
      `balance` needs one post-settle `SELECT total_credits` (pre-auth/settle don't return the row);
      if we'd rather avoid the read, ship `creditsCharged` only and defer `balance`.
- [ ] **A.10** `apiContract.js`: add the `meta` block to `RESPONSE_SHAPE` so MCP/OpenAPI stay SSOT.
- [ ] **A.11** Cache write: `writeCache(cacheKey, payload)` after settle (non-debug), band embedded
      in the payload for charge-on-hit parity (R2).

---

## 5. WS-B — admin/agent direct-connection (the "direct line for my agent")

Goal: the privileged tester from §3 (Shape B) drives the **real** pipeline at **0 credits, no rate
cap, all-tier**, and can request **origin-revealing, fully-instrumented** output no ordinary caller
can see. This is the one capability the connectors *cannot* provide (§6) — it's live in-pipeline
state, not DB rows or logs. (The `admin` plan + flag are already built in A.1/A.2.)

**5.1 — Debug (origin-revealing) mode.** Gated **strictly** server-side on `identity.admin ||
identity.master`. A `debug=1` query param:
- **Bypasses `toPublicResult`** → returns an internal card via a NEW `api/_shared/debugResult.js`
  (separate file so `publicResult.js`'s origin-blind invariant is never weakened). **v1 fields:**
  `source`, raw `_score`, plus everything the public card has.
- **Bypasses the cache** (always fresh) and **emits `meta.debug`** telemetry the public path discards:
  `{ perAdapter:[{id, ms, candidates, errored}], dedup:{ raw, afterDoi, afterTitle }, coverage:{ rawPercent, failedCount, band } }`.

**5.2 — Telemetry capture.** Small refactor of the fan-out (`search.js:153-178`): collect per-adapter
`{id, ms, count, errored}` during the existing `Promise.all` instead of discarding it; thread the
raw/dedup counts out of the dedup step. The public path ignores it; only debug surfaces it.

> **Deferred to v0.33 F1:** the per-signal BM25F breakdown (per-field contribution, phrase/proximity/
> thin-source, gate disposition) needs `scoreResults` to return a breakdown object — out of scope
> here. v0.32 debug ships `source` + `_score` + the telemetry above; that already unblocks ranking
> and adapter triage.

**Hard invariant:** `debug=1` from a non-admin identity is treated as absent — standard origin-blind
cards, no `meta.debug`. Covered by a dedicated test (B.6).

**5.3 — Test harness.** `scripts/admin/probe.mjs` — drives `/api/search` with the admin key +
`debug=1`, pretty-prints the internal envelope (source-attributed ranking, per-adapter latency,
dedup trace). Pairs with `scripts/stress/` + `search_quality_stress_plan.md`. Debug stays a *direct
REST* capability; the MCP/public contract is untouched (`debug` is NOT added to `apiContract.PARAMS`).

**Task breakdown:**
- [ ] **B.1** *(done in A.1/A.2)* — `admin` plan + `admin` flag.
- [ ] **B.2** `api/_shared/debugResult.js` — `toDebugResult(r)` = public fields + `source` + `_score`.
- [ ] **B.3** Capture per-adapter telemetry + raw/dedup counts; assemble `meta.debug`.
- [ ] **B.4** `const debug = (identity.admin || identity.master) && isTruthy(firstParam(req.query?.debug));`
      when true: cache-bypass + `toDebugResult` + attach `meta.debug`. Non-admin `debug` → no-op.
- [ ] **B.5** `scripts/admin/probe.mjs` harness (admin key + `debug=1`, pretty-print).
- [ ] **B.6** Test: non-admin `debug=1` → origin-blind cards, no `source`, no `meta.debug` (critical).

---

## 6. Admin testing across Supabase + Vercel (connector reevaluation)

With the Supabase + Vercel connectors now granted in Claude Desktop (Supabase project **OpenC_Auth**
/ `cjnmoupvlqcqigmabanq`, verified live), my **data + ops plane is covered without app changes** —
this narrows WS-B to *only* the in-pipeline introspection above.

**What the connectors give me directly:**

| Need | Tool | How |
|---|---|---|
| Verify a search charged correctly | Supabase `execute_sql` | `SELECT total_credits FROM users WHERE internal_id=...` before/after a probe |
| Provision my admin test identity | Supabase `execute_sql` | `UPDATE users SET plan='admin'` + `INSERT INTO api_keys(key_hash,key_prefix,user_id,plan)` with a hash I compute locally |
| Simulate monthly rollover / grants | Supabase `execute_sql` | `UPDATE users SET credits_period=NULL` then hit a grant path |
| Seed insufficient-balance (402) tests | Supabase `execute_sql` | `UPDATE users SET total_credits=0` |
| Inspect schema before a change | Supabase `list_tables` (verbose) | confirm columns/FKs match `schema.prisma` |
| Apply a needed migration | Supabase `apply_migration` / `list_migrations` | for any WS-A schema delta |
| Catch RLS/PII exposure | Supabase `get_advisors` (security) | **run after any DDL** — `api_keys`/`users` hold secrets |
| Watch `/api/search` behavior live | Vercel `get_runtime_logs` | confirm 401/402/429 + errors + timing under real traffic |
| Confirm a deploy & build | Vercel `list_deployments` / `get_deployment_build_logs` | relevant given the recent migration/build incidents |
| Audit prod env config | Vercel `get_project` | is `OPENCITE_API_KEY`, the Stripe price envs, KV/Upstash set? |
| Ship the wiring | Vercel `deploy_to_vercel` | after review |

**The end-to-end admin test loop** (my agent, post-WS): seed via Supabase SQL → probe via
`scripts/admin/probe.mjs` (admin key, `debug=1`) → assert ranking/coverage from the debug envelope →
assert the ledger delta via Supabase SQL → tail Vercel runtime logs for the request → `get_advisors`
if any DDL ran. No human in the loop for a relevance or billing regression check.

**Safety rails for connector use:** all DB writes are scoped to a dedicated **test user** (never a
real customer row); destructive SQL is confirmed before running; `get_advisors` is run after every
DDL; production deploys remain human-approved (Mode C).

---

## 7. Out of scope → v0.33

The admin **console UI** (visual algorithm/adapter tuning, regression suite, gold-set labeling,
metrics dashboards) is its own sprint — see `sprint_log_v0_33.md`. WS-B here deliberately ships only
the **machine-readable debug substrate** that the v0.33 UI will render. Also deferred: per-pack PAYG
checkout polish; the BM25F field-weight sliders carried from v0.31 T2; and the per-signal score
breakdown (v0.33 F1).

---

## 8. Acceptance criteria

- [ ] A customer key minted via `/api/keys` authenticates on `/api/search`; an unknown/revoked key → 401;
      an anonymous (no-key) request → 401.
- [ ] A search **decrements `total_credits`** by the coverage-prorated net charge; `meta.creditsCharged`
      is returned and matches the ledger delta (verified via Supabase SQL).
- [ ] Insufficient balance → **402**; over rate limit → **429** + `Retry-After`.
- [ ] A search that **throws** mid-fan-out refunds the pre-auth (net charge 0) — no silent burn.
- [ ] `limited`-coverage query is charged 0 (`freeBelowBand`).
- [ ] Cache hit charges the **same** prorated amount as the original (charge-on-hit).
- [ ] Source tier enforced: a `free`/`core` key cannot reach `all`-tier adapters.
- [ ] **Admin path:** admin key runs searches at **0 credits**, no rate cap, all-tier; `debug=1`
      returns origin-revealing cards + `meta.debug` (per-adapter timing, dedup trace, coverage internals).
- [ ] **Origin-blind invariant intact:** `debug=1` from a non-admin identity returns standard
      origin-blind cards and **no** `meta.debug`.
- [ ] MCP endpoint inherits all of the above unchanged (it is a pure HTTP client of `/api/search`).

---

## 9. Risk register

| ID | Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | A.8 | Search throws *after* pre-auth, before settle → customer charged for nothing | Med | High | try/catch around fan-out → `refund`; test the throw path explicitly |
| R2 | A.6/A.11 | Charge-on-hit double-charges or mis-prorates a cached payload | Med | Med | Store the coverage band in the cached payload; settle from it, not a re-compute |
| R3 | B.2/B.4 | Debug mode leaks `source` to a normal caller → origin-blind invariant broken (product-defining) | Low | **Critical** | Strict server-derived `identity.admin` gate; non-admin `debug` is a silent no-op; dedicated test (B.6) |
| R4 | A.5 | KV down → limiter fail-open lets an abuser through | Low | Med | Accept (credits are the durable cap); revisit only if abuse observed |
| R5 | A.2 | **Master key currently resolves to `free` (`getPlan("paid")` falls back) — it is NOT privileged today.** A.2 must repoint it at `admin` or master loses tier/cost bypass after the swap | High | High | Fix in A.2 (`getPlan("admin")`); smoke-test master resolves `admin:true`, `creditCost:0`, tier `all` |
| R6 | §6 / P.2 | A destructive test SQL hits a real customer row | Low | High | All writes scoped to a dedicated test user; confirm-before-run; never `UPDATE` without a `WHERE internal_id=` guard |
| R7 | A.* | New billing path 500s every search (cf. the v0.27 confidence-gate incident) | Low | High | Stage on the Supabase branch + Vercel preview (P.1); verify via runtime logs before promoting |
| R8 | A.3 | Retiring `OPENCITE_API_KEY`-as-endpoint-gate accidentally opens the endpoint to anonymous callers | Med | High | Auth fails closed: `resolveApiKey` → null → 401; verify an anonymous request gets 401 |

---

## 10. Definition of done

- [ ] `/api/search` runs the full §2 pipeline: identity → tier → rate-limit → cache → pre-auth →
      fan-out → settle → respond, with refund-on-failure.
- [ ] `meta.creditsCharged` in the envelope; ledger deltas verified via Supabase.
- [ ] `admin` plan + identity; admin traffic is unmetered, uncapped, all-tier, attributable, revocable;
      the `getPlan("paid")` master bug is fixed (R5).
- [ ] `debug=1` (admin-only) returns origin-revealing cards + `meta.debug` pipeline telemetry;
      non-admin `debug` is a no-op (tested).
- [ ] `scripts/admin/probe.mjs` drives the debug path; documented connector test loop (§6) works
      end-to-end for both a billing check and a relevance check.
- [ ] Staged on a Supabase branch + Vercel preview, advisors clean, then promoted (human-approved).
- [ ] This log updated with actuals; console UI carried to `sprint_log_v0_33.md`.

---

## 11. Execution actuals (2026-05-31)

**WS-A + WS-B code: COMPLETE, locally verified (syntax + pure-logic invariants). Staging/deploy: PENDING human approval (Mode C).**

**Files changed (code):**
- `api/_shared/plans.js` — added `admin` plan (`creditCost:0`, `rateLimit.max:0`, `tier:"all"`, `internal:true`). [A.1]
- `api/_shared/apiAuth.js` — master key → `getPlan("admin")` + `admin:true` (fixes R5 `"paid"`→free bug); customer branch → `admin: row.user?.plan === "admin"`. Header rewritten. [A.2]
- `api/_shared/apiContract.js` — `meta` added to `RESPONSE_SHAPE` (SSOT for MCP/OpenAPI). [A.10]
- `api/_shared/billing.js` — added `getBalance(userId)` (ledger module owns ledger reads; keeps search.js Prisma-decoupled). Powers `meta.balance`.
- `api/search.js` — **full pipeline rewrite**: identity(401 fail-closed) → tier(`allowedSourceIds`) → rate-limit(429+Retry-After) → cache(charge-on-hit) → pre-auth(402) → fan-out(telemetry capture) → settle(coverage-prorated) → respond, with **refund-on-throw**. Admin `debug=1` → `toDebugResult` + `meta.debug`. Added up-front `format` validation (no billing a malformed request). [A.3–A.9, A.11, B.3, B.4]
- `api/_shared/debugResult.js` *(new)* — `toDebugResult` = `toPublicResult` + `source` + raw `_score` (composed, DRY). [B.2]
- `scripts/admin/probe.mjs` *(new)* — admin debug harness (`OPENCITE_ADMIN_KEY` + `debug=1`, pretty-print, `--assert-admin`). [B.5]
- `scripts/admin/probe-blind-check.mjs` *(new)* — **R3/B.6 guardrail**: non-admin `debug=1` MUST yield no `source` / no `meta.debug` (exit 1 on leak).
- `scripts/admin/README.md` *(new)* — §6 end-to-end test loop (seed → probe → blind-check → ledger delta). SQL corrected to mapped tables (`users`/`api_keys`, `internal_id` uuid).

**Local verification done:** all 8 files `node --check` clean; pure-logic asserts pass (`admin` plan cost 0 / max 0 / tier all; `allowedSourceIds` tiers free→core-only & admin→all; coverage proration full=1 … limited=0).

**Key findings / decisions during execution:**
- **NO schema migration required.** `users.plan` is already a free-form String (accepts `'admin'`); the admin plan is pure data/code. So **no DDL → no `get_advisors` step strictly needed** (still worth a security advisor pass post-deploy as hygiene).
- **`meta.debug.perAdapter`** is the canonical telemetry key (matches plan §5.1); reconciled the probe (agent had drifted to `adapters`).
- **Charge-on-hit reuses `preAuthorize`+`settle`** via a local `chargeForBand` helper, billing a cache hit the SAME prorated amount as the original (R2). Debug bypasses + never writes cache (so origin-revealing cards can never poison the public cache).
- `meta.balance` shipped (one PK `SELECT` via `billing.getBalance`, fail-soft → omitted on null).
- The no-`q` usage doc now sits **behind** auth (identity is step 1). Trivial to move pre-auth if public discovery is wanted — flagged for Shahbaz.

**⚠️ DEPLOY-TIME OPS (breaking change — intended):** today prod `/api/search` is **open** (no key needed); after this deploy it is **fail-closed (401 without a valid key)**. Consequences: (1) the **website UI is unaffected** — verified it runs adapters client-side and never calls `/api/search`; (2) the **MCP server / any keyless caller starts getting 401** (this is the billing-launch behavior, per `mcp/README.md`); (3) for the **admin path in prod** either set `OPENCITE_API_KEY` (master break-glass) or seed an `admin` user+key. R8 (anonymous leak) holds: auth fails closed.

## 12. Live prod verification (2026-05-31) — ALL ACCEPTANCE CRITERIA PASS

Deployed to prod (commit `c78bbe7`, then redeployed `dpl_B7FW1sDN…` to pick up the rotated pepper).
Verified directly against `https://citation.today/api/search`:

| Criterion | Result |
|---|---|
| Anonymous / invalid key → 401 | ✅ (fail-closed live; confirms new code — old gate w/o `OPENCITE_API_KEY` would've 200'd) |
| Customer key authenticates + meters | ✅ free key → 200; `meta.creditsCharged:1` (coverage "full"), `meta.balance:98.05` |
| Ledger debit matches prorated charge | ✅ exact: 100 − 0.95 ("high" search) − 1 ("full" search) = 98.05 |
| Insufficient balance → 402 | ✅ balance 0.5 → 402, **no charge** (pre-auth gate; balance unchanged) |
| Source tier enforced | ✅ free key → core only ("high"/"full"); admin → all 22 adapters |
| Admin: 0-cost, all-tier, debug | ✅ `creditsCharged:0`, 22 adapters, `debug=1` → source-revealing cards + full `meta.debug` (per-adapter ms, dedup trace, coverage internals) |
| Origin-blind invariant (non-admin debug=1) | ✅ `probe-blind-check` PASS: `meta.debug` absent, no `source` field |
| Coverage proration | ✅ observed "full"→1, "high"→0.95 live |

Not exercised live (verified by code/logic): refund-on-throw R1 (can't force a live throw); `freeBelowBand "limited"→0`; rate-limit 429 + cache (KV/UPSTASH **not configured in prod** → both fail-open no-ops, as designed — credits are the durable cap).

**Prod environment facts discovered:** `OPENCITE_API_KEY` (master) is **NOT set** in Vercel → the only admin path is a `plan='admin'` user. `API_KEY_PEPPER` **was** set; **rotated** to a fresh value (safe — 0 real keys existed) for Production via Vercel CLI (Preview left unset — unused; CLI stdin quirk). KV/Stripe envs audited.

**Left in prod:** one admin identity `admin-test@opencite.internal` (`plan='admin'`, key prefix `oc_live_GATA`) — provides the otherwise-absent admin/debug access; key handed to Shahbaz. Test customer `free-test` was seeded, used, and **deleted**. No real customer rows touched.

*End v0.32 sprint. WS-A + WS-B shipped AND verified in prod. Admin console UI (WS-C) is v0.33.*
