---
machine_ids: []
findings: []
runtime: infra
status: degraded
tags: [legal, tos, terms-of-service, draft, go-live]
---

# OpenCITE — Terms of Service (DRAFT)

> 🟡 **DRAFT — not yet in force. Requires review by qualified legal counsel before publication.**
> This note is an engineering working draft written to stay **consistent with the OpenCITE
> Source-Available License v1.0** ([`LICENSE`](../../../LICENSE)). It is **not legal advice**. Do not
> link it from the live site or present it to users until counsel has reviewed it and it is moved out of
> draft. See [[Legal-Overview]] for the go-live checklist.

**Operator:** Shahbaz Yusuf ("OpenCITE", "we", "us")
**Service:** the OpenCITE hosted meta-search and `/api/search` grounding endpoint at `citation.today`
and `opencite.space` (the "Service")
**Effective date:** _TBD (do not publish until set)_
**Contact:** shahbazyusuf@outlook.com

---

## 1. Acceptance

By creating an account, signing in, or otherwise using the Service, you agree to these Terms. If you do
not agree, do not use the Service. If you use the Service on behalf of an organization, you represent
that you have authority to bind that organization.

## 2. The Service

OpenCITE is a meta-search layer over third-party open-access scholarly and cultural-heritage databases.
We **do not own** the underlying records; we retrieve, deduplicate, rank, and relay metadata from
upstream sources. Results are provided **as-is** for discovery and citation purposes. The paid
`/api/search` grounding endpoint returns results **origin-blind** by design — it does not promise to
identify which upstream source any individual record came from.

We may add, change, degrade, or remove sources and features at any time. Source coverage is **aggregate
and best-effort**, not a guarantee that any particular database is queried for any particular request.

## 3. Accounts & eligibility

- Accounts are created via supported third-party sign-in (OAuth). You are responsible for activity under
  your account and for keeping your credentials secure.
- You must provide accurate information and may not impersonate others or create accounts by automated
  means.
- One person or entity may not maintain multiple accounts to expand free usage, evade limits, or
  circumvent the credit system (see §6).

## 4. Permitted use

Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable right to
access and use the Service for your own personal, academic, research, or internal-business purposes,
including grounding AI agents you operate, **within the limits of your plan and credit balance**
(see [[05-Billing/Billing-Credits]]).

This is a right to **use our hosted Service** only. It is **not** a license to the OpenCITE source code —
the source code is governed separately by the [Source-Available License](../../../LICENSE), which does
**not** permit you to operate your own hosted or commercial deployment.

## 5. Credits, billing & refunds

- The Service runs on **prepaid credits** — entitlements to make searches, not currency or a deposit.
  Subscriptions replenish a monthly allowance; PAYG packs add one-time credits. See
  [[05-Billing/Billing-Credits]].
- Charges are computed per request and may be prorated by source coverage. Admin and zero-cost plans may
  pass without charge.
- Payments are processed by our third-party payment processor (Stripe). You authorize the charges you
  initiate.
- **Credits are non-refundable** except where required by law, and may expire per your plan. We may
  change pricing and plan terms prospectively with notice.

## 6. Acceptable use & anti-circumvention

You agree **not** to:

1. **Circumvent rate limits or the credit system** — including creating multiple accounts, rotating or
   sharing credentials, scripting around quotas, or using automated means to exceed your enforced
   thresholds. *(This mirrors the anti-circumvention obligation in the_ [Source-Available License](../../../LICENSE) _§Restrictions 3.)*
2. **Rebuild or resell our corpus** — bulk-harvest, scrape, or systematically download results to
   reconstruct a competing index, dataset, or service, or to resell access to results.
3. **Operate a competing hosted service** from the Service or its output, or sublicense, rent, or
   white-label access, except under a separate written commercial agreement with us.
4. **Misuse upstream sources** — use the Service in any way that violates an upstream source's own terms.
   Some sources carry use restrictions we are obligated to pass through (see `99-Archive/TOS-items.md`).
5. **Attack or degrade the Service** — probe, overload, interfere with, or attempt to gain unauthorized
   access to the Service or other users' data.
6. **Strip attribution or misrepresent the Service** as your own.

We may throttle, suspend, or terminate accounts that breach this section.

## 7. Third-party content & intellectual property

