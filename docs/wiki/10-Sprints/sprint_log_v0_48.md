# Sprint v0.48 — Verifiable Scholarly Evidence for Agents (adoption-first)

**Date authored:** 2026-10-17 · **Revision 2** (same day; revision 1 reworked for path-of-least-resistance adoption after Shahbaz's review) · **Baseline:** `main` @ `ca2e108` (== prod) · **Status:** PLANNED — AWAITING "GO" ON PHASE 1
**Supersedes:** the 2026-10-16 draft, archived at `docs/wiki/99-Archive/sprint_log_v0_48_draft1_superseded.md` (do not execute).

## 0. Directives of record (Shahbaz, 2026-10-16/17)

1. OpenCITE is sold to agents as **verifiable** scholarly evidence, not "trust us".
2. Machine users pay **half of Brave's price**: $2.50 per 1,000 search calls, postpaid, card at signup, monthly in arrears (Brave's model).
3. **Free-tier decision (2026-10-17, "a+b"):** Brave's model is copied faithfully, including its **included monthly credit** ($2.50/month = 1,000 calls, card on file); **plus** a **keyless trial on `verify_citations` only** (25 references/day). The earlier "no free tier at all" directive is withdrawn by this choice. No free *search* credits exist without a card.
4. Make the product **easy to adopt and natively discoverable by AI tools**; cut everything that doesn't serve first use.

## 1. The product

**One sentence:** *Before you cite it, check it.* An agent sends references or a query; OpenCITE returns real records with retraction status, origin and completeness, so the agent never outputs a fabricated or retracted citation.

**Five checkable guarantees on every answer** (published on `/docs/guarantees`):

| # | Guarantee | Fields | Built from |
|---|---|---|---|
| G1 | **Exists** | canonical ids (DOI / PMID / PMCID / OpenAlex) | existing adapters + `idResolve.js` + E2 |
| G2 | **Provenance** | `source`, `source_url`, `retrieved_at`, metadata licence | contract v2 `source` (`publicResult.js:34`) + E4 |
| G3 | **Completeness** | which sources answered / failed; never pay for a blind answer | coverage bands + prorated billing (`coverage.js:67-73`), exposed per source (E3) |
| G4 | **Integrity flags** | retracted / corrected / expression of concern (notice DOI + date), preprint vs article, OA status, DOAJ, indexing lists | Crossref `updated-by` (Retraction Watch) + OpenAlex (E1), **both verified live** (§2) |
| G5 | **Reproducible** | `requestId` on every answer, journaled server-side | M2 journal. (Signed receipts and snapshots moved to v0.49; see §7) |

**Non-goals (stated in the docs):** OpenCITE never judges whether findings are true, and never labels journals "predatory". Only sourced facts.

**What agents get, and what it costs** (one balance; details in M1):

| Tool / endpoint | Unit | Trial | Included with card (Brave model) |
|---|---|---|---|
| `verify_citations` (`POST /api/verify`) | 0.1 per reference ($0.25/1k) | **25 refs/day, no key** | from the $2.50 monthly credit |
| `search_papers` (`/api/search`) | 1 per call ($2.50/1k) | none | $2.50 monthly credit = 1,000 calls |
| `get_paper` (`/api/works`: metadata + ids + citation graph) | 1 per call, or 0.1 for an id-only lookup | none | same credit |

Balance, cost and remaining trial are in every response trailer. No separate balance tool.

## 2. Verified baseline (2026-10-16/17)

**Code and infra**
- Node functions **8 / 12** (Hobby cap): `auth/handler`, `checkout`, `citations`, `ids`, `search`, `search/[source]`, `stripe/webhook`, `user/[resource]`. Edge: `proxy`, `search/gallica`, `search/openedition`.
- Prod env has Stripe vars, `OPENALEX_API_KEY`, `NCBI_API_KEY`, `API_KEY_PEPPER`, `AUTH_SECRET`; **no KV** (limits are per-instance, `ratelimit.js:13-20`); **no `CRON_SECRET`**.
- The audit's "3 results per source" cap is **already fixed** (`search.js:295-296`).
- MCP is stdio-only (`mcp/src/server.js:87-95`); the client drops `code`/`upgrade_url` on errors (`mcp/src/client.js:68-71`, `99-101`); key holders have no balance endpoint (`handlers/credits.js:167-168`).
- Ledger = one column `users.total_credits` (`schema.prisma:32`); `api_usage` never written.
- Pricing leaks (fixed in M5): pack → permanent unlimited web (`plans.js:106-108`, `webhook.js:182`); cancel demotes pack buyers (`webhook.js:226`, `234`); `GREATEST` grant swallows the allowance (`billing.js:201-206`).
- v0.45: T3, T4 and the metered half of T7 are done; **T1 journal, T2 sweep, T5 outage billing** are adopted here unchanged.
- Root `package.json` has no MCP SDK and local `npm install` is forbidden → the remote MCP is hand-rolled JSON-RPC (`mcp/src/{schema,contract,client}.js` import no SDK). `mcp/src/apiContract.js` is generated (`mcp/scripts/sync-contract.mjs`); never hand-edit.

