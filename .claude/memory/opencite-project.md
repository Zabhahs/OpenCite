# OpenCITE Project Context

## What it is
Free meta-search engine for open-access scholarly databases. Searches 25+ academic APIs in parallel, returns results with MLA 9 and APA 7 citations. Deployed at `citation.today` / `opencite.space`.

## Repo
`Zabhahs/opencite_deploy` on GitHub. Main branch, deployed via Vercel.

## Current version
v0.29 (as of 2026-05-29) — read `architecture_report_v0_29.md`

## Architecture report
Always read `architecture_report_v0_XX.md` (highest version number) before touching code. It's the canonical reference — contains file map, schema, sprint history, roadmap, and constraints.

## Key architecture (v0.26)
- **Retrieval (v0.26):** adapters now field-scope queries. Scholarly sources (OpenAlex, Curated, DOAJ, Crossref, NCBI, Internet Archive, OpenNeuro) search content fields only (title/abstract/keywords) → fixes the "memon returns author papers" bug at the source. Heritage/museum sources stay all-field by design (creator = legit discovery). `settings.authorSearch` toggle (default false) flips scholarly adapters to author/all-field.
- **Scoring pipeline:** BM25F (title 3x, keywords 2x, abstract 1x) → optional synonym expansion (Moby Thesaurus, 2.5M synonyms) → optional semantic rerank (client-side all-MiniLM-L6-v2 via Web Worker) → RRF fusion (0.6 lexical / 0.4 semantic)
- **Scoring is content-only.** No author matching in BM25F.
- **v0.27 Phase B (shipped):** scoring.js splits multi-word query terms into words (fixed latent zero-match bug), adds verbatim phrase bonus + proximity bonus. **Phase C (shipped):** MeSH descriptors → OpenAlex keywords; `select=` payload trim (OA_SELECT SSOT in parseOpenAlex.js, host_venue excluded). *Still open:* enrich non-OpenAlex adapters.
- **RRF wiring (v0.27):** Phase B phrase/proximity flow into RRF via the lexical `_score` rank. Phase C keywords feed the semantic arm too — `computeSemanticRanks` embeds title→abstract→keywords with a reserved 140-char keyword tail budget (`KW_BUDGET`) so a long abstract can't truncate keywords out of the 512-char window. Synonyms feed only the lexical arm by design (embeddings capture meaning).
- **Deferred field-scoping** (uncertain API syntax, would risk prod break): SciELO, PANGAEA, Smithsonian/Europeana/Northwestern fielded syntax, SRU CQL (ONB/BnF/Gallica).
- **Global low-confidence gate (v0.27, in `useFilters.js`):** low-confidence "loose match" fallback is now decided GLOBALLY, not per-adapter. If any adapter has a genuine hit (`!_lowConfidence`), all adapters' loose matches are dropped. Fixed the "Memons of Kutch" pollution where heritage adapters dumped tangential junk. Only when nothing matches anywhere do guesses show.
- **Semantic Scholar deregistered (v0.27)** — approval-only key, poor cost/benefit. File kept, removed from registry + settings UI.
- **Phase 2 phrase push-down to adapter retrieval was DEFERRED** — forcing multi-word queries as phrases at scholarly APIs would worsen heritage-query recall (the regression we just fixed). Only revisit as opt-in quoted-phrase support.
- **Two view modes:** unified (default, ranked cross-adapter) and source (per-adapter sections)
- **Adapters:** core (always on) + extensions (opt-in). Each returns UnifiedResult schema.
- **Filters:** type, language, year range, topics facet, OA only — all derived from live results.

## Roadmap (as of 2026-05-28)
- **Next:** Phase 3A — Stripe billing (Starter $2.99/mo, Pro $9.99/mo)
- Phase 3B — Agent billing
- Phase 3C — RESTful API endpoint
- Also planned as native app / client (not just web app)

## Key decisions made this session
- BM25F over simple keyword overlap — field weighting matters for academic search
- Client-side embedding (Web Worker + CDN) over server-side API — zero cost, works for native app
- Moby Thesaurus (public domain) for synonym expansion — sharded JSON, fetched on demand
- RRF over score normalization — rank-based fusion is scale-agnostic
