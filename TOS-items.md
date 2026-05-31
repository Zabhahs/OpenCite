# OpenCITE — TOS / Customer-Awareness Items

> **Dumping ground for everything a customer (or our own Terms of Service / API docs)
> must disclose.** Not legal copy — a running engineering+product ledger of claims we
> make, caveats we owe customers, and upstream obligations we inherit. Counsel turns
> this into final ToS / API-docs language later.
>
> **Add freely.** Each entry: what it is · why it matters · where it surfaces (ToS,
> API docs, response field, dashboard) · status.
>
> Created: 2026-05-30 · Companion to `sprint_log_v0_30.md` (coverage model, origin-blind contract).

---

## Legend
- **Status:** `live` (true in shipped product) · `planned` (committed in a sprint) · `deferred` (future wave) · `draft` (proposed, unconfirmed).
- **Surface:** where the customer encounters it — ToS, API docs, a response field, the billing/dashboard UI.

---

## A. Coverage, attrition & honest reporting

| # | Item | Why it matters | Surface | Status |
|---|---|---|---|---|
| A1 | **Coverage is reported conservatively and never overstated.** We compute corpus-weighted coverage, bucket it into bands, and **round in the customer's favor** (report the band's *floor* coverage). We never claim more completeness than we delivered. | Trust; avoids a false-completeness claim we can't stand behind. | API docs, ToS | planned (WS0) |
| A2 | **You are never billed for the unavailable portion of the library.** Per-query charge is prorated by coverage (`creditCost × coverageMultiplier`). If sources covering part of the eligible corpus are unreachable, you pay proportionally less. | Fair-billing promise; core monetization fairness claim. | API docs, billing UI, `creditsCharged` field | planned (WS3) |
| A3 | **Coverage is aggregate and corpus-weighted — not a per-query relevance score.** A band reflects what fraction of the *eligible corpus* responded, weighted by source size. A small but topically perfect source being unavailable may **not** move the band, even though that specific answer is weaker. Coverage ≠ "we found everything relevant." | Sets correct expectations; pre-empts "you said near-full but missed the key source" disputes. (Maps to sprint risk **R20**.) | API docs, ToS | planned (WS0) |
| A4 | **Coverage is expressed in coarse bands, not exact numbers.** We deliberately do not return a precise percentage, source counts, or which sources were unavailable. Bands are intentionally coarse. | Honesty about granularity **and** protects origin-blindness (anti-fingerprint, sprint risk **R19**). | API docs | planned (WS0) |
| A5 | **Below a minimum coverage threshold, a query may be served free (zero credits).** If coverage falls under our configured floor (~50%), we may return results at no charge rather than bill for a half-blind answer. | Fairness; also signals we'd rather not sell a degraded result. | API docs, billing UI | planned (WS3, configurable) |
| A6 | **Results may be partial.** Upstream sources can be temporarily unavailable, rate-limited, or slow; a response may omit content that a fully-available run would include. The `coverage` band signals this. | Standard availability caveat; the band is the customer's signal. | API docs, ToS, `coverage` field | planned (WS0) |

## B. Origin-blindness & data provenance

| # | Item | Why it matters | Surface | Status |
|---|---|---|---|---|
| B1 | **Source/origin names are not exposed.** Results are returned as unified, deduped cards. We intentionally do not reveal which upstream database any individual result came from, nor the set of sources queried. The product is "one verifiable call across many sources," not a source directory. | Core product promise + protects our aggregation IP. | API docs, ToS | planned (WS0) |
| B2 | **Results are aggregated from open-access / openly-available scholarly sources.** We don't sell the underlying data (it's open); we sell the unified, deduped, ranked, citation-ready call. | Clarifies what's being paid for; supports the "we don't resell data" stance. | API docs, ToS | planned |
| B3 | **Verifiable provenance is preserved per result.** Each card retains `doi`, `url`, `journal`, `publisher`, `authors`, and citations so the customer can independently verify the item — even though the *aggregator origin* is hidden. | Distinguishes "origin-blind" (which DB) from "unverifiable" (we still give DOIs/URLs). | API docs | planned (WS0) |
| B4 | **Result IDs are opaque and deterministic.** The `id` is an anonymized hash (`oc_…`), stable across calls for the same item, and does not encode the source. | Prevents source inference via IDs (sprint risk **R3**). | API docs | planned (WS0) |
| B5 | **Ranking is by relevance/quality signals, not source reputation labels.** We use BM25F + thin-source priors; the customer does not see source-reputation weighting. | Sets expectation that ranking is intrinsic, not a source allowlist (sprint risk **R18**). | API docs | planned |

