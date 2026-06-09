<!-- AUTO-GENERATED from docs/wiki/99-Archive/search_quality_findings.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->
# OpenCITE — Search-Quality Stress-Test Findings

> Executed 2026-05-31 against live `https://citation.today/api/search` via
> `scripts/stress/probe.mjs`. Five Haiku agents, ~55 distinct queries across 8
> categories (plan: `search_quality_stress_plan.md`).

---

## TL;DR

- **Robustness: clean.** Every query — including XSS/SQLi/emoji/DOI-slash/stopword-only —
  returned HTTP 200 + valid JSON. Injection shapes treated as literal strings. Gate
  behaves (emoji → `lowConfidence:true`, nonsense token → empty). **No 5xx, no crashes,
  no reflection.**
- **Relevance floor: holds.** All 6 control baselines (climate change, CRISPR,
  photosynthesis, machine learning, quantum entanglement, COVID-19 vaccine) returned an
  on-topic #1. No release blocker on the baselines.
- **Relevance debt: real and structural.** Four systemic defects below, ranked by
  severity. The "memon" gap is a symptom of #1+#2+#3 stacking.
- **Operational: latency-saturated + non-deterministic.** Most queries hit the 12 s
  adapter-timeout ceiling, and coverage/candidate-pool **flaps run-to-run on the
  identical query** — so result sets are not reproducible under load.

---

## The "memon" gap — answered

> *"memon returns a different result than kutchi memon… how is this possible?"*

| Query | Pool | Top score | Top #1 | Relevant? |
|---|---|---|---|---|
| `memon` | 41 | **1.79** | "VIC Revealed (1982)(Hayden Book Company)" | ❌ OCR: "memory"→"memon" |
| `kutchi memon` | 14 | **16.17** | "Spice Sorcery: The Kutchi Memon Cookbook" | ✅ |

It's possible — and expected — for three compounding reasons:

1. **No query containment.** Retrieval is a literal-string fan-out to the upstream APIs,
   run fresh per query. `memon` and `kutchi memon` build **different candidate pools with
   zero top-title overlap** (41 vs 14 docs). There is no faceted hierarchy in which
   "memon" is the superset of "kutchi/halai/sindhi memon" — each is its own search.
2. **Scores are not comparable across queries.** IDF is computed over *each query's own
   pool*, and the 2-word query additionally earns a verbatim **phrase boost (×2 per
   field)** + **proximity bonus** that a single token physically cannot. The 9× score
   jump is mostly a **query-length artifact**, not a relevance verdict. (Measured across
   the whole Category A set: `mughal`→`mughal architecture` = 13.5×; `sufi`→`chishti sufi
   order` = 12.6×; `gujarat`→`gujarat textile trade` = 9.2×.)
3. **The bare token `memon` is a retrieval trap.** Rare enough that it's dominated by
   (a) OCR garbage — `memon/` is mis-scanned "memory" in a VIC-20 manual; (b) surname
   collisions — papers *authored by* a Memon; (c) Internet Archive download counts
   sitting in the `citedBy` slot (973, 16 209) feeding the citation tiebreak.

So `kutchi memon` isn't "more of memon" — it's a cleaner, narrower query that dodges all
three traps. The bare term is the broken case, not the qualified one.

---

## Systemic defects (ranked)

<a id="d1"></a>
### D1 — Internet Archive view/download counts inflate rank as `citedBy` *(highest impact)*
IA items carry `citedBy` values of **174 733 (khan), 225 600 (ali), 231 971 (shaikh),
64 378 (qureshi), 32 838 (patel), 32 554 (qabar)** — these are downloads, not citations,
yet they feed the `CITED_BY_CAP` tiebreak and lift non-scholarly IA items (curated book
lists, devotional PDFs) above peer-reviewed work. The scorer comment in `scoring.js`
explicitly warns about exactly this; the IA capability descriptor appears to set
`rankFields.citedBy: true` (or maps downloads→citedBy). **Action:** set IA
`rankFields.citedBy: false`, or stop mapping downloads into the `citedBy` field.

<a id="d2"></a>
### D2 — Surname-as-content collision *(high impact, hard)*
4 of 5 common surnames (`khan`, `ali`, `shaikh`, `qureshi`; `patel` partial) return a
non-subject #1 — a work merely *authored by* someone of that name, or a passing mention.
BM25F scores title/abstract/keywords with no awareness that the token is a person name.
Hard to fully fix without an NER/author-aware signal; partial mitigation: down-weight
single-token person-name queries, or surface a "did you mean a person?" affordance.

<a id="d3"></a>
### D3 — No transliteration / diacritic normalization *(medium impact)*
Variants of one concept fragment into disjoint pools: `Quran` / `Qur'an` / `Koran` →
**0/5 top-title overlap**, and the apostrophe variant scores 12.47 vs 1.60. `Muhammad` /
`Mohammed` → only 20 % overlap. **Action:** a normalization/alias layer (fold diacritics,
common transliteration pairs) on the *score* side, mirroring how `synonyms.js` already
widens matching without changing the upstream query.

<a id="d4"></a>
### D4 — Cross-query score magnitude is meaningless to users *(medium, UX)*
Because of per-pool IDF + length-dependent boosts, a "16.17" and a "1.79" tell the user
nothing comparable. **Action:** normalize displayed score per result set (e.g. 0–100
relative to that query's top hit), or don't surface the raw number at all.

---

## Operational findings (Category H)

- **Timeout saturation:** 5 of 6 baselines ran ≥ 9.8 s; 3 of 6 hit the 12 000 ms adapter
  ceiling. The cap is the dominant latency factor, not query complexity.
- **Non-deterministic coverage:** identical `climate change` run 5× → `tookMs`
  {1575, 3331, 12006, 12003, 12006}, coverage flapped `high ↔ partial`, candidate pool
  39–45. Some adapters time out on some runs, changing the pool → changing IDF →
  changing both the ordering *and* which results survive the gate. **This is a second,
  quieter reason result sets differ — even for the same query.**

---

## Category pass/fail roll-up

| Cat | Theme | Result |
|---|---|---|
| A | Specificity / score incomparability | **Findings** — D4 + memon gap quantified; bare `memon` FAIL |
| B | Dirty corpus / OCR | **Findings** — D1; OCR & IA-citedBy dominate rare tokens |
| C | Surname collision | **Findings** — D2; 4/5 surnames non-subject #1 |
| D | Diacritics / transliteration | **Findings** — D3; 0/5 variant overlap |
| E | Adversarial / degenerate | **PASS** — all 200, injection-safe, gate sane |
| F | Multi-keyword `;` | **PASS** — OR-union semantics, dedup works |
| G | Known-good baselines | **PASS** — 6/6 on-topic #1 (no blocker) |
| H | Latency / coverage | **WARN** — timeout-saturated, coverage non-deterministic |

---

## Recommended next steps (in priority order)

1. **D1 fix** (config-only, high ROI): flip IA `rankFields.citedBy` off / stop
   downloads→citedBy mapping. Re-run Category B to confirm IA noise drops out of top-3.
2. **D4 fix** (UX, cheap): relative/normalized score display per result set.
3. **D3 fix** (score-side alias/normalization layer alongside `synonyms.js`).
4. **H** investigation: the 12 s ceiling + coverage flap — consider raising/streaming, or
   stabilizing the eligible-adapter set so coverage is reproducible.
5. **D2** (largest, defer): author-name awareness in scoring or query intent.

Harness (`scripts/stress/probe.mjs`) is reusable — re-point `BASE` env at a preview
deploy to regression-test any of the above before shipping.
