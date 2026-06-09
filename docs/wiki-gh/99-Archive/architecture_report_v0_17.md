<!-- AUTO-GENERATED from docs/wiki/99-Archive/architecture_report_v0_17.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->
# OpenCITE — Architecture Report
> **Canonical reference for the next Claude instance picking up this project.**
> Read this before touching any code. Contains full sprint history, schema, file map, roadmap, and execution checklists.
> Last updated: v0.17 — Adapter enrichment + book-chapter grouping + citation fixes

---

## Project overview

OpenCITE is a free meta-search engine for open-access scholarly databases. Searches multiple academic APIs in parallel, returns results with MLA 9 and APA 7 citations ready to paste. Deployed on Vercel.

**Author:** Shahbaz Yusuf (baazijan). Moves fast, expects precise execution. Mode C (plan + halt) before large tasks. Mode B (fast path) for small changes. Never pad responses.

**Long-term direction:** `citation.today` — monetised tiered platform with human (Stripe) and agent (Base L2) billing. Phase 1 complete. Phase 2 is next (see Phase roadmap).

---

## File structure (v0.17)

```
opencite/
├── api/
│   ├── _shared/
│   │   ├── prisma.js
│   │   └── auth.js
│   ├── proxy.js
│   ├── history.js
│   ├── library.js
│   ├── settings.js
│   ├── search/
│   │   ├── bdpi.js
│   │   ├── gallica.js
│   │   └── opencontext.js
│   └── auth/
│       └── handler.js
│
├── prisma/
│   └── schema.prisma
│
├── vercel.json
│
├── src/
│   ├── App.jsx
│   ├── adapters/
│   │   ├── _shared/
│   │   │   ├── base.js                       ← [MODIFIED v0.17] +editors, +keywords, +subjects, +language, +citedBy
│   │   │   ├── normalize.js                  ← [MODIFIED v0.17] +_editorsParsed, expanded TYPE_MAP
│   │   │   ├── parseOpenAlex.js              ← [MODIFIED v0.17] +keywords, +citedBy, +language
│   │   │   └── proxy.js
│   │   ├── core/
│   │   │   ├── doaj.js                       ← [MODIFIED v0.17] +keywords, +subjects, +language
│   │   │   ├── openalex.js
│   │   │   ├── crossref.js                   ← [MODIFIED v0.17] +type passthrough, +editors, +subjects, +language
│   │   │   └── curatedJournals.js            ← inherits parseOpenAlex changes
│   │   ├── extensions/
│   │   │   ├── semanticScholar.js            ← [MODIFIED v0.17] +type via S2_TYPE_MAP, +citedBy, +subjects
│   │   │   └── index.js
│   │   └── index.js
│   ├── components/
│   │   ├── EagleTooltip.jsx
│   │   ├── Layout.jsx
│   │   ├── LauncherBlock.jsx
│   │   ├── Panels.jsx
│   │   ├── ResultCard.jsx                    ← [MODIFIED v0.17] chapter awareness, editors, enrichment badges
│   │   ├── SearchInput.jsx
│   │   └── SourceSection.jsx                 ← [MODIFIED v0.17] groupByParentWork() for book chapters
│   ├── constants/
│   │   ├── app.js                            ← [MODIFIED v0.17] APP_VERSION = "v.17"
│   │   ├── defaults.js
│   │   ├── themes.js
│   │   └── vocabulary.js
│   ├── contexts/
│   │   ├── AuthContext.jsx
│   │   ├── BillingContext.jsx
│   │   └── SettingsContext.jsx
│   ├── hooks/
│   │   ├── useEagleTooltip.js
│   │   ├── useHistory.js
│   │   ├── useLibrary.js
│   │   ├── useSearch.js
│   │   ├── useSettings.js
│   │   └── useTheme.js
│   ├── launchers/
│   │   ├── _factory.js
│   │   └── index.js
│   ├── lib/
│   │   ├── auth-client.js
│   │   ├── citations.js                      ← [MODIFIED v0.17] book-chapter MLA/APA, editors in CSL/BibTeX/RIS
│   │   ├── helpers.js
│   │   ├── history.js
│   │   ├── library.js
│   │   └── storage.js
│   ├── input.css
│   └── main.jsx
```