**Live data probe (DOI `10.1016/S0140-6736(97)11096-0`, retracted 2010):**
- OpenAlex `select=is_retracted,type,open_access,primary_location` → `is_retracted:true`, `oa_status:"closed"`, `source.is_in_doaj:false`, `source.listed_in:["medline",…]`.
- Crossref `/works/{doi}` → `updated-by: [{type:"correction", DOI:…(04)15715-2, source:"retraction-watch", 2004-03-06}, {type:"retraction", DOI:…(10)60175-4, source:"retraction-watch", 2010-02-06}]`.

**Client-side facts that shape adoption (official docs, 2026-10-17):**
- **MCP spec 2026-07-28:** Dynamic Client Registration is **deprecated**; servers SHOULD support **Client ID Metadata Documents** and advertise `"client_id_metadata_document_supported": true` in AS metadata. Client priority: pre-registered → CIMD → DCR → ask the user.
- **Claude.ai custom connectors:** available on **Free** (1 connector), Pro, Max, Team, Enterprise. Default OAuth client = **"Use Claude's published identity"** (CIMD); "Register automatically" (DCR) and "own client" are alternatives. **Claude connects from Anthropic's cloud**, so our server sees Anthropic's IPs, not the user's. No prefilled install link is documented.
- **Claude Code:** `claude mcp add --transport http <name> <url>`; `/mcp` or `claude mcp login <name>` runs OAuth; **CIMD is supported and auto-discovered**.
- **VS Code:** `code --add-mcp '{"name":…,"type":"http","url":…}'`; config key `servers`. **Cursor:** `mcp.json` with `url` (+ `auth`); the deeplink docs page returned 404 → **"Add to Cursor" link format is unverified**, confirm at execution.
- ChatGPT requires Streamable HTTP and prefers CIMD (secondary source).

**Stripe (docs, 2026-10-16):** metered prices under Managed Payments = **undocumented** (probe P0-1); `billing_thresholds` can't be set at Checkout, only via `subscriptions.update`; invoices < $0.50 roll into the next invoice; meter `identifier` dedups for ≥24 h and `timestamp` may be ≤35 days old; a Managed Payments subscription authorizes **only** Managed Payments to charge the card.

**Brave benchmark** (pricing docs + trade press, Feb 2026; re-check before any public comparison): $5/1k search, **$5 monthly credit included** (reportedly attribution-conditional), card at signup, postpaid, 50 req/s, light endpoints $5/10k, enterprise by contact.

## 3. Decisions (confirmed unless marked OPEN)

| # | Decision | Resolution |
|---|---|---|
| D-1 | Evidence flags on every metered response | **On by default**, `evidence=0` opts out |
| D-2 | Verification price | **0.1 unit/reference** |
| D-3 | Retraction precedence | Crossref `updated-by` authoritative; OpenAlex `is_retracted` fallback; disagreement → `retracted` with both listed |
| D-4 | Trial (directive 3b) | **`verify_citations` only, 25 refs/UTC-day**, keyed `ip:<addr>` for keyless REST/stdio and `user:<id>` for OAuth-signed-in accounts without a card. Counters in **Postgres** (`trial_usage`), not KV. Trial responses carry full evidence. |
| D-5 | Included credit (directive 3a) | `api` plan `monthlyGrant: 1000` (= $2.50), delivered through the M3 allowance bucket, reset monthly, **no attribution condition** (simpler than Brave) |
| D-6 | API contract version | **2 → 3** (additive fields; the bump invalidates stale cache payloads because the version is in the cache key, `search.js:317`) |
| D-7 | OAuth client registration | **CIMD first** (advertise support; fetch + validate the client document), **DCR kept as fallback**, https/localhost redirects only |
| D-8 | Access token | **= an `oc_live_` key**, non-expiring, revocable, one per (user, client) |
| D-9 | Remote MCP without credential | 401 on every method → client starts OAuth (sign-in is free; no card needed for the verify trial) |
| D-10 | Tool set | **Three tools:** `verify_citations`, `search_papers`, `get_paper`. Descriptions say *when* to call |
| D-11 | Output size | **Compact by default** (title, authors ≤3 + "et al.", year, venue, doi, url, evidence, citation in the requested style); `detail=full` adds abstract, keywords, all authors |
| D-12 | Packs | Reprice to the metered rate ($10→4,000 · $50→20,000 · $150→60,000); API-credits only, never unlimited web |
| D-13 | Subscription allowance vs packs | Separate allowance bucket spent first; purchased credits never expire |
| D-14 | Removing free *search* credits | `FREE_MONTHLY_GRANT=0`; zero existing `plan='free'` balances once (≤13 users). The **web** cap (10/day) is unchanged |
| D-15 | Managed Payments on the metered plan | Use it **if P0-1 passes**; else Stripe Tax as merchant of record for that plan |
| D-16 | Function layout | **9 / 12:** `works/[op]` (citations \| ids \| verify \| get), `agent/[proto]` (mcp only in v0.48), `oauth/[step]` |
| D-17 | Throughput | 300/min per key (5 req/s), published; "contact us" above |
| D-18 | **Moved to v0.49** | A2A tasks + signed Agent Card (static card stays), snapshots, signed receipts (re-specified as **JWS over RFC 8785 canonical JSON**, not a custom scheme), x402 listing |
| D-19 | **OPEN** | Install-button link formats for Cursor / VS Code / Claude.ai (verify at execution; ship the CLI one-liners regardless) |

