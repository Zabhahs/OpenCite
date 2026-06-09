# OpenCITE — Sprint Log v0.43

> **PM + architecture document for the next Claude instance(s).** Self-contained execution
> plan for **Capability Raid: citation graph + identifier resolution** — two net-new
> enrichment capabilities harvested (clean-room, MIT) from the competing Python CLI
> `neuromechanist/opencite`, rebuilt in our JS/Node stack.
>
> Read `sprint_log_v0_42.md` §2.13 (dedup field-merge, the sibling win) and
> `docs/wiki/02-Adapters/Adapter-Capability-Tiers.md` (OpenCitations/DataCite already on the
> adopt list) first. Cross-refs: [[03-Search-Pipeline/Search-Pipeline]] ·
> [[02-Adapters/Adapters]] · [[05-API-MCP/API-MCP]] (verify note paths against the wiki).
>
> **Created:** 2026-06-09 · **Status:** PLANNED — not executed.
> **Mode:** C (plan → approval → execute → checklist). Dense; no padding; precise execution.

---

## 0. TL;DR

A corporate-raider teardown of `neuromechanist/opencite` (MIT, ~6 stars, a UCSD
neuroscientist's personal CLI — **not a market threat**, but a clean parts-bin) surfaced
four reusable capabilities. The dedup field-merge (#3) was folded into v0.42 (§2.13). This
sprint executes the other two high-ROI wins as net-new capabilities — neither fits the
feature-frozen v0.40–42 cleanup sprints, so they get their own log.

| # | Win | Source module (theirs) | Our build | Est. |
|---|---|---|---|---|
| T1 | **Citation-graph traversal** — forward (cited-by) + backward (references) for a work | `src/opencite/citations.py` | new `api/_shared/citationGraph.js` + endpoint + MCP tool | ~2.5 d |
| T2 | **Identifier resolution** — DOI ↔ PMID ↔ PMCID, batched | `src/opencite/clients/id_converter.py` | new `src/lib/idResolve.js` (isomorphic) | ~1 d |

**Why these two:** both are *capabilities we lack outright*, both are MIT clean-room ports of
solved problems (their value is plumbing, not algorithm), and both compound existing assets —
T1 is a natural AI/MCP differentiator on top of our OpenAlex adapter; T2 tightens the dedup
keys that drive v0.42's F-208 merge and the v0.35 fragmentation defect (D5).

**Total estimate: ~3.5 days.** No DB migration. No change to the existing search ranking
path (additive endpoints + one shared util). Provenance + license cleared in §6.

---

## 1. Scope

**In scope:**
- T1 — Citation-graph module (OpenAlex backbone + OpenCitations enrichment), a thin
  `/api/citations` endpoint, and an MCP tool surface.
- T2 — Isomorphic identifier-resolution util (NCBI ID Converter), wired as (a) a dedup-key
  canonicalizer and (b) an `/api/ids` resolution endpoint / MCP tool.
- §6 provenance/license record + the **PyPI name-collision finding** (action item from the
  competitive recon).

**Out of scope (explicitly):**
- PDF retrieval + PDF→markdown (their `pdf.py`/`convert.py`) — server-heavy, only relevant
  to a future content-extraction/embeddings effort; parked (see §7).
- Unpaywall OA-status + ar5iv/bioRxiv full-text enrichment — deferred to a follow-on; note
  Unpaywall/Europe-PMC are *already* on the capability-tiers adopt list, so that work
  coordinates there, not here (§7).
- BibTeX/CSV export (their `formatters/`) — easy researcher-UX win, but UI-surface work;
  carry forward.
- Any change to `src/lib/scoring.js` / RRF fusion. T1/T2 are additive.

---

## 2. Design / approach

### 2.1 — T1 Citation-graph traversal (their `citations.py`)

**What they do (verified by source read):** `citing_papers(id, max_results)` (forward) and
`references(id, max_results)` (backward), both `async`, fan OpenAlex + Semantic Scholar in
parallel via `asyncio.gather`, then dedup + filter (`min_citations`) + sort
(citations/year). Pure orchestration — portable 1:1 to Promises.

**Our build — `api/_shared/citationGraph.js` (new, server-only):**

```
getReferences(workId, { limit })  → backward edges (works this work cites)
getCitations(workId, { limit, minCitations, sort })  → forward edges (works citing this)
```

Backbone + enrichment (per the recon's verified API facts — **do not** wire Semantic
Scholar; its keys are approval-gated and 429 even when keyed):

- **OpenAlex** (we already have an adapter — `src/adapters/openalex.js`, `relevance_score`
  at `:45`; verify the exact path/line before importing):
  - Backward: a work's `referenced_works[]` (array of OpenAlex IDs) → batch-hydrate via
    `filter=openalex_id:ID1|ID2|…` (OpenAlex supports up to 50/`OR` group; page with
    `cursor`, **mandatory past the 10k window**).
  - Forward: `filter=cites:WORK_ID` returns citing works directly, with `cited_by_count`
    inline for the sort.
  - Resolve a DOI → OpenAlex ID via `https://api.openalex.org/works/doi:{doi}`.
- **OpenCitations** `/index/v2/{references|citations|citation-count}/doi:{doi}` for
  enrichment / cross-check when the input is a bare DOI and OpenAlex misses it.
  **Gotchas (build these in from day one):** the count comes back as a **string**
  (`"1514"`) → `parseInt`; the endpoint is **lookup-only, no search** → cache hard (7-day
  TTL, keyed by `doi` + direction); ~180 req/min keyless, ~900 ms warm.
  - **Reuse, don't duplicate:** OpenCitations + DataCite are already on the adopt list
    (`Adapter-Capability-Tiers.md`). If/when an OpenCitations adapter lands from that
    adoption, `citationGraph.js` **imports it** rather than embedding a second HTTP client
    (SSOT). Until then, a minimal fetch here is acceptable; flag it `TODO(reuse)`.

**Resilience:** wrap both upstreams in the existing circuit-breaker
(`api/_shared/adapterHealth.js`, the v0.38 F-208… — *note: that is a different F-208, the
adapter-health one; the dedup F-208 is v0.42*). Parallel-fetch with `Promise.allSettled`;
a dead upstream degrades to the other, never throws the whole call.

> **Source deep-read (2026-06-09) → see Appendix B.** Exact OpenAlex constants (`per-page`
> cap **200**, batch chunk **50**, full-URL DOI form, `mailto=` as a **query param** since
> serverless strips UA), the **pipeline-order invariant** (dedup → filter → sort → *then*
> truncate — never truncate first), the `year` sort tie-break, and the source bugs **not** to
> copy (their `references()` uses a wrong `cited_by:` filter; no cursor paging exists; their
> `total_available` is a pre-dedup over-count) are itemized there.
>
> **S2 reconciliation:** Appendix A.4 and §2.1 here decide **not** to wire Semantic Scholar.
> The deep-read's S2-specific lifts (the `DOI:`/`PMID:`/`ARXIV:` prefix chain, S2-primary seed
> resolution) are therefore **N/A** unless that decision is reversed — kept in Appendix B for
> completeness only.

**Surface:**
- `/api/citations?id={doi|openalex}&dir={refs|cited-by}&limit=&minCitations=&sort=` — a thin
  Vercel function that calls `citationGraph.js` and returns origin-blind `UnifiedResult[]`
  (reuse `api/_shared/publicResult.js` to strip `source`, same contract as `/api/search`).
- **MCP tool** `opencite.citations` — `{ id, direction, limit }` → the same payload. This is
  the actual differentiator: lets an external model walk a paper's reference network in one
  call. Register alongside the existing search tool (verify the MCP tool-registration site;
  memory: `{_text}` envelope, F-501).
- **Auth/metering:** treat like `/api/search` — session-admin unmetered; otherwise it spends
  credits (reuse the v0.32 meter + v0.39 per-route auth). One graph call = one billable unit
  (decide rate in T1.5).

### 2.2 — T2 Identifier resolution (their `id_converter.py`)

**What they do:** wrap the **NCBI ID Converter**, detect each id's type (pure-numeric →
`pmid`, `PMC…` → `pmcid`, else `doi`), group homogeneous, chunk **≤200/request**, skip
per-record `status:"error"`. **Use the current host** `https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1`
(the legacy `www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/` in their source is deprecated) —
confirmed by the source deep-read; details + the bugs **not** to copy are in **Appendix B**.