## C. Billing, credits & accounts

| # | Item | Why it matters | Surface | Status |
|---|---|---|---|---|
| C1 | **Prepaid credit model.** Customers buy credits; each billable query decrements `total_credits`. Credits are a durable balance; rate limits are a separate, ephemeral burst control. | Explains the two distinct limits a customer can hit (402 vs 429). | API docs, billing UI | planned (WS3) |
| C2 | **Pre-authorize then settle.** We reserve the base cost before fan-out and settle to the coverage-prorated amount after, refunding the difference. Briefly, an in-flight query reserves the full base cost. | Explains why balance may dip then recover within a request. | API docs | planned (WS3) |
| C3 | **Plans gate which sources are searched.** Free tier queries a core set; paid plans query the full server-safe set. Plan/tier is server-authoritative — it cannot be changed client-side. | Sets free-vs-paid expectation; security posture. | API docs, billing UI | planned (WS3) |
| C4 | **Billing is tied to your OpenCITE (Google SSO) account.** Credits, keys, and Stripe customer link all hang off one identity. API keys are minted by a signed-in human and consumed by agents. | Account model clarity; one identity root. | ToS, billing UI | planned (WS3) |
| C5 | **API keys: store/transport responsibility.** We store only a hash; the plaintext key is shown once. Customer is responsible for keeping it secret; usage on a key is billed to the owning account. Revocation is available. | Standard API-key liability allocation. | ToS, dashboard | planned (WS3) |
| C6 | **Free-tier = 20 searches / month (recurring, decided).** Not a one-time seed: signed-in free users get **20 searches per calendar month** (1 search = 1 credit), applied idempotently via `credits_period` (YYYY-MM). Student verification does **not** raise the free allowance — it only unlocks the $5 Student plan (500/mo). Paid tiers: Student 500/mo, Pro 1,000/mo. The `@default(10)` balance is a cold-start seed only; unused credits do **not** roll over. | Sets the exact free-tier promise; avoids implying unlimited, a bigger free student tier, or rollover. | API docs, billing UI, ToS | planned (decision locked; grant code live, search-spend pending) |
| C7 | **Caching may serve a recent identical query.** Repeat queries within a TTL window may be served from cache; charge-on-hit applies (you still receive a result). | Explains identical-payload + still-charged behavior (WS5). | API docs | deferred (WS5) |
| C8 | **Payment is processed by Stripe (web/desktop) or the platform app store (mobile).** On web and desktop, subscriptions and all API/credit-pack purchases go through **Stripe**; we store only a Stripe customer/subscription reference, never card data. On **iOS/Android**, subscriptions are purchased through **Apple App Store / Google Play in-app purchase** per their policies — billing, receipts, and cancellation for those follow the store's terms. | Required app-store disclosure; clarifies who the merchant of record is per platform; sets cancellation/refund channel expectations. | ToS, billing UI | planned (Stripe rail live; IAP rail UI shows store routing, store integration pending) |
| C9 | **Subscriptions auto-renew until canceled; packs are one-time.** Subscription plans (Student, Pro) renew each period and grant that period's credit allowance on each successful renewal invoice; cancellation stops future renewals (handled via Stripe `customer.subscription.updated/deleted` → plan reverts to free). One-time **credit packs** are a single charge with no recurring billing. | Standard recurring-billing disclosure; explains the renewal grant and what canceling does. | ToS, billing UI | planned (webhook handling live; search-spend pending) |
| C10 | **Student plan requires eligibility verification.** The discounted Student tier is gated: checkout is refused (`needs_student_verification`) until the account is verified. Verification will be handled by a third-party (e.g. SheerID/VerifyPass); we intend **not** to store identity documents ourselves. | Sets expectation that Student isn't self-serve; flags third-party data flow for privacy disclosure. | ToS, billing UI | planned (gate live; verification provider not yet integrated) |

