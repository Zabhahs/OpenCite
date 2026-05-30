# Adapter ↔ Rank System — Sprint Plan

Goal: make every adapter interface optimally with the unified-view rank system
(`src/lib/scoring.js` BM25F + `src/hooks/useSemanticRerank.js` RRF), driven by a
machine-readable capability descriptor rather than hard-coded per-adapter logic.

Status: **Sprint 1 ✅ implemented (capability descriptors on all adapters).
Sprint 2 ✅ implemented (capability-aware rank: citedBy gating + thin-source prior).
Sprint 3 ✅ implemented (Crossref citedBy, NCBI abstract via efetch, Northwestern subjects;
Princeton DPUL/Thaqalayn/OpenContext-subjects left as not-fixable — no source field).**
Companion reference: `docs/adapter-api-capabilities.md` (verified capability + rank-fitness data).

---

## Why this matters (problem statement)

The unified view pools results from all ~27 adapters into one list and ranks them with a
single BM25F pass over `title` (×3), `keywords`+`subjects` (×2), `abstract` (×1), plus a
small `citedBy` tiebreak. Consequences observed during the review:

1. **Field-poor sources are structurally buried.** Adapters that emit only a title (Met,
   BnF, Wikidata, Gallica) can never earn abstract/keyword/proximity score, so they sink
   beneath abstract-rich articles regardless of true relevance.
2. **Fixable gaps leak signal.** Crossref drops the citation count it already receives;
   NCBI ships empty abstracts; several aggregators drop subject terms the API returns.
3. **Pagination/`hasMore` logic is hand-rolled per adapter**, with no shared notion of
   deep-paging caps or total counts.

A capability descriptor on each adapter object becomes the single source of truth that the
ranker, registry, and UI read — turning today's implicit, per-file behaviour into explicit,
testable data.

---

## Sprint 1 — Machine-readable capability descriptor (SSOT)

**Objective:** Add a `capability` block to every adapter object. Data only; zero behaviour
change. This unblocks Sprints 2–3.

**Descriptor shape (strawman):**
```js
capability: {
  protocol:   "rest-json",  // rest-json | sru | sparql | oai-pmh | graphql | elasticsearch | blacklight | mediawiki
  fulltext:   false,        // searches content body, not just metadata
  pagination: "offset",     // page | offset | cursor | token | none
  totalCount: true,
  maxWindow:  10000,        // deep-paging cap, or null
  auth:       "none",       // none | key | polite
  rankFields: { abstract: "full", subjects: "full", citedBy: false }, // full | sparse | none
}
```

**Execution steps:**
1. Define the descriptor `@typedef` + allowed enums in `src/adapters/_shared/base.js`
   (alongside the `UnifiedResult` typedef). Optionally extend `validateNCR` with a
   dev-only `validateCapability()`.
2. Populate `capability` on all 27 registered adapters (and the deregistered
   SemanticScholar for completeness), using the verified table in
   `docs/adapter-api-capabilities.md` as the protocol/pagination/auth source.
3. **Validation gate (cross-check vs code — per user decision):** for each adapter,
   reconcile `rankFields` against what the adapter source *actually emits today* (grep of
   `abstract:`/`keywords:`/`subjects:`/`citedBy:` already captured in the rank-fitness
   table). The descriptor must describe current reality, not aspiration. Server-proxy
   adapters (bdh, gallica, mexicana, opencontext, bl) are cross-checked against their
   `api/search/*.js` mappers, not the thin client shim.

**Code-verified `rankFields` per adapter** (✅ reconciled against actual emitted source —
this is what now ships in each `capability` block):