**Our build — `src/lib/idResolve.js` (new, isomorphic — usable from both the browser adapters
and the server):**

```
detectIdType(id)            → "pmid" | "pmcid" | "doi"
resolveIds(ids[], { email }) → Map<inputId, { doi, pmid, pmcid }>
canonicalDoi(record)        → the record's DOI, resolving from pmid/pmcid if absent
```

**Gotchas (verified facts — bake in):**
- Rate limit **3 req/s keyless → 10 req/s with a free NCBI key, hard-enforced**; a 429 is
  returned as a **JSON body**, not just an HTTP status — parse defensively. Build the
  key-gated 10 req/s path from the start (env `NCBI_API_KEY`, optional; share the limiter
  key `"ncbi_eutils"` with any PubMed adapter so we don't blow the per-process budget — this
  is the one genuinely smart pattern in their `base.py`).
- Batch ≤200 homogeneous ids/request; the API rejects mixed-type batches.

**Two consumers:**
1. **Dedup-key canonicalizer (the high-value internal use).** A paper from PubMed (PMID
   only) and from Crossref (DOI only) currently fail to collapse — different `doiKey`,
   different `titleFingerprint` surname/year if metadata differs. Resolving PMID→DOI *before*
   dedup gives both records the same `doiKey`, so v0.42's F-208 merge then unifies them.
   **This directly attacks the v0.35 D5 fragmentation defect** that never shipped.
   - Integration point: a pre-dedup normalization pass. **Cost-aware:** only resolve records
     that have a PMID/PMCID but no DOI (skip records that already have a DOI). Cache results
     (session map + optional 30-day persistent). Do **not** call NCBI per-search
     unconditionally — gate it behind a flag and measure added latency (R3).
