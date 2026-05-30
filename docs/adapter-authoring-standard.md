# Adapter Authoring Standard

**Status:** canonical · applies to every new adapter from v0.29 forward.
**Scope:** how to design, build, wire, and verify a search adapter so it returns
the best possible results into OpenCite's unified ranked pool — without bespoke
special-casing.

This is the contract. If a rule here conflicts with an older adapter, the older
adapter is the thing that's wrong (it predates the standard and is on the retrofit
list); follow this document.

Companion docs:
- `adapter-api-capabilities.md` — per-source API facts (endpoints, auth, caps).
- `adapter-rank-sprints.md` — how the capability descriptor feeds the ranker.

---

## 0. The non-negotiables (read first)

1. **An adapter is a plain exported object, not a class.** It never `extends`
   anything. The registry calls `AbstractAdapter.sanitize()` on your output.
2. **`search()` returns `{ results, hasMore }`.** Nothing else is contractual.
3. **Every record is built to feed the ranking pipeline.** OpenCite ranks with
   **two arms fused by Reciprocal Rank Fusion** — a lexical arm (BM25F + optional
   synonym expansion) and a semantic arm (MiniLM embeddings). **Both arms read the
   same four text fields: `title`, `abstract`, `keywords`, `subjects`.** Everything
   else you emit is for display, citation export, filtering, or dedup — it does not
   move rank. Section §4 is the spec; internalize it before writing `map()`.
4. **Gear each adapter to its own API.** Sources are not interchangeable. Your job
   is to read *that API's* field documentation and map its richest available field
   into each of the four ranked slots (+ `citedBy` where it exists). Two adapters
   hitting the same four slots from different JSON shapes is exactly the point.
5. **The `capability{}` descriptor must describe reality, not aspiration.**
   `rankFields` states what your `map()` *actually emits today*, verified against a
   live response. It gates real ranker behaviour (§4.4) — lying mis-ranks silently.
6. **No live network call ships unverified.** You must hit the real endpoint, read
   a real payload, and map against real field names before wiring it in.

---

## 1. Decision tree: which transport do I use?

Pick the cheapest path that works. In order of preference:

```
Is it a GET request returning JSON, from a CORS-open or allowlistable host?
│
├─ YES → CLIENT ADAPTER + proxiedFetch  (e.g. SciELO, OAPEN, LA Referencia)
│        Add the host to ALLOWED_DOMAINS in api/proxy.js. Done.
│
└─ NO → does it need one of:
        • a POST with a JSON body, or
        • XML/SRU parsing, or
        • a geo/IP-gated or Cloudflare-challenged upstream, or
        • a secret key that must not reach the browser?
        │
        ├─ YES → EDGE ROUTE + client shim  (e.g. Gallica, OpenEdition)
        │        Write api/search/<name>.js, then a thin client adapter that
        │        fetches /api/search/<name>.
        │
        └─ STILL NO PATH → it is not viable. Document why in
                 adapter-api-capabilities.md and stop. (OAI-PMH harvest-only,
                 IP-whitelist-on-Vercel, JS-challenge with no JSON fallback,
                 institutional-credential gates — all hard-excluded. See §10.)
```

### Why the split exists

The generic proxy (`api/proxy.js`) **rebuilds its own headers on POST and does not
forward `Content-Type`.** A JSON POST routed through it will fail. That is the
single most important reason an adapter graduates from client+proxy to a dedicated
edge route. OpenEdition is the canonical example: its SPA POSTs
`{q, pagination:{currentPage, documentsPerPage}}` to `search-api.openedition.org`,
so it owns `api/search/openedition.js`.

---

## 2. File & naming layout

| Concern | Location | Convention |
|---|---|---|
| Client adapter | `src/adapters/extensions/<camelCase>.js` | one file, one exported `*_ADAPTER` const |
| Edge route (if needed) | `api/search/<lowercase>.js` | `export const config = { runtime: 'edge' }` |
| Re-export | `src/adapters/extensions/index.js` | one `export { X_ADAPTER } from "./x.js";` line |
| Registration | `src/adapters/index.js` | add to the import block **and** the `ADAPTERS` array |
| Proxy allowlist | `api/proxy.js` | add hostname to `ALLOWED_DOMAINS` (client+proxy only) |

- Adapter `id` is `SCREAMING_SNAKE_CASE` and is the stable identity used in logs,
  `source`, and result `id` prefixes.
- Result `id` is `<lowercase-source>-<stableUpstreamId || \`${offset}-${i}\`>`.
  Always provide an index fallback so two results never collide when the upstream
  id is missing.

