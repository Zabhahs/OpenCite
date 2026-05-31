# OpenCITE — Search-Quality Stress-Test Architecture

> **Purpose:** a repeatable battery that probes the *relevance* pipeline (retrieval →
> `scoreResults` BM25F → dedup → `applyConfidenceGate` → coverage band) for failure
> modes, run against the live `/api/search` endpoint. Companion harness:
> `scripts/stress/probe.mjs`. Created 2026-05-31.

---

## 0. The pipeline under test (what can break, and where)

```
q ──► fan-out to server-safe adapters (literal string)   ← RETRIEVAL (upstream APIs decide the candidate pool)
   ──► pool + scoreResults(BM25F, IDF over THIS pool)     ← SCORING (per-query IDF, phrase ×2, proximity, citedBy, thin-source)
   ──► dedupHighestScore (DOI, then title fingerprint)    ← DEDUP
   ──► applyConfidenceGate (drop zero-score unless none)  ← GATE (lowConfidence flag)
   ──► computeCoverage (corpus-weighted band)             ← HEALTH (timeouts → degraded)
   ──► sort by _score, slice(limit), origin-blind cards
```

Five structural facts that generate most defects:

1. **Retrieval is literal-string, per-query, independent.** No faceting, no query
   hierarchy. `memon` and `kutchi memon` produce *different candidate pools* — one is
   not a subset of the other.
2. **IDF is computed over each query's own pool.** Scores are **not comparable across
   queries**, and only loosely comparable across sources within one query.
3. **Multi-word queries earn boosts a single word physically cannot**: verbatim
   `PHRASE_BOOST ×2` per field + proximity bonus. Specificity inflates absolute score.
4. **`citedBy` is a tiebreak gated by `capability.rankFields.citedBy`** — but Internet
   Archive exposes download/view counts in that slot, so noisy full-text hits get a
   citation-shaped lift.
5. **The gate only drops zero-score rows.** A nonzero-but-irrelevant match (OCR noise,
   surname collision) survives and can top the list.

---

## 1. Reference defect (the "memon" gap)

| Query | Top result | Top score | Pool | Relevant? |
|---|---|---|---|---|
| `memon` | "VIC Revealed (1982)(Hayden Book Company)" | **1.79** | 41 | **No** — OCR: "memory" → "memon" |
| `kutchi memon` | "Spice Sorcery: The Kutchi Memon Cookbook" | **16.17** | 14 | Yes |

**Why they differ (the answer to "how is this possible"):**
- Different upstream pools — the two queries fan out as distinct literal strings; there
  is no "memon ⊃ kutchi memon" containment.
- The single token `memon` is a **retrieval trap**: rare enough to be dominated by OCR
  garbage (`memon/` = OCR'd "memory" in a VIC-20 manual), surnames-as-content, and IA
  download counts read as citations.
- `kutchi memon` scores **~9× higher** not because it's "more relevant" in an absolute
  sense but because two words + verbatim phrase boost + proximity stack — score
  magnitude is an artifact of query length, not quality.

This single case touches Categories **A, B, C** below. The battery generalizes it.

---

## 2. Test taxonomy

| Cat | Name | Probes | Primary failure hunted |
|---|---|---|---|
| **A** | Specificity / score incomparability | broad term vs qualified term pairs | cross-query score blow-up; pool non-overlap |
| **B** | Dirty corpus / OCR noise | rare tokens, IA-heavy terms | OCR-garbage top hits; rare-token traps |
| **C** | Surname-as-content collision | common South-Asian/Arabic surnames | author tokens scored as topic |
| **D** | Diacritics / transliteration / script | Qur'an/Quran/Koran, Sufi/Sufism, non-Latin | variant fragmentation; no normalization |
| **E** | Degenerate / adversarial | stopword-only, empty, huge, special chars, DOI-with-slash, emoji | gate/parse robustness; 5xx; injection-shape |
| **F** | Multi-keyword `;` semantics | `a; b` vs `a` vs `b` | OR/AND semantics; dedup across batches |
| **G** | Known-good baselines (control) | climate change, CRISPR, photosynthesis | regression floor — these MUST be clean |
| **H** | Latency / coverage stability | repeats + concurrency | tookMs near 12s timeout; coverage flapping |

---

## 3. Signals each probe records

From `probe.mjs`: `coverage` band · `count` · `totalCandidates` · `tookMs` (server) ·
`wallMs` (client) · `lowConfidence` · per-result `{score, inferred-source, citedBy,
year, language, title}`.

**Per-query verdicts the agent assigns** (human/LLM judgment, not in the harness):
- `top_relevant` — is result #1 actually about the queried subject? (Y/N/partial)
- `garbage_in_top3` — any OCR noise / surname-collision / wrong-domain hit in top 3?
- `score_artifact` — is the score magnitude explained by query length, not relevance?
- `notes` — one line.

---

## 4. Execution model

Five Haiku agents run in parallel, each owning a category band, calling the live API
through the shared harness:

```
node scripts/stress/probe.mjs "<query>" [limit]      # from repo root
```

- Agent 1 → **A** (+ memon family deep dive)
- Agent 2 → **B + C**
- Agent 3 → **D + F**
- Agent 4 → **E**
- Agent 5 → **G + H**

Each returns a compact findings table + flagged defects. This document + the synthesis
report (`search_quality_findings.md`) are the deliverables.

---

## 5. Pass / fail rubric

- **PASS** — top result relevant, no garbage in top 3, coverage `high`/`near-full`.
- **WARN** — relevant but score is a length artifact, or 1 noise hit in top 3, or
  `tookMs` > 10s.
- **FAIL** — irrelevant #1, OCR/surname garbage tops the list, 5xx, or `lowConfidence`
  on a query that has obvious real matches in the corpus.

Category **G** failing is a release blocker; A–D failures are relevance-debt findings.