- Result metadata originates from third-party sources and remains subject to their rights and terms. You
  are responsible for how you use retrieved records, including any required attribution to the original
  source or publisher.
- The OpenCITE name, brand, software, and the compiled/ranked presentation of results are owned by us and
  protected by the [Source-Available License](../../../LICENSE) and applicable law. These Terms grant you
  no rights in our software beyond using the hosted Service.

## 8. Disclaimer of warranties

THE SERVICE IS PROVIDED **"AS IS"** AND **"AS AVAILABLE"**, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTY
THAT RESULTS ARE COMPLETE, ACCURATE, CURRENT, OR UNINTERRUPTED. *(Consistent with the_ [LICENSE](../../../LICENSE) _§No Warranty.)*

## 9. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, OPENCITE AND ITS OPERATOR WILL NOT BE LIABLE FOR ANY INDIRECT,
INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF DATA, PROFITS, OR GOODWILL,
ARISING FROM OR RELATED TO THE SERVICE. OUR TOTAL AGGREGATE LIABILITY FOR ANY CLAIM IS LIMITED TO THE
AMOUNT YOU PAID US FOR THE SERVICE IN THE THREE (3) MONTHS PRECEDING THE CLAIM.

## 10. Suspension & termination

Your rights under these Terms terminate automatically if you breach them. We may suspend or terminate your
access at any time for breach, suspected abuse, or to comply with law. On termination you must stop using
the Service; unused credits may be forfeited as permitted by law. *(Mirrors the_ [LICENSE](../../../LICENSE) _§Termination.)*

## 11. Changes to these Terms

We may update these Terms. Material changes will be notified by reasonable means (e.g. site notice or
email). Continued use after changes take effect constitutes acceptance.

## 12. Governing law

These Terms are governed by the laws of the **State of Delaware, United States**, without regard to
conflict-of-law principles, and disputes are subject to the exclusive jurisdiction of the state and
federal courts located in Delaware. *(Same forum as the_ [LICENSE](../../../LICENSE) _§Governing Law.)*

## 13. Entire agreement; severability

These Terms, together with any plan-specific terms and our Privacy Policy, are the entire agreement
between you and us regarding the Service. If any provision is unenforceable, it will be limited to the
minimum extent necessary and the rest remains in effect.

**Commercial / out-of-scope use:** shahbazyusuf@outlook.com (same address as the
[LICENSE](../../../LICENSE) commercial-licensing contact).

---

## Alignment with the Source-Available License

This table is the **maintenance contract**: if you edit the [`LICENSE`](../../../LICENSE) or this ToS,
re-check every row. The two documents must not contradict each other.

| Concern | LICENSE (code) | This ToS (hosted service) | Aligned? |
|---|---|---|---|
| **Who may operate a hosted service** | Only the Licensor; others prohibited (§Restrictions 1) | We are the sole authorized operator; users get use-only rights (§4) | ✅ |
| **Commercial use by others** | Prohibited without written commercial license (§Restrictions 2) | No reselling / white-labeling without separate agreement (§6.3) | ✅ |
| **Rate-limit circumvention** | Prohibited; derivatives must keep ≥ limits (§Restrictions 3) | No circumventing credits/limits, no multi-account evasion (§6.1) | ✅ |
| **Attribution / misrepresentation** | Must retain notices, not claim as own (§Restrictions 4, §Attribution) | No stripping attribution / passing off (§6.6, §7) | ✅ |
| **Warranty** | As-is, no warranty (§No Warranty) | As-is / as-available, no warranty (§8) | ✅ |
| **Termination on breach** | Automatic on breach (§Termination) | Automatic on breach + suspension rights (§10) | ✅ |
| **Governing law** | Delaware, USA (§Governing Law) | Delaware, USA (§12) | ✅ |
| **Contact** | shahbazyusuf@outlook.com | shahbazyusuf@outlook.com (§13) | ✅ |

## See also

- [[Legal-Overview]] — go-live legal checklist (this note is item **L1**)
- [`LICENSE`](../../../LICENSE) — OpenCITE Source-Available License v1.0
- [[05-Billing/Billing-Credits]] — credit/rate-limit mechanics the ToS describes
- `99-Archive/TOS-items.md` — upstream per-source obligations we pass through