## 4. Architecture

**Layers.** Access (REST, stdio MCP, remote MCP `/mcp`, OAuth, discovery) → Evidence (`verify.js`, `evidence.js`, per-source status, licences) → Pipeline (existing) → Money (`plans.js`, 3-bucket `billing.js`, journal, Stripe meter).

**New single-responsibility modules (each the SSOT for its concern):**

| Module | Owns |
|---|---|
| `api/_shared/evidence.js` | batched G4 enrichment by DOI (OpenAlex filter + Crossref `updated-by`), 24 h per-DOI cache |
| `api/_shared/verify.js` | reference → candidates → match score → verdict |
| `api/_shared/trial.js` | trial identity, daily counter (Postgres), remaining, `trial` meta block |
| `api/_shared/compact.js` | compact vs full card projection (D-11), used by every endpoint |
| `api/_shared/licenses.js` | source → metadata licence from the adapter registry |
| `api/_shared/agentTools.js` | re-exports `mcp/src/tools.js`: the 3-tool registry + `toToolResult` |
| `api/_shared/invokeHandler.js` | in-process call of handlers (no self-HTTP: that would put every remote user behind Vercel's egress IP and the shared per-IP limiter at `ratelimit.js:33`) |
| `api/_shared/oauthConfig.js` | issuer, resource metadata, AS metadata incl. `client_id_metadata_document_supported`, `WWW-Authenticate` |
| `api/_shared/cimd.js` | fetch + validate a Client ID Metadata Document (https, path, `client_id` equals URL, required fields, redirect match), cached per HTTP headers |
| `api/_shared/apiKeys.js` | `mintApiKey` extracted from `keys.js:248-264` |

**Function map after:** `auth/handler`, `checkout`, `search`, `search/[source]`, `stripe/webhook`, `user/[resource]`, **`works/[op]`**, **`agent/[proto]`**, **`oauth/[step]`** = **9 / 12**.

**Response contract v3** (`X-OpenCITE-API-Version: 3`, compact card shown):

```json
{
  "query": "ancient DNA Anatolia", "coverage": "near-full", "count": 10,
  "results": [{
    "id": "oc_…", "doi": "10.…", "title": "…", "authors": ["A. Smith", "B. Jones", "et al."],
    "year": 2019, "venue": "Nature", "url": "https://doi.org/10.…",
    "source": "OPENALEX", "source_url": "https://openalex.org/W…",
    "evidence": { "status": "ok", "retraction": null, "work_type": "journal-article",
                  "oa_status": "gold", "in_doaj": true, "license": "cc-by" },
    "citation": "Smith, A., et al. (2019). … Nature. https://doi.org/10.…"
  }],
  "meta": { "requestId": "…", "creditsCharged": 0.99, "balance": 1840.5,
            "sources": [{ "source": "OPENALEX", "status": "ok", "returned": 10 },
                        { "source": "EUROPEPMC", "status": "timeout", "returned": 0 }],
            "retrieved_at": "2026-10-17T14:02:11Z" }
}
```

`evidence.status` ∈ `ok | retracted | corrected | expression_of_concern | unknown` — `unknown` is always explicit. Trial responses add `meta.trial: { remaining, resets_at, subscribe_url }`.

## 5. Tasks

### WS-E — Evidence (the product)

**E1 — `evidence.js` (G4).** After dedup, collect result DOIs; OpenAlex `filter=doi:a|b|…` in batches of 25 with `select=doi,is_retracted,type,open_access,primary_location` (server key from `serverKeys.js`); Crossref `/works?filter=doi:a,doi:b&select=DOI,updated-by&mailto=…` (**P0-3 confirms** multi-DOI filter + `select=updated-by`; fallback = per-DOI `/works/{doi}` for OpenAlex-flagged DOIs only). Merge per D-3; `work_type` from OpenAlex `type` / Crossref type; `oa_status`, `in_doaj`, `indexed_in`, `license` from OpenAlex. Cache per DOI 24 h via `cache.js`. **Failure-isolated**: lookup failures → `status:"unknown"` + an `EVIDENCE_*` row in `meta.sources`; never a failed call, never a coverage-band drop. Applied to search, works and verify. Cost ≈ 1 OpenAlex list call per 25 results.

**E2 — `verify.js` + `POST /api/verify` (G1, headline).** Input `{ refs:[ "doi" | "PMID:…" | "free text" ], style?: "apa"|"mla"|"bibtex"|… }`, ≤50 refs/call (GET `?refs=a|b` also accepted). Per ref: `detectIdType`/`normalizeId` (`idResolve.js:77-82`); PMID/PMCID → DOI via `resolveIds`; id → canonical record (OpenAlex, then Crossref `/works/{doi}`), compare supplied text; free text → Crossref `query.bibliographic` rows=3 + OpenAlex `search=` fallback. Score = title token-set ratio (diacritic-folded) + first-author surname + year ±1 + venue; constants in one SSOT block. Verdicts: `verified` · **`mismatch`** (real DOI, wrong paper → `mismatched_fields[]` + canonical values) · `not_found` · `ambiguous` (top 3 returned). Attach E1 evidence + corrected citation via `citations.js` `exportAs`. Billing: 0.1 unit/ref via `charge`; all-legs-failed → band `limited` → free (v0.45 T5 policy). Output `{ results[], summary:{verified,mismatch,not_found,ambiguous,retracted}, meta }`.

**E3 — Per-source completeness (G3).** Search: publish `{source, status: ok|empty|failed|timeout|circuit_open|ineligible, returned}` from the telemetry already collected (`search.js:343-372`); no latencies/URLs (`publicResult.js:9` rule). Works/verify: **v0.45 T5 verbatim** (leg health → band: all failed `limited`/free, partial `high`, none `full`) + `meta.sources`.

**E4 — Licence clarity (G2).** `metadataLicense` + `licenseUrl` on each adapter `capability` block, **transcribed from `docs/wiki/99-Archive/TOS-items.md` and the capability dossiers** (else `"unknown"`); `licenses.js` → `meta.licenses`; per-work `evidence.license` from OpenAlex; generated `/docs/licensing` table.

**E5 — Compact output (D-11).** `compact.js` projects the public card; `detail=full` restores today's full card. Citation style per request (`style=`), one string per result instead of the mla+apa pair, cutting payload ~60%.

### WS-A — Access (path of least resistance)

**A1 — Three-tool registry: `mcp/src/tools.js`** (re-exported as `agentTools.js`). Each tool: `{ name, title, description, inputSchema(), endpoint, toRequest(args), annotations:{readOnlyHint:true, openWorldHint:true} }`. Descriptions are the discovery mechanism — e.g. `verify_citations`: *"Use before outputting any reference list or citation. Returns, per reference, whether it exists, is retracted or corrected, and the corrected citation."* `get_paper` folds in id resolution (`ids`) and the citation graph (`citations`, via `direction`). `toToolResult` is the **single** shaper for stdio and remote: block 1 = payload (compact JSON or citation text), block 2 = trailer *"charged 0.4 · balance 1,840 · trial 21 left"*, `structuredContent` = `meta`; errors → structured `code` with `subscribe_url` / `retry_after` / `portal_url`. `client.js` → `httpExecutor` (returns `{status, headers, body|text}`, never throws on non-2xx; TLS/no-key-leak checks stay). Version read from `package.json` (not `server.js:31`); README states the trial + key; bump **0.48.0**; `sync-contract.mjs --check`.

**A2 — Remote MCP: `api/agent/[proto].js` (`mcp`).** POST only, one JSON-RPC message, JSON responses, no SSE; `initialize` negotiates against an SSOT version list (**P0-4 confirms the current revision**); `notifications/*` 202; `ping`, `tools/list`, `tools/call`. Auth every method: `meter.authAndLimit` with Bearer (A4); 401 → `WWW-Authenticate: Bearer resource_metadata="https://citation.today/.well-known/oauth-protected-resource"`. Never reads cookies. Trial: a signed-in OAuth key with no entitlement **can call `verify_citations` within the D-4 trial**; other tools → 402 `subscription_required`. Calls run in-process via `invokeHandler`, forwarding key + real `x-forwarded-for`. **Public URL `https://citation.today/mcp`** (rewrite → `/api/agent/mcp`).

**A3 — OAuth 2.1 AS: `api/oauth/[step].js`.** `metadata` (RFC 8414, with `client_id_metadata_document_supported:true`, `registration_endpoint` for DCR fallback, `code_challenge_methods_supported:["S256"]`, `token_endpoint_auth_methods_supported:["none"]`), `resource` (RFC 9728), `register` (DCR fallback, D-7), `authorize` GET/POST, `token`, `revoke`. **CIMD path:** `client_id` that is an https URL with a path → `cimd.js` fetches, validates `client_id` equality, required fields and redirect match, caches per headers; consent page shows `client_name` + redirect host + *"calls bill your OpenCITE account at $2.50 per 1,000 — verify is free up to 25/day"*. No session → `/api/auth/signin?callbackUrl=<this URL>` (**verify live** that Auth.js preserves the query; fallback = signed short-lived cookie). `token` mints via `mintApiKey(userId,{label:client_name, oauthClientId})`, revoking the previous key for that client; returns `{access_token, token_type:"Bearer", scope:"opencite"}`. Rewrites for `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource[/mcp]`; add `\.well-known/` to the SPA catch-all exclusion (`vercel.json:327`). Schema: `oauth_clients` (DCR only), `oauth_codes`, `api_keys.label`, `api_keys.oauth_client_id`. IP pre-auth window on every step.

**A4 — Bearer + key-auth balance + unified errors.** `presentedKey` (`apiAuth.js:46-49`) accepts `Authorization: Bearer oc_live_…`; CORS allows `Authorization`. `handlers/credits.js` resolves a key before the session (`{credits, allowance, purchased, tier, metered, trial}`; per-key limited; unmetered). `meter.js` is the single builder for 401 `unauthorized`, 402 `insufficient_credits | subscription_required | spend_cap_reached | payment_failed | trial_exhausted`, 429 — used by search, works, agent, credits (replaces `search.js:194`, `meter.js:49`).

**A5 — Consolidation: `api/works/[op].js`.** Move `api/citations.js`, `api/ids.js` verbatim to `api/_shared/handlers/works/`, add `verify.js` and `get.js` (metadata by id = ids + optional graph). Rewrites keep `/api/citations`, `/api/ids`; add `/api/verify`, `/api/works`. Published MCP 0.46 keeps working.

**A6 — One-click install surfaces (D-19).** Docs "Connect" page with: Claude.ai steps (Customize → Connectors → Add custom connector → `https://citation.today/mcp`, OAuth default); **`claude mcp add --transport http opencite https://citation.today/mcp`**; **`code --add-mcp '{"name":"opencite","type":"http","url":"https://citation.today/mcp"}'`**; Cursor `mcp.json` snippet; ChatGPT connector steps; and "Add to Cursor / VS Code" buttons **only if the deeplink formats are confirmed at execution**. Static `.well-known/agent-card.json` (A2A card pointing at docs; no A2A endpoint yet).

**A7 — Claude Code plugin + skill.** `plugins/opencite/` in the repo: `.mcp.json` (remote URL) + skill `cite-check` (*"when writing or editing any reference list, call `verify_citations` and replace mismatched/retracted entries"*). Documented install: `claude plugin add <repo-path or marketplace>` — **confirm the current plugin install syntax at execution**. The ARS plugin's citation-check command is the model.

**A8 — Discovery.** `public/llms.txt` (guarantees, non-goals, endpoints, `/mcp`, trial, pricing, 402 codes); `apiContract.js` gains citations/ids/verify/works/credits schemas, `public/openapi.json` regenerated from `openApiSpec()`; `/docs/{guarantees,verify,connect,licensing,pricing}` (pricing generated from `plans.js`); `mcp/server.json` for the MCP Registry. Directory submissions are Shahbaz-only (§12).

### WS-M — Money

**M1 — Plans SSOT.** `ENDPOINT_UNITS = { search:1, works:1, ids:0.1, verify:0.1 }`; `unitCost(plan, endpoint, qty)` replaces every `identity.plan.creditCost` (`search.js:150,334,425,434,438`; `meter.js:66`). New plan `api`: `{tier:"all", monthlyGrant:1000 /*D-5*/, creditCost:1, rateLimit:{60s,300}, subscription:true, postpaid:true, priceEnv:"STRIPE_PRICE_API_METERED", unitPriceUsd:0.0025}`. Packs per D-12. `hasUnlimitedWebSearch = !!((p.subscription && !p.postpaid) || p.internal)`. `FREE_MONTHLY_GRANT = 0`, delete dead lazy-grant calls (`apiAuth.js:100-102`, `credits.js:179-181`), `total_credits @default(0)`, one-off zeroing SQL (approved). `TRIAL = { endpoint:"verify", refsPerDay:25 }` (SSOT for D-4). Copy in `pricing.js`, `Panels.jsx:288-289`, `Layout.jsx:137`: *"API & agents: $2.50 per 1,000 calls · $2.50/month included · verify 25/day free, no account"*.

**M2 — Journal + daily sweep.** v0.45 T1 verbatim + `key_id`, `bucket`, `endpoint`; `requestId` minted once per request, returned as `X-OpenCITE-Request-Id`; grant statement → `RETURNING` CTE. Cron `billing-sweep` on `user/[resource]` (`CRON_SECRET`): v0.45 T2 reconcile → M4 meter report → prune (journal 12 mo, `trial_usage` 7 d). Crons total 2.

**M3 — Three-bucket pre-authorization (D-13).** Columns `allowance_credits`, `subscription_status`, `metered_period`, `metered_usage`, `metered_unreported`, `metered_cap_usd` (default 25). `preAuthorize` = one guarded SQL statement: allowance → purchased → metered remainder (only if `postpaid` and `active` and under cap). `settle`/`refund` reverse in order; `clawbackCredits` purchased-only; `applyMonthlyGrant` **resets** the allowance once per period; `applyUpgradeGrant` `GREATEST` on the allowance. Branch-first concurrency probes.

**M4 — Stripe metered subscription.** Objects (sandbox first via P0-1, then live with approval): meter `opencite_api_units`, product (tax code `txcd_10701400`), monthly metered price `unit_amount_decimal:"0.25"`; env `STRIPE_PRICE_API_METERED`, `STRIPE_API_METER_EVENT`. Checkout `{plan:"api"}` → subscription mode, metered item **without quantity**, `billing_mode:"flexible"`, postpaid consent `custom_text`, Managed Payments per D-15, one subscription per user (`checkout.js:121-124`). Webhook: `completed` → `plan:"api"`, `active`, allowance = 1000 (D-5), then `subscriptions.update billing_thresholds amount_gte 5000` if P0-2 passes; `subscription.updated` persists status (postpaid serves only while `active`); `payment_failed` → `past_due` (metered stops; purchased still spends); `invoice.paid` → `active` + monthly allowance reset; deleted → `downgradePlanFor` (M5). Meter report in the sweep: `floor(metered_unreported)` units, `identifier:\`${userId}:${day}\``, `timestamp` = end of usage day, decrement after success, journal `report`.

**M5 — Spend controls, usage, leaks, hygiene.** `PATCH /api/credits` cap ($5–$1,000); `GET /api/usage` (session or key; `group=day|key|endpoint`, `format=json|csv`); Developers panel: balance split, MTD units + estimated bill, cap, usage CSV, Customer Portal, connected apps + revoke, "Connect" snippets. Leak L2: `users.pack_purchased_at` + `downgradePlanFor` at `webhook.js:226,234` + Stripe backfill (approved). IP pre-auth limiter on `user/[resource]` + `checkout.js`. Stale copy (`Layout.jsx:137`, `schema.prisma:36`, `server.js:13`), `.env.example` (+`CRON_SECRET`, Stripe metered vars). Legal: postpaid terms, trial terms, attestation scope — **Shahbaz reviews**.

**M6 — Trial (`trial.js`, D-4).** Table `trial_usage(identity text, day date, refs int, PRIMARY KEY(identity, day))`. Identity = `user:<id>` when a key/session resolves to an account with no entitlement, else `ip:<x-forwarded-for first hop>`. `charge` path for verify: if no entitlement → atomic `INSERT … ON CONFLICT DO UPDATE SET refs = refs + N WHERE refs + N ≤ 25` (count-1 guard); over → 402 `trial_exhausted` with `subscribe_url`, `resets_at`. Anonymous `POST /api/verify` is allowed **only** on this path (every other endpoint stays 401). Abuse guard: the existing pre-auth IP window (`ANON_PLAN` 60/min) plus the daily cap; no KV dependency.

## 6. Collision map

| File | Order |
|---|---|
| `prisma/schema.prisma` + **one** migration `…_v0_48_evidence_metering` | A3 tables · M2 · M3 · M5 column · M6 table · `total_credits` default 0 — branch first, then prod; zeroing + L2 backfill are separate approved SQL |
| `api/_shared/billing.js` | M2 → M3 |
| `api/_shared/meter.js` | A4 → M1 → M2 → E3 → M6 |
| `api/search.js` | A4 → E1 → E3 → E5 → M1 → M2 → contract v3 |
| `api/_shared/handlers/works/*` | A5 → E2 → E1 → E3 → E5 → M1 → M6 |
| `api/stripe/webhook.js` | M2 → M5 (L2) → M3 → M4 |
| `api/_shared/apiAuth.js` | A4 → M1 |
| `api/_shared/handlers/credits.js` | A4 → M3 → M5 |
| `api/user/[resource].js` | M2 (`billing-sweep`) → M5 (`usage`) → A6 (`agent-card`) → M5 (limiter) |
| `vercel.json` | A5 rewrites → A2 `/mcp` → A3 well-known + regex → M2 cron |
| `api/_shared/plans.js` | M1 → M5 |
| `api/_shared/apiContract.js` (+ regenerated `mcp/src/apiContract.js`, `openapi.json`) | A8 → v3 |
| `mcp/src/*` | A1 → A8 |
| `src/adapters/**` | E4 only |
| `DevelopersPanel.jsx`, `Panels.jsx`, `pricing.js`, `Layout.jsx` | M1 → M5 |
| `public/docs/*`, `llms.txt`, `legal/*`, `plugins/opencite/*` | A6 → A7 → A8 → M5 |

## 7. Phases and the cut line

- **P0 — Probes (no code):** P0-1 Stripe sandbox (meter/price/MP checkout) · P0-2 sandbox `billing_thresholds` + min-collection script · P0-3 Crossref multi-DOI `select=updated-by` + EoC type name · P0-4 MCP revision; Cursor/VS Code/Claude install-link formats; `claude plugin` install syntax.
- **Phase 1 — Product (no schema, no Stripe):** A5 → A4 → E1 → E2 → E3 → E5 → A1 (stdio) → A8 (llms.txt, OpenAPI, docs) → contract v3. **Trial excluded** (needs the M6 table). Ships behind existing credits. **Checkpoint 1** → commit on Shahbaz's word → prod → verify (§9) → publish `opencite-mcp@0.48.0`.
- **Phase 2 — Money + trial:** migration → M2 → M3 → M1 → M6 → M4 → M5 → E4. Free search credits are removed **in the same deploy** that adds the metered plan and the verify trial. **Checkpoint 2** (needs `CRON_SECRET`, Stripe env, approvals).
- **Phase 3 — Agent access:** A3 (OAuth, CIMD) → A2 (remote MCP) → A6 → A7. **Checkpoint 3** (KV provisioned first) → directory submissions.
- **Moved to v0.49 (D-18):** A2A endpoint + signed card, snapshots, JWS receipts, x402, verification-accuracy harness.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Over-claiming trust | G1–G5 + non-goals published; `unknown` always explicit; legal copy reviewed |
| Verify false verdicts | SSOT thresholds; prefer `ambiguous` over `verified`; top-3 always returned; accuracy harness in v0.49 |
| Upstream limits (Crossref polite pool, shared OpenAlex key, NCBI) | batching, 24 h per-DOI cache, circuit breakers, failure-isolated evidence, free when all legs fail |
| Trial abuse | Postgres counter (durable, not per-instance), per-IP window, verify-only, 25/day; Claude.ai users are keyed per account not per Anthropic IP |
| Hot billing path (3 buckets) | one guarded statement, journaled, branch-first concurrency probes, refund-on-throw unchanged |
| Postpaid non-payment | card at Checkout, $25 default cap, $50 early invoice, stop on `past_due` |
| MP rejects metered (S1) | P0-1 decides before M4; fallback = no MP + Stripe Tax for `api` only |
| CIMD fetch SSRF / spoofing | https + path required, `client_id` equality, size/time caps on fetch, no private-range hosts, redirect-URI exact match, consent shows host |
| Remote MCP exposure without KV | KV before Checkpoint 3; IP windows on agent/oauth; 401 on every method |
| Spec churn | P0-4 records versions; SSOT lists; stateless JSON POST |
| Hobby caps | 9/12 functions, 2 crons |

## 9. Live verification (prod)

**Checkpoint 1**
```bash
curl -s -X POST https://citation.today/api/verify -H "x-api-key: $KEY" -H "content-type: application/json" -d '{"refs":["10.1016/S0140-6736(97)11096-0","Smith J. A study that does not exist. Nature. 2019;570:1-5."],"style":"apa"}'
```
Expect ref 1 `verified` + `evidence.status:"retracted"` (notice `…(10)60175-4`, 2010-02-06); ref 2 `not_found`/`ambiguous`, never `verified`.
```bash
curl -s -H "x-api-key: $KEY" "https://citation.today/api/search?q=ancient%20DNA%20Anatolia" -D -
```
Expect `X-OpenCITE-API-Version: 3`, compact cards, `evidence`, `meta.sources[]`. `/api/citations`, `/api/ids` still answer. Stdio MCP lists 3 tools, `verify_citations` first, trailer present.

**Checkpoint 2**
```bash
curl -s -X POST https://citation.today/api/verify -H "content-type: application/json" -d '{"refs":["10.1038/nature12373"]}'
```
Expect 200 with `meta.trial.remaining: 24`; the 26th ref that day → 402 `trial_exhausted`. A free key → 402 `subscription_required` on search. Shahbaz test account subscribes to `api` with a real card → allowance 1,000 appears; a search bills the allowance first; after 1,000 calls the `metered` bucket; sweep → Stripe meter units + upcoming invoice at $0.0025/unit; $5 cap → `spend_cap_reached`. `/api/usage?format=csv` reconciles. Web cap still applies to an `api` subscriber.

**Checkpoint 3**
```bash
curl -s https://citation.today/.well-known/oauth-authorization-server | grep client_id_metadata_document_supported
curl -si -X POST https://citation.today/mcp -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```
Expect `true`; expect 401 + `WWW-Authenticate`. Claude.ai custom connector at `https://citation.today/mcp` with the default "Claude's published identity": consent appears, `verify_citations` works on the trial with no card, search returns 402 with `subscribe_url`. `claude mcp add --transport http opencite https://citation.today/mcp` then `/mcp` login works. The `cite-check` skill triggers on a reference list.

## 10. Effort

| WS | Tasks | Est. |
|---|---|---|
| E | E1 3 · E2 4 · E3 1.5 · E4 1.5 · E5 1 | ~11 h |
| A | A1 2.5 · A2 4 · A3 6 (CIMD + DCR) · A4 1 · A5 1.5 · A6 1 · A7 1.5 · A8 2 | ~19.5 h |
| M | M1 1.5 · M2 4 · M3 3 · M4 4 · M5 3 · M6 1.5 | ~17 h |
| **Total** | | **~47.5 h** (Phase 1 alone ≈ 14 h) |

## 11. Acceptance

- An agent can check a bibliography with **no account** (25 refs/day) and get verdicts, retraction notices and corrected citations; with a card it gets 1,000 included calls/month and $2.50/1k beyond.
- Every metered 200 carries G2 provenance, G3 per-source status, G4 evidence (or explicit `unknown`), a `requestId`, and a compact card by default.
- Three tools, descriptions that say when to call, reachable via REST, stdio MCP 0.48.0, `https://citation.today/mcp` with CIMD-first OAuth, one-line installs for Claude Code / VS Code, a Claude Code plugin skill.
- Ledger and Stripe meter reconcile daily; leaks L1–L3 closed; 9/12 functions; `sync-contract --check` and `build-machine-map --check` pass; wiki `_fragments` updated (never generated files).
- Working tree only until Shahbaz says commit; `git commit -F` via Bash to `main`; every checkpoint verified against live prod.

## 12. Shahbaz-only actions

1. **"Go" on Phase 1** (no env or Stripe prerequisites).
2. Connect the **Stripe sandbox** (Managed Payments enabled inside it) for P0-1/P0-2.
3. Set `CRON_SECRET`, `STRIPE_PRICE_API_METERED`, `STRIPE_API_METER_EVENT`; approve live Stripe objects; add the `api` price to the Customer Portal config.
4. Approve the prod migration, free-balance zeroing, L2 backfill (after a JSON backup) and the legal copy.
5. Provision Upstash KV before Checkpoint 3.
6. `npm publish` `opencite-mcp@0.48.0`; MCP Registry namespace + publish.
7. Reviewer test account; submit to the Anthropic connector directory and ChatGPT apps.

## 13. Actuals

### Phase 1 — executed 2026-10-17 (working tree; NOT committed, NOT deployed — awaiting Shahbaz)

**Built (all parse-checked; MCP modules smoke-loaded in-process; machine-twin `--check` passes):**
- A5 `api/works/[op].js` dispatcher + `api/_shared/handlers/works/{citations,ids}.js` (moved with `git mv`), **9/12 functions**; `vercel.json` rewrites keep `/api/citations`, `/api/ids`, add `/api/verify`, `/api/works`.
- A4 Bearer alias in `apiAuth.presentedKey`; `handlers/credits.js` key path (per-key limited, unmetered); `meter.js` error builders (`unauthorized`, `insufficientCredits({balance, packs})`, `rateLimited`), `legBand`, `sourceRow`, `charge({endpoint, qty, band: fn})`, `meterMeta` (requestId + retrieved_at).
- **M1 units landed early** (small, SSOT): `plans.js ENDPOINT_UNITS` + `unitCost` (`search`/`citations`/`works` 1 · `ids`/`verify`/`works_meta` 0.1). The `api` plan / free-tier removal / packs repricing remain Phase 2.
- E1 `evidence.js` (Crossref `updated-by` + OpenAlex, batched 25/call, 24 h cache, failure-isolated). EoC spelled both ways upstream → normalised.
- E2 `verify.js` + `handlers/works/verify.js` (`POST|GET /api/verify`, ≤50 refs, 0.1/ref; verdicts verified/mismatch/not_found/ambiguous; corrected citation; candidates).
- E3 `sources[]` on search (timeout vs failed vs empty vs circuit_open) and on works/verify via leg health; **v0.45 T5 executed**: `citationGraph.js` (+`getWork`, `ids` on the seed select, 404 ≠ failure) and `idResolve.js` tally `opts.health`.
- E5 `compact.js` (`renderCard`, `cardOptsFrom`); contract **v3** (`apiContract.js`: `detail`/`style`/`evidence` params, `COMPACT_FIELDS`, `EVIDENCE_FIELDS`, `SOURCE_ROW_FIELDS`, `META_FIELDS`, `ENDPOINTS` registry). Cache key includes the card-shaping params; cached bodies carry `retrieved_at`, lifted into `meta` on a hit.
- New `GET /api/works?id=&include=` (`handlers/works/get.js`): any id → record + `ids {doi,pmid,pmcid,openalex}` + evidence + optional graph.
- A1 `mcp/src/tools.js` (3 tools, when-to-call descriptions, annotations, `toToolResult`), `client.js` → `httpExecutor`, registry-driven `server.js` (version from package.json), `schema.js` → OpenAPI over `ENDPOINTS`, `contract.js` mappings; `opencite-mcp` **0.48.0** (not published); `sync-contract --check`.
- A8 `public/llms.txt`, `public/docs/index.html` (guarantees, verify, works, pricing units, Claude Code one-liner), `public/openapi.json` **generated** by new `scripts/gen-openapi.mjs`, `mcp/README.md`. Cursor/VS Code buttons dropped per Shahbaz (2026-10-17).
- Wiki: fragment records for every new/moved module; `Shared-Modules.md` + `MCP-Server.md` v0.48 sections.

**Design deltas vs §5 (recorded, not re-planned):**
- `sources[]` is a **top-level** envelope field next to `coverage` (not `meta.sources`): it describes the search that produced the body, so it is cached with it. `/api/verify` reports its resolution legs as one `VERIFY_LOOKUPS` row.
- `source_url` per card was dropped from Phase 1 (only OpenAlex ids reconstruct cleanly); `url` + `source` + `meta.retrieved_at` carry G2.
- `get_paper` folds `ids` + `citations` as planned; the standalone REST endpoints remain for existing integrators.

**Not yet done / needs Shahbaz:** Checkpoint 1 commit + push (auto-deploys prod) → live verification (§9) → `npm publish opencite-mcp@0.48.0`. Phase 2/3 untouched.