---

## 3. The adapter object — required shape

Every field below is mandatory unless marked optional. Tag values **must** come
from `src/constants/vocabulary.js` (`TAG_VOCAB`) — invalid tags break the filter UI.

```js
import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";          // if abstracts carry HTML
import { proxiedFetch } from "../_shared/proxy.js";        // client+proxy adapters only

export const EXAMPLE_ADAPTER = {
  id: "EXAMPLE",
  name: "Example Source",
  tagline: "One line a human reads in the source picker · what & where",
  category: ADAPTER_CATEGORY.EXTENSION,         // CORE only for always-on reference sources
  region: ["europe", "global"],                 // ⊆ TAG_VOCAB.region
  archiveType: ["scholarly-index"],             // ⊆ TAG_VOCAB.archiveType
  contentType: ["peer-reviewed", "textual"],    // ⊆ TAG_VOCAB.contentType
  color: { bg: "bg-sky-800", text: "text-sky-50" },  // Tailwind classes, pick an unused hue
  needsKey: false,                              // true → see §8

  capability: {                                 // §4.4 — SSOT for ranker/registry/UI
    protocol: "rest-json",
    fulltext: false,
    pagination: "offset",
    totalCount: true,
    maxWindow: null,
    auth: "none",
    rankFields: { abstract: "full", subjects: "full", citedBy: false },
  },

  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    // ... fetch, map, return { results, hasMore } ...
  },
};
```

### Result object — the field contract

`AbstractAdapter.sanitize()` coerces types and supplies defaults, so you never need
to guard against `null`. But sanitize **cannot invent data you didn't map.** The
table marks each field's role; **§4 explains exactly how the ranked four are
consumed** — read it before deciding what to map where.

| Field | Type | Role | Notes |
|---|---|---|---|
| `title` | string | **RANKED** | strongest signal in both arms (§4); never empty — `"Untitled"` only as last resort |
| `abstract` | string | **RANKED** | your biggest prose signal; `stripHtml()` it; front-load the topic (§4.3) |
| `subjects` | string[] | **RANKED** | controlled vocab / classification; pooled with `keywords`; cap at 8 |
| `keywords` | string[] | **RANKED** | author keywords; pooled with `subjects`; cap at 8 |
| `citedBy` | number | rank tiebreak | BM25F-only, **gated** by `capability.rankFields.citedBy` (§4.4) |
| `id` | string | system | unique, prefixed, with `${offset}-${i}` fallback |
| `source` | string | system | equals adapter `id` |
| `url` | string | display | prefer DOI link → canonical landing page → handle |
| `doi` | string | display/dedup | strip `https://doi.org/` to the bare DOI |
| `authors` | string[] | display/export | **not matched by the ranker** — strip ORCID/affiliation noise |
| `year` | string | display/export | extract with `.match(/\d{4}/)?.[0]` |
| `journal`,`publisher`,`volume`,`issue`,`pages` | string | export | citation completeness |
| `isOA` | boolean | display/filter | `true` if the source is open-access by definition |
| `type` | string | display/filter | raw upstream type; `normalize.js` canonicalizes it |
| `language` | string | display/filter | ISO-639 where available |
| `previewImage` | string | display (optional) | thumbnail URL for visual sources |

> **The ranked four are `title`, `abstract`, `subjects`, `keywords`.** A record that
> doesn't put query-matchable text in at least one of them is, for ranking purposes,
> invisible — no matter how complete its citation metadata is. Map the rest for
> display and export, but spend your real effort on these four.

---

## 4. How the ranking pipeline reads your record — design to this

This is the heart of the standard. OpenCite does **not** rank with a single BM25F
pass. It runs two independent arms and fuses their *rank orders* with RRF. Both arms
read the same four fields; they just consume them differently. Gear your `map()` so
the same clean payload serves both.

### 4.1 The pipeline (verified against `src/lib/` + `src/hooks/`)

```
                 your mapped record
                         │
        ┌────────────────┴─────────────────┐
        ▼                                   ▼
  LEXICAL ARM  (always on)           SEMANTIC ARM  (opt-in toggle)
  scoring.js — BM25F                 semantic.js — MiniLM embedding
   title ×3 · keywords+subjects ×2    embeds title + abstract +
   · abstract ×1                      keywords/subjects, cosine vs query
   + phrase/proximity boosts          (client Web Worker, ~23MB model)
   + synonym expansion (synonyms.js,
     query-side, lexical arm only)
        │                                   │
        ▼                                   ▼
   lexical rank order               semantic rank order
        └────────────────┬─────────────────┘
                         ▼
              RRF  (rrf.js / useSemanticRerank.js)
        fuse(0.6 × lexical, 0.4 × semantic), k=60
                         │
                         ▼
                  final pooled order
```

