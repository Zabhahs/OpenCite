> **SUPERSEDED 2026-10-17** by a from-scratch redesign around the verifiable-evidence model — see `docs/wiki/10-Sprints/sprint_log_v0_48.md`. Kept for history only; do not execute.

# Sprint v0.48 — Machine Revenue Path (MCP money-awareness · remote MCP + OAuth · usage ledger · leak closure · metered API subscription)

**Date authored:** 2026-10-16 · **Revised:** 2026-10-16 (added WS-D, a Brave-style metered API subscription at half Brave's price, with no free tier for machine users) · **Baseline:** `main` @ `ca2e108` (== prod) · **Status:** PLANNED — AWAITING SHAHBAZ APPROVAL · **Execute only after the decisions in §3 are confirmed.**

> **Shahbaz directive (2026-10-16), the basis for WS-D:**
> - Machine users pay **half of Brave's price**.
> - The free tier for machine users is **removed entirely**.
> - Copy Brave's subscription model: postpaid metered billing, a card required to start, a monthly invoice in arrears, one public per-call price, and enterprise by contact.
>
> This supersedes the auto-recharge option discussed in the same session.

## 1. Rationale

The paid API works for a human developer: sign in with Google, mint a key, paste it into the stdio MCP, top up by hand in Stripe Checkout. It does **not** work for the buyers the MCP is meant to serve.

**Autonomous agents** have three problems:
- They cannot get credentials without a browser (`api/_shared/handlers/keys.js:234-235`).
- On a 402 they get no purchase link. The MCP client throws away `code` and `upgrade_url` (`mcp/src/client.js:68-71`, `99-101`).
- They cannot read their balance. `/api/credits` is session-only (`handlers/credits.js:167-168`).

**Institutions** cannot reconcile spend. There is no per-call record: `api_usage` is never written, there is no request id and no export. Credits live in one mutable number, `users.total_credits` (`prisma/schema.prisma:32`).

**The MCP is stdio-only** (`mcp/src/server.js:87-95`). The Claude and ChatGPT connector directories only list remote servers with OAuth. That is how comparable products (Exa, Tavily, scite, Consensus) reach agent users.

On top of that sit four pricing leaks in the webhook and plans SSOT.

Prepaid packs ask a new machine buyer to pay $10 or more before the first call, which puts them off. Brave's model is: card on file, pay only for what you used, one per-call price. That is the low-friction default for agent and API buyers.

This sprint:
- makes both MCP transports money-aware (WS-A);
- ships a remote MCP endpoint with OAuth 2.1 that mints our existing API keys (WS-B);
- lands the spend journal that v0.45 designed but never executed, plus a usage export (WS-C);
- closes the leaks (WS-L);
- adds a **metered "API" subscription at $2.50 per 1,000 calls, billed monthly in arrears, with the free API tier removed** (WS-D).

Market context and comparables are in this session's analysis. The headline: prepaid credits are the right rail, and MCP use is billed from the same balance as the API.

## 2. Prior art — do NOT re-plan

| Item | Status at `ca2e108` | Use in this sprint |
|---|---|---|
| v0.45 T3 webhook P2002 scoping | **Done** (`isDuplicateClaim`, `api/stripe/webhook.js:57`, `275`) | — |
| v0.45 T4 `applyMonthlyGrant` race | **Done** (single `GREATEST` statement, `api/_shared/billing.js:193-208`) | L3 changes this statement again |
| v0.45 T7 pre-auth IP window | **Half done.** Metered paths are covered (`meter.js:40-46`; `search.js:186-190`). Session routes and checkout are not. | Remainder becomes WS-L **L7** |
| v0.45 T1 `credit_events` journal | **Not done** | Executed as **C1**, using the v0.45 design verbatim plus the deltas noted there |
| v0.45 T2 orphan reconcile sweep | **Not done** | Executed as **C2** |
| v0.45 D-6 `meta.requestId` | **Not done** | Folded into C1 |
| v0.45 T5 / T6 / T8 / T9 | Not done | **Out of scope** (T9 is superseded by L3); they stay in v0.45 |
| v0.37 per-IP keyless trial | Never built; the audit cut it | Stays cut (see D-4) |

## 3. Decisions to confirm with Shahbaz

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D-1** | **What a pack buyer gets on the web** (L1) | (a) Packs are API credits only. The `machine` plan keeps all sources and the 300/min API rate limit but gets the same 10/day web cap as free; unlimited web is a perk of a **flat-fee** subscription (Student/Pro). (b) Status quo: one $10 pack gives unlimited web forever. (c) Unlimited web only while the balance is above 0. | **(a).** This gives subscriptions a distinct paid feature (the v0.46 rule: subs need a paid-only web feature) and removes the $10-once-vs-$10/month arbitrage. (c) does not fix it: web searches never spend credits, so the balance never drains. **The WS-D `api` plan must also be excluded:** it costs $0 a month at zero usage, so it would otherwise become a free route to unlimited web (see D1). |
| **D-2** | **Subscription allowance vs pack credits** (L3) | (a) Two buckets. `allowance_credits` resets to the plan grant each month and never rolls over. `total_credits` holds purchased credits, which never expire. Spending takes from the allowance first. (b) Disclose only (v0.45 T9 copy): a subscriber holding more pack credits than the allowance keeps getting **0** new credits for $10/month. (c) Add the allowance to the balance each month (it rolls over, which gives credits away). | **(a).** (b) charges a customer for nothing, which invites disputes. (c) changes the economics. |
| **D-3** | **Price inversion:** packs cost $5/1k (one-time), Pro costs $10/1k (monthly) | (a) Keep: packs are the API volume product, subscriptions are the human product with unlimited web. (b) Raise the Pro/Student allowances. (c) Reprice packs. | **(a).** Once D-1(a) ships, the two products buy different things, so the inversion is coherent. Revisit with real sales data. **No task unless (b) or (c) is chosen.** |
| **D-4** | **Remote MCP without a credential** | (a) OAuth or a key is required for every method; 401 starts the client's OAuth flow. (b) Keyless `initialize` and `tools/list`, auth only on `tools/call`. (c) A keyless free trickle per IP (the Exa/scite pattern). | **(a).** Clients start OAuth on the first 401. (b) risks a client that never authenticates. (c) needs abuse controls we don't have (the rate limiter is in-process only, see L8), and it contradicts the no-free-tier directive. **There is no machine trial (D8).** The OAuth consent page offers "Subscribe — $2.50 per 1,000 calls" to any user without API entitlement (B5). |
| **D-10** | **Pack pricing once metered costs $2.50/1k** (packs are $5.00 / $4.17 / $3.33 per 1k today, so strictly worse) | (a) Reprice packs to the metered rate: $10 → 4,000 · $50 → 20,000 · $150 → 60,000. Code-only: credits per **existing** Stripe Price, as in v0.46. (b) Stop selling packs; existing balances stay spendable. (c) Keep as-is. | **(a).** Packs stay as the prepaid option for buyers who cannot run postpaid card billing, such as grant-funded labs or a budget cap set by finance. They carry no discount below the metered rate, so metered stays the headline. |
| **D-11** | **Existing free-plan balances** when the free tier is removed | (a) Zero them once. Every `plan='free'` balance is free-granted credit, because buying a pack moves a user to `machine` (`webhook.js:182`). (b) Let them run down; just stop new grants. | **(a).** It is the clean reading of "remove entirely". Affects at most about 13 users and 20 credits each. Requires Shahbaz's approval for the SQL. |
| **D-12** | **Per-endpoint units** (Brave charges $5/1k for Search but $5/**10k** for its lighter endpoints) | (a) `search` and `citations` = 1 unit ($2.50/1k). `ids` = 0.1 unit ($0.25/1k), mirroring Brave's 1/10 light-endpoint tier at half price. (b) Everything at 1 unit. | **(a).** `/api/ids` costs us almost nothing (NCBI is free). `/api/citations` makes several OpenAlex calls per request, so it stays at the full unit. |
| **D-13** | **Managed Payments on the metered subscription** | (a) Run it under Managed Payments, **if probe P1 (§4a) succeeds**. The docs are silent (S1). (b) Run it without Managed Payments: OpenCITE becomes merchant of record for these invoices and needs Stripe Tax registrations. | **(a) if P1 passes, otherwise (b).** Run P1 before D3 is built. |
| **D-14** | **Spend controls** (Brave publishes no spending cap) | (a) A user-set monthly cap (default **$25**, adjustable up to $1,000 self-serve; enterprise above that) **plus** a Stripe `billing_thresholds.amount_gte` early invoice at **$50**. (b) No cap, Brave-style. | **(a).** Postpaid means we carry the non-payment risk, and a cap also reassures buyers. Stripe reinstated `billing_thresholds` as of `2025-03-31.basil`. Whether it works under Managed Payments is unverified. |
| **D-15** | **Throughput** (Brave Search: 50 requests/s) | (a) Keep the 300/min (5 req/s) per-key cap and publish "5 requests/second; contact us for more". (b) Raise it. | **(a).** Every machine user shares **our single OpenAlex key**, so total capacity is bounded upstream. Revisit once KV (L8) and real traffic exist. |
| **D-5** | **OAuth client registration** | (a) Open Dynamic Client Registration (RFC 7591). Redirect URIs must be `https:` or `http://localhost` / `127.0.0.1`. The consent screen shows the client name and redirect host. (b) Allowlist only Claude, ChatGPT and localhost redirects. | **(a).** The directories and Claude Code all use DCR, and an allowlist breaks every new client. Phishing risk is handled by consent-screen clarity plus revocation. |
| **D-6** | **OAuth access-token lifetime** | (a) The token **is** a regular `oc_live_` API key: no expiry, revocable from the Developers panel, one active key per (user, client). (b) Short-lived tokens plus refresh tokens. | **(a).** One credential type and one auth path (`resolveApiKey`). Billing is identical, and revocation UI already exists. (b) adds a token store and refresh logic for no billing benefit. |
| **D-7** | **Function budget** (Hobby cap is 12 Node functions; 8 used today) | Add `api/mcp.js` (#9) and `api/oauth/[step].js` (#10). The fallback if slots get tight is to fold OAuth into `api/user/[resource].js`. | Add both (10/12). Keeping OAuth separate keeps the session-authed user-data dispatcher single-purpose. |
| **D-8** | **Who sees usage for an API key** | (a) A key sees its own account's usage, broken down per key. (b) A key sees only its own rows. | **(a).** There is one owner per account today, and a lab admin wants the per-key breakdown. Revisit when org accounts exist. |
| **D-9** | **v0.45 journal decisions** (D-2 retention, D-3 cascade, D-5 trigger) | Adopt the v0.45 recommendations: 12-month retention, cascade on user delete, cron plus admin trigger | Adopt. |

## 4. Preflight facts (verified 2026-10-16)

- **Vercel prod env** (`vercel env ls production`):
  - `STRIPE_PRICE_PRO` is now correctly named; the memory's `SRIPE_PRICE_PRO` typo is resolved.
  - **No `KV_REST_API_URL` / `KV_REST_API_TOKEN`**, so every rate limit is per-instance only (`ratelimit.js:20-28`).
  - **No `CRON_SECRET`**, which C2 needs.
  - `STRIPE_MANAGED_PAYMENTS` is set.
- **Function count:** 8 Node (`auth/handler`, `checkout`, `citations`, `ids`, `search`, `search/[source]`, `stripe/webhook`, `user/[resource]`) plus Edge (`proxy`, `search/gallica`, `search/openedition`).
- **Root `package.json` has no `@modelcontextprotocol/sdk`.** Local `npm install` is forbidden, so a lockfile change can't be made safely. The remote MCP is therefore **hand-rolled stateless JSON-RPC with no new dependency** (B6). `mcp/src/schema.js`, `contract.js` and `client.js` import nothing from the SDK, so `api/` can import them.
- `mcp/src/apiContract.js` is a **generated copy** of `api/_shared/apiContract.js` (`mcp/scripts/sync-contract.mjs`). Never edit it by hand. A7 adds a drift check.
- `public/legal/privacy.html` exists; the Anthropic directory requires a privacy policy URL.
- Pushing `main` auto-deploys prod. Per CLAUDE.md there are no previews and no local builds; verify against live.

**Brave Search API, the model WS-D clones** (researched 2026-10-16; the live plans page renders client-side, so the figures come from snippets of Brave's pricing page and two trade reports):

| Item | Brave | OpenCITE (WS-D) |
|---|---|---|
| Search unit price | $5.00 / 1,000 requests | **$2.50 / 1,000 calls** (`search`, `citations`) |
| Light endpoints | Spellcheck and Autosuggest $5.00 / 10,000 | **$0.25 / 1,000** (`ids`, D-12) |
| Free allowance | $5/month credit, reportedly conditional on attribution; the old 2,000/month free tier was retired in Feb 2026 | **None** (directive; D8) |
| Billing | Postpaid; usage billed at the end of each period to a card on file | Same: a Stripe subscription with a metered price, invoiced monthly in arrears |
| Card | Required at signup | Required (Checkout subscription mode) |
| Capacity | 50 requests/s | 5 requests/s per key (D-15) |
| Spend cap | None published | User-set monthly cap plus an early-invoice threshold (D-14) |
| Enterprise | Contact sales | Contact (existing contact page) |

Sources: Brave's pricing documentation (https://api-dashboard.search.brave.com/documentation/pricing) and Implicator, "Brave drops free Search API tier" (https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/). **Re-check the live Brave dashboard before publishing copy that names Brave.**

**Unit economics at $2.50/1k:**
- A search costs OpenAlex $1.00/1k (`$0.001`/search, per the 2026-09 audit), and our key gets $1/day free. Gross margin is about **$1.50/1k before payment fees**.
- Cache hits and `ids` calls have about zero upstream cost.
- Each monthly invoice pays a fixed card fee of about $0.30, so a $1 invoice loses about 30% to fees, plus any Managed Payments fee (check the Stripe pricing page).
- **UNVERIFIED:** Stripe's handling of invoices below its $0.50 minimum charge (believed to roll into the next invoice). Confirm in D2.

**Stripe facts for WS-D** (checked against Stripe's docs 2026-10-16; ✅ = confirmed in the docs, ❓ = the docs are silent):

| # | Question | Verdict | Evidence / design consequence |
|---|---|---|---|
| S1 | Are metered (usage-based) prices supported under Managed Payments? | ❓ **Not documented either way** | The eligibility page restricts only account type, country, product category and tax code. `txcd_10701400` (what our products use) is eligible. The "remove unsupported parameters" list for Managed Payments subscriptions (`adaptive_pricing`, `automatic_tax`, `tax_id_collection`, `payment_method_*`, `customer_update[*]`, shipping, Connect fields, `subscription_data.invoice_settings`, `invoice_creation`) **does not mention metered prices or meters.** The changelog shows subscription flexibility growing (2026-04-22: invoice items and subscription items allowed; 2026-10-05: Pay Invoice). **Settled only by the live probe P1 (§4a) or by Stripe support.** |
| S2 | Can `billing_thresholds` be used? | ✅ API, with caveats | Un-deprecated in `2025-03-31.basil`. **Checkout cannot set it.** It has to be set by `subscriptions.update` after `checkout.session.completed` (D3/D4 change below). Managed Payments says you can "update subscriptions in the Dashboard or with the API". ❓ Whether `billing_thresholds` specifically is allowed on a Managed Payments subscription is covered by probe P2. |
| S3 | Invoices below Stripe's minimum charge ($0.50) | ✅ | The invoice is **marked paid** and the amount is debited to the customer's invoice balance (`invoice_too_small`), then **added to the next invoice**. Caveat: if the customer cancels before another invoice, that amount is never collected. Stripe's **"Minimum amount before collection"** billing script can raise the threshold (for example to $5) so small months accumulate before any card fee is paid. It requires `subscription_data.billing_mode: "flexible"` on the Checkout Session; Managed Payments compatibility ❓. |
| S4 | Meter event `value`: integer? | ❓ Not stated | The API reference example sends `"25"`. D6 already reports whole units and carries fractional remainders, so it works either way. |
| S5 | Meter event dedup and timing | ✅ | The `identifier` is unique within a **rolling ≥24 h** window. `timestamp` may be **up to 35 days in the past** (5 minutes into the future). Corrections (Meter Event Adjustment, cancel) only work **within 24 h**, and finalized invoices are never corrected. **D6 change:** send each daily batch with `timestamp` = the end of the usage day, not the time of reporting, so usage lands in the correct billing period while that period is open. |
| S6 | Charging outside Managed Payments | ✅ restriction | "When a customer purchases a subscription through Managed Payments, it only authorizes Managed Payments to charge their payment method." Also, `subscription.default_payment_method` **can't be updated through the API** for Managed Payments subscriptions; customers change it in the Customer Portal or Link. So there is no off-session charging of a Managed Payments card from our side. That confirms metered billing must stay **inside** the Managed Payments subscription, or the whole `api` plan runs without Managed Payments. |
| S7 | Usage-based billing direction | ✅ | Stripe's usage-based docs now lead with Metronome (a Stripe product). Classic Meters plus metered Prices are still documented and supported. Metronome isn't needed at our scale. |

Sources: docs.stripe.com `/payments/managed-payments/{eligibility,update-checkout,how-it-works,changelog}`, `/billing/customer/balance`, `/billing/scripts/stripe-authored/customer-balance`, `/api/billing/meter-event/create`, `/billing/subscriptions/usage-based/meters/configure`, `/changelog/basil/2025-05-28/reintroduce-billing-thresholds`.

### 4a. Live probe to settle S1/S2 (needs Shahbaz's approval; the Stripe MCP reaches only the **live** account `acct_1TcsbiEIZgZk846W`, no sandbox)

No money moves and no customer sees anything. Every object is archived or expired afterwards (a meter can be deactivated, not deleted).

1. **P0:** `POST /v1/billing/meters`: `opencite_api_units`, sum, `by_id` mapping. This is the real D2 meter, kept if P1 passes.
2. **P0:** `POST /v1/products`: "OpenCITE API (pay as you go)", `tax_code=txcd_10701400`. Plus `POST /v1/prices`: recurring monthly, `usage_type=metered`, `meter=<P0 meter>`, `unit_amount_decimal=0.25`, USD. This is the real D2 product and price.
3. **P1:** `POST /v1/checkout/sessions` with `mode=subscription`, that price **without quantity**, `managed_payments[enabled]=true`, the Managed Payments preview API version used in `checkout.js:40`, and a test `success_url`. **2xx → S1 = supported.** An error message → S1 = unsupported, which forces D-13(b). Expire the session immediately (`POST /v1/checkout/sessions/{id}/expire`).
4. **P2** (only possible with a real subscription): during the Checkpoint 2b acceptance run with Shahbaz's own card, call `subscriptions.update` with `billing_thresholds[amount_gte]=5000`. 2xx → S2 confirmed.

If P1 fails, archive the price and product and deactivate the meter, unless Shahbaz chooses D-13(b) and keeps them for a non-Managed-Payments `api` plan.

## 5. Tasks

### WS-A — Money-aware MCP (both transports)

#### A1 — Tool registry SSOT shared by the stdio and remote servers
**Files:** new `mcp/src/tools.js`, `mcp/src/server.js`, `mcp/src/client.js`

- `tools.js` exports `TOOLS`. Each entry is `{ name, definition(), path, toQuery(args), metered }`:
  - `search_scholarly_sources` → `/api/search`
  - `search_citations` → `/api/citations`
  - `resolve_ids` → `/api/ids`
  - `get_balance` → `/api/credits` (A5)
- It also exports `toToolResult(resp)`, the **one** place that shapes `{status, headers, body|text}` into an MCP result (A2/A3).
- `client.js` becomes `httpExecutor({ baseUrl, apiKey })`. It returns `{status, headers, body | text}` and **does not throw** on non-2xx, which is what currently loses `code` and `upgrade_url`. TLS and no-key-leak guarantees stay as they are (`client.js:15-29`).
- `server.js` iterates `TOOLS` for both `tools/list` and `tools/call`. The three per-tool `if` blocks (`server.js:42-76`) go away.
- `client.js` is not in the package `exports` map (`mcp/package.json`), so the refactor breaks no consumers.

**Acceptance:** stdio `tools/list` returns 4 tools. Each tool's definition matches today's byte-for-byte except for the A6 annotations.

#### A2 — Structured paywall and auth errors for agents
**Files:** `mcp/src/tools.js` (`toToolResult`)

| Status | Tool result |
|---|---|
| 402 | `isError:true`. Text: *"Out of OpenCITE credits (balance N). A human must top up at <upgrade_url>. Packs: $10→2,000 · $50→12,000 · $150→45,000."* `structuredContent: { code, upgrade_url, balance, packs }`. |
| 401 | Text pointing at `signup_url` (A4). |
| 429 | Text including `Retry-After`. |

The pack list comes from the 402 body (A4), never hardcoded in the MCP.

**Acceptance:** with a zero-balance key, every metered tool returns the upgrade URL and pack list.

#### A3 — A billing trailer on every metered call
**Files:** `mcp/src/tools.js`

- Append a second text content block: `OpenCITE · charged X credit(s) · balance Y · request <requestId>`.
- JSON responses read it from `meta`. Citation-text formats read it from the `X-OpenCITE-Credits` / `X-OpenCITE-Balance` / `X-OpenCITE-Request-Id` headers (`search.js:447-448`), which `httpExecutor` now returns.
- Citation text stays clean in block 1, so agents can paste it directly.

#### A4 — Server-side 402/401 bodies say how to pay
**Files:** `api/_shared/meter.js`, `api/search.js`

- `insufficientCredits({ balance })` (`meter.js:16-20`) adds `balance` and `packs: Object.values(CREDIT_PACKS).map(({id, usd, credits}) => …)` from `plans.js` (SSOT), plus `docs_url`. It is still the single 402 body.
- New `unauthorized()` in `meter.js`: `{ error, code:"unauthorized", signup_url:"https://citation.today/#developers", docs_url }`. It replaces the two divergent 401 literals at `search.js:194` and `meter.js:49`.
- Update `public/docs/index.html:75` to match.

#### A5 — Key-authenticated balance (`get_balance`)
**Files:** `api/_shared/handlers/credits.js`, `mcp/src/tools.js`

- `credits.js` resolves `resolveApiKey(req)` **before** the session path.
- A key caller gets `{ credits, tier, monthlyGrant, upgrade_url }`, plus the L3 split fields `allowance` and `purchased` and the WS-D `metered` block (D7).
- The key branch is rate-limited per key (`checkRateLimit(identity.keyId, identity.plan)`). It is never metered.
- The `get_balance` tool calls it.

**Acceptance:** `curl -H "x-api-key: $K" https://citation.today/api/credits` returns 200 with the balance. A bad key returns 401. A session caller is unchanged.

#### A6 — Package hygiene and directory-required metadata
**Files:** `mcp/src/server.js`, `mcp/README.md`, `mcp/package.json`, `mcp/src/schema.js`

- The server version is read from `package.json` instead of the literal `"0.1.0"` (`server.js:31`).
- Fix the "optional pre-billing" comment (`server.js:13`) and make the README consistent (a key is required).
- Add MCP tool annotations to every tool: `title`, `readOnlyHint:true`, `openWorldHint:true`. The Anthropic directory requires them.
- Bump the package to `0.48.0`. **Shahbaz publishes** (`cd mcp && npm publish`, npm 2FA).

#### A7 — Contract drift guard
**Files:** `mcp/scripts/sync-contract.mjs`

Add a `--check` mode that exits 1 if `mcp/src/apiContract.js` differs from the SSOT. From B6 onward, prod `api/mcp.js` imports the vendored copy, so drift would now affect prod and not just npm. Run it in the sprint acceptance step.

### WS-B — Remote MCP + OAuth 2.1 (machines connect without pasting keys)

#### B1 — Accept `Authorization: Bearer`
**Files:** `api/_shared/apiAuth.js`, `api/search.js`, `api/citations.js`, `api/ids.js`

- `presentedKey` (`apiAuth.js:46-49`) falls back to `Authorization: Bearer <key>` when `x-api-key` is absent.
- Add `Authorization` to CORS `Access-Control-Allow-Headers` (`search.js:169`, `citations.js:31`, the matching `ids.js` line).
- One credential type keeps one resolution path, so billing is unchanged.

#### B2 — Key minting SSOT
**Files:** new `api/_shared/apiKeys.js`, `api/_shared/handlers/keys.js`

- Extract `mintApiKey(userId, { label, oauthClientId })` from `keys.js:248-264`. Both the keys handler and the OAuth token endpoint use it.
- The 10-active-key cap (`keys.js:251-254`) applies to manual keys only.
- An OAuth mint first revokes the user's previous active key for the same `oauth_client_id`, so each connected client has exactly one live key (D-6).
- `publicView` gains `label` and `oauthClientId`.

#### B3 — Schema (part of the single v0.48 migration, see §6)
- `oauth_clients`: `client_id` PK, `client_name`, `redirect_uris text[]`, `created_at`.
- `oauth_codes`: `code_hash` PK, `client_id`, `user_id` FK cascade, `redirect_uri`, `code_challenge`, `resource`, `expires_at`, `used_at`.
- `api_keys`: add `label text NULL` and `oauth_client_id text NULL` (indexed).
- Purely additive.

#### B4 — OAuth config SSOT
**Files:** new `api/_shared/oauthConfig.js`

- `ISSUER = "https://citation.today"` and `MCP_RESOURCE = \`${ISSUER}/api/mcp\``.
- Builders for the RFC 8414 authorization-server metadata and the RFC 9728 protected-resource metadata, plus the `WWW-Authenticate` value.
- Every OAuth and MCP surface reads from here.

#### B5 — `api/oauth/[step].js` (Node function #9)

**Steps:**

- **`metadata`** (GET): authorization-server metadata.
  - `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `revocation_endpoint`
  - `response_types_supported:["code"]`, `grant_types_supported:["authorization_code"]`
  - `code_challenge_methods_supported:["S256"]`, `token_endpoint_auth_methods_supported:["none"]`
- **`resource`** (GET): protected-resource metadata `{ resource: MCP_RESOURCE, authorization_servers:[ISSUER], bearer_methods_supported:["header"] }`.
- **`register`** (POST, DCR, D-5):
  - Validate `redirect_uris`: `https:`, or `http:` on `localhost` / `127.0.0.1` with any port.
  - `client_name` up to 100 chars, HTML-escaped wherever it is rendered.
  - Issue a UUID `client_id` for a public client.
- **`authorize`** (GET):
  - Validate `client_id`, an exact `redirect_uri` match, `response_type=code`, `code_challenge` + `S256`, `state`, and `resource` (must equal `MCP_RESOURCE` when present).
  - **No session** → 302 to `/api/auth/signin?callbackUrl=<this exact URL>`. **Verify live** that Auth.js returns to a same-origin `callbackUrl` with the query intact.
  - **Session** → server-rendered consent page showing the client name, the redirect **host**, the line *"calls are billed to your OpenCITE account at $2.50 per 1,000"*, and Approve / Deny buttons. It carries a CSRF token: HMAC(`AUTH_SECRET`, userId + params + 10-min expiry).
  - If the user has **no API entitlement** (no allowance, no purchased credits, no active `api` subscription; same predicate as D8), the page also shows "Subscribe — pay as you go". That button starts D3 Checkout with `success_url` returning to this authorize URL. Approving without subscribing is allowed, but the first call will return 402 `subscription_required` (D-4, D8).
- **`authorize`** (POST):
  - Verify the CSRF token.
  - Approve → insert `oauth_codes` (random 32 bytes; store only the sha256; 5-min TTL) → 302 to `redirect_uri?code&state`.
  - Deny → `error=access_denied`.
- **`token`** (POST, form-encoded, `grant_type=authorization_code`):
  - Claim the code atomically: `updateMany where used_at IS NULL AND expires_at > now()`, with count 1 required, so a code can only be redeemed once.
  - Verify the PKCE S256 challenge, `client_id`, `redirect_uri` and `resource`.
  - `mintApiKey` (B2) → `{ access_token, token_type:"Bearer", scope:"opencite" }`, with no `expires_in` (D-6).
- **`revoke`** (POST, RFC 7009): revoke by key hash; always return 200.

**Supporting config:**
- **Rate limit:** every step goes through the pre-auth IP window, reusing `checkRateLimit` + `ANON_PLAN`.
- **Rewrites** (`vercel.json`):
  - `/.well-known/oauth-authorization-server` → `/api/oauth/metadata`
  - `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/api/mcp` → `/api/oauth/resource`
  - Add `\.well-known/` to the SPA catch-all's exclusion regex (`vercel.json:327`).

#### B6 — `api/mcp.js` (Node function #10): stateless Streamable HTTP

**Requests:**
- **POST only.** GET and DELETE return 405 (no SSE stream offered). One JSON-RPC message per POST; arrays are rejected. Responses are `application/json`.

**Methods:**
- `initialize`: echo the client's `protocolVersion` if it is in `SUPPORTED_PROTOCOL_VERSIONS`, otherwise send the latest. The list is an SSOT constant in `oauthConfig.js` or `tools.js`. **Confirm the current spec revision at execution time.** Research reported a 2026-07-28 stateless revision; that is unverified.
- `notifications/*` → 202.
- `ping`, `tools/list`, `tools/call`.

**Auth:**
- Every method requires a credential (D-4): `meter.authAndLimit`, which with B1 reads Bearer.
- Failure → 401 with `WWW-Authenticate: Bearer resource_metadata="<ISSUER>/.well-known/oauth-protected-resource"` (B4).
- **The route never reads cookies**, so it has no CSRF surface.

**Execution:**
- `tools/call` runs through `TOOLS` (A1) with the **in-process executor** (B7). Results are shaped by the same `toToolResult`, so the remote server behaves identically to stdio, including A2 and A3.

#### B7 — In-process handler executor
**Files:** new `api/_shared/invokeHandler.js`

- `invokeHandler(handler, { method, query, headers }) → {status, headers, body|text}`.
- It is a minimal req/res adapter supporting `statusCode`, `setHeader`/`getHeader`, `end`, and `status().json()`. Both handler styles appear in the code: `sendJson` in search and meter, Express-style in credits.
- `api/mcp.js` imports the `search`, `citations`, `ids` and `credits` handlers directly. It forwards the caller's key as `x-api-key` and the caller's **real** `x-forwarded-for`.

**Why not self-HTTP to `/api/search`?**
- Every remote-MCP call would arrive from Vercel's egress IP. The per-IP pre-auth limiter (`ANON_PLAN` 60/min, `ratelimit.js:33`) would then throttle **all remote users together**.
- It would also double the function invocations and wall-clock time.

The in-process route reuses the billing path with zero duplication.

#### B8 — Developers panel: connect and manage
**Files:** `src/components/DevelopersPanel.jsx`

- Add a "Connect to Claude / ChatGPT" block with the remote URL `https://citation.today/api/mcp` and per-client setup steps.
- Add a "Connected apps" list (keys with an `oauth_client_id`, shown by client name) with Revoke.

#### B9 — Discovery surfaces
**Files:** new `public/llms.txt`, `public/docs/index.html`, `public/openapi.json`, new `mcp/server.json`

- `llms.txt`: what OpenCITE is, the endpoints, the remote MCP URL, pricing, and the 402 contract.
- Docs: a remote-MCP section.
- `openapi.json`: add `/api/citations`, `/api/ids` and key-authenticated `/api/credits`. Today only `/api/search` is documented.
- `mcp/server.json`: an official MCP Registry entry covering both the npm package and the remote URL. The namespace is a Shahbaz decision: `io.github.zabhahs/…` (GitHub auth) or `today.citation/…` (DNS verification).

#### B10 — Directory submissions (Shahbaz-only, after live verification)
- **Anthropic connector directory:** needs OAuth (B5), tool annotations (A6), the privacy URL, and a **reviewer test account**. Use a dedicated Google account, granted credits through admin SQL.
- **ChatGPT apps/connectors.**
- **MCP Registry publish** with `mcp-publisher`.

### WS-C — Usage ledger and reconciliation (what institutions need)

#### C1 — `credit_events` journal
**Design:** the **v0.45 T1 design, verbatim** (`sprint_log_v0_45.md` §T1). The balance stays authoritative on `users.total_credits` (and on `allowance_credits` after L3). The journal is evidence, not the balance.

**Deltas from v0.45:**
- Add a **`key_id text NULL`** column (indexed `[user_id, key_id, created_at]`) for per-key attribution: which agent or lab key spent what. `keyId` is threaded from `identity.keyId`; `"master"` and `"session-admin"` are stored as NULL.
- Add **`bucket text NULL`** (`allowance` | `purchased`) once L3 lands, so split debits are itemized.
- The `grant` event delta: v0.45 T4 is now a single `$executeRaw` (`billing.js:201-206`). Convert it to a `$queryRaw … RETURNING`, using a CTE for the old balance, so the journal records the real delta. Atomicity is unchanged.
- `requestId = crypto.randomUUID()` is minted once per request in `search.js` and `meter.js`. It is surfaced as `meta.requestId` **and** an `X-OpenCITE-Request-Id` header (v0.45 D-6), which A3 consumes.
- Pack purchases, monthly grants and clawbacks in `webhook.js` journal inside the existing transaction, with `source` = the Stripe event id.

**Acceptance:** the v0.45 T1 acceptance criteria apply unchanged, plus: every row written by a key-authenticated call carries `key_id`.

#### C2 — Orphaned pre-auth sweep
**Design:** the **v0.45 T2 design, verbatim**: a `reconcile` handler on the `api/user/[resource].js` dispatcher, a 30-min orphan threshold, and idempotent insert-first ordering.

**Deltas:**
- `vercel.json` gets a **second** daily cron entry. The existing one is `/api/health`, at `vercel.json:331-333`.
- **Shahbaz adds a `CRON_SECRET`** to Vercel prod; it is not set today (§4).
- Retention pruning (D-9: 12 months) rides the same handler.

#### C3 — Usage export API
**Files:** new `api/_shared/handlers/usage.js`, `api/user/[resource].js` (`HANDLERS`), `vercel.json` rewrite `/api/usage`

- `GET /api/usage?from=YYYY-MM-DD&to=YYYY-MM-DD&group=day|key|endpoint&format=json|csv`.
- Auth: session **or** API key (D-8: a key sees its account's usage, per key).
- Aggregates net spend per `request_id` (the preauth + settle/refund/reconcile sum), plus purchase, grant and clawback rows.
- The range is capped at 366 days. Rate-limited.
- CSV columns: `date, key_label, key_prefix, endpoint, requests, credits_charged, credits_granted`.

#### C4 — Developers panel usage view
**Files:** `src/components/DevelopersPanel.jsx`

A 30-day usage table (day × key) plus a "Download CSV" button that calls C3.

#### C5 — `api_usage` table
No change this sprint. It is dead but harmless (`schema.prisma:160-170`), and C1/C3 supersede it. Quarantine-drop it in a later sprint.

### WS-L — Leak closure

#### L1 — A pack buyer gets permanent unlimited web (D-1)
**Root cause:**
- `hasUnlimitedWebSearch` is true for every non-free plan (`plans.js:106-108`).
- One pack moves free → `machine` forever (`webhook.js:182`).
- The pack copy advertises unlimited web (`Panels.jsx:288-289`).

**Fix (per D-1a):**
- `hasUnlimitedWebSearch = (p) => !!((p.subscription && !p.postpaid) || p.internal)`. The `postpaid` clause covers the WS-D `api` plan (D1). Write it once here; D1 only verifies it.
- Edit the pack blurb: *"…unlocks the full source library and the machine rate limit for your API/MCP keys."*
- Mirror any pack copy in `src/constants/pricing.js`.

The client cap (`src/lib/searchQuota.js:26`) needs no change; it already reads the SSOT.

#### L2 — Cancelling a subscription demotes a pack buyer to `free`
**Root cause:** `customer.subscription.updated` (inactive) and `.deleted` hard-set `plan:"free"` (`webhook.js:226-227`, `234`). A user who bought packs loses the `machine` tier (all sources, 300/min) while still holding their credits.

**Fix:**
- New column `users.pack_purchased_at timestamptz NULL`, stamped in the pack branch (`webhook.js:178-182`, same transaction).
- New SSOT helper `downgradePlanFor(user)` in `plans.js`: `pack_purchased_at ? PACK_BUYER_PLAN_ID : DEFAULT_PLAN_ID`. Both webhook sites use it.
- **Backfill:** read paid `mode=payment` Checkout Sessions carrying `metadata.pack` from Stripe, then update the matching users. This runs at execution time with Shahbaz's per-action approval (Stripe read + Supabase SQL).

#### L3 — The subscription allowance is swallowed by pack credits (D-2)
**Root cause:** the monthly and upgrade grants use `GREATEST(total_credits, grant)` (`billing.js:201-206`, `219-224`). A Pro subscriber holding 5,000 pack credits pays $10/month and receives 0.

**Fix (per D-2a, two buckets):**
- **New column:** `users.allowance_credits Decimal(12,4) DEFAULT 0`.
- **Grants:**
  - `applyMonthlyGrant` becomes `SET allowance_credits = grant, credits_period = $p WHERE credits_period IS DISTINCT FROM $p`. That is a reset, never a rollover, and no `GREATEST` is needed.
  - `applyUpgradeGrant` becomes `SET allowance_credits = GREATEST(allowance_credits, grant)`, keeping the existing upgrade-only semantics.
  - The free tier's lazy grant (`apiAuth.js:100-102`, `credits.js:179-181`) uses the same primitive.
- **Spending:**
  - `preAuthorize` becomes **one** guarded statement. It debits `LEAST(allowance, amt)` from `allowance_credits` and the remainder from `total_credits`, `WHERE allowance_credits + total_credits >= amt`, and returns the split.
  - `settle` and `refund` take that split and refund the allowance first, up to what was taken from it.
  - `clawbackCredits` touches only `total_credits`, because purchased credits are what gets refunded.
- **Reads:** `getBalance` and `/api/credits` return `credits = allowance + purchased`, plus both parts. The `CreditsChip` and `meta.balance` show the sum.
- **Migration:** `allowance_credits` starts at 0, and existing balances stay in `total_credits`. A current Student/Pro subscriber gets a fresh allowance at their next grant, a one-time windfall of at most 1,000 credits for the handful of subscribers. That is accepted as negligible; confirm under D-2. Free users get no allowance at all after D8 (`FREE_MONTHLY_GRANT = 0`), and their balances are zeroed (D-11).
- **Copy:** replaces v0.45 T9. *"Your monthly allowance refills each month and is used first; purchased credits never expire and are used after it."*
- **Order:** after C1, so the journal records `bucket`.

**Acceptance:**
- A Pro user holding 5,000 purchased credits shows 6,000 after renewal.
- A 1-credit search debits the allowance first.
- A refund clawback leaves the allowance intact.
- Two concurrent preauths can never overspend the combined balance (single guarded statement).

#### L4 — A refunded or disputed pack keeps the `machine` plan
After L1, `machine` grants only the API tier and rate limit. With 0 purchased credits it cannot spend, so **no code change is needed.** Keep the existing `credits-clawed-back` log (`webhook.js:263`) and journal the clawback through C1.

#### L5 — Stale copy and config
- `Layout.jsx:137` tooltip says "web search is unlimited" for free users. Change it to *"Free API credits this month"*.
- `schema.prisma:36` stale comment ("free→1500/mo; gate for $5 student plan") → honor-system note.
- `.env.example`: add `STRIPE_PORTAL_CONFIGURATION` (optional) and `CRON_SECRET`.

#### L6 — Already closed
The `SRIPE_PRICE_PRO` typo is resolved in prod env (§4). No task.

#### L7 — Unthrottled session routes (the v0.45 T7 remainder)
- Add the pre-auth IP window once in the `api/user/[resource].js` dispatcher. It covers credits, keys, usage and reconcile; the cron path is exempt via `CRON_SECRET`.
- Add it in `api/checkout.js` too.
- Skip `api/auth/handler.js`, which is out of scope (OAuth-incident class).

#### L8 — The rate limiter is per-instance only (Shahbaz-only)
No KV is provisioned (§4). The remote MCP plus the public `register`/`token` endpoints raise abuse exposure. **Provision Upstash KV through the Vercel Marketplace** (`KV_REST_API_URL` / `KV_REST_API_TOKEN`) before B10's directory listing brings in traffic. No code change: `ratelimit.js` already uses KV when it is present.

### WS-D — Metered "API" subscription (Brave-style, half price, no free tier)

**Model.** A new plan `api`:
- $0 base fee, $2.50 per 1,000 units, billed monthly in arrears to the card collected at Checkout.
- All sources and the machine rate limit.
- **No allowance and no free credits.**

Spending order on every metered call:
1. subscription allowance (Student/Pro, from L3);
2. purchased pack credits;
3. metered postpaid usage (`api` plan only, while the subscription is active and under the cap).

The `machine` plan (prepaid pack buyers) is unchanged apart from the D-10 repricing. Its display label becomes "Prepaid credits"; the new `api` plan is labelled "API (pay as you go)".

**Build order:** after C1 (journal) and L3 (bucket split), because the metered bucket is the third bucket of the same guarded statement.

#### D1 — Plans SSOT
**Files:** `api/_shared/plans.js`, `src/constants/pricing.js`

- **New plan `api`:**
  - `{ tier:"all", monthlyGrant:0, creditCost:1, rateLimit:{60s, 300}, freeBelowBand:"limited" }`
  - `subscription:true, postpaid:true, priceEnv:"STRIPE_PRICE_API_METERED"`
  - `unitPriceUsd: 0.0025` (display SSOT; Stripe's Price is the billing truth, and D2 makes them match)
- **New `ENDPOINT_UNITS = { search:1, citations:1, ids:0.1 }`** (D-12). The effective cost becomes `plan.creditCost × ENDPOINT_UNITS[endpoint]` through one helper, `unitCost(plan, endpoint)`. The callers are `search.js:150`, `334`, `425`, `434` and `438`, plus `meter.js:66`, which passes the endpoint in from `citations.js` / `ids.js`.
- **`hasUnlimitedWebSearch`** (`plans.js:106-108`): `!!((p.subscription && !p.postpaid) || p.internal)`. This applies L1/D-1 and keeps the $0-base `api` plan from being a free route to unlimited web.
- **`isPaidPlan`** (`plans.js:112-115`) already returns true for subscriptions, so the Customer Portal works for `api` subscribers.
- **D-10 repricing:** `CREDIT_PACKS` credits become 4,000 / 20,000 / 60,000 (`plans.js:126-130`); comment updated.
- **`pricing.js`:** a new `API_PLAN` display block ("$2.50 per 1,000 calls · billed monthly · card required · no minimum"). `perK` now shows $2.50/1k for every pack. `COVERAGE_NOTE` mentions that ID resolution costs 0.1.

#### D2 — Stripe objects (Shahbaz in the Dashboard, or Claude through the Stripe MCP with per-action approval)
1. A **Billing Meter** with `event_name: "opencite_api_units"`, `default_aggregation.formula: "sum"`, mapped to the Stripe customer id.
2. A **Product** "OpenCITE API (pay as you go)", tax code `txcd_10701400` (the same as the existing products, which are Managed Payments-eligible).
3. A **Price**: recurring monthly, `usage_type: metered`, linked to the meter, `unit_amount_decimal: "0.25"` (cents per unit = $0.0025), USD.
4. Vercel env: `STRIPE_PRICE_API_METERED`, `STRIPE_API_METER_EVENT`.
5. **Ask Stripe** about D-13 (metered under Managed Payments), D-14 (`billing_thresholds` under Managed Payments) and the minimum-charge rollover.

#### D3 — Checkout
**Files:** `api/checkout.js`

- `{plan:"api"}` creates a subscription-mode session with the metered line item. **No `quantity`**: Stripe rejects quantity on metered prices.
- **Checkout can't set `billing_thresholds` (S2).** D4 sets it instead: on `checkout.session.completed` for a postpaid plan, the webhook calls `stripe.subscriptions.update(sub, { billing_thresholds: { amount_gte: 5000 } })` (D-14). If probe P2 shows Managed Payments rejects it, rely on our own cap (D5) only.
- When `plan.postpaid`, set `subscription_data.billing_mode: "flexible"` so Stripe's "Minimum amount before collection" script (S3) can be enabled later without migrating subscriptions.
- `managed` (`checkout.js:160`) extends to `api` subscriptions only if D-13(a) is confirmed. Otherwise it stays packs-only.
- The existing 409 `already_subscribed` (`checkout.js:121-124`) keeps one subscription per user. A Student/Pro subscriber who wants metered overage switches plans through the Customer Portal (an `api` price is added to the portal config by Shahbaz) or buys packs.
- Checkout `custom_text` for postpaid consent: *"You'll be billed monthly for API calls at $2.50 per 1,000 (ID lookups $0.25 per 1,000), up to your monthly cap."*

#### D4 — Webhook and subscription state
**Files:** `api/stripe/webhook.js`, `prisma/schema.prisma`

- **New user columns:** `subscription_status text NULL`, `metered_period text NULL`, `metered_usage Decimal(12,4) DEFAULT 0`, `metered_unreported Decimal(12,4) DEFAULT 0`, `metered_cap_usd Decimal(10,2) DEFAULT 25`. They join the single v0.48 migration (§6).
- `checkout.session.completed` with plan `api` → `plan:"api"`, `stripe_subscription_id`, `subscription_status:"active"`. `grantOnUpgrade` is a no-op because the grant is 0.
- `customer.subscription.updated`:
  - persist `obj.status` into `subscription_status` for every plan;
  - **postpaid plans serve only while `active`** (unlike flat plans, where `past_due` keeps serving, `webhook.js:218`);
  - inactive → `downgradePlanFor(user)` (L2).
- `invoice.payment_failed`: postpaid → `subscription_status:"past_due"`, which stops metered spending immediately; purchased credits stay spendable. This is no longer a no-op for `api`.
- `invoice.paid` for `api` → `subscription_status:"active"`; no grant.
- `customer.subscription.deleted` → `downgradePlanFor` (L2). Any unreported usage is still reported by the next D6 sweep; Stripe bills it on the final invoice or the customer balance (**verify**: usage reported after cancellation).

#### D5 — Third billing bucket: metered usage with a cap
**Files:** `api/_shared/billing.js`

`preAuthorize` (already rewritten for two buckets in L3) gains a third source. It stays **one guarded statement**:

1. take from `allowance_credits`, then from `total_credits`;
2. send any remainder `r` to `metered_usage`, but only when:
   - the plan is postpaid;
   - `subscription_status = 'active'`;
   - `(metered_period = $p ? metered_usage : 0) + r ≤ metered_cap_usd / unitPriceUsd`.

In the same statement, `metered_period` rolls to the current month (resetting `metered_usage` to 0) and `metered_unreported += r`. The return value gives the 3-way split.

- `settle` and `refund` give back to the bucket debited, in reverse order (metered first, then purchased, then allowance), decrementing `metered_usage` **and** `metered_unreported` together.
- C1 journals the split with `bucket:"metered"`.

**Errors when the call can't be covered:**
- Cap reached → 402 `{ code:"spend_cap_reached", cap_usd, manage_url }`.
- `past_due` → 402 `{ code:"payment_failed", portal_url }`.
- No entitlement at all → 402 `subscription_required` (D8).

All three come from the A4 builder in `meter.js` (single source), and A2 renders all three for agents.

#### D6 — Daily usage reporting to Stripe (rides the C2 cron, one handler)
**Files:** `api/_shared/handlers/reconcile.js`, renamed `billingSweep.js`, plus `vercel.json`

- The single daily cron runs: (1) the C2 orphan reconcile, then (2) the meter report, then (3) retention pruning. This keeps the cron count at 2 (`health` + `billing-sweep`) under the Hobby limits.
- **Meter report:** for each `postpaid` user with `metered_unreported ≥ 1`:
  - `units = floor(metered_unreported)`;
  - `stripe.billing.meterEvents.create({ event_name, payload:{ stripe_customer_id, value: units }, identifier: \`${userId}:${sweepDate}\`, timestamp: <end of the usage day, UTC> })`. Backdating is allowed up to 35 days (S5), so usage lands in its own billing period;
  - **then** an atomic `metered_unreported -= units`.
  - The fractional remainder carries forward. The `identifier` makes a retried sweep idempotent on Stripe's side, and the decrement only after success makes it idempotent on ours.
- **Disclosed lag:** usage is reported to Stripe within 24 hours, so usage from a period's last day can appear on the next invoice. Nothing is lost.
- Journal a `report` row (amount 0, `source` = meter identifier) so C3 can reconcile what we billed against what Stripe holds.

#### D7 — Spend controls UI and API
**Files:** `api/_shared/handlers/credits.js`, `DevelopersPanel.jsx`

- `/api/credits` (session or key, A5) adds `{ plan, subscription_status, metered: { period, usage_units, est_usd, cap_usd } }`.
- `PATCH /api/credits` (session only) sets `metered_cap_usd`, clamped to $5–$1,000 (D-14).
- The panel shows month-to-date units, an estimated bill, a cap editor, and "Invoices & card", which opens the existing Customer Portal (`{portal:true}`).
- The MCP `get_balance` tool (A5) returns the `metered` block, so an agent can see its estimated bill.

#### D8 — Remove the free tier for machine users
**Files:** `api/_shared/plans.js`, `prisma/schema.prisma`, `src/constants/pricing.js`, `api/_shared/meter.js`, `api/search.js`

- **Stop the grants:**
  - `FREE_MONTHLY_GRANT = 0` and `FREE_STUDENT_MONTHLY_GRANT = 0` (`plans.js:22-23`).
  - The lazy grants at `apiAuth.js:100-102` and `credits.js:179-181` become no-ops automatically: `applyMonthlyGrant` returns early when `!(grant > 0)` (`billing.js:194`). Delete the dead calls for clarity; do not leave them as no-op calls.
  - The signup seed `total_credits @default(10)` (`schema.prisma:32`) changes to `@default(0)`, as an `ALTER COLUMN … SET DEFAULT 0` in the v0.48 migration.
- **Zero existing free balances** (D-11): a one-time `UPDATE users SET total_credits = 0 WHERE plan = 'free'`. Shahbaz approves; run it after the JSON backup.
- **No API entitlement:** a `free` caller with a valid key, no allowance, no purchased credits and no active `api` subscription gets **402 `subscription_required`**:
  - `{ error, code:"subscription_required", subscribe_url:"https://citation.today/#developers", pricing:{ per_1k_usd:2.50, ids_per_1k_usd:0.25 }, packs }`
  - It is built in `meter.js` beside `insufficientCredits` (A4) and used by both `search.js` and `meter.charge`.
  - Keys can still be minted, since a key is needed to subscribe from an agent's OAuth flow. They just can't spend.
- **The web app is unaffected:** the free plan keeps `FREE_WEB_DAILY_SEARCHES = 10` (`plans.js:28`). "Machine users" means API and MCP.
- **Copy:**
  - `FREE_TIER_NOTE` (`pricing.js`) becomes *"Free: 10 web searches a day. API and MCP access is pay as you go: $2.50 per 1,000 calls."*
  - `Layout.jsx:137` tooltip (with L5): drop "free API credits".
  - `public/docs/index.html`, `llms.txt` (B9), `mcp/README.md`.
  - Legal: `terms.html` and `refunds.html` gain postpaid usage billing, monthly arrears, card required, the cap, suspension on failed payment, and that metered usage isn't refundable once delivered. **Shahbaz reviews all legal copy.**

**Acceptance (WS-D, against live prod, using a Shahbaz-owned test account):**
- A free key returns 402 `subscription_required` on `/api/search` and `/api/ids`.
- After subscribing to `api` via Checkout (card required), a search returns 200 with `meta.creditsCharged: 1` and the `bucket` is `metered` in the journal.
- After the next daily sweep, Stripe's meter shows the units and the upcoming invoice shows `N × $0.0025`.
- Setting the cap to $5 and exceeding 2,000 units returns 402 `spend_cap_reached`.
- A `stripe trigger invoice.payment_failed`-style failure (or a real decline on the test account) returns 402 `payment_failed`, while purchased credits still spend.
- A user holding pack credits **and** `api` spends packs first (journal `bucket:"purchased"`) and only then meters.
- The web cap still applies to an `api` subscriber (D-1).

## 6. File-ownership / collision map (one owner per shared file; sequence where two touch it)

| File | Tasks (in order) |
|---|---|
| `prisma/schema.prisma` + **one** additive migration `…_v0_48_machine_revenue` | B3 + C1 + L2 + L3 + D4 columns, plus the D8 `total_credits` default → 0. Applied together on a **Supabase branch first**, then prod. The D-11 zeroing is a separate, approved one-off SQL, not part of the migration. |
| `api/_shared/billing.js` | C1 → L3 → D5 |
| `api/stripe/webhook.js` | C1 (journal) → L2 → L3 (grant calls) → D4 |
| `api/_shared/meter.js` | A4 → C1 (requestId) → D1 (`unitCost`) → D5/D8 (402 variants) |
| `api/search.js` | A4 → B1 → C1 → D1 (`unitCost`) → D8 |
| `api/_shared/apiAuth.js` | B1 → L3 (lazy grant call) → D8 (delete dead lazy grant) |
| `api/_shared/handlers/credits.js` | A5 → L3 → D7 (metered block, cap PATCH) → D8 (delete dead lazy grant) |
| `api/_shared/handlers/keys.js`, new `apiKeys.js` | B2 |
| `api/_shared/handlers/billingSweep.js` (was C2's `reconcile.js`) | C2 → D6 |
| `api/checkout.js` | L7 → D3 |
| `api/user/[resource].js` | C2 → C3 → L7 |
| `vercel.json` | B5 (rewrites, regex) → C2/D6 (one `billing-sweep` cron) → C3 (rewrite) |
| `api/_shared/plans.js` | L1 → L2 → D1 (packs D-10 first, in Phase 1) → D8 |
| `mcp/src/*` | A1 → A2 → A3 → A5 → A6 → A7 → D5/D8 (render the new 402 codes) |
| `src/components/DevelopersPanel.jsx` | B8 → C4 → D7 |
| `Panels.jsx`, `pricing.js`, `Layout.jsx` | L1 → L3 copy → L5 → D1/D8 copy |
| `public/legal/terms.html`, `refunds.html`, `public/docs/index.html` | D8 (Shahbaz reviews) |

**Function count after the sprint: 10 / 12 Node** (D-7). There are no other new files under `api/` outside `api/_shared/**`. **Crons: 2** (`health`, `billing-sweep`).

## 7. Execution order and deploy checkpoints

1. **Phase 1, no schema change:** L1, L5, L7, A1–A7 (A5 without the L3/D7 fields), plus the **D-10 pack repricing** (code-only `plans.js` credits).
   - **Checkpoint 1:** commit on Shahbaz's word, then push, which auto-deploys prod. Verify live (§9). Shahbaz publishes `opencite-mcp@0.48.0`.
2. **Phase 2a, ledger:** migration on a Supabase branch → C1 → L2 (+ backfill) → L3 → C2 → C3 → C4.
   - **Checkpoint 2a:** Shahbaz approves the prod migration, sets `CRON_SECRET`, commits and deploys. Verify live.
3. **Phase 2b, metered subscription and free-tier removal:** D2 (Stripe objects and answers to D-13/D-14) → D1 → D3 → D4 → D5 → D6 → D7 → D8.
   - **Ship D8 in the same deploy as D3–D6.** The free API tier must not disappear before the pay-as-you-go route exists.
   - **Checkpoint 2b:** Shahbaz approves the legal copy, sets `STRIPE_PRICE_API_METERED` / `STRIPE_API_METER_EVENT`, runs the D-11 zeroing SQL after a fresh JSON backup, commits and deploys. Verify live (§9).
4. **Phase 3, remote MCP:** B1 → B2 → B4 → B5 → B7 → B6 → B8 → B9.
   - **Checkpoint 3:** Shahbaz provisions KV (L8), commits and deploys. Verify live. Then B10 submissions.

## 8. Risks

| Risk | Mitigation |
|---|---|
| **L3/D5 rewrite the hot billing path** (three-bucket preauth) | A single guarded SQL statement, with no read-then-write. It lands after C1 so every split is journaled. Verify on the Supabase branch with concurrent preauth probes, including the cap boundary, before prod. |
| **Postpaid non-payment** (WS-D carries credit risk that packs never had) | A card is required at Checkout. A per-user monthly cap (D-14, default $25). An early invoice at $50 via `billing_thresholds`. Metered spending stops the moment an invoice fails (D4). Later option: Stripe Radar's pay-as-you-go abuse signal (`billing_evaluations`) before raising a user's cap. |
| **Metered prices may be unsupported under Managed Payments** (D-13) | Ask Stripe before D3. Fallback: the `api` subscription runs without Managed Payments, with Stripe Tax registrations as merchant of record. Packs and Student/Pro stay as they are. |
| **Meter reporting drifts from the ledger** | The ledger (C1) is the source of truth. D6 reports from `metered_unreported`, decrementing only after Stripe accepts. The idempotent `identifier` makes retries safe. D6 journals a `report` row so C3 can show billed-vs-used. |
| **Removing the free tier (D8) cuts the only zero-friction trial** | Intended (directive). The OAuth consent page and every 402 point to Checkout, which needs a card but no upfront charge. Watch the conversion signal in C3 data after the deploy. |
| **Tiny invoices are eaten by card fees** (~$0.30 fixed each) | Accepted: Brave has the same exposure. Confirm Stripe's sub-minimum rollover in D2. Revisit a minimum monthly charge only if the data shows many sub-$2 invoices. |
| **Copy that names Brave goes stale or invites a dispute** | Public copy states our price only ("$2.50 per 1,000 calls"). Comparisons to Brave stay internal unless Shahbaz approves, and get re-checked against the live Brave page first. |
| **The prod migration touches `users`** (new columns plus a default change) | Additive with defaults only; no rewrite of existing values. Branch-first via `apply_migration`. A JSON backup is taken before prod (precedent: `OpenCite-backups/opencite-db-2026-09-28.json`). |
| **Open DCR is used for consent phishing** | The consent page shows the redirect **host** prominently. HTTPS or localhost only. One key per client, revocable in the panel. Registration is IP-rate-limited. |
| **The Auth.js `callbackUrl` round-trip loses the authorize query** | Verify live in Phase 3 before building the consent UI. Fallback: stash the authorize params in a signed short-lived cookie scoped to `/api/oauth`. |
| **CSP `form-action 'self'`** (Report-Only today, `vercel.json:343`): Chrome applies `form-action` to redirects that follow a form POST | No effect while it is Report-Only. If CSP is ever enforced, give `/api/oauth/authorize` a route-specific CSP allowing the redirect target, or answer the POST with a 200 page that navigates via a meta refresh. |
| **The MCP protocol revision changes during the sprint** | The supported versions are an SSOT list. Stateless JSON-only POST is the lowest common denominator across the 2025 revisions. Confirm against the spec at execution time. |
| **`api/mcp.js` cold starts** (it bundles the full search pipeline) | Accepted. Same pipeline and same latency class as `/api/search`. |
| **The vendored contract drifts into prod** | The A7 `--check` runs in the acceptance step. |
| **Hobby caps** | 10/12 functions. Two daily crons (`health`, `billing-sweep`). |

## 9. Live verification (prod, after each checkpoint; no previews, no local builds)

**Checkpoint 1**
```bash
curl -s -H "x-api-key: $ZERO_BALANCE_KEY" "https://citation.today/api/search?q=test"
```
Expect 402 with `code`, `upgrade_url`, `balance` and `packs`; the packs show the D-10 credits.
```bash
curl -s "https://citation.today/api/search?q=test"
```
Expect 401 with `signup_url`.
```bash
curl -s -H "x-api-key: $KEY" https://citation.today/api/credits
```
Expect 200 with the balance.
- Run the stdio MCP against prod (sanctioned pure-fetch smoke): 4 tools listed, a billing trailer on every metered call, and the 402 text carries the URL.
- A pack-buyer test account is capped at 10/day on the web; a subscriber is not.

**Checkpoint 2a**
- A billed search produces exactly a `preauth` + `settle` pair with one `request_id` and the right `key_id`.
- `/api/usage?format=csv` returns rows.
- A synthetic orphan is refunded by the sweep.
- A Pro test account holding purchased credits gets its allowance on top.

**Checkpoint 2b**
- Every item in the WS-D acceptance list (§5, end of D8), on a Shahbaz-owned test account with a real card.
```bash
curl -s -H "x-api-key: $FREE_KEY" "https://citation.today/api/ids?ids=10.1038/nature12373"
```
Expect 402 `subscription_required`.
- The day after the first metered calls, the Stripe Dashboard shows meter usage on the test customer and an upcoming invoice at $0.0025 per unit.

**Checkpoint 3**
```bash
curl -si https://citation.today/.well-known/oauth-protected-resource
```
Expect JSON.
```bash
curl -si -X POST https://citation.today/api/mcp -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```
Expect 401 with `WWW-Authenticate`.
- Add `https://citation.today/api/mcp` as a custom connector in Claude.ai. Expected sequence:
  1. the OAuth consent screen appears;
  2. for an unsubscribed account, it offers "Subscribe — pay as you go";
  3. after subscribing, a search runs;
  4. the charge shows in the Developers panel usage table.

## 10. Effort

| Workstream | Tasks | Estimate |
|---|---|---|
| WS-A | A1–A7 | ~4.5 h |
| WS-B | B1–B9 (B10 is Shahbaz) | ~10 h |
| WS-C | C1 3 h · C2 2 h · C3 1.5 h · C4 1 h | ~7.5 h |
| WS-L | L1 0.5 · L2 1.5 · L3 3 · L5 0.3 · L7 0.7 | ~6 h |
| WS-D | D1 1 · D2 0.5 · D3 1 · D4 1.5 · D5 2.5 · D6 1.5 · D7 1.5 · D8 1 | ~10.5 h |
| **Total** | | **~38.5 h** across 4 deploy checkpoints |

## 11. Acceptance (sprint-level)

- An agent with a zero balance is told, by the tool result itself, where and how much to pay, on both transports. That covers `insufficient_credits`, `subscription_required`, `spend_cap_reached` and `payment_failed`.
- An agent can read its balance, plus its month-to-date metered usage and estimated bill, with only a key.
- A user can connect OpenCITE in Claude.ai with no key copy-paste (OAuth), and every remote call bills the same ledger as REST.
- Every credit mutation writes a `credit_events` row in the same transaction. Usage is exportable per key as CSV.
- **Machine billing:**
  - A machine user can subscribe to pay-as-you-go API access at **$2.50 per 1,000 calls** (`ids` $0.25/1k), billed monthly in arrears.
  - **No free API credits exist for anyone on the free plan.**
  - Ledger usage and Stripe meter totals reconcile within one day.
- L1–L3 are closed. L4 is closed by L1. L5 and L7 are fixed. L8 is provisioned.
- `node mcp/scripts/sync-contract.mjs --check` passes. `node scripts/wiki/build-machine-map.mjs --check` passes after the wiki and findings fragments are updated (edit `_fragments`, never generated files). `docs/wiki/05-Billing/Billing-Credits.md` is updated for the `api` plan, the free-tier removal and the D-10 pack credits.
- Working tree only until Shahbaz says commit. Commits go to `main` via Bash `git commit -F`. Each checkpoint is verified against live prod.

## 12. Shahbaz-only actions

1. Confirm D-1 to D-15.
2. Set `CRON_SECRET` in Vercel prod (Checkpoint 2a).
3. **Stripe (Checkpoint 2b):**
   - Create (or approve Claude creating) the Billing Meter, Product and metered Price (D2).
   - Ask Stripe about metered prices and `billing_thresholds` under Managed Payments, and about sub-minimum invoices (D-13, D-14).
   - Add the `api` price to the Customer Portal configuration.
   - Set `STRIPE_PRICE_API_METERED` / `STRIPE_API_METER_EVENT` in Vercel.
4. Approve the prod migration, the L2 backfill and the D-11 free-balance zeroing (after a fresh JSON backup).
5. Review and approve the terms and refunds copy for postpaid billing (D8).
6. Provision Upstash KV (Checkpoint 3).
7. `npm publish` `opencite-mcp@0.48.0` (2FA).
8. Pick the MCP Registry namespace and publish.
9. Create the reviewer test account. With no free tier, give it an `api` subscription or an admin-granted pack.
10. Submit to the Anthropic connector directory and ChatGPT.

## 13. Actuals (filled at close)

_(to be completed at sprint close)_