2. **`/api/ids` endpoint + MCP tool** `opencite.resolveIds` — user/model-facing conversion.
   Thin, same auth/metering treatment as T1.

### 2.3 — Shared concerns

- **Origin-blind contract:** both endpoints return through `publicResult.js`; no `source`
  leakage, same as `/api/search`.
- **No new infra:** reuse v0.30 Stripe meter, v0.32 credit spend, v0.39 per-route auth,
  v0.38 circuit-breaker. Only two new env vars, both optional: `NCBI_API_KEY` (raises NCBI
  3→10 req/s) and nothing for OpenCitations (keyless).
- **License header:** each new file carries a one-line provenance comment (§6).

---

## 3. Execution plan (ordered)

### T1 — Citation-graph traversal (~2.5 d)

- [ ] **T1.1** Read `src/adapters/openalex.js` to confirm the existing client/fetch helper,
  base URL, and `select=` trimming; reuse it (don't add a second OpenAlex client).
- [ ] **T1.2** `api/_shared/citationGraph.js`: implement `getReferences` (via
  `referenced_works[]` → batched `openalex_id:` hydrate) and `getCitations` (via
  `filter=cites:` with `cited_by_count` sort). DOI→OpenAlex-ID resolver. `Promise.allSettled`
  fan-out; cursor paging; per the §2.1 gotchas.
- [ ] **T1.3** OpenCitations enrichment path: `/index/v2/{references|citations}/doi:` with
  `parseInt` on the string count + a 7-day cache keyed by `doi|direction`. Mark
  `TODO(reuse)` to swap for the adopted OpenCitations adapter when it lands.
- [ ] **T1.4** `/api/citations` Vercel function: param-validate `id/dir/limit/minCitations/sort`,
  call the module, return origin-blind `UnifiedResult[]` via `publicResult.js`.
- [ ] **T1.5** Wire auth + metering (mirror `/api/search`): admin unmetered; else 1 unit per
  call. Confirm the rate against the free-tier model in memory `project_free_tier_decision`.
- [ ] **T1.6** Register MCP tool `opencite.citations` `{ id, direction, limit }`. Verify the
  tool-registration site + the `{_text}` envelope (F-501).
- [ ] **T1.7** Smoke test against **live prod** (per CLAUDE.md — no local builds): a known DOI
  with many citations (e.g. a landmark paper) → `dir=cited-by` returns ranked citing works;
  `dir=refs` returns its bibliography. Confirm OpenCitations string-count parses and the
  cache hits on the second call.

### T2 — Identifier resolution (~1 d)

- [ ] **T2.1** `src/lib/idResolve.js`: `detectIdType`, `resolveIds` (homogeneous grouping,
  ≤200 chunking, `status:"error"` skip, 429-as-JSON handling), `canonicalDoi`. Share the
  `"ncbi_eutils"` limiter key; honor `NCBI_API_KEY` for the 10 req/s path.
- [ ] **T2.2** Pre-dedup canonicalization pass (flagged, cost-aware): resolve PMID/PMCID→DOI
  **only** for records lacking a DOI; cache; feed the resulting DOI into `doiKey` before
  `dedupHighestScore`. Measure added p50/p95 latency; if > ~150 ms, keep it behind the flag
  default-off and document.
- [ ] **T2.3** `/api/ids` endpoint + MCP tool `opencite.resolveIds`; same auth/metering.
- [ ] **T2.4** Live smoke test: a PMID and a PMCID for the same article both resolve to the
  shared DOI; a known PMID-only + DOI-only duplicate pair now collapses+merges (ties to
  v0.42 F-208).

### T3 — Provenance, docs, ship (~0.5 d)

- [ ] **T3.1** Add the §6 license/provenance header to both new files.
- [ ] **T3.2** The competitive teardown + PyPI name-collision finding is already captured in
  **Appendix A** (canonical). Optionally mirror Appendix A to memory
  `project_v0_43_capability_raid` and add the wiki naming note — not required for execution.
- [ ] **T3.3** Update `docs/wiki/_machine/findings.json` / module map for the two new modules
  (`node scripts/wiki/build-machine-map.mjs --check`).
- [ ] **T3.4** Deploy to **prod** and verify both endpoints against the live host (curl), per
  CLAUDE.md. Bump `APP_VERSION` to `v.43`; append actuals to this log (§11 placeholder).
- [ ] **T3.5** Commit **directly to `main`** (no branch — per CLAUDE.md), only when Shahbaz asks:
  `feat(v0.43): citation-graph traversal + DOI/PMID/PMCID resolution (clean-room from neuromechanist/opencite, MIT)`

---

## 4. Acceptance criteria

- [ ] `/api/citations?id={doi}&dir=cited-by` returns a ranked list of citing works
  (`cited_by_count`-sorted) for a high-citation DOI; `dir=refs` returns its bibliography.
- [ ] OpenCitations string counts are parsed to int; a repeat call is served from the 7-day
  cache (no second upstream hit). Semantic Scholar is **not** called anywhere.
- [ ] A dead upstream (simulate OpenAlex timeout) degrades gracefully — the call still
  returns OpenCitations data, never a 5xx.
- [ ] MCP `opencite.citations` returns the same payload through the standard envelope; metered
  for non-admin, unmetered for session-admin.
- [ ] `resolveIds(["12345678","PMC1234567","10.x/abc"])` returns each input's `{doi,pmid,pmcid}`;
  mixed-type input is internally split into homogeneous ≤200 batches; a 429 JSON body is
  handled without throwing.
- [ ] With the canonicalization flag on, a known PMID-only + DOI-only duplicate pair collapses
  to one merged record (verifies the T2→v0.42-F-208 chain).
- [ ] Both endpoints return origin-blind (no `source` field); auth + metering match `/api/search`.
- [ ] Verified against **live prod**, not a preview (CLAUDE.md).

---

## 5. Risk register

| ID | Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | T1.2 | OpenAlex `cites:`/`referenced_works` field or paging semantics differ from assumption | Med | Med | Verify against a live OpenAlex response before coding; `select=` to trim payload; `allSettled` so a shape error on one upstream doesn't sink the call |
| R2 | T1.3 | OpenCitations latency (~900 ms) inflates the endpoint's response time | Med | Low | 7-day cache; call OpenCitations only as enrichment/fallback, not on the hot path; OpenAlex alone satisfies most queries |
| R3 | T2.2 | Per-search NCBI resolution adds latency / burns the 3 req/s budget | Med | Med | Resolve only DOI-less records; cache; flag default-off until p95 measured; share `"ncbi_eutils"` limiter so we never exceed the process budget |
| R4 | T1/T2 | Metering a new paid surface without UI signposting confuses free users | Low | Med | Reuse the v0.37 in-context 402 paywall pattern; document the credit cost on the endpoint |
| R5 | T1.6 | MCP tool envelope mismatch (F-501 `{_text}` undocumented) | Low | Low | Verify against the live MCP route before registering; mirror the existing search tool exactly |
| **R-NAME** | brand/legal | **The `opencite` PyPI package name is already taken** by the upstream author (Seyed Yahya Shirazi, `shirazi@ieee.org`, v0.5.3 uploaded 2026-06-05, links to github.com/neuromechanist/opencite). We **cannot** ship a CLI as `pip install opencite`. Three-way name collision also includes **OpenCitations.net** (Bologna/I4OC, owns the SEO head term). | **Confirmed** | Med | If we ever ship a CLI/package, pick a distinct dist name (e.g. `opencite-search`, `citetoday`); keep the product brand "OpenCITE" but add an explicit non-affiliation line re: OpenCitations + the CLI. Do **not** contest the name — it's descriptive/undefensible. Full picture in **Appendix A.5** |

---

## 6. Provenance & license (clearance)

- **Source project:** `github.com/neuromechanist/opencite`, **MIT License**.
- **What we take:** the *algorithms / orchestration patterns* of `citations.py` and
  `id_converter.py` — not their code. We **clean-room re-implement** in JS from the
  behavioral description in this plan. MIT would permit verbatim vendoring with the license
  header retained, but a JS rewrite of an algorithm carries **no** obligation (algorithms
  aren't copyrightable). We choose the rewrite path.
- **Courtesy attribution (optional, recommended):** a one-line header in each new file —
  `// Approach adapted (clean-room) from neuromechanist/opencite (MIT): citations.py / id_converter.py`
  — documents provenance for our own future maintainers. No legal requirement.
- **No code, strings, or data files are copied** from the upstream repo.

---

## 7. Out of scope / carry-forward

- **PDF retrieval + PDF→markdown** (their `pdf.py`, `convert.py`, `pmc_convert.py`,
  markitdown/Mistral OCR) — only worth it if we pursue content extraction for embeddings;
  revisit alongside the v0.42 F-205 semantic-server spike.
- **OA-status + full-text** (Unpaywall 422-not-429 quirk, `oa_status:"bronze"`; Europe PMC as
  the unified preprint aggregator with `fullTextUrlList[]`; ar5iv unreliable — never a hard
  dep). **Coordinate with the capability-tiers adoption** (Unpaywall + Europe PMC already on
  that adopt list) rather than building it here.
- **BibTeX/CSV/JSON export** (their `formatters/`) — researcher-UX win; own small sprint.
- **Streaming-path dedup merge** — see v0.42 §2.13 (out of scope there too; needs cross-batch
  buffering).

---

## 8. Dependencies

| Item | Depends on | Status |
|---|---|---|
| T2.2 canonicalization → real dedup unification | v0.42 **F-208** dedup field-merge | v0.42 must ship for the *merge* half; T2 ships the *key-canonicalization* half independently and forward-benefits |
| T1.3 OpenCitations reuse | OpenCitations adapter from capability-tiers adoption | Not yet built — minimal inline fetch acceptable with `TODO(reuse)` |
| T1.5 / T2.3 metering | v0.32 meter + v0.39 per-route auth | DONE (v0.39 executed, not yet deployed — confirm deploy gate first) |
| T1.2 | `src/adapters/openalex.js` existing client | Available |
| T1.6 | MCP route + `{_text}` envelope (F-501) | Available; F-501 doc pending (v0.40) |

---

## 9. Definition of done

- [ ] T1 + T2 modules, endpoints, and MCP tools implemented, clean-room, with provenance headers.
- [ ] All §4 acceptance criteria pass against **live prod**.
- [ ] R-NAME finding recorded in memory + wiki; no CLI/package shipped under the taken `opencite` name.
- [ ] `findings.json` / machine map rebuilt (`build-machine-map.mjs --check` clean).
- [ ] `APP_VERSION` → `v.43`; actuals appended (§11).
- [ ] Single commit **directly to `main`** (no branch, per CLAUDE.md), only on Shahbaz's request.

---

## 10. Cross-sprint links

- `sprint_log_v0_42.md` §2.13 — F-208 dedup field-merge (the third harvested win; T2 feeds it).
- `docs/wiki/02-Adapters/Adapter-Capability-Tiers.md` — OpenCitations/DataCite/Unpaywall/EuropePMC adopt list (reuse, don't duplicate).
- memory `project_v0_35_sprint` — D5 transliteration/identifier fragmentation (T2 attacks it).
- memory `project_v0_30_sprint` / `project_v0_32_shipped` — credit meter + per-route auth reused by T1.5/T2.3.
- **Appendix A** (this doc) — full competitive teardown, loot ledger, source signatures, API facts, R-NAME. Canonical raid record.

---

## 11. Actuals (EXECUTED 2026-06-09 — NOT committed, NOT deployed)

**Status:** all in-scope tasks built; sits on top of the v0.42 commit `4beb92e`. Per CLAUDE.md, no
commit and no deploy (both are Shahbaz's call). Acceptance criteria (§4) are gated on the live-prod
smoke (T1.7/T2.4/T3.4) which requires deploy — not run locally.

**Files (new):**
- `src/lib/idResolve.js` — T2 isomorphic resolver (`detectIdType`, `normalizeId`, `resolveIds`,
  `canonicalDoi`, `ncbiLimiter`); hand-ported token bucket (Appendix B.1), shared key `ncbi_eutils`.
- `src/lib/idResolve.test.js` — pure unit tests (detect/normalize/token-bucket). **Written, NOT run**
  (CLAUDE.md no-local-tests); `node src/lib/idResolve.test.js` when CI/Shahbaz wants them.
- `api/_shared/citationGraph.js` — T1 `getReferences`/`getCitations`; OpenAlex backbone (reuses
  `parseOpenAlexWork`/`OA_SELECT`), OpenCitations CC0 backward fallback (7-day KV cache), circuit
  breaker with distinct ids `OPENALEX_GRAPH`/`OPENCITATIONS`. S2 NOT wired.
- `api/citations.js` — T1.4/T1.5 endpoint, origin-blind via `toPublicResult`.
- `api/ids.js` — T2.3 endpoint.
- `api/_shared/meter.js` — DRY auth + rate-limit + two-phase charge for the two new endpoints.

**Files (modified):** `api/search.js` (T2.2 `canonicalizeDois` + env-gated call, **default-OFF**);
`mcp/src/{contract,schema,client,server}.js` + `mcp/README.md` (T1.6 tools `search_citations`,
`resolve_ids`); `src/constants/app.js` (`APP_VERSION`→`v.43`); `docs/wiki/_machine/_fragments/*`
(+5 module entries, machine map rebuilt — `build-machine-map.mjs --check` ✓ clean);
`docs/wiki/02-Adapters/Adapter-Capability-Tiers.md` (R-NAME note). Memory: `project_v0_43_capability_raid`.

**Live API facts verified by sanctioned smoke (pre-code, R1):** OpenAlex `cites:` forward
(count 80,783 for `10.1038/nature14539`); `referenced_works[]` inline (53 refs); hydration
`filter=openalex:|ids.openalex:|openalex_id:` all 200 — chose `openalex:`, chunk 25. NCBI idconv:
mixed batch **400s** → homogeneous groups + explicit `idtype` mandatory; per-record `status:"error"`
+`errmsg`; 429 as JSON body. OpenCitations: slow/timeout-prone → kept best-effort + cached only.

**New env (both optional):** `NCBI_API_KEY` (3→10 req/s), `IDRESOLVE_CANONICALIZE` (enables T2.2).
Deploy still carries the v0.39 gate (`API_KEY_PEPPER`+`AUTH_SECRET`≥32) since v0.39 isn't deployed.

**Unmeasured (deferred to prod):** OpenCitations warm latency, NCBI budget headroom, T2.2 p50/p95.
Credit rate = 1 unit/call at band `full` (per T1.5).

**Deviations from plan:** (1) `src/adapters/openalex.js` is at `src/adapters/core/openalex.js`
(plan guessed root) and `relevance_score` is sort-only, not mapped — `parseOpenAlexWork`/`OA_SELECT`
are the real reuse target. (2) Records carry no generic `pmid`/`pmcid` field, so T2.2 canonicalizes
PubMed (`ncbi-<pmid>`) only — noted in-code for a future adapter-shape widening. (3) MCP tool names
use snake_case (`search_citations`/`resolve_ids`) to match the existing `search_scholarly_sources`,
not the dotted `opencite.*` form in §2.1.

---

## Appendix A — Competitive teardown (source intelligence for the executor)

> This is the durable intel behind the sprint, inlined so the next instance needs no separate
> memory file. Gathered 2026-06-09 by direct read of the upstream repo + a web-recon pass.
> **Canonical record for the raid.** (T3.2 may *also* mirror it to memory; not required.)

### A.1 What the target is, and the threat read

`github.com/neuromechanist/opencite` — **MIT** Python **CLI**: parallel academic search across
~11 scholarly sources (Semantic Scholar, OpenAlex, PubMed, arXiv, bioRxiv/medRxiv, OSF, Zenodo,
Figshare, Crossref, CORE), dedup, citation-graph traversal, DOI/PMID/PMCID conversion, PDF
retrieval, PDF→markdown, BibTeX export.

- **Author:** Seyed (Yahya) Shirazi (@neuromechanist, `shirazi@ieee.org`), Assistant Project
  Scientist at UCSD's Swartz Center for Computational Neuroscience.
- **Traction:** ~6★ / 2 forks; created 2026-02-07; active (v0.5.3, 2026-06-05; ~2-week cadence).
- **Verdict — not a market threat.** A single domain-expert's personal lit-review utility,
  CLI-only, zero distribution/community, audience barely overlaps ours (terminal-native
  researchers vs. our hosted search). Watch only the *cadence*.
- **Strategic read — it's an *integration*, not an invention.** Every capability sits on public
  APIs + well-trodden client patterns; it competes with off-the-shelf libs (**findpapers** =
  closest analog, **pyalex**, **habanero**, **paperscraper**, **scholarly**). The value is the
  *bundle/workflow*, not technology. **Implication for us: we are matching a convenience layer,
  not chasing a moat — rebuild cost is API plumbing (the rate-limit/error quirks in §A.4), not
  algorithms.**

### A.2 Loot ledger — their module → our disposition

| Their module | Does | Our disposition |
|---|---|---|
| `citations.py` | forward/backward citation-graph traversal | **T1, this sprint** (#1) |
| `clients/id_converter.py` | DOI↔PMID↔PMCID via NCBI | **T2, this sprint** (#2) |
| `dedup.py` → `merge_papers()` | field-level record merge | **v0.42 F-208** (#3 — already wired) |
| `clients/base.py` | shared token-bucket limiter + backoff | **pattern reused in T2** (`ncbi_eutils` shared key) |
| `fulltext.py` / `preprint_fulltext.py` / `clients/unpaywall.py` | OA-status + ar5iv/bioRxiv full-text | **deferred** → coordinate with capability-tiers Unpaywall/EuropePMC adoption (§7) |
| `convert.py` / `pmc_convert.py` | PDF→markdown (markitdown/Mistral OCR) | **park** — only for a future embeddings/extraction effort |
| `formatters/` | BibTeX/CSV/JSON export | **carry-forward** — researcher-UX win, own small sprint |

### A.3 Source signatures actually read (for the clean-room rebuild)

Verified by reading the upstream source — implement the *behavior*, not the code (§6).

- **`citations.py`:** `citing_papers(id, max_results=50)` (forward) and `references(id,
  max_results=50)` (backward); both `async`; init OpenAlex + S2 clients conditionally, query
  in parallel via `asyncio.gather`; pipeline `_gather_papers → deduplicate → filter(min_citations)
  → sort(citations|year) → truncate`. **No caching in theirs — we add the 7-day OpenCitations
  cache (T1.3).** We also drop S2 entirely (§A.4).
- **`clients/id_converter.py`:** `_detect_id_type` (pure-numeric → `pmid`, `PMC…` → `pmcid`,
  else `doi`); `_group_ids_by_type` (API needs homogeneous batches); `_convert_chunk` (≤200/req);
  shares the rate limiter with the PubMed client via `shared_limiter_key="ncbi_eutils"`; skips
  per-record `status:"error"`.
- **`dedup.py`** (context for v0.42 F-208): three-tier `_find_duplicate` — DOI exact → PMID
  exact → fuzzy normalized-title **word-set overlap**; `merge_papers` = the field policy ported
  into v0.42 §2.13. **Their fuzzy matcher is weaker than our BM25F tooling — we took the merge
  policy, not the matcher.**
- **`clients/base.py`:** token-bucket `RateLimiter`; `shared_limiter_key` class var (first
  instance creates the bucket, the rest reuse it regardless of their own rate params — this is
  the one genuinely smart pattern, reused in T2); exponential backoff `wait = 2**attempt`;
  honors `Retry-After` (default 5 s) on 429; non-429 4xx raises immediately. No caching.

### A.4 Consolidated external-API facts (one place for the executor)

- **OpenAlex:** `cited_by_count` inline; `filter=cites:ID` (forward), `referenced_works[]`
  (backward); ~30 req/s polite (~100 keyed); **cursor paging mandatory past the 10k window**.
- **OpenCitations** `/index/v2/{references|citations|citation-count}/doi:{doi}`: count returns
  as a **string** (`"1514"`) → `parseInt`; **lookup-only, no search** → cache 7 d; ~180 req/min
  keyless; ~900 ms warm.
- **Semantic Scholar: do NOT wire.** Keys are approval-gated; 429s even when keyed. Not worth it.
- **NCBI ID Converter:** **3 req/s keyless → 10 req/s with a free key, hard-enforced**; a 429 is
  returned as a **JSON body** (parse defensively); **≤200 homogeneous ids/request**.
- **(Deferred — recorded for §7 follow-on)** Unpaywall `/v2/{doi}?email=`: quota/bad-email errors
  are **HTTP 422, not 429**; `oa_status` includes **"bronze"** (free-to-read, no license);
  `best_oa_location` is null when `is_oa=false`. **Europe PMC** is the unified preprint
  aggregator (`SRC:PPR`, `fullTextUrlList[]` + `citedByCount` built in). **ar5iv** (arXiv HTML)
  is crowd-run/unreliable — never a hard dependency.

### A.5 Name collision (full picture behind R-NAME)

Three-way: (1) **OpenCitations.net** — Bologna/I4OC, 2.01B CC0 citation links, ~2018, owns the
"open + citation" SEO head term; (2) **our OpenCITE**; (3) **target `neuromechanist/opencite`**.
The **GitHub repo name and the PyPI dist name `opencite` are both the target's** (PyPI v0.5.3
confirmed). Name is descriptive/undefensible; no trademark noted for any party. Differentiation =
domain authority + framing + an explicit non-affiliation line re: OpenCitations.

### A.6 Recon reliability caveat

The web-recon pass had **2 of 4 search angles drift and describe *our* product instead of the
target** (corrected at synthesis). Load-bearing/trustworthy: author identity, the competitor-lib
list (§A.1), and the external API facts (§A.4). Treat any *web-sourced* "novelty"/"naming" claim
skeptically — those were re-derived from the source read, not the web. **Unverified:** upstream
contributor list, PyPI download counts, any trademark filing.

---

## Appendix B — Liftable-logic ledger (line-level source deep-read, 2026-06-09)

> Answers the narrow question: *beyond the orchestration we already documented, is there
> specific logic worth lifting?* **Yes — ~4 non-obvious pieces; the rest is plumbing, and the
> source carries 3 bugs not to copy.** From a raw-source read of `citations.py`, `openalex.py`,
> `id_converter.py`, `base.py`, `dedup.py`, `utils.py` on `neuromechanist/opencite@main`.

### B.1 — LIFT (re-implement faithfully; the algorithm/constant is non-obvious)

1. **Token-bucket arithmetic** *(T2)* — port verbatim, it's easy to get subtly wrong:
   - Init `tokens = burst` (float). On acquire:
     `elapsed = now - lastRefill; tokens = Math.min(burst, tokens + elapsed*rate); lastRefill = now`.
   - If `tokens < 1.0`: `wait = (1.0 - tokens)/rate`; sleep `wait*1000` ms; then **set
     `tokens = 0.0` and re-read the clock for `lastRefill`** (do NOT reuse the pre-sleep
     timestamp — that double-counts the slept interval). Else `tokens -= 1.0`.
   - Use `performance.now()` / `process.hrtime`, **never `Date.now()`**. Keep refill+decrement
     fully synchronous (only the sleep awaits) ⇒ **no lock needed** in Node's single loop.
2. **Citation pipeline-order invariant** *(T1, forward path)* —
   `dedup → filter(citationCount >= minCitations, only when minCitations>0) → sort → slice(0, limit)`.
   **Never truncate first** (truncate-first drops high-citation late arrivals). On the
   **backward/references path** add a **stable sort before truncating** — the source truncates
   the unsorted reference list, which is a defect to fix, not copy.
3. **`year` sort tie-break** *(T1)* — comparator key is the tuple `(year || 0, citationCount)`,
   so null years sink instead of throwing. Naive ports sort by `year` alone and crash on null.
4. **Merge list-union casing/order** *(F-208)* — `_union_lists` keys dedup on
   `item.toLowerCase()` but pushes the **original-cased** item and **preserves insertion
   order**. Also: dedup `pdf_locations` by `loc.url` (first-seen wins); dedup `grants` by the
   tuple `(funder, award_id)`. (See B.4 for the F-208 refinements.)

### B.2 — Hard-won API constants (quote exactly into T1/T2)

- **OpenAlex forward edges:** `filter=cites:{id}`; page size key is hyphenated **`per-page`**,
  capped at **200**.
- **OpenAlex backward / batch hydration:** chunk **50** ids, pipe-`|` OR-join, DOI as the
  **full URL** `https://doi.org/{d}` (not a bare DOI); the same `|`-join hydrates a work's
  `referenced_works` via `filter=openalex:id1|id2|…`.
- **OpenAlex `select=`:** always send it for bandwidth; include `referenced_works` +
  `referenced_works_count`; the **only** abstract form is `abstract_inverted_index`.
- **OpenAlex polite pool:** send **`mailto=<contact>` as a query param** (the source only sets
  a UA header, which Vercel strips — so do NOT rely on the header).
- **OpenAlex has NO cursor paging in the source** (`cursor=*`/`meta.next_cursor` absent), single
  `per-page≤200` page only. If T1 needs >200 edges/work, **build cursor paging from scratch** —
  there is no reference to lift.
- **PMC ID Converter:** host `https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1`; **200** ids/req,
  comma-joined; send `tool=opencite` + `email=` courtesy params; **set `idtype` explicitly per
  homogeneous group** (the source relies on auto-detect and its `_group_ids_by_type` group key
  is dead code — never sent). Handle **versioned PMCIDs** (`PMC1234.1`) and the `versions`
  array — the source drops both.

### B.3 — Source BUGS (do NOT copy; implement correctly)

- **`references()` via `cited_by:` filter** *(openalex.py)* — wrong direction / invalid
  inversion. Backward edges = the work's **`referenced_works` array + `|`-join hydrate** (our
  §2.1 T1.2 already says this — keep it).
- **`total_available = len(all_papers)` pre-dedup** *(citations.py)* — over-reports by counting
  cross-source dups. Use the **post-dedup** count for any "N more" affordance.
- **`titles_similar` = Jaccard@0.7 + `len≥3`** *(utils.py)* — order-insensitive bag-of-words,
  strictly **weaker than our BM25F**; `0.7` and `len≥3` are uncalibrated. **Take nothing for
  matching.** (Closes the v0.42 §2.13 open question — see B.4.)

### B.4 — Refinements to current plans

**v0.42 §2.13 / T3.1 (F-208) — confirm + tighten:**
- **CONFIRMED: keep BM25F.** Their fuzzy matcher is weaker (B.3); do not adopt `0.7`/`len≥3`.
  This resolves the "is their fuzzy matcher worth taking" question — **no.**
- Encode in the merge: (a) **`is_retracted` / `is_oa` merge by OR** (any source true ⇒ true —
  retraction is safety-critical, asymmetric with normal scalars); (b) conflicting **enums**
  (`oa_status`) can't OR → pick by **source-priority**, not "existing-wins" (the source itself
  comments existing-wins is "arbitrary"), and debug-log the disagreement; (c) the case-insensitive
  union with preserved casing+order, and the `pdf_locations`/`grants` dedup keys (B.1 #4).
- **Improve on source:** their `authors` rule takes the longer list **wholesale** and discards
  the other — prefer **merging author sets** if scope allows.

**v0.43 T2 (id resolution) — refine retry + limiter:**
- If T2 adopts the base.py retry triage (429 + 5xx + network retry; other-4xx raise; honor
  `Retry-After`), **add jitter + a max-backoff ceiling** (source `2**attempt` has neither) and
  parse `Retry-After` in **both seconds and HTTP-date** forms (source is int-only and throws on
  a date).
- **Shared limiter caveat — don't oversell:** the per-host shared limiter is **process-local**;
  on Vercel it limits per warm instance, not globally (same limitation as `adapterHealth.js`).
  True global coordination needs external KV/Redis. Keep it as a module `Map`; drop the Python
  `threading.Lock` (no Node analog).
- **`_detect_id_type`:** order (digits→PMID, `PMC`→PMCID, else→DOI) is right but naive — tighten
  DOI to `^10\.` and normalize the `PMC` prefix.

### B.5 — Honest SKIP (plumbing; write our own, don't port)

`_gather_papers`/`allSettled`+`warn` (we have `adapterHealth` + `failedCount`) · the
asyncio per-loop lock rebind & `threading.Lock` (Python-only) · `_group_ids_by_type` (dead) ·
`_make_ids`, async context managers, all `httpx` wrappers · the trivial scalar merge rules
(`max`, longer-abstract, `a or b` — keep the field list only as a **completeness checklist**) ·
the "both sources disabled" constructor **throw** (we gate "zero eligible citation adapters" at
the request layer with a coverage signal, consistent with the keyed-source eligibility-drop
pattern — not a throw).

---

*End v0.43 sprint plan. Two clean-room ports (~3.5 d), additive only — no ranking-path change.
T2 ships independently and forward-feeds v0.42 F-208. R-NAME (PyPI squat) is confirmed and
constrains any future CLI naming. Appendix A is the canonical raid record — no separate memory
file required.*