---

## UnifiedResult schema (v0.17)

```js
// Required
title:      string
id:         string
source:     string

// Standard metadata
authors:    string[]
year:       string
journal:    string      // container-title (journal name OR book title for chapters)
publisher:  string
volume:     string
issue:      string
pages:      string
doi:        string
url:        string
abstract:   string
isOA:       boolean
type:       string      // upstream type string — normalized to _type by pipeline

// Optional enrichment (v0.17) — adapters may omit any of these
editors:    string[]    // book/collection editors
keywords:   string[]    // author-assigned keywords
subjects:   string[]    // controlled vocabulary terms (MeSH, LCSH, fieldsOfStudy, etc.)
language:   string      // ISO 639 language code
citedBy:    number|null // citation count (relevance signal)

// Preview
previewImage: string    // thumbnail URL (optional)
```

### NCR (Normalized Citation Record) — pipeline-internal

```js
_type:           string     // canonicalized via TYPE_MAP (article, book-chapter, dataset, etc.)
_authorsParsed:  Author[]   // { family, given } or { literal }
_editorsParsed:  Author[]   // same shape as _authorsParsed (v0.17)
_normalized:     boolean    // sentinel — idempotency guard
```

---

## Sprint history

### v0.17 — Adapter enrichment + book-chapter grouping + citation fixes (current)

**Root cause addressed:** type erasure + metadata blindness across 21 adapters.

Three systemic problems fixed:
1. **Type erasure** — 14/21 adapters hardcoded `type: "article"`. CrossRef's `book-chapter`, `monograph`, `proceedings-article` etc. were flattened. Fixed in crossref.js and semanticScholar.js with passthrough + type maps.
2. **Subject/keyword blindness** — 0/21 adapters extracted subject tags. Fixed in crossref, doaj, semanticScholar, parseOpenAlex.
3. **Relevance signals discarded** — citation counts, publication subtypes, AI summaries available but never fetched. Fixed in semanticScholar, parseOpenAlex.

| File | Change |
|------|--------|
| `src/adapters/_shared/base.js` | Added `editors`, `keywords`, `subjects`, `language`, `citedBy` to `sanitize()` guard. New `num()` helper. |
| `src/adapters/_shared/normalize.js` | Added `_editorsParsed`. Expanded `TYPE_MAP` with CrossRef-specific types. |
| `src/adapters/_shared/parseOpenAlex.js` | Added `keywords`, `citedBy`, `language`. |
| `src/adapters/core/crossref.js` | Type passthrough. Maps `editor[]`, `subject[]`, `language`. |
| `src/adapters/core/doaj.js` | Added `keywords`, `subjects`, `language`. |
| `src/adapters/extensions/semanticScholar.js` | Type passthrough via `S2_TYPE_MAP`. Added `fieldsOfStudy` → `subjects`, `citedBy`, `publicationTypes` to API fields param. |
| `src/components/SourceSection.jsx` | `groupByParentWork()` clusters book chapters by `container-title`. Parent book rendered as header; chapters nested. |
| `src/components/ResultCard.jsx` | Chapter awareness: "chapter" badge, "In: Book Title" subheader, editors row, enrichment badges (citation count, language, keywords/subjects capped at 3+2), `isChapterInGroup` prop. |
| `src/lib/citations.js` | Book-chapter MLA 9 + APA 7 formats. `editors` in CSL-JSON, BibTeX (`@incollection` + `booktitle`), RIS (`A2` + `T2`). `language` and `keywords` in all export formats. |
| `src/constants/app.js` | `APP_VERSION = "v.17"` |

**Design decisions:**
- Enrichment fields are optional — `sanitize()` defaults to `[]`/`""`/`null`. No adapter required to populate them.
- Grouping is keyed by `container-title`, not DOI prefix (DOI prefix matching is fragile).
- `isChapterInGroup` prevents redundant "In: Book Title" when already inside a parent book header.
- Enrichment badges capped at 3 keywords + 2 subjects. Full data preserved for export/filtering.
- BibTeX book-chapter uses `@incollection` — standard LaTeX type for chapters in edited collections.