## D. Upstream / third-party obligations we inherit (Wave 3+ — DEFERRED)

> These bite when we add key-gated and Edge-ported sources (sprint §9). Capture now so
> nothing ships before the matching customer disclosure / internal control exists.

| # | Item | Why it matters | Surface | Status |
|---|---|---|---|---|
| D1 | **Commercial / redistribution restrictions on some upstreams.** Several Wave-3 key-gated sources (e.g. CORE, and museum/aggregator APIs) carry ToS limits on commercial use or redistribution. Reselling/redistributing their content may be restricted even though our calls are origin-blind. | We must not monetize content we're not licensed to redistribute. Per-source go/no-go required before inclusion. | internal control → ToS | deferred (Wave 3) |
| D2 | **Shared rate-limit buckets on project-level keys.** Wave-3 keys are project-level (env), so all customers share one upstream quota per source. One customer's volume can degrade coverage for others (shows up as a coverage band drop, not an error). | Explains why a paid customer might see reduced coverage with no fault of their own; capacity-planning obligation. | API docs (coverage caveat), internal | deferred (Wave 3) |
| D3 | **Attribution / polite-pool requirements.** NCBI E-utilities and Crossref expect a `mailto`/identifying User-Agent ("polite pool"); some sources require attribution. We must comply at the request layer and honor any attribution terms. | Compliance to keep keyless access; avoid being blocked (sprint risk **R7**). | internal control | planned (request headers) / deferred (attribution display) |
| D4 | **Geo-blocked / fragile sources excluded.** Some sources (e.g. BDH, MEXICANA) are geo-restricted or unstable and are intentionally not included. Their absence is reflected (minimally) in corpus weighting, not surfaced as an error. | Manages "why isn't X here" and sets reliability expectations. | API docs | deferred |
| D5 | **Per-source ToS/quota checklist is a release gate.** No new upstream ships into the billable set until its license, quota, attribution, and redistribution terms are reviewed and recorded here. | Process control so D1–D4 can't be skipped. | internal control | planned (process) |
| D6 | **CC0-metadata sources are origin-blind-safe; attribution-required sources are not — this is the inclusion filter.** A source whose ToS mandates *visible* attribution (logo, "powered by", a credit snippet) cannot be served through an origin-blind card without breaching either the upstream ToS or invariant **B1**. CC0 / public-domain-metadata sources carry no such requirement and are compatible. Apply this test before any key-gated source enters the billable set. | Resolves a structural conflict between origin-blindness (B1) and upstream attribution clauses; turns "review ToS" into a yes/no gate. | internal control → governs which sources reach API docs/ToS | planned (Wave 3 gate) |
| D7 | **CORE requires a license + mandatory attribution → currently incompatible with the origin-blind paid product.** CORE permits commercial use only under a license (free-license *eligibility is assessed*, and they ask to be contacted when a product "relates to functionality provided by CORE's existing services" — i.e. search/aggregation, which is exactly OpenCITE). It also mandates attribution (logo + snippet), which collides with D6/B1. **Do not ship CORE into the billable set on the free key.** **DECIDED 2026-05-31:** CORE stays a **human-user, web/app-only** source — it remains in the browser adapter registry with a **per-user `coreKey`** (the human supplies their own key in settings), and is **excluded from `capability.serverSafe`, the public `/api/search`, and the MCP tool**. No project key fronts commercial fan-out, so no licensing duty and no attribution conflict is triggered. Revisit a CORE license only if we ever want it server-side. | Avoids both the redistribution/competing-service and attribution conflicts by keeping CORE off the monetized server path entirely. | internal control + adapter `serverSafe:false` | decided 2026-05-31 (web/app human-only; excluded from API/MCP) |
| D8 | **NDLI is non-commercial and individual-use-only → excluded from the billable product entirely.** NDLI ToS: contents "cannot be used for any commercial purpose," and access credentials are for an individual, "not for multiple users in a network." A project-level/shared key is therefore not even permitted, independent of the commercial ban. **DECIDED 2026-05-31:** same posture as CORE — NDLI stays a **human-user, web/app-only** source (per-user `ndliKey`, browser registry), **excluded from `serverSafe`/`/api/search`/MCP**. Individual-use credentials are honored because each human uses their own key; the commercial server path never touches it. | Hard go/no-go for the *server* product; the individual-credential model is satisfied by per-user keys in the app. | internal control + adapter `serverSafe:false` | decided 2026-05-31 (web/app human-only; excluded from API/MCP) |

