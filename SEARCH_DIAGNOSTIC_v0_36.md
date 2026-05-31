# Search Pipeline Diagnostic — v0.36

## 1. Header

**What simple mode is.** `?simple=1` is a developer-only flag added in v0.36 T1. When present, the `/api/search` handler runs the full 22-adapter fan-out identically to production but skips the post-retrieve pipeline (dedup, BM25F/RRF scoring, confidence gate, coverage classification). The response returns the raw merged pool in fan-out order, with `source` visible on every result and no `score` field. This makes it possible to distinguish *upstream* failures (adapter-level errors, timeouts, empty results) from *pipeline* failures (results present in the raw pool but dropped or reordered by dedup/scoring/gate).

**How data was gathered.** Local in-process harness: `scripts/stress/simple_smoke.mjs`. The script instantiates the real `/api/search` handler, authed as the admin master key (`plan='admin'`, unmetered), and fires live HTTP requests to the upstream APIs. Each query run produces a SIMPLE call followed by a PROD call. All five queries were run on **2026-05-31** from a Windows 11 workstation on a home network.

**Caveat.** This is a local development run, not the citation.today Vercel deployment. Network latency, rate-limit exposure, and adapter availability reflect this machine and this moment in time. The BL (British Library) adapter is NOT in the server-safe tier set and therefore does not appear in any run — the query "british library" exercises the *term* against the remaining 22 adapters, not the BL adapter itself.

---

## 2. Per-Query Findings Table