---

### v0.16 — OAuth stack fix + auth SSOT refactor + sync fix + export UI

**Root cause addressed:** Auth was split across multiple files with no single source of truth, causing session sync issues and broken OAuth flows.

Key changes:
- `api/_shared/auth.js` established as auth SSOT. All auth logic consolidated here.
- `api/auth/handler.js` created as single OAuth callback/token exchange endpoint.
- `src/lib/auth-client.js` created as client-side auth SSOT.
- `src/contexts/AuthContext.jsx` refactored to consume `auth-client.js` only — no direct API calls.
- Session sync race condition fixed: auth state now propagates through context before any dependent hook fires.
- Export UI added — citations panel with MLA/APA/CSL-JSON/BibTeX/RIS tabs.
- `useLibrary` and `useHistory` hooks wired to Prisma-backed `/api/library.js` and `/api/history.js` endpoints.
- `prisma/schema.prisma` finalized: `User`, `Search`, `SavedResult` models.
- Google-only OAuth at launch. `AuthProvider` must be outermost wrapper.

---

## Adapter enrichment backlog (sprints not yet executed)

These adapters still hardcode type and/or lack subject metadata. Listed in priority order:

| Adapter | Available upstream fields | Priority |
|---------|--------------------------|----------|
| NCBI/PubMed | `pubtype[]`, MeSH terms (requires efetch call change) | **High** — biomedical researchers need study type filters |
| Europeana | `it.type` (IMAGE/TEXT/VIDEO/SOUND/3D), `dcSubject[]`, `dcLanguage[]` | Medium |
| DPLA | `src.type`, `src.subject[].name`, `src.language[].name` | Medium |
| Internet Archive | `d.mediatype` (already fetched, not mapped), `subject` field available | Medium — easy fix |
| The Met | `classification`, `culture`, `period`, `tags[].term` | Low |
| Smithsonian | `idx.topic[]`, `idx.culture[]`, `idx.place[]` | Low |
| Gallica (server) | `dc:type`, `dc:subject`, `dc:language` | Low |
| Others | See adapter_audit_report.md | Low |

---

## Adding a new adapter — checklist

1. Create adapter file in `src/adapters/extensions/` (or `core/` if always-on)
2. Map upstream `type` field — do NOT hardcode. If upstream has no type, use a reasonable default.
3. Map enrichment fields where available: `editors`, `keywords`, `subjects`, `language`, `citedBy`
4. Register in `src/adapters/index.js` ADAPTERS array
5. If CORS-blocked: add domain to `api/proxy.js` ALLOWED_DOMAINS + use `proxiedFetch()`
6. If server-side normalization needed: create `api/search/<name>.js` edge route
7. Test: confirm results appear, citations render, book chapters group correctly

No changes needed to `base.js`, `normalize.js`, `citations.js`, or UI components.
The pipeline handles everything via `sanitize()` → `normalizeRecord()` → `groupByParentWork()`.

---

## Roadmap

### Phase 1 — Complete ✓

Core meta-search engine. Multi-source parallel search. MLA 9 + APA 7 citations. Vercel deployment. Google OAuth. Prisma-backed history + library. Export UI (CSL-JSON, BibTeX, RIS). Book-chapter grouping. Adapter enrichment (keywords, subjects, citedBy, language, type passthrough).

---

### Phase 2 — Search quality + UX (current sprint queue)

#### Sprint C — Search quality (unblocked by v0.17)

**C1 — Cross-adapter DOI dedup**
- Move `dedupMap` creation from `runSearch()` to `useSearch.search()`
- Pass shared map through all parallel adapter calls
- Files: `src/hooks/useSearch.js`

**C2 — Client-side filters**
- Type dropdown, language dropdown, date range, sort-by-citations
- Filter on `sectionStates` in `useSearch`
- All data now available via v0.17 enrichment
- Files: `src/hooks/useSearch.js`, new `src/components/FilterBar.jsx`

**C3 — Multi-keyword parsing**
- `query.split(";")` → run per-keyword, merge per adapter
- With `keywords`/`subjects` populated, can score matches against structured metadata
- Files: `src/hooks/useSearch.js`