| Adapter | abstract | subjects | citedBy |
|---|---|---|---|
| OpenAlex, CuratedJournals | full | full | true |
| Internet Archive | full | full | true (downloads, not citations) |
| DOAJ | full | full | false |
| SciELO | full | full | false |
| Mexicana | full | full | false |
| Europeana, DPLA | full | full | false |
| Crossref | sparse | sparse | **true** (Sprint 3: is-referenced-by-count mapped) |
| NCBI | **full** (Sprint 3: efetch AbstractText) | full (MeSH) | false |
| BnF | **none** (no UNIMARC abstract) | full (600/606/607) | false |
| Smithsonian, Gallica, ONB, BDH, British Library, LC Datasets, Wikidata, Chronicling America | sparse | full | false |
| ENA | full | sparse (taxonomy/category) | false |
| Northwestern | full | **full** (Sprint 3: subject+genre facets) | false |
| Princeton DPUL | sparse | **none today** | false |
| Thaqalayn | full (hadith body) | **none** (no subject concept) | false |
| OpenContext | sparse (Context/Type labels) | **none today** | false |
| Met, Rijksmuseum, PANGAEA, OpenNeuro | sparse | sparse | false |

> **Cross-check correction (vs. the original draft):** the audit showed the subject signal is
> *already mapped* by most aggregators — Europeana (`dcSubject`), DPLA (`sourceResource.subject`),
> Smithsonian (`indexedStructured.topic/type/culture`), Chronicling America & LC Datasets (LoC
> `subject`), Wikidata (`P921`), Mexicana/BDH/BnF/BL/ONB (DC/UNIMARC subject). The genuine
> **`subjects: none`** set is only **Northwestern, Princeton DPUL, OpenContext, Thaqalayn**. This
> materially shrinks Sprint 3's subject-mapping work (see revised item 3 below).

**Files touched:** `src/adapters/_shared/base.js` (typedef) + every file under
`src/adapters/core/` and `src/adapters/extensions/`.

**Acceptance criteria:**
- Every registered adapter has a `capability` block.
- `rankFields` values match actual emitted fields (cross-checked).
- No runtime/behaviour change; existing search output byte-identical.

**Risk:** low. Additive data. Main cost is the per-adapter cross-check (27 files).

---

## Sprint 2 — Wire descriptor into the rank system

**Objective:** Use `capability.rankFields` so the unified pool ranks heterogeneous sources
fairly, without burying field-poor primary sources.

**Execution steps:**
1. **Citation tiebreak gating** — in `scoring.js`, only apply the `citedBy` bonus for
   sources where `rankFields.citedBy === true` (avoids penalising sources that simply
   can't report citations, and prevents IA download-counts from masquerading as citations
   unless we choose to allow it).
