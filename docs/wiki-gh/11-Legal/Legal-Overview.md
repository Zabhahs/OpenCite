---
machine_ids: []
findings: []
runtime: infra
status: degraded
tags: [legal, tos, privacy, go-live, compliance]
---
<!-- AUTO-GENERATED from docs/wiki/11-Legal/Legal-Overview.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Legal & Go-Live Concerns

> **The spot for everything legal that must land before OpenCITE goes live as a paid hosted service.**
> Two distinct layers live here: (1) **OpenCITE's own user-facing agreements** — [Terms-of-Service](Terms-of-Service.md),
> privacy, acceptable use — and (2) the **upstream-source obligations** we inherit by meta-searching
> third-party open-access databases (tracked in `99-Archive/TOS-items.md`, the per-source ToS ledger).
>
> 🟡 **Status: not yet go-live ready.** The ToS is a **DRAFT pending counsel review** — see caveat in
> [Terms-of-Service](Terms-of-Service.md). Nothing in this section is legal advice.

## Why this section exists

OpenCITE is shifting from a personal/research project to a **commercial Hosted Service** (paid
`/api/search` grounding endpoint + subscription/PAYG credits — see [Billing-Credits](../05-Billing/Billing-Credits.md)).
That triggers three legal surfaces that don't exist for a hobby project:

1. **A contract with our users** — who may use the service, on what terms, what they can't do
   (circumvent rate limits, rebuild our corpus, resell access). This is the [Terms-of-Service](Terms-of-Service.md).
2. **A privacy posture** — we collect OAuth identity, store a credit ledger, and log queries. We owe
   users a Privacy Policy (and, depending on audience, GDPR/CCPA disclosures).
3. **Upstream compliance** — every result is third-party metadata. Our right to relay it (and the
   origin-blind framing) is governed by each source's terms, already catalogued in
   `99-Archive/TOS-items.md` (D1–D8 decisions).

## The license ↔ ToS relationship (important)

These are **two different documents** and must not be conflated:

| Document | Governs | Audience | Source of truth |
|---|---|---|---|
| [`LICENSE`](../../../LICENSE) — *OpenCITE Source-Available License v1.0* | the **source code** (use, study, modify, redistribute; **no** hosted service, **no** commercial use, **no** rate-limit circumvention) | developers who obtain the code | repo root `LICENSE` |
| [Terms-of-Service](Terms-of-Service.md) — *OpenCITE Terms of Service* | the **live hosted service** at `citation.today` / `opencite.space` (accounts, credits, acceptable use, liability) | end users & API customers | this section |

The ToS is **drafted to be consistent with the LICENSE** — same operator (Shahbaz Yusuf as sole
authorized Hosted Service operator), same anti-circumvention stance on rate limits, same no-warranty
and Delaware governing-law posture, same contact address. When either document changes, **re-check the
other** against the alignment table in [Terms-of-Service](Terms-of-Service.md#alignment-with-the-source-available-license).

## Go-live legal checklist

| # | Item | Status | Owner | Notes |
|---|---|---|---|---|
| L1 | **End-user Terms of Service** | 🟡 draft | Shahbaz | [Terms-of-Service](Terms-of-Service.md) — needs counsel review before publish |
| L2 | **Privacy Policy** | 🔴 not started | Shahbaz | Discloses OAuth identity, credit ledger, query logging; GDPR/CCPA if EU/CA users |
| L3 | **Acceptable Use Policy** | 🟡 folded into ToS §6 | Shahbaz | Could split out if it grows; covers no-scraping-to-rebuild-corpus, no automated circumvention |
| L4 | **Upstream-source ToS compliance** | 🟢 tracked | Shahbaz | `99-Archive/TOS-items.md` D1–D8; CORE/NDLI held web/app-only (D7/D8) |
| L5 | **Credit / refund policy** | 🟡 in ToS §5 | Shahbaz | Prepaid entitlements, non-refundable stance — confirm against Stripe + consumer law |
| L6 | **Cookie / consent banner** | 🔴 not started | Shahbaz | Only if analytics/tracking cookies are added; auth session cookie is strictly-necessary |
| L7 | **DMCA / takedown contact** | 🔴 not started | Shahbaz | We relay third-party metadata; need a notice-and-takedown path |
| L8 | **Display name / linking to ToS+Privacy** | 🔴 not started | Shahbaz | Footer links + signup-time acceptance checkbox |

Promote items off `99-Archive/TOS-items.md` into wiki notes here as they become live obligations
rather than planning decisions.

## See also

- [Terms-of-Service](Terms-of-Service.md) — the draft end-user agreement
- [Billing-Credits](../05-Billing/Billing-Credits.md) — what the credit/rate-limit clauses describe
- [Search-Endpoint](../04-Backend-API/Search-Endpoint.md) — the origin-blind contract the ToS must not overclaim
- `99-Archive/TOS-items.md` — upstream per-source ToS ledger (D1–D8)
- [`LICENSE`](../../../LICENSE) — the source-available code license