**C4 — Relevance scoring**
- Client-side composite score = f(citedBy, keyword overlap, title match)
- No AI needed — structured metadata from v0.17 provides all inputs
- OpenAlex topics: add `w.topics[]` (with pre-computed relevance scores) to `parseOpenAlex`; feed into scorer
- Files: `src/adapters/_shared/parseOpenAlex.js`, new `src/lib/relevance.js`

---

#### Sprint D — UX improvements

**D1 — Article title opens DOI link**
- In `ResultCard.jsx`: wrap the article title/heading `<h3>` (or equivalent) in an `<a>` tag
- `href`: use `doi` field first (`https://doi.org/${result.doi}`), fall back to `result.url`
- `target="_blank" rel="noopener noreferrer"`
- Only render as link if `doi` or `url` is present; otherwise render as plain text (no broken link)
- Files: `src/components/ResultCard.jsx`

**D2 — Suggested search on low-relevance results**
- After search completes, evaluate result set for semantic relevance (heuristic: if top N results have low `citedBy`, mismatched types, or no keyword overlap with query)
- If relevance is low, show an inline suggestion UI above or below results
- Flavor text: _"Not finding what you need? Try refining your search or browse related terms:"_
- Suggest 2–4 alternative queries (generate from query tokenization + subjects returned)
- Files: `src/hooks/useSearch.js` (add `suggestedSearches` to returned state), `src/components/ResultCard.jsx` or new `src/components/SearchSuggestions.jsx`

**D3 — External launcher prompt on empty/weak results**
- In `LauncherBlock.jsx` (or wherever launchers are rendered): add flavor text above the launchers row
- Text: _"Couldn't find what you're looking for? Try external launchers with your search prefilled!"_
- Launchers should already have the current query prefilled (verify `_factory.js` passes query through)
- Show this flavor text only when: results are empty, or a "low relevance" signal from D2 fires
- Files: `src/components/LauncherBlock.jsx`, `src/launchers/_factory.js`

---

#### Sprint E — Adapter enrichment backlog (priority order)

**E1 — NCBI/PubMed enrichment** (High priority)
- Add `pubtype[]` → `subjects` mapping
- MeSH terms require a separate `efetch` call — plan: after initial search, batch-fetch MeSH for returned PMIDs
- Files: relevant PubMed adapter file

**E2 — Internet Archive type + subject passthrough** (Medium — easy)
- `d.mediatype` is already fetched, just not mapped → map to `type`
- `subject` field available → map to `subjects`
- Files: IA adapter

**E3 — Europeana + DPLA type/subject passthrough** (Medium)
- Europeana: `it.type` → `type`, `dcSubject[]` → `subjects`, `dcLanguage[]` → `language`
- DPLA: `src.type` → `type`, `src.subject[].name` → `subjects`, `src.language[].name` → `language`
- Files: Europeana adapter, DPLA adapter

**E4 — Met + Smithsonian classification metadata** (Low)
- Met: `classification`, `culture`, `period`, `tags[].term` → `subjects`
- Smithsonian: `idx.topic[]`, `idx.culture[]`, `idx.place[]` → `subjects`
- Files: Met adapter, Smithsonian adapter

**E5 — Gallica server-side type/subject/language** (Low)
- `dc:type` → `type`, `dc:subject` → `subjects`, `dc:language` → `language`
- Files: `api/search/gallica.js`

---

### Phase 3 — Monetisation + Agentic API (`citation.today`)

Begin `prisma migrate dev` workflow from this phase forward — schema was applied directly in Phase 1, no migration history exists.

---

#### Phase 3A — Human billing (Stripe)

- Mount `BillingProvider` in `App.jsx` (currently stub at `src/contexts/BillingContext.jsx`)
- Hook column: `users.stripe_customer_id` already in Prisma schema
- Create Stripe products:
  - Starter: $2.99/mo, 150 searches
  - Pro: $9.99/mo, 1000 searches
  - Enforce minimum $5.00 deposit to offset flat fees
- Stripe webhook → update `users.total_credits` in Supabase on `invoice.paid` + `checkout.session.completed`
  - Files: new `api/webhooks/stripe.js`