- **BM25F is the always-on baseline.** It produces `_score` for every result. When
  the semantic toggle is **off** (or the worker/model fails to load), `_score` is
  the final order — RRF never runs. This is why BM25F still matters most.
- **Semantic + RRF is opt-in reordering.** When enabled and all adapters have
  settled, RRF blends the BM25F order (weight 0.6) with the embedding-similarity
  order (weight 0.4). On any failure it falls back to BM25F.
- **Synonym expansion** (`settings.synonyms`) widens the *query terms* the lexical
  arm matches against — score-side only; the API always receives the raw query. It
  feeds the lexical arm exclusively. You do nothing special for it; populating the
  ranked four is what lets expanded terms find a match.

### 4.2 Field-by-field: what each arm does with your data

| Field you emit | Lexical arm (BM25F) | Semantic arm (MiniLM) |
|---|---|---|
| `title` | weight **×3**; drives phrase + proximity boosts; gates the thin-source prior on a complete match | always embedded first — never truncated out of the window |
| `abstract` | weight **×1** | embedded after the title, fills the remaining window; **truncated to ~`512 − title − 140` chars** |
| `keywords` + `subjects` | pooled into one field at weight **×2** | embedded as a **guaranteed 140-char tail** (`KW_BUDGET`) so a long abstract can't crowd them out |
| `citedBy` | small capped tiebreak, **gated** (§4.4) | not read |
| everything else | not read | not read |

Two consequences fall straight out of this table:

1. **Bag-of-words vs. meaning.** BM25F tokenizes and ignores word order and HTML
   noise (it mostly tokenizes away). The embedder is the opposite: it reads natural
   language, **only the first ~512 characters**, and HTML fragments/boilerplate
   *pollute the vector*. So `stripHtml()` and front-loading the topical sentence
   help the semantic arm far more than they help BM25F — see §4.3.
2. **Subjects/keywords pay double.** They are ×2 in BM25F *and* hold a reserved tail
   slot in the embedding. Digging them out of a nested API response is the
   highest-leverage mapping work you can do for a field-poor source.

### 4.3 Practical mapping rules that follow from the pipeline

- **`stripHtml()` every abstract.** Not cosmetic — raw `<p>`/`&nbsp;` tokens degrade
  the embedding and waste the 512-char window.
- **Front-load the abstract.** The embedder sees only the opening window and the
  abstract competes with title + keyword tail for room. If the API returns a long
  abstract, the first sentence must carry the topic. Don't prepend boilerplate
  ("This article…", publisher banners, license text).
- **Always populate `subjects`/`keywords` when the API has them**, even if it also
  has a rich abstract. They earn ×2 lexical weight and a guaranteed embedding slot.
  Aggregators bury them in arrays-of-arrays (LA Referencia) or `::`-delimited strings
  — dig them out; cap at 8 to keep scoring tight.
- **Never stuff non-topical text into the ranked four** to game length. BM25F length-
  normalizes (B=0.75) and the embedder penalizes incoherent text. Junk hurts both.
- **`authors` is never matched** — `scoring.js` deliberately excludes author text.
  Map authors for display/citation only; don't fold them into title/abstract.

### 4.4 The capability descriptor gates real ranker behaviour

`scoring.js` reads `capability.rankFields` per result. Two behaviours depend on it
being **honest**:

- **`citedBy` tiebreak is gated.** The citation bonus (`min(citedBy/5000, 0.3)`)
  applies **only** when `rankFields.citedBy === true`. This exists because some
  sources emit a count that isn't citations (Internet Archive emits *downloads*).
  Set `citedBy: true` only if the number is a real citation count.
- **Thin-source prior protects field-poor sources.** When `rankFields.abstract` and
  `rankFields.subjects` are *both* `none`/`sparse`, the source is "thin" — its only
  reliable topical field is the title. On a **complete title match**, BM25F adds a
  bounded prior (`+0.4`) so a strong title-only hit from a catalogue/primary-source
  adapter isn't structurally buried beneath abstract-rich-but-loosely-relevant
  articles. **Being honest that you're thin is what earns this protection** —
  mislabeling a thin source as rich forfeits the prior and buries it.

**Verification rule (unchanged, now load-bearing):** look at three real records. If
two of three carry a real abstract → `full`; constructed/usually-empty → `sparse`;
never mapped → `none`. Same for subjects. The ranker trusts these labels literally.

---