2. **Source prior / score floor for thin sources** — give tier-C sources a small
   normalization so a strong title-only match isn't dominated purely by document length.
   **DECISION (implemented): option (c), a bounded additive prior gated on a *complete*
   title match.** A source is "thin" when `rankFields.abstract ∈ {none, sparse}` AND
   `rankFields.subjects ∈ {none, sparse}` (broadened from the original `subjects === "none"`
   so non-topical-label sources like Met/Rijksmuseum/PANGAEA/OpenNeuro/OpenContext/Princeton
   DPUL qualify — they can't earn topical keyword score either). `THIN_SOURCE_PRIOR = 0.4`
   is added only when every meaningful query word is in the title (or a query phrase matches
   verbatim), and only to already-relevant results (`score > 0`). Bounded like the citation
   tiebreak so it nudges ordering without dominating relevance.
3. Thread the adapter's `capability` to the scorer via a new optional 3rd arg
   `scoreResults(results, terms, getCapability)`. `useSearch` passes
   `() => adapter.capability` (homogeneous per-adapter batch); `api/search.js` pools all
   adapters and passes `(r) => capBySource[r.source]`. `useSemanticRerank` needs **no
   change** — it ranks by the existing `_score`, which now already encodes both tiebreaks.

**Files touched:** `src/lib/scoring.js`, `src/hooks/useSearch.js` (both search + loadMore),
`api/search.js` (pooled lookup).

**Acceptance criteria:**
- Citation tiebreak fires only for citedBy-capable sources.
- A title-exact primary-source hit ranks above an abstract-rich but loosely-relevant
  article in a manual spot-check set.
- No regression in the existing "drop zero-score" gating.

**Risk:** medium — ranking changes are user-visible. Mitigate with before/after spot-checks
on a fixed query set; keep priors small and bounded.

---

## Sprint 3 — Tier-B field fixes (recover dropped signal)

**Objective:** Close the fixable gaps so B-tier adapters emit the fields the rank system
needs. Each is independent and individually shippable.

**Execution steps (each item = 1 PR-sized change):**
1. **Crossref `citedBy`** ✅ — maps `it["is-referenced-by-count"]` → `citedBy`
   (numeric guard → `null` when absent). Flipped `rankFields.citedBy` to true.
   (`src/adapters/core/crossref.js`)
2. **NCBI abstract via efetch** ✅ — added a parallel
   `efetch.fcgi?db=pubmed&id=…&rettype=abstract&retmode=xml` call alongside esummary.
   Local `parsePubmedAbstracts(xml)` helper concatenates `<AbstractText>` segments per PMID
   (Label-tagged sections joined); `decodeEntities` handles numeric/basic XML entities that
   `stripHtml` leaves intact. efetch is enrichment — failure degrades to empty abstract, never
   throws. One extra request per page (parallel, so no added latency). Flipped abstract → full.
   (`src/adapters/extensions/ncbi.js`)
3. **Subject-term mapping (REVISED after cross-check)** — most aggregators *already* emit
   `subjects` (Europeana, DPLA, Smithsonian, Chronicling America, LC Datasets, Wikidata,
   BDH, BnF, BL, ONB, Mexicana), so no work was needed there. The genuine gaps:
   - Northwestern ✅ → maps DC `subject[]` + `genre[]` label objects + free `keywords[]`
     into `subjects`/`keywords`; flipped subjects → full (`northwestern.js`)
   - Princeton DPUL — **not fixable**: live `catalog.json` exposes only
     `readonly_*` collection/creator/publisher/format facets, no subject/genre field.
     Left `subjects: "none"` (no fabrication). (`princetonDpul.js` unchanged)
   - OpenContext — left as Context/Type labels only (`subjects: "none"`); the `uri-meta`
     response carries no clean topical category term. Deferred.
   - Thaqalayn — no subject concept in the hadith API; skipped.
4. Descriptors updated in lock-step with each fix so the capability block stays the SSOT.

**Acceptance criteria:**
- Crossref results carry `citedBy`; NCBI results carry non-empty `abstract`.
- Named aggregators emit `subjects`; descriptors updated to match.
- Each change verified against a live sample response (field present in API payload).

**Risk:** low–medium. NCBI efetch adds latency/quota cost — the only item needing a
throughput decision (page-1-only vs always).

---

## Backlog — structural / fragility (out of rank scope, tracked for later)

Not required for rank fitness, but surfaced by the review:
- **Mexicana** OAI-PMH cannot keyword-search — decide drop vs replace.
- **Rijksmuseum** / **British Library** on legacy/at-risk endpoints — plan migration
  (Rijksmuseum keyless cursor API; BL "Share Family").
- **PANGAEA** raw undocumented Elasticsearch endpoint — move to supported OAI/REST path.
- **Met** / **NCBI** two-step fetch cost — batch detail calls.
- **LoC pair** 100k cap + 429/CAPTCHA — defensive paging guard (could ride on
  `capability.maxWindow` from Sprint 1).

---

## Sequencing & sign-off

```
Sprint 1 (descriptors, cross-checked)  ──►  Sprint 2 (rank wiring)
                       └─────────────────►  Sprint 3 (field fixes, updates descriptors)
```

Sprint 1 must land first (it's the SSOT). Sprints 2 and 3 can proceed in parallel after
that; Sprint 3 feeds corrected `rankFields` back into Sprint 1's data.

**All three sprints implemented.** ✅