- Upgrade/downgrade UI in settings panel
- Stripe-hosted customer portal (billing management, cancellation)
  - Files: new `api/billing/portal.js`, update `src/components/Panels.jsx`
- Tiered rate limiting per plan — enforce in `middleware.ts` via Vercel KV credit check
  - Return structured `429` with `{ credits_remaining, plan, reset_at }` in body

**Exit criteria:** A user can subscribe, get credited, search, and manage billing without eng involvement.

---

#### Phase 3B — Agentic billing (Base L2)

Hook column: `users.agent_wallet_address` already in Prisma schema.

**Auth:**
- SIWE (Sign-In with Ethereum) session — hook point in `api/auth/handler.js` and `src/contexts/AuthContext.jsx`
- Agent identity confirmed via wallet signature; maps to same `internal_id` as human path
- No Google OAuth required for agent actors

**Payment flow:**
- Chainlink Price Feeds → compute per-search USD cost in ETH at request time
- Base L2 on-chain listener → detect incoming payment to OpenCITE treasury address → credit top-up for `agent_wallet_address`
  - Files: new `api/billing/agent-listener.js` (Vercel cron or webhook from on-chain indexer)
- Per-search micropayment deduction via same `runSearch()` middleware KV balance check
- Inject `X-Attribution-Required` header on all agent-authenticated responses

**Exit criteria:** An autonomous agent can sign in with a wallet, pay per search in ETH, and receive structured JSON results.

---

#### Phase 3C — RESTful API endpoint

Expose a stable, authenticated, rate-limited API so non-browser clients (agents, iOS/Android, third-party integrations) can consume OpenCITE search results.

**Endpoint:**
```
GET  /api/search?q=<query>&sources=<comma-list>&limit=<n>
```

**Auth:** Bearer token (API key) or SIWE session cookie. API keys issued per user/agent via dashboard.

**Response shape:**
```json
{
  "query": "string",
  "results": [ UnifiedResult ],
  "credits_remaining": number,
  "sources_queried": ["string"],
  "dedup_count": number
}
```

**Deliverables:**

| File | Description |
|------|-------------|
| `api/search/index.js` | Main authenticated search route. Calls `runSearch()` directly. Enforces credit deduction. Returns normalized JSON. |
| `api/keys/issue.js` | Issues API key for authenticated user/agent. Stores hashed key in `users` table (new `api_key_hash` column). |
| `api/keys/revoke.js` | Revokes API key. |
| `middleware.ts` | Extend to validate Bearer token on `/api/search` requests. |
| `prisma/schema.prisma` | Add `api_key_hash String? @unique` to `User` model. Migration required. |
| `src/components/Panels.jsx` | Add "API Access" tab to settings panel — shows key, copy button, revoke button. |
| `docs/openapi.yaml` | OpenAPI 3.1 spec. Covers `/api/search`, `/api/keys/issue`, `/api/keys/revoke`. Publish at `citation.today/docs`. |

**Rate limiting:** Same KV leaky-bucket as human path. Agent tier gets higher burst limit. API key requests tagged separately from browser session requests in telemetry.

**Adapters are pure JS modules** — `runSearch()` in `src/adapters/index.js` is already importable directly into any Node.js/Vercel context with no changes.

**Exit criteria:** A third-party client can issue an API key, call `/api/search`, and receive normalized `UnifiedResult[]` JSON with citation-ready metadata.

---

## Known issues / backlog

1. `adapters/extensions/index.js` — 16 extensions in one barrel. Split if count grows past ~20.
2. `components/Panels.jsx` and `components/Layout.jsx` — barrel files. Accepted tech debt.
3. No `prisma migrate` history — schema applied directly. Use `prisma migrate dev` from Phase 2.
4. `BillingProvider` not mounted in `App.jsx` (stub — add at Phase 2).
5. `AuthProvider` must be outermost wrapper.
6. Google-only OAuth at launch.
7. `eagleBounce` + `eagleEnter` keyframes in `App.jsx` `<style>` block — move to `input.css` when convenient.
8. Tier 2/3 extension adapters still hardcode type — see Sprint E backlog above.