## 5. Pagination — the three patterns

OpenCite drives load-more by `opts.offset`. Page size is **always** small and
fixed: `INITIAL_PAGE_SIZE` (3) for the first page, `LOAD_MORE_PAGE_SIZE` (5)
after. Convert offset to the upstream's paging model, then compute `hasMore`
honestly.

**Pattern A — offset/limit, with a real total (`totalCount: true`):**
```js
const url = `...&limit=${pageSize}&offset=${offset}`;
return { results, hasMore: offset + results.length < total };
```

**Pattern B — 1-based page number, with a real total:**
```js
const page = Math.floor(offset / pageSize) + 1;   // the canonical offset→page line
const url = `...&page=${page}&limit=${pageSize}`;
return { results, hasMore: offset + results.length < total };
```

**Pattern C — bare array, no total (`totalCount: false`):**
```js
const url = `...&limit=${pageSize}&offset=${offset}`;
return { results, hasMore: results.length === pageSize };  // a full page implies more
```

OAPEN is Pattern C; LA Referencia and OpenEdition are Pattern B. **The
`capability.totalCount` flag must match which pattern you used** — that's how the
load-more guard knows whether to trust a count or infer from page fullness.

---

## 6. The `capability{}` descriptor — enum reference

Read by the ranker (§4.4), registry, and UI as the single source of truth. Enums
(from `base.js`):

| Key | Values | Meaning |
|---|---|---|
| `protocol` | `rest-json` `sru` `sparql` `oai-pmh` `graphql` `elasticsearch` `blacklight` `mediawiki` | wire format. Edge-route shims still report the *upstream* protocol. |
| `fulltext` | boolean | does the query search content body (OCR/full text), not just metadata? |
| `pagination` | `page` `offset` `cursor` `token` `none` | matches your §5 pattern |
| `totalCount` | boolean | upstream returns a real total → drives `hasMore` trust |
| `maxWindow` | number \| null | deep-paging ceiling (`offset+rows`), or `null` if unbounded/unknown |
| `auth` | `none` `key` `polite` | `polite` = optional mailto/UA for a faster pool |
| `rankFields.abstract` | `full` `sparse` `none` | `full`=dedicated description field; `sparse`=constructed/one-liner; `none`=never emitted |
| `rankFields.subjects` | `full` `sparse` `none` | keyword/subject richness; `sparse`=non-topical labels |
| `rankFields.citedBy` | boolean | emits a **real citation** count (not downloads/views) |

---

## 7. Edge-route adapters — the extra rules

When §1 sends you to an edge route, follow the `api/search/gallica.js` /
`api/search/openedition.js` contract exactly:

1. `export const config = { runtime: 'edge' };`
2. **8-second `AbortController` timeout.** Edge functions must not hang.
3. **Always return HTTP 200**, even on upstream failure/timeout/parse error. The
   body is `{ results: [], total: 0, error: "<reason>" }`. A failing source must
   degrade to "empty", never to a thrown 500 that takes down the unified search.
4. CORS header on every response: `'Access-Control-Allow-Origin': '*'`. Handle
   `OPTIONS` preflight with 204 if you accept POST.