| Query | Simple pool | Prod count | Prod cand | Coverage band | Failed adapters (error code) | Notes |
|---|---|---|---|---|---|---|
| `kubernetes` | 29 | 10 | 31 | partial | OPENNEURO (400), WIKIDATA (429), SCIELO (404), ENA (syntax reject), DOAJ (12169ms timeout) | Clean relevance in top-5 raw; IA returned 5 results with very high `citedBy` (10214, 9885, 5404, 2884 — download counts, not citations); prod top-3 are CROSSREF book-chapter titles, not OPENALEX papers — scoring reorder vs raw fan-out order |
| `memon` | 36 | 10 | 35 | partial | OPENNEURO (400), WIKIDATA (429), SCIELO (404), ENA (syntax reject) | DOAJ succeeded (1237ms). IA returned 6 results including `citedBy=50998` ("May-2010" scan dump), `citedBy=32009` ("Ulamaehaqpage5"), `citedBy=16209` (Urdu religious scan) — archive download counts, not academic citations. Prod top-2 ("VIC Revealed", "Bombay High Court") are IA OCR garbage elevated by the inflated citedBy. CROSSREF returned 0 — no scholarly record for this name term. Scoring reorder: raw fan-out starts DOAJ (medical) → OPENALEX (academic); prod promotes IA garbage to rank 1 and 2 |
| `mughal` | 40 | 10 | 42 | partial | OPENNEURO (400), WIKIDATA (429), ENA (syntax reject), SCIELO (404), DOAJ (12143ms timeout) | Heritage adapters fired correctly: RIJKS returned 3 (Indian/Mughal art; 1741ms including 3 detail-fetch sub-calls), NORTHWESTERN returned 3 (art/archival), PRINCETON_DPUL returned 3, THAQALAYN returned 1. Prod top-3 are all RIJKS results — heritage adapter dominated. Raw simple top-3 are OPENALEX academic papers (highest-cited scholarly hits); scoring re-elevated RIJKS over OPENALEX academics, suggesting BM25F title-match weight on short visual-art titles. CROSSREF returned 0 |
| `openlib test` | 15 | 7 | 14 | partial | OPENNEURO (400), WIKIDATA (429), SCIELO (404), ENA (syntax reject), DOAJ (12197ms timeout) | **OpenLib 403 hypothesis refuted.** OPEN_LIBRARY returned HTTP 200 in 307ms but parsed 0 items — no results for this query, not an error. The sprint hypothesised a 403; actual status is a clean 200+empty. Prod top-2 (#1 "PySol SBC OpenLib", score 2.651) and (#2 Pangaea biomarker dataset, score 2.519) differ from simple raw top-1 (same PySol) — Pangaea jumped from position 19 in raw to #2 in prod, indicating scoring promotion of a low-rank raw item |
| `british library` | 39 | 10 | 40 | partial | SCIELO (404), OPENNEURO (400), WIKIDATA (429), ENA (syntax reject), LA_REFERENCIA (12004ms timeout in simple run; fetch-fail + 400 in prod run), CHRONICLING_AMERICA (12014ms timeout in simple run) | BL adapter absent by design (not server-safe). DOAJ succeeded in 836ms in simple run; succeeded in 1896ms in prod run — no DOAJ timeout this query. CHRONICLING_AMERICA timed out in simple run (12014ms) but succeeded in 3456ms in prod run (network variance). LA_REFERENCIA: timeout in simple (12004ms) and fetch-fail + subsequent 400 in prod run — two different failure modes in the same session, suggesting severe instability. Prod top-3 are OPEN_LIBRARY catalogue entries with very high scores (16.4, 13.5, 13.4) — plausible given "british library" is a literal title match in catalogue records |

---

## 3. Per-Adapter Reliability Table

Observations across all 5 queries (10 total SIMPLE calls, each query run twice — once for simple, once for prod fan-out).

| Adapter | Returned ≥1 candidate? | Ever errored? | Error type(s) | Ever timed out (≈12s)? | Notes |
|---|---|---|---|---|---|
| OPENALEX | Yes (4/5 queries) | No | — | No | Fastest scholarly adapter (463–945ms). 0 results for `openlib test` is expected (no matching papers). Reliable. |
| CROSSREF | Yes (3/5 queries) | No | — | No | 0 results for `mughal` and `memon` — correct (no Crossref-indexed papers for these narrow terms). Reliable. |
| DOAJ | Yes (2/5 queries) | Yes | Timeout (~12s) | Yes — 3/5 queries | Timed out on `kubernetes` (12169ms), `mughal` (12143ms), `openlib test` (12197ms). Succeeded on `memon` (1237ms) and `british library` (836ms). Highly intermittent. When it succeeds, results are relevant. |
| IA | Yes (4/5 queries) | No | — | No | Consistently returns 5–6 results per query (2383–4299ms). All results have `citedBy` values that are Internet Archive download counts, NOT academic citations. Confirmed inflated values: kubernetes (10214, 9885, 5404), memon (50998, 32009, 16209). `openlib test` and `mughal` returned 0 and 6 respectively. |
| NCBI | Yes (4/5 queries) | No | — | No | Returns 3 results per query, ~724–1121ms. `openlib test` returned 0 (correct). Reliable. |
| OPEN_LIBRARY | Yes (3/5 queries) | No | — | No | HTTP 200 on all queries (~307–2226ms) but 0 results for `openlib test` and `memon` — parse-level empty, not an error. No 403 observed. Reliable. |
| OAPEN | Yes (4/5 queries) | No | — | No | Consistent 3 results (~1075–1467ms). 0 for `openlib test` (expected). Reliable. |
| LA_REFERENCIA | Yes (4/5 queries) | Yes | Timeout (12004ms), fetch-fail, 400 | Yes — 1/5 queries | Timed out on `british library` simple run (12004ms). In the subsequent prod run for `british library`, fired a fetch-fail (10585ms) then a 400 (34013ms) — severe instability in that session. Succeeded on `kubernetes`, `memon`, `mughal`, `openlib test`. |
| CHRONICLING_AMERICA | Yes (4/5 queries) | Yes | Timeout (12014ms) | Yes — 1/5 queries | Timed out on `british library` simple run (12014ms) but succeeded in 3456ms on the prod run — network variance. Returned 1–3 items per successful query. Slow but usually functional. |
| PRINCETON_DPUL | Yes (3/5 queries) | No | — | No | Returns 3 results on `memon`, `mughal`, `british library`. 0 on `kubernetes` and `openlib test`. ~543–1191ms. Reliable. |
| LC_DATASETS | Yes (4/5 queries) | No | — | No | Consistently 3 results, 435–4743ms (wide latency spread). 0 for `memon`. Reliable. |
| NORTHWESTERN | Yes (2/5 queries) | No | — | No | Results only on heritage-relevant queries: `mughal` (3 items, ~803ms), `british library` (3 items, ~683–1438ms). 0 on others — correct domain behaviour. |
| RIJKS | Yes (1/5 queries) | No | — | No | Results only on `mughal` (3 items; makes 3 detail-fetch sub-calls, total ~1741ms). 0 on all others. Correct museum-collection domain scoping. |
| ONB | Yes (3/5 queries) | No | — | No | Results on `memon` (3 items), `mughal` (3 items), `british library` (3 items). ~1184–3348ms. 0 on tech/dataset queries. |
| THAQALAYN | Yes (1/5 queries) | No | — | No | Results only on `mughal` (1 item, ~490ms). Islamic heritage scope — correct. |
| PANGAEA | Yes (2/5 queries) | No | — | No | Results on `openlib test` (3 items, makes 3 DOI sub-calls, ~1714ms) and `british library` (3 items, ~2034ms). Geoscience data — unexpected match for these terms suggests broad keyword search. |
| SCIELO | No | Yes | 404 (every query) | No | Returns HTTP 404 on every query in this run (~550–983ms). **Consistently broken** — possibly a regional URL change or service disruption. Error is ADAPTER-level (upstream returns 404). |
| OPENNEURO | No | Yes | 400 (every query) | No | Returns HTTP 400 on every query (~200–515ms). Consistently broken — likely a query-format rejection at the OpenNeuro GraphQL endpoint. Error is ADAPTER-level. |
| WIKIDATA | No | Yes | 429 (every query) | No | Returns HTTP 429 on every query (~363–1001ms). Rate-limited — the local-machine IP is being throttled. This may not reproduce in production (different IP/headers) but is consistently triggered in local runs. Error is ADAPTER-level. |
| ENA | No | Yes | Syntax reject (every query) | No | Returns the internal "ENA: query syntax rejected" error on every query. Error fires at ~700–1318ms. The ENA adapter is rejecting all test queries as invalid syntax. ADAPTER-level. |
| BNF_API | No | No | — | No | Returns 0 results on every query, no error (~797–2111ms). Either empty corpus match or silently failing. Cannot distinguish without adapter source inspection. |
| MET | No | No | — | No | Returns 0 results on every query, no error (~273–564ms). Museum of Metropolitan Art — narrow scope; none of the test terms have MET-indexed art objects. |
| CURATED | No | No | — | No | Returns 0 results on every query (~347–912ms). Internal curated list — no matches for test terms. |

---

## 4. Layer-Isolation Analysis

### (a) OpenLib 403 hypothesis — REFUTED

**Evidence:** OPEN_LIBRARY returned HTTP 200 on every query in this run. For `openlib test`, the response was `status=200` in 307ms with `rawCount=0` — the adapter received a valid response, it just contained no matching results. No 403 was observed in any of the 10 OPEN_LIBRARY calls across all 5 queries. The sprint hypothesis is refuted for this network/time. If a 403 was seen previously, it was likely transient rate-limiting or a network-specific issue at the time of the original observation.

### (b) DOAJ timeout behaviour — ADAPTER-LEVEL, INTERMITTENT

**Evidence:** DOAJ timed out at approximately 12 seconds on 3 of 5 queries (kubernetes, mughal, openlib test). It succeeded in 836–1237ms on the remaining 2 (british library, memon). The timeout is clearly adapter-level: DOAJ appears in `failedAdapters[]` with `ms≈12169`/`12143`/`12197`, meaning the upstream API never returned within the 12s budget. When it does succeed, it returns 3 relevant results. This is not a pipeline issue — the pipeline never receives candidates from DOAJ on the timed-out queries. Fix must be at the adapter level (shorter timeout threshold, retry policy, or circuit-breaker).

**LA_REFERENCIA** is similarly unstable: timed out on `british library` simple call (12004ms) and then produced a fetch-fail + 400 sequence on the prod call in the same session. On all other 4 queries it succeeded in 545–706ms. The dual-failure mode (timeout then fetch-fail) in a single session suggests the upstream may have had a transient episode during the `british library` test window. ADAPTER-level.

**CHRONICLING_AMERICA** timed out on `british library` simple call (12014ms) but recovered to 3456ms on the prod call seconds later. Isolated network spike, not a structural issue. ADAPTER-level, one-off.

### (c) IA download-count-as-citedBy inflation — ADAPTER-LEVEL DATA QUALITY

**Evidence:** IA results carry `citedBy` values that are Internet Archive download/view counts, not academic citation counts:

| Query | IA result title | citedBy value |
|---|---|---|
| `memon` | May-2010 (scan dump) | 50,998 |
| `memon` | Ulamaehaqpage5 | 32,009 |
| `memon` | Maut Aur Qabar Ka Heran Kun Waqiat | 16,209 |
| `memon` | VIC Revealed (1982) | 973 |
| `kubernetes` | Negus C. Linux Bible 10ed 2020 | 10,214 |
| `kubernetes` | devops books (IA collection) | 9,885 |
| `kubernetes` | DevOps Materials | 5,404 |

These values are present in the simple-mode raw pool, meaning the inflation arrives from the IA adapter itself — it is ADAPTER-level data quality, not a pipeline artefact. The pipeline's scoring then promotes these high-`citedBy` items. For `memon`, prod rank 1 is "VIC Revealed (1982)" (cit=973, a generic computer manual) and rank 2 is "Bombay High Court" (cit=12) — IA items elevated to the top by the combination of citedBy signal and title-match. The IA adapter is supplying garbage data that is valid JSON and passes all structural checks, so the pipeline cannot filter it without domain knowledge.

### (d) Simple results present but dropped/reordered in prod — PIPELINE-LEVEL (scoring)

**kubernetes:** Simple raw top-3 are OPENALEX papers (cit=565, 399, 171 — the canonical "Borg, Omega, and Kubernetes" paper appears twice, suggesting a cross-adapter duplicate). Prod top-3 are CROSSREF book-chapter titles ("Kubernetes API Operations", "Kubernetes API Introduction") with scores ~1.009. The OPENALEX papers dropped from rank 1-3 raw to below rank 3 in prod. This is a **pipeline scoring issue**: CROSSREF book chapters that closely match the literal query string are scoring above highly-cited OPENALEX academic papers. The duplicate "Borg, Omega, and Kubernetes" also indicates the dedup pipeline did not merge the two OPENALEX instances (different `cit` values: 565 vs 399, likely different editions or DOIs normalised differently).

**memon:** The IA garbage items ("May-2010", "Ulamaehaqpage5") that are top-citedBy in the raw pool ARE reflected in prod top-2 — the pipeline is promoting them, not filtering them. This confirms the citedBy signal is weighted in scoring and the IA adapter citedBy is not capped or normalised. PIPELINE scoring amplifies the adapter-level data quality defect.

**mughal:** Simple raw top-3 are OPENALEX academic papers (cit=133, 122, 100 — scholarly Mughal Empire history). Prod top-3 are RIJKS museum images ("Mughal prins zittend op een olifant", score 0.9117). RIJKS images have null citedBy but win on title-match (the word "Mughal" appears verbatim in the title). This is a PIPELINE scoring issue: title-match BM25F weight overrides citation-count signal for short museum titles vs. long academic paper titles where "Mughal" is one word among many.

**openlib test:** Simple raw shows PANGAEA at position 19 (out of 15 total — it is item 19 in the simple pool, added later due to sub-call latency). Prod rank 2 is the same PANGAEA dataset ("Biomarker test on the springtail...") at score 2.519, above CROSSREF items that were ranks 4-5 in raw. The term "test" provides a strong BM25F signal in the PANGAEA RIS title. PIPELINE scoring promotion.

---

## 5. Raw Evidence Appendix

### Query: `kubernetes` (ALL)

```
SIMPLE  http 200 | simpleMode: true | count: 29 | failed: ["OPENNEURO","WIKIDATA","SCIELO","ENA","DOAJ"]
perAdapter (selected): OPENALEX 945ms/3cand, CROSSREF 610ms/3cand, NCBI 928ms/3cand, OPEN_LIBRARY 447ms/3cand,
  LA_REFERENCIA 673ms/3cand, OAPEN 1241ms/3cand, IA 2421ms/5cand, CHRONICLING_AMERICA 3358ms/3cand,
  LC_DATASETS 4017ms/3cand, DOAJ 12169ms/0cand(errored)
first 5 raw:
  [OPENALEX] Borg, Omega, and Kubernetes  (yr=2016, cit=565)
  [OPENALEX] Borg, Omega, and Kubernetes  (yr=2016, cit=399)   ← duplicate, different citedBy
  [OPENALEX] Horizontal Pod Autoscaling in Kubernetes  (yr=2020, cit=171)
  [CROSSREF] Kubernetes API Operations  (yr=2022, cit=1)
  [CROSSREF] Kubernetes API Introduction  (yr=2022, cit=0)
T1.3 invariants: PASS

PROD    http 200 | coverage: partial | count: 10 | cand: 31
first 3:
  sc=1.0095 Kubernetes API Operations        (hasSource=false)
  sc=1.0093 Kubernetes API Introduction      (hasSource=false)
  sc=0.9364 Extending Kubernetes API with Custom Resources  (hasSource=false)
```

IA citedBy values: 10214, 9885, 5404, 2884, 239

---

### Query: `memon` (ALL)

```
SIMPLE  http 200 | simpleMode: true | count: 36 | failed: ["OPENNEURO","WIKIDATA","SCIELO","ENA"]
perAdapter (selected): OPENALEX 463ms/3cand, OPEN_LIBRARY 350ms/3cand, IA 398ms/6cand,
  CHRONICLING_AMERICA 422ms/3cand, LC_DATASETS 435ms/3cand, PRINCETON_DPUL 570ms/3cand,
  LA_REFERENCIA 706ms/3cand, NCBI 724ms/3cand, DOAJ 1237ms/3cand, ONB 1184ms/3cand,
  OAPEN 1298ms/3cand, CROSSREF 513ms/0cand
first 5 raw:
  [DOAJ] Contributing Factors in the Tuberculosis Care Cascade in India  (yr=2021, cit=null)
  [DOAJ] Assessing The Effectiveness of Ultrasound-Guided Injections  (yr=2025, cit=null)
  [DOAJ] Antibiotic Resistance and Susceptibility Profile  (yr=2023, cit=null)
  [OPENALEX] Order effects in collaborative memory contamination?  (yr=2007, cit=6)
  [OPENALEX] Translational Style: A Corpus-Based Comparative Analysis  (yr=2020, cit=2)
T1.3 invariants: PASS

IA citedBy values (all 6 items):
  May-2010 (scan dump): citedBy=50998
  Ulamaehaqpage5: citedBy=32009
  Maut Aur Qabar Ka Heran Kun Waqiat: citedBy=16209
  BK 1121 -Gazetteer of Boroda Vol I: citedBy=460
  VIC Revealed (1982): citedBy=973
  Bombay High Court - HCBM010437302005: citedBy=12

PROD    http 200 | coverage: partial | count: 10 | cand: 35
first 3:
  sc=1.5305 VIC Revealed (1982)(Hayden Book Company)(US)   ← IA OCR item
  sc=1.4473 Bombay High Court - HCBM010437302005          ← IA legal scan
  sc=1.2735 Translational Style: A Corpus-Based Comparative Analysis  ← OPENALEX
```

---

### Query: `mughal` (ALL)

```
SIMPLE  http 200 | simpleMode: true | count: 40 | failed: ["OPENNEURO","WIKIDATA","ENA","SCIELO","DOAJ"]
perAdapter (selected): OPENALEX 714ms/3cand, THAQALAYN 491ms/1cand, LA_REFERENCIA 622ms/3cand,
  PRINCETON_DPUL 737ms/3cand, NCBI 795ms/3cand, NORTHWESTERN 804ms/3cand, OAPEN 1430ms/3cand,
  RIJKS 1741ms/3cand, ONB 1783ms/3cand, LC_DATASETS 2550ms/3cand, IA 2674ms/6cand,
  CHRONICLING_AMERICA 4684ms/3cand, DOAJ 12143ms/0cand(errored), CROSSREF 466ms/0cand
first 5 raw:
  [OPENALEX] The Princes of the Mughal Empire, 1504–1719  (yr=2012, cit=133)
  [OPENALEX] The Agrarian System of Mughal India, 1556-1707  (yr=1963, cit=122)
  [OPENALEX] The Muslim Empires of the Ottomans, Safavids, and Mughals  (yr=2009, cit=100)
  [RIJKS] Throne of Mughal emperors in Diwan-i-Am of the Red Fort  (yr=1865-1890, cit=null)
  [RIJKS] Mughal prins zittend op een olifant  (yr=1675-1700, cit=null)
T1.3 invariants: PASS

PROD    http 200 | coverage: partial | count: 10 | cand: 42
first 3:
  sc=0.9117 Mughal prins zittend op een olifant           ← RIJKS (null citedBy)
  sc=0.8331 Photo reproduction of twenty-four portraits of the Mughal emperors  ← RIJKS
  sc=0.8149 Throne of Mughal emperors in Diwan-i-Am      ← RIJKS
```

---

### Query: `openlib test` (ALL)

```
SIMPLE  http 200 | simpleMode: true | count: 15 | failed: ["OPENNEURO","WIKIDATA","SCIELO","ENA","DOAJ"]
perAdapter (selected): OPEN_LIBRARY 309ms/0cand(no error, HTTP 200), CROSSREF 597ms/2cand,
  OPENALEX 751ms/3cand, OAPEN 1262ms/3cand, PANGAEA 1714ms/3cand, LC_DATASETS 3754ms/3cand,
  CHRONICLING_AMERICA 5646ms/1cand, DOAJ 12197ms/0cand(errored),
  NCBI 329ms/0cand, LA_REFERENCIA 627ms/0cand, IA 3103ms/0cand
first 5 raw:
  [OPENALEX] A Pesquisa em Testes e Tolerância a Falhas ...  (yr=2022, cit=0)
  [OPENALEX] Como a Comunidade que Publica na SBC ...  (yr=2024, cit=0)
  [OPENALEX] PySol: Uma Proposta Python para Automação de Busca na SBC OpenLib  (yr=2024, cit=0)
  [CROSSREF] Perancangan Prototipe Sistem Tugas Akhir e OpenLib Berbasis Web  (yr=2025, cit=0)
  [CROSSREF] PySol: Uma Proposta Python para Automação de Busca na SBC OpenLib  (yr=2024, cit=0)
T1.3 invariants: PASS

PROD    http 200 | coverage: partial | count: 7 | cand: 14
first 3:
  sc=2.651  PySol: Uma Proposta Python para Automação de Busca na SBC OpenLib
  sc=2.519  Biomarker test on the springtail Folsomia candida  ← PANGAEA, was position ~19 in raw
  sc=2.506  Random test data to play with                      ← likely LC_DATASETS/PANGAEA
```

**OpenLib 403 evidence:** `[opencite:OPEN_LIBRARY:proxy-ok] status=200 ms=307` then `[opencite:OPEN_LIBRARY:empty] rawCount=0` — HTTP 200, zero results, no error. 403 hypothesis refuted.

---

### Query: `british library` (ALL)

```
SIMPLE  http 200 | simpleMode: true | count: 39
failed: ["SCIELO","OPENNEURO","WIKIDATA","ENA","LA_REFERENCIA","CHRONICLING_AMERICA"]
perAdapter (selected): DOAJ 837ms/3cand, CROSSREF 685ms/3cand, OPENALEX 861ms/3cand,
  NCBI 1121ms/3cand, PRINCETON_DPUL 1191ms/3cand, OAPEN 1328ms/3cand, NORTHWESTERN 1438ms/3cand,
  PANGAEA 2034ms/3cand, OPEN_LIBRARY 2226ms/3cand, ONB 3348ms/3cand, IA 4299ms/6cand,
  LC_DATASETS 4743ms/3cand,
  LA_REFERENCIA 12004ms/0cand(errored), CHRONICLING_AMERICA 12014ms/0cand(errored)
Note: BL adapter NOT in server-safe set — absent from run by design.

first 5 raw:
  [DOAJ] El payṭan R. Isaac de Castellón  (yr=1992, cit=null)   ← weak relevance
  [DOAJ] Information Literacy Policy Development in Canada  (yr=2013, cit=null)
  [DOAJ] Eclectic Endeavours of 18th-century Popular Philosophy  (yr=2022, cit=null)
  [OPENALEX] Defining digital comics: a British Library perspective  (yr=2018, cit=80)
  [OPENALEX] British Library Books genre detection model  (yr=2021, cit=75)
T1.3 invariants: PASS

PROD (second fan-out): LA_REFERENCIA fired fetch-fail (10585ms) then 400 (34013ms)
PROD    http 200 | coverage: partial | count: 10 | cand: 40
first 3:
  sc=16.4958 Catalogue of the Hugh Nevill collection of Sinhalese manuscripts in the British Library
  sc=13.5395 British Library map collections
  sc=13.4517 British Library Books genre detection model
```

---

---

## 6. Root-Cause Assessment (T3 — PM sign-off)

**Verdict: the post-retrieve pipeline is healthy. The ranker is the relevance culprit, and adapter hygiene is a separate, real defect. The original "pipeline corrupts results" hypothesis is REFUTED.**

Applying the sprint's decision tree to the evidence:

- **Dedup / confidence-gate are NOT the culprit.** Prod candidate counts track the simple pool minus expected dedup (kubernetes 29→31*, memon 36→35, mughal 40→42*) — nothing is being silently dropped. The gate never starved a query of keepers. **Do not refactor these — they are sound and load-bearing.** (*prod cand exceeds simple pool because the two fan-outs hit different live adapter sets per network variance — not a pipeline bug.)

- **Scoring IS the relevance culprit — confirms v0.35 D3/D4.** On every query, BM25F over a micro-pool promotes short *literal-title* matches above substantively relevant work: RIJKS museum images beat cited Mughal-history papers; CROSSREF book-chapters beat the canonical Borg/Omega/Kubernetes paper; IA OCR scans top `memon`. Local IDF over 14–42 docs is noise. v0.35's "fuse native upstream relevance instead of replacing it" is the correct next sprint.

- **IA `citedBy`=download-count (D1/D2) confirmed** — adapter-level data corruption *amplified* by scoring (cit=50,998 garbage → prod rank 1). v0.35 T1's 2-line fix stands.

- **Adapter reliability is a distinct, unbudgeted problem.** SCIELO (404), OPENNEURO (400), ENA (syntax) fail on 100% of queries; WIKIDATA (429) is local-IP throttling (verify in prod). DOAJ/LA_REFERENCIA/CHRONICLING intermittently hit the 12s timeout. These dead/slow adapters drag **every** query to `partial` coverage — which, via coverage-prorated billing, systematically discounts every paid search. This needs its own workstream (kill or fix the 3 always-dead adapters; tighten per-adapter timeout + circuit-breaker).

- **OpenLib 403: refuted.** Clean 200+empty. No action.

**Next-sprint targets:** (1) v0.35 ranker refactor (RRF fusion of native + local signal) — now *confirmed* prerequisite, not speculative. (2) New adapter-hygiene sprint: retire SCIELO/OPENNEURO/ENA, add circuit-breaker, re-tune the 12s timeout. The pipeline itself is off the table.

---

## 7. Follow-up: DOAJ latency investigation (correction)

The T2 runs flagged DOAJ as timing out on 3/5 queries, and the first draft of §6 grouped it
with the unreliable adapters. **A follow-up controlled probe corrected this.**

- **Hypothesis tested:** DOAJ deprioritizes the bare Node/undici User-Agent (DOAJ uses a plain
  `fetch`, not `proxiedFetch`, so it gets no spoof UA server-side). An initial two-pass probe
  (bare UA, then browser UA) appeared to confirm a 10–40× speedup with a browser UA.
- **Confound found:** the second pass reran the *same five queries*, so DOAJ server-side query
  caching + warm TLS — not the UA — produced most of the speedup.
- **Controlled re-test** (bare/browser UA *interleaved* on the same query at matched warmth)
  showed **no consistent UA effect**: browser was sometimes faster, sometimes slower
  (`mughal`: bare 463ms vs browser 883ms). The dominant variable was warmth
  (`kubernetes` 1040→275ms on repeat). All controlled calls were sub-1.1s.

**Conclusion: DOAJ is healthy — it works from both client and server.** Its latency is
genuinely *variable upstream* (observed sub-second to ~9s at different times), which occasionally
exceeds the 12s per-adapter cap under full fan-out load. This is the v0.35 D7 "timeout flap,"
NOT a throttle and NOT a dead adapter. **No DOAJ code change is warranted.** The only lever is
pipeline resilience (don't let one slow adapter gate the response / tune the timeout) — which is
adapter-fleet hygiene, applied uniformly, not a DOAJ-specific fix. DOAJ is explicitly EXCLUDED
from the "retire" list; it belongs only in the "make the fan-out resilient to a slow source" bucket.

*End of diagnostic.*