### D — Wave-3 free-key candidates: per-source findings (researched 2026-05-31)

> Concrete results of the per-source review demanded by **D5**. Verdicts feed the **D6** filter.
> Confidence: terms read from official pages/search; exact rate-limit numbers flagged *unverified* —
> confirm against each provider's live dashboard before relying on capacity.

| Source | Key model (project-level?) | Metadata license | Commercial resale | Attribution required | Origin-blind compatible (D6) | Verdict |
|---|---|---|---|---|---|---|
| **Smithsonian** (`smithsonianKey`) | api.data.gov key, email signup — application-scoped, shareable as a project key | **CC0 1.0** (metadata + designated assets) | ✅ explicit, no fee/permission | ❌ none | ✅ yes | 🟢 **GREEN** — best candidate. Caveat: third-party rights (trademark/publicity) in *depicted content* are the user's responsibility, but we surface metadata + links only. api.data.gov default ~1,000 req/hr *(unverified — confirm)*. |
| **DPLA** (`dplaKey`) | Key issued to an **email** (POST request) — bind to a role address, not personal | **CC0** (metadata) | ✅ explicit; "anyone to harvest and re-use without asking permission" | ❌ none (community convention keeps it) | ✅ yes | 🟢 **GREEN.** CC0 covers *metadata only*, not the underlying resource — fine, we return metadata + provenance links. DPLA "won't rate-limit in general" but reserves revocation for abuse. |
| **Europeana** (`europeanaKey`) | **Real "Project API key" tier** (production / at-scale, ≥1 solution) vs Personal (1/user, non-prod). Since 2025-05-28, registered in the Europeana account. | **CC0** (metadata) | ✅ allowed | ❌ none on metadata | ✅ yes | 🟢 **GREEN** — and the model directly satisfies the "project not personal key" requirement. Register a **Project** key + accept API ToS. Keys are confidential, not to be shared with third parties (we don't — it's our server key). Item *content* URLs carry per-object `edm:rights` (not CC0) — we don't redistribute content, only metadata + link. Read methods advertised free/un-throttled *(verify at scale)*. |
| **CORE** (`coreKey`) | Institutional-email key; **license required** | License-gated | ⚠️ commercial only under license; free-license eligibility **assessed** | ✅ **mandatory** (logo + snippet) | ❌ **conflict** (D6/B1) | 🟡 **AMBER → blocked.** See **D7**. Needs an explicit origin-blind-resale license from CORE, or exclude. |
| **NDLI** (`ndliKey`) | **Individual credentials, no network/multi-user** → project key not permitted | content rights stay with holder | ❌ **non-commercial only** | n/a | ❌ | 🔴 **RED → excluded.** See **D8**. |

**Net for Wave 3 billable set:** ship **Smithsonian, DPLA, Europeana** (all CC0, all origin-blind-safe, all project-keyable). **Hold CORE** pending a license. **Drop NDLI** from the monetized product. The `settings.x || process.env.X` fallback + `serverSafe` flip applies to the three GREEN sources only.

## E. General / standard

| # | Item | Why it matters | Surface | Status |
|---|---|---|---|---|
| E1 | **No warranty of completeness, accuracy, or fitness.** Results are aggregated from third-party open sources as-is; customer must verify before relying (provenance fields provided for this). | Standard liability limitation. | ToS | draft |
| E2 | **Availability / SLA position (TBD).** No uptime guarantee at launch; coverage bands communicate per-query degradation but are not an SLA. | Avoid implying an SLA we don't offer. | ToS | draft |
| E3 | **Acceptable use.** No attempts to reverse-engineer source origins, no scraping to rebuild a source directory, no circumventing rate limits or plan source-gating. | Protects origin-blindness + infra. | ToS | draft |

---

*Append new items at the bottom of the relevant section (or open a new section). Keep the
"why it matters" column — it's what tells counsel and future engineers whether the item
still applies. When an item ships, flip its status to `live` and note the surface where it
actually appears.*