5. Do all mapping **server-side** and emit finished records — **including the ranked
   four shaped per §4** (stripHtml'd abstract, dug-out subjects). The client shim
   does zero transformation.
6. Log with the shared `log()` helper: `start`, `upstream-ok`/`upstream-fail`,
   `parse-ok`, `upstream-timeout`/`edge-error`.

The **client shim** is then trivial and still owns the `capability{}` block,
tags, and offset→page math:
```js
const r = await fetch(`/api/search/<name>?q=${encodeURIComponent(query)}&page=${page}&rows=${pageSize}`);
if (!r.ok) throw new Error(`<Name> ${r.status}`);
const data = await r.json();
return { results: data.results || [], hasMore: offset + (data.results?.length || 0) < (data.total || 0) };
```

> **Caution — Edge runtime ≠ Node.** `DOMParser` may be absent in Vercel Edge V8.
> The Gallica route wraps it in try/catch and degrades gracefully. If you need
> robust XML parsing, prefer a Node serverless route or a regex/string extraction
> that you've confirmed runs in Edge.

---

## 8. Keys & secrets

- `needsKey: true` signals the UI a key is required.
- **A secret key never reaches the browser.** If the upstream needs a private key,
  you are automatically in edge-route territory (§1) — read it from
  `process.env.<NAME>` server-side and inject it there.
- `auth: "polite"` (mailto/User-Agent for a faster pool, à la Crossref/OpenAlex) is
  not a secret; it may live client-side.
- Document the env var name and how to obtain the key in
  `adapter-api-capabilities.md`.

---

## 9. Mandatory build checklist

Every new adapter must clear all of these before it's considered done:

- [ ] **Live-verified contract.** You hit the real endpoint and mapped against a
      real payload. Record the verified URL/POST-body in a code comment.
- [ ] **The ranked four are geared to this API.** You found, in *this* response
      shape, the best available source for `title`, `abstract`, and
      `subjects`/`keywords` (+ `citedBy` if real) and mapped them per §4.
- [ ] Adapter file created in `extensions/` with the full object shape (§3).
- [ ] All `region`/`archiveType`/`contentType` tags exist in `TAG_VOCAB`.
- [ ] `capability.rankFields` **verified against 3 real records** (§4.4) — it gates
      the citedBy tiebreak and the thin-source prior, so it must be honest.
- [ ] Pagination pattern (§5) matches `capability.totalCount`.
- [ ] `id` prefix + `${offset}-${i}` fallback on every result.
- [ ] Abstracts run through `stripHtml()` and front-loaded; subjects/keywords dug
      out of nested structures and capped at 8 (§4.3).
- [ ] If edge route: 8s timeout, status-200-always, CORS, server-side mapping (§7).
- [ ] If client+proxy: hostname added to `ALLOWED_DOMAINS` in `api/proxy.js`.
- [ ] Re-export added to `extensions/index.js`.
- [ ] Import + `ADAPTERS` array entry added to `src/adapters/index.js`.
- [ ] `node --check` passes on every new/edited file. (Run the full `npm run build`
      when `node_modules` is installed.)
- [ ] A real query returns mapped, ranked results in the unified view — and a
      topical query word present only in your `subjects`/`abstract` still surfaces
      the record (proves the ranked four are wired).

---

## 10. Exclusion criteria — when to walk away

Do not spend effort building an adapter for a source that is architecturally
mismatched. Confirmed hard-excludes:

| Pattern | Why it fails | Example |
|---|---|---|
| **OAI-PMH** | harvest-only; verbs select by set/date/id, **cannot do relevance keyword search** | Mexicana (the anti-pattern) |
| **IP-whitelist on serverless** | Vercel egress IPs aren't whitelistable | BASE |
| **Cloudflare JS challenge** | "Just a moment…" interstitial, no JSON fallback for serverless | DOAB directory (→ pivoted to OAPEN) |
| **Institutional credentials** | requires a per-institution login | Dialnet, Delpher KB |
| **JS-only, no JSON endpoint** | the only search is a browser SPA with no callable API | BDPI new search |
| **No topical text at all** | emits only IDs/coordinates — nothing for the ranked four (§4) | (rare; verify before excluding) |

When you exclude a source, **write the one-line reason in
`adapter-api-capabilities.md`** (and as a `//` comment where the export would have
gone, mirroring the existing `DELPHER_ADAPTER`/`NLS_ADAPTER`/`BDPI_ADAPTER`
tombstones in `extensions/index.js`). Absence of evidence from a subagent is *not*
proof of exclusion — verify the endpoint yourself before tombstoning.

---

## 11. Worked references (in-tree)

Read these before writing your first adapter — together they cover every pattern in
this document, including how each gears its own API's fields into the ranked four.

| Adapter | Demonstrates |
|---|---|
| `extensions/scielo.js` | Clean client+proxy GET-JSON template; multilingual abstract/keyword extraction into the ranked four |
| `extensions/oapen.js` | Pattern C (no total); DSpace `{key,value}` metadata flattening; subjects from `dc.subject.*`; DOI cleanup |
| `extensions/laReferencia.js` | Pattern B; ORCID-stripping authors; nested array-of-arrays **subject digging** (the ×2 win) |
| `extensions/openEdition.js` + `api/search/openedition.js` | Edge-route POST split; server-side ranked-four mapping; reverse-engineered SPA contract |
| `api/search/gallica.js` | Edge-route SRU/XML; 8s timeout; status-200 graceful degradation; Edge DOMParser caveat |
| `src/lib/scoring.js` · `src/lib/semantic.js` · `src/lib/rrf.js` | The pipeline §4 describes — read them to see exactly which fields are consumed |

---

*Optimize for the unified ranked pool. The four fields `title` / `abstract` /
`subjects` / `keywords` are read by **both** ranking arms; clean, honest,
well-mapped text there beats more sources or more citation metadata. Gear every
adapter to pull its API's best content into those four slots, label its
`capability` truthfully, and it will earn its place in every query it touches.*
