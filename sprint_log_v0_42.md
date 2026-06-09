# OpenCITE — Sprint Log v0.42

> **PM + architecture document for the next Claude instance(s).** Self-contained execution
> plan for **UX & Performance Polish** — accessibility fixes, adapter fan-out reduction,
> dedup/synonym performance improvements, admin debug UX, and a bounded server-side
> semantic spike.
>
> Read `docs/wiki/99-Archive/sprint_log_v0_36.md` (house style ref) and
> `docs/wiki/_machine/findings.json` (all finding detail) first.
>
> **Created:** 2026-06-08 · **Status:** PLANNED — not executed.
> **Mode:** C (plan → approval → execute → checklist). Dense; no padding.

---

## 0. TL;DR

**The problem:** OpenCITE has four categories of accumulated debt that are each individually
small but together degrade the experience for real users and the server scoring pipeline:

1. **Accessibility gaps** — free users fly blind on their 20-search balance (F-311), keyboard
   users can tab behind the AuthModal (F-312), ThemeStrip is color-only (F-303), LibraryPanel
   uses an unstyled native `confirm()` (F-306/F-313).
2. **Adapter fan-out waste** — Met fires up to 30–60 concurrent requests per page (F-113),
   Rijksmuseum adds 2 sequential image-resolve RTTs per page load (F-115), PANGAEA fires up
   to 20 per-hit RIS fetches regardless of whether the hit has a title (F-116).
3. **Pipeline micro-optimizations** — `dedupHighestScore` has an O(n) `indexOf` that becomes
   O(n²) at load-more sizes (F-206); Moby synonym shards `JSON.parse` synchronously on the
   main thread with the 'c' shard ~4 MB (F-207); admin debug cards show raw incomparable
   BM25F magnitudes (F-201).
4. **Research spike (stretch):** server-side semantic signal is architecturally absent for
   `/api/search` / MCP consumers (F-205); this sprint scopes the investigation only.

**Outcome:** A free user on mobile can see their remaining searches; keyboard-only navigation
works through the sign-in flow; popular adapters (Met/Rijks/PANGAEA) are less chatty; the
pipeline dedup and synonym path are O(1) and off-thread respectively; admin debug cards show
normalized 0–100 scores; a written spike report characterizes viable server embedding options.

---

## 1. Scope

| Group | Finding(s) | Severity | Est. hours |
|---|---|---|---|
| UX/accessibility | F-311, F-312, F-303, F-306/F-313 | med/low | 4.5 h |
| Adapter perf | F-113, F-115, F-116 | med/low | 3.5 h |
| Pipeline perf/quality | F-206, **F-208**, F-207, F-201, F-200 (doc only) | low/med | 3.75 h |
| Research spike (stretch) | F-205 | med | 1.5 h |
| Test + cleanup | — | — | 1.5 h |
| **Total** | | | **~14.75 h** |

**In scope:** F-311 (blocked on F-300 BillingProvider, dependency documented below),
F-312, F-303, F-306/F-313, F-113, F-115, F-116, F-206, **F-208** (dedup field-merge —
co-located with F-206 in the same `dedupHighestScore` rewrite, §2.13 / T3.1), F-207, F-201,
F-200 (mitigation doc), F-205 (spike only — no implementation committed).

**Out of scope:** F-300 BillingProvider full wiring (prerequisite for F-311 full
implementation — delegated to v0.41 or its own task; see §2), dead-adapter quarantine
(done in v0.38), security findings (F-4xx series), data-layer fixes (F-5xx series).

**No permanent deletion:** any code removal follows the quarantine policy at
`docs/wiki/99-Archive/_quarantine/_index.md` — copy verbatim source to a dossier, remove
from active imports, mark machine record `quarantined`.

---

## 2. Design & approach

### 2.1 F-311 — Credit balance display (dependency: v0.41 F-300)

**Dependency flag.** `BillingContext.jsx` is a stub (F-300): `BillingProvider` is not
mounted in `App.jsx:462–470`; `credits` is hardcoded `Infinity`. F-311 (surfacing the
balance) cannot be fully implemented until F-300 ships (mount provider + wire to
`/api/credits`). **v0.41 is the expected vehicle for F-300.**

This sprint implements the *display shell* only — a `CreditsChip` component in the Header
nav that reads `useBilling().credits` and renders gracefully when credits is `Infinity`
(shows nothing / omits chip). When F-300 ships the chip becomes live with zero additional
work.

**Approach:**
- `src/components/Layout.jsx`: add `CreditsChip` reading `useBilling()`. When
  `credits === Infinity` → renders `null`. When numeric → renders `「N left」` (or similar)
  near the `◇ plans` nav button.
- `src/contexts/BillingContext.jsx`: no change — stub untouched until v0.41.
- `src/App.jsx`: pass no new props; `useBilling()` inside `Header`/`CreditsChip` reads
  context directly.

**Acceptance:** chip is invisible today (stub → Infinity); becomes visible and correct the
moment v0.41 mounts the real provider with a finite balance.

### 2.2 F-312 — AuthModal focus trap (WCAG 2.1 SC 2.1.2)

`src/components/Layout.jsx:264–325` renders `AuthModal` as a plain `<div>` overlay with no
focus containment. Keyboard users Tab through to the main page behind the overlay.

**Approach (no new dependency):** implement a minimal manual focus trap inside `AuthModal`:
- On mount (`useEffect`), query all focusable elements within the modal container and move
  focus to the first one.
- Attach a `keydown` handler on the modal container: when `Tab` is pressed, cycle focus
  within the modal's focusable children; when `Escape` is pressed, call `onDismiss`.
- On unmount, restore focus to the element that was focused before the modal opened
  (`document.activeElement` captured at mount).

No third-party library needed given the modal has only 2–3 interactive elements (Google
sign-in button + "Continue anonymously" button). This avoids adding a production dependency
for a ~30-line pattern.

### 2.3 F-303 — ThemeStrip `aria-label` on swatches

`src/components/Layout.jsx:208–219`. Each swatch `<button>` has only a `title` attribute
tooltip; screen readers read the button with no meaningful label; colorblind users cannot
distinguish swatches by color alone.

**Approach:** add `aria-label={t.label}` to each swatch button. Optionally add a visible
text label below the active swatch (e.g., small `mono-font` name). The `title` tooltip
stays for pointer users.

### 2.4 F-306/F-313 — LibraryPanel inline confirmation

`src/components/Panels.jsx:499`: `confirm(`Remove all ${items.length} items...`)` — native
browser dialog, unstyled, inaccessible.

**Approach:** two-step button pattern (no modal needed):
- First click on "Clear all" → sets local `confirmClear` state to `true`, button text
  changes to "⚠ Confirm clear?" (amber/red colour).
- Second click → calls `onClear()`, resets state.
- Any other click / pointer-leave → resets state to `false`.

This is ~15 lines of state + JSX, consistent with the existing design system, and requires
no overlay/portal.

### 2.5 F-113 — Met fan-out reduction

`src/adapters/extensions/met.js:27`: `fetchSlice = allIds.slice(offset, offset + pageSize * 3)`,
then `Promise.all(fetchSlice.map(...))` → up to 30 concurrent requests for INITIAL_PAGE_SIZE=10
or 60 for LOAD_MORE_PAGE_SIZE=20.

**Acceptability:** fine at current traffic (client-side browser adapter, not a Vercel
function). At ≤50 docs / low-traffic usage, 30 concurrent requests rarely hit the Met's
rate limit. However, on slow connections this saturates the browser connection pool and
delays the entire page.

**Approach:** reduce the fetch multiplier from `3×` to `1.5×` (round up to integer):
```js
const fetchSlice = allIds.slice(offset, offset + Math.ceil(pageSize * 1.5));
```
This halves peak concurrency (15 at initial, 30 at load-more) while still providing enough
candidates to fill a filtered page. Relevance filter at `met.js:33–40` already trims to
`pageSize` after filtering, so the reduced slice still works correctly when hit density is
~50% (the typical ratio for cultural-query terms).

No retry or batching needed; the Met API is generally reliable. Document the multiplier
choice in a comment.

### 2.6 F-115 — Rijksmuseum image cache

`src/adapters/extensions/rijksmuseum.js:141–172`: `resolveImage()` performs 2 sequential
proxy hops (VisualItem → DigitalObject) for each result. All results run concurrently, but
each has 2 extra sequential RTTs = up to 3 fetch waves per page.

**Acceptability:** fine at current traffic (client-only, not hot path). But adds 200–600 ms
latency on every Rijksmuseum page load even for results the user has seen before.

**Approach:** module-level `Map<objectId, imageUrl>` session cache. Before firing the 2-hop
resolve, check the cache; if hit, return immediately. On success, write to cache. The cache
lives for the session (in-memory JS Map) — no localStorage needed; image URLs are stable
per object.

```js
// top of rijksmuseum.js
const imageCache = new Map(); // objectId → resolved URL string

async function resolveImage(obj) {
  const id = obj.id;
  if (id && imageCache.has(id)) return imageCache.get(id);
  // ... existing 2-hop logic ...
  if (url) imageCache.set(id, url);
  return url;
}
```

### 2.7 F-116 — PANGAEA pre-filter before RIS fetch

`src/adapters/extensions/pangaea.js:68–98`: `Promise.all(hits.map(async h => ... fetchRIS(numericId)))`.
Each Elasticsearch hit fires a separate RIS endpoint request regardless of whether the hit
has a usable title in the ES source. Items where `title` is empty in both RIS and ES source
are then filtered at `pangaea.js:100–101` — meaning the RIS fetch was wasted.

**Acceptability:** fine at current traffic. At 10–20 concurrent RIS fetches the PANGAEA
endpoint is rarely saturated. But wasted fetches slow results for PANGAEA.

**Approach:** pre-filter `hits` to only those with a non-empty `agg-datasetname` or
`title` in the ES `_source` before firing RIS fetches:

```js
const filteredHits = hits.filter(h => {
  const s = h._source || {};
  return !!(s["agg-datasetname"] || s["title"]);
});
const rawResults = await Promise.all(filteredHits.map(async (h, i) => { ... }));
```

This removes RIS fetches for hits with no ES-side title signal, which are the ones that
would be filtered post-RIS anyway. The `numericId`-only path (`ris` parse from
`fetchRIS(numericId)`) still runs for hits that do have an ES title — those may have a
richer title in RIS, which is correct.

### 2.8 F-206 — dedupHighestScore O(n) → O(1)

`src/lib/dedup.js:44`: `out[out.indexOf(existing)] = r` — `indexOf` linearly scans `out`
for the existing entry. At pool ≤50 this is negligible (≤50² = 2,500 comparisons). At
load-more accumulation across 3–4 pages (up to 200 docs) worst-case is 40,000 comparisons.

**Fix:** maintain a second `Map<key, outIndex>` that tracks each key's position in `out`.
On replacement, update both `byKey` and `posMap` in O(1).

```js
export function dedupHighestScore(records, keyFn) {
  const byKey = new Map();   // key → record
  const posMap = new Map();  // key → index in out[]
  const out = [];
  for (const r of records) {
    const key = keyFn(r);
    if (key == null) { out.push(r); continue; }
    const existing = byKey.get(key);
    if (!existing) {
      posMap.set(key, out.length);
      byKey.set(key, r);
      out.push(r);
    } else if ((r._score || 0) > (existing._score || 0)) {
      out[posMap.get(key)] = r;
      byKey.set(key, r);
    }
  }
  return out;
}
```

### 2.9 F-207 — Moby shard JSON.parse off main thread

`src/lib/synonyms.js:48–61`: `resp.json()` parses the shard synchronously on the main
thread (the `.json()` deserialization runs in the JS engine's main execution context after
the fetch resolves). The 'c' shard is ~4 MB; first parse for a 'c'-initial term can cause
a 50–150 ms jank spike on low-end mobile.

**Approach option A (preferred):** move `loadShard` into the existing embed Web Worker
(`src/workers/embed.worker.js`) or a new `synonyms.worker.js`. The main thread sends a
`{type:'loadShard', letter}` message and awaits the `Map` back. The jank moves off-thread.

**Approach option B (simpler):** use `queueMicrotask` or `setTimeout(0, parseFn)` to defer
the parse to the next task boundary, which doesn't eliminate jank but yields the main thread
for a single frame. Not a full fix; document limitation.

**Decision:** use option A (new `synonyms.worker.js`). The embed worker already demonstrates
the pattern. The synonym expansion is already async (`await expandTerms(...)`) so the call
site needs no change — just the internal `loadShard` implementation moves. Shards are
already cached after first load, so the worker overhead is one-time per session.

**Scope constraint:** if option A proves complex (worker message plumbing, serialization of
`Map` across the boundary), fall back to option B and document. Do not over-engineer.

### 2.10 F-201 — Normalize score in admin debug cards

`src/lib/scoring.js:13–15`: raw BM25F `_score` values (e.g. 1.79 vs 16.17) are shown in
admin debug cards. These are query-length-dependent and confusing for cross-query comparison.

**Approach:** in the admin `ScoreCard` renderer (`src/components/admin/AdminConsole.jsx` or
its ScoreCard sub-component), compute `displayScore = Math.round((_score / maxScore) * 100)`
where `maxScore` is `results[0]._score` (the top hit for this query). Show `displayScore`
as "XX / 100" alongside the raw `_score` in small text for transparency. Raw `_score` stays
in the data; only the display is normalized. No change to `scoring.js`.

### 2.11 F-200 — BM25F micro-pool IDF (accepted residual — document mitigation)

`src/lib/scoring.js:160–171`: IDF computed over 14–45 docs; statistically degenerate.
Mitigated (not eliminated) by RRF fusion weighting it 30–50% depending on pool size.

**No code change.** This sprint adds a comment block at `scoring.js:155` documenting:
- The micro-pool problem (N ≈ 14–45).
- The RRF mitigation (nativeWeight 0.7 at pool < 20, 0.5 at pool ≥ 50).
- The path to eliminate: corpus-level IDF priors (a background stats endpoint) or full
  reliance on native+semantic when available.
- Why it's accepted: RRF makes local BM25F share weight with full-corpus native signals;
  the residual effect is bounded.

Cross-ref: `[[03-Search-Pipeline/Known-Defects#d3]]` · [F-200].

### 2.12 F-205 — Semantic server signal (stretch research spike)

`src/lib/semantic.js`: Web Worker + 23 MB `all-MiniLM-L6-v2`. Cannot run in Vercel
Functions. `/api/search` and the MCP endpoint use two-input RRF (native + lexical) only.

**This sprint: spike report only. No implementation committed.**

Spike questions to answer:
1. **Hosted embedding API** — does OpenAI/Cohere/Jina offer a small embedding model callable
   from a Vercel Function within the 10 s timeout? What is the per-call latency + cost at
   100 req/day?
2. **Vercel AI SDK** — does the `@vercel/ai` package expose a sync-capable embedding path
   usable without a Web Worker?
3. **Smaller sync model** — are there ONNX/WASM-compiled models ≤ 5 MB that run sync in
   Node.js (Vercel Function runtime) with acceptable recall vs. the 23 MB MiniLM?
4. **Vector API (Upstash/Supabase pgvector)** — pre-embed the candidate pool at index time
   and query by vector at search time; is the latency budget compatible with the 12 s
   adapter timeout?

**Spike deliverable:** a `docs/wiki/03-Search-Pipeline/Semantic-Server-Spike.md` document
(≤ 400 words + a go/no-go table). No new code. The spike informs a future sprint (v0.43+
if warranted).

### 2.13 — F-208 dedup keeps highest score but DISCARDS the duplicate's metadata

> **Provenance:** lifted from `neuromechanist/opencite` (`src/opencite/dedup.py` →
> `merge_papers()`), MIT-licensed. Algorithm only; clean-room re-implement in JS. Full
> competitive teardown + merge-policy origin in `sprint_log_v0_43.md` Appendix A (§A.2/§A.3).

`src/lib/dedup.js:33–49` (`dedupHighestScore`) keeps the highest-`_score` copy of a
duplicate **and throws the loser away** — line 43–45 just swaps the array reference. The
streaming path `dedupFirstWins` (`:22–30`) is worse: it drops every later copy with
`.filter`. **In both paths, when the same work arrives from two sources, one source's
fields are lost.**

Concrete loss: a paper returned by both **Crossref** (rich `abstract`, `is-referenced-by-count`)
and **OpenAlex** (real `cited_by_count`, fuller `authors`, `relevance_score`) collapses to a
single record — whichever scored higher — silently discarding the other's superior fields.
This degrades card quality (missing abstracts/authors) and weakens the `citedBy` rank signal
the v0.35 RRF fusion consumes.

**Fix — field-level merge on collapse, not wholesale discard.** Add a pure `mergeRecords(keep,
drop)` helper and call it at the dedup collision point so the surviving record is *enriched*
with the loser's better fields. Merge policy (ported from `merge_papers()`, mapped to our
`UnifiedResult`):

| Field class | Rule |
|---|---|
| Identifiers (`doi`, `pmid`, ids[]) + `sources`/origin tags | **union** (provenance — never drop an identifier) |
| `abstract` | prefer the **longer** non-empty string |
| `authors` | prefer the **longer** list (richer author set) |
| `citedBy` / `nativeScore` | take the **max** |
| Collection fields (keywords, subjects, image/pdf links) | **union, de-duplicated** |
| Single-value scalars (`year`, `publisher`, `language`, `url`, `title`) | prefer **existing** (the higher-scored keeper is canonical) |
| `_score` | keep the **higher** (unchanged — drives which record is canonical) |

**Field-name caveat (no invention):** the exact `UnifiedResult` field set must be read from
`src/adapters/base.js` before coding — implement the *policy* above against the real fields,
do not assume field names not present there.

**Source deep-read refinements (2026-06-09, `sprint_log_v0_43.md` Appendix B.4):**
- **Fuzzy matcher decision — CLOSED: keep our BM25F.** Their `titles_similar` is Jaccard@0.7
  (order-insensitive bag-of-words, uncalibrated `0.7`/`len≥3`), strictly weaker. Adopt nothing
  from it; the merge keys stay `doiKey`/`titleFingerprint`.
- **Safety flags merge by OR, not "prefer existing":** any boolean like `is_retracted` /
  `is_oa` → `keep.flag || drop.flag` (any source flags retraction ⇒ retracted — asymmetric
  with normal scalars, safety-critical). A conflicting **enum** (e.g. `oa_status`) can't OR →
  pick by source-priority if we have one, else keep canonical, and log the disagreement.
- **Collection-union preserves casing + order:** dedup key on `.toLowerCase()` but push the
  **original-cased** value and keep insertion order (a naive `Set` loses one or the other);
  dedup pdf/image links by `url` (first-seen wins), grants by `(funder, award_id)`.
- **Authors — improve on source:** their rule takes the longer list wholesale and discards the
  other; prefer **merging the author sets** (de-dup by normalized name) if scope allows, else
  fall back to longer-list.

**Why it lives here, not its own sprint:** F-206 (T3.1) already rewrites
`dedupHighestScore`. Implementing the merge in a *separate* sprint would mean two sprints
editing the same function → guaranteed conflict. **F-208 is folded into the F-206 rewrite
(T3.1) as one surgical change.** It is the only *behavior* change in this otherwise
polish-only sprint — gated and verified accordingly (§5 R7).

**Decoupled dependency:** identifier canonicalization (DOI/PMID/PMCID normalization, the
v0.43 #2 win) would tighten the *keys* that decide what merges. F-208 ships against today's
keys (`doiKey`, `titleFingerprint`) and forward-benefits from v0.43 with no rework.

---

## 3. Execution plan

### T1 — UX/accessibility fixes (~4.5 h)

**T1.1 — CreditsChip shell for F-311 (~1 h)**
- [ ] `src/components/Layout.jsx`: import `useBilling` from `BillingContext.jsx`.
  Add `CreditsChip` component:
  ```jsx
  function CreditsChip() {
    const { credits } = useBilling();
    if (credits === Infinity || credits == null) return null;
    return (
      <span className="mono-font text-[10px] uppercase tracking-widest text-stone-600"
            title="Remaining searches this month">
        {credits} left
      </span>
    );
  }
  ```
  Insert `<CreditsChip />` between the `◇ plans` and `⚙ settings` nav buttons
  (`Layout.jsx:143–147`). Confirm `useBilling()` reads the stub and renders `null`.
- [ ] **Dependency callout in code:** add a `// F-311: CreditsChip live once F-300
  (BillingProvider) is mounted in App.jsx` comment above the component.
- [ ] Manual test: chip invisible in browser (stub credits = Infinity). Temporarily set
  `credits: 7` in `BillingContext.jsx:23` → confirm chip renders "7 left" → revert.

**T1.2 — AuthModal focus trap for F-312 (~1.5 h)**
- [ ] `src/components/Layout.jsx:264`: add `useRef(null)` for the inner modal `<div>`.
  Add `useEffect` on mount:
  ```js
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const prev = document.activeElement;
    const focusable = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();
    const trap = (e) => {
      if (e.key === 'Escape') { onDismiss(); return; }
      if (e.key !== 'Tab') return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    el.addEventListener('keydown', trap);
    return () => { el.removeEventListener('keydown', trap); prev?.focus(); };
  }, [onDismiss]);
  ```
  Apply `ref={modalRef}` to the inner content `<div>` at `Layout.jsx:273`.
- [ ] Manual test: open AuthModal via "↳ sign in" → Tab cycles within modal only →
  Escape dismisses → focus returns to sign-in button. Test with Chrome DevTools a11y pane.

**T1.3 — ThemeStrip aria-labels for F-303 (~0.5 h)**
- [ ] `src/components/Layout.jsx:213`: add `aria-label={t.label}` to the swatch `<button>`.
  Current line:
  ```jsx
  <button key={key} onClick={() => onChange(key)}
    title={t.label}
    className={...}
    style={{ background: t.swatch }} />
  ```
  After:
  ```jsx
  <button key={key} onClick={() => onChange(key)}
    aria-label={t.label}
    title={t.label}
    aria-pressed={themeKey === key}
    className={...}
    style={{ background: t.swatch }} />
  ```
  Add `aria-pressed` to mark the active swatch for screen reader state announcement.
- [ ] Manual test: Chrome a11y pane shows swatch buttons with named labels. Screen reader
  (NVDA/VoiceOver on test device) reads "Cream, toggle button, not pressed" etc.

**T1.4 — LibraryPanel inline confirm for F-306/F-313 (~1.5 h)**
- [ ] `src/components/Panels.jsx:499`: replace the `confirm()` call with a two-step button
  pattern. Add `const [confirmClear, setConfirmClear] = useState(false)` to
  `LibraryPanel` state.

  Replace:
  ```jsx
  <button onClick={() => { if (confirm(`Remove all ${items.length} items from your library?`)) onClear(); }}>
    Clear all
  </button>
  ```
  With:
  ```jsx
  {!confirmClear
    ? <button onClick={() => setConfirmClear(true)}
        className="mono-font text-[10px] uppercase tracking-widest text-stone-600 hover:text-red-900 transition">
        Clear all
      </button>
    : <span className="flex items-center gap-2">
        <button onClick={() => { onClear(); setConfirmClear(false); }}
          className="mono-font text-[10px] uppercase tracking-widest text-red-700 hover:text-red-900 transition">
          ⚠ Confirm clear?
        </button>
        <button onClick={() => setConfirmClear(false)}
          className="mono-font text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-900 transition">
          Cancel
        </button>
      </span>
  }
  ```
  Reset `confirmClear` to `false` when `selectMode` changes or the panel closes
  (add a `useEffect([selectMode])`).
- [ ] Manual test: "Clear all" → "⚠ Confirm clear?" / "Cancel" appear. Click Cancel →
  reverts. Click "⚠ Confirm clear?" → library cleared. Native `confirm()` dialog never
  appears.

---

### T2 — Adapter performance (~3.5 h)

**T2.1 — Met fan-out cap for F-113 (~1 h)**
- [ ] `src/adapters/extensions/met.js:26`: change multiplier from `3` to `1.5`:
  ```js
  // Before:
  const fetchSlice = allIds.slice(offset, offset + pageSize * 3);
  // After:
  const fetchSlice = allIds.slice(offset, offset + Math.ceil(pageSize * 1.5));
  ```
  Add comment: `// F-113: 1.5× (not 3×) — caps at 15 concurrent requests for initial
  page, 30 for load-more. Still gives enough candidates for the relevance filter.`
- [ ] Manual test: search "mughal" → Met adapter returns ≥1 result. Network tab shows
  ≤15 concurrent requests to `collectionapi.metmuseum.org/...` (not 30).

**T2.2 — Rijksmuseum image session cache for F-115 (~1.5 h)**
- [ ] `src/adapters/extensions/rijksmuseum.js`: add module-level cache at the top of the
  file (before `resolveImage`):
  ```js
  // F-115: session cache for resolved image URLs — avoids 2-hop re-fetch on repeat loads.
  const _imageCache = new Map(); // objectId → resolved URL (or "" for known-missing)
  ```
  At the top of `resolveImage(obj)` (line 141), insert:
  ```js
  const cacheKey = obj.id;
  if (cacheKey && _imageCache.has(cacheKey)) return _imageCache.get(cacheKey);
  ```
  At the end (before `return url`), insert:
  ```js
  if (cacheKey) _imageCache.set(cacheKey, url);
  ```
- [ ] Manual test: search "rembrandt" → Rijksmuseum results load images. Trigger the same
  search again (or "Show more") → network tab shows no second `proxiedFetch` calls to
  the linked-art endpoints for previously resolved object IDs. Confirm images still display.

**T2.3 — PANGAEA pre-filter for F-116 (~1 h)**
- [ ] `src/adapters/extensions/pangaea.js:68`: insert pre-filter before the
  `Promise.all(hits.map(...))` call:
  ```js
  // F-116: pre-filter to hits with a usable title in ES source, avoiding wasted RIS fetches.
  const titleHits = hits.filter(h => {
    const s = h._source || {};
    return !!(s["agg-datasetname"] || s["title"]);
  });
  const rawResults = await Promise.all(titleHits.map(async (h, i) => {
    // ... existing per-hit logic unchanged ...
  }));
  ```
  The per-hit logic body is unchanged; only the input array changes from `hits` to `titleHits`.
- [ ] Manual test: search "ocean temperature" → PANGAEA adapter returns results. In the
  network tab confirm the number of `/oai/provider` (RIS) requests is ≤ the number of
  Elasticsearch hits that had a `agg-datasetname`. No functional regression.

---

### T3 — Pipeline perf/quality fixes (~3 h)

**T3.1 — dedupHighestScore O(1) + field-merge for F-206 & F-208 (~1.5 h)**

*One rewrite covers both findings: the `posMap` removes the O(n) `indexOf` (F-206) and the
`mergeRecords` call enriches the keeper instead of discarding the loser (F-208). Doing them
together avoids two sprints touching the same function.*

- [ ] **Step 0 (F-208 prerequisite):** read `src/adapters/base.js` to enumerate the real
  `UnifiedResult` fields. Map the §2.13 merge-policy table onto the *actual* field names —
  do not assume fields that aren't there.
- [ ] Add a pure helper in `src/lib/dedup.js` (above `dedupHighestScore`):
  ```js
  // F-208: enrich the surviving record with the duplicate's better fields instead of
  // discarding it. `keep` is canonical (higher _score); `drop` is the collapsed duplicate.
  // Policy: §2.13. Field names below MUST be reconciled against src/adapters/base.js.
  const _longer = (a, b) => ((b || "").length > (a || "").length ? b : a);
  const _maxNum = (a, b) => Math.max(a || 0, b || 0);
  const _union  = (a, b) => Array.from(new Set([...(a || []), ...(b || [])]));
  export function mergeRecords(keep, drop) {
    if (!drop) return keep;
    return {
      ...keep,
      // union identifiers + provenance (never drop an id)
      sources:  _union(keep.sources, drop.sources),
      // prefer richer text / lists
      abstract: _longer(keep.abstract, drop.abstract),
      authors:  (drop.authors?.length || 0) > (keep.authors?.length || 0) ? drop.authors : keep.authors,
      // strongest citation/native signal wins
      citedBy:     _maxNum(keep.citedBy, drop.citedBy),
      nativeScore: _maxNum(keep.nativeScore, drop.nativeScore),
      // single-value scalars: keep canonical; fill only if missing
      doi:       keep.doi  || drop.doi,
      year:      keep.year || drop.year,
      publisher: keep.publisher || drop.publisher,
      language:  keep.language  || drop.language,
      url:       keep.url || drop.url,
      // _score unchanged — keep is already the higher
    };
  }
  ```
- [ ] Rewrite `dedupHighestScore` (`:33–49`) with `posMap` (O(1)) **and** merge-on-collision:
  ```js
  export function dedupHighestScore(records, keyFn) {
    const byKey  = new Map(); // key → record
    const posMap = new Map(); // key → index in out[]
    const out    = [];
    for (const r of records) {
      const key = keyFn(r);
      if (key == null) { out.push(r); continue; }
      const existing = byKey.get(key);
      if (!existing) {
        posMap.set(key, out.length);
        byKey.set(key, r);
        out.push(r);
      } else {
        // F-208: pick canonical by score, then enrich it with the loser's better fields.
        const keep = (r._score || 0) > (existing._score || 0) ? r : existing;
        const drop = keep === r ? existing : r;
        const merged = mergeRecords(keep, drop);
        const idx = posMap.get(key);     // F-206: O(1), no indexOf scan
        out[idx] = merged;
        byKey.set(key, merged);
      }
    }
    return out;
  }
  ```
- [ ] **Decide for the streaming path (`dedupFirstWins`, `:22–30`):** it cannot merge —
  later copies haven't arrived when it runs and scores aren't comparable across batches
  (the file header documents this). Leave it first-wins; add a one-line comment noting the
  merge happens only in the pooled path. Do **not** retrofit merge into the streaming path
  this sprint (out of scope — would need cross-batch buffering).
- [ ] Unit test (`src/__tests__/dedup` or new): (a) two records, same `doiKey`, different
  `_score` → output length 1, keeps higher `_score`, and the merged record has the longer
  abstract + union of `sources` + max `citedBy`. (b) 200-record synthetic pool → assert no
  `indexOf` on `out` and `performance.now()` delta < 1 ms.

**T3.2 — Moby shard parse off-thread for F-207 (~1.5 h)**
- [ ] Create `src/workers/synonyms.worker.js`:
  ```js
  // Synonyms Web Worker — loads and parses Moby Thesaurus shards off the main thread.
  const shardCache = new Map();
  self.onmessage = async ({ data }) => {
    const { id, letter } = data;
    if (shardCache.has(letter)) {
      self.postMessage({ id, letter, entries: [...shardCache.get(letter).entries()] });
      return;
    }
    try {
      const resp = await fetch(`/synonyms/${letter}.json`);
      if (!resp.ok) throw new Error(resp.status);
      const raw = await resp.json(); // parse happens here, off main thread
      const map = new Map(Object.entries(raw));
      shardCache.set(letter, map);
      self.postMessage({ id, letter, entries: [...map.entries()] });
    } catch {
      self.postMessage({ id, letter, entries: [] });
    }
  };
  ```
- [ ] `src/lib/synonyms.js:48–61`: replace the synchronous `loadShard` with a worker-based
  version. Use the same `getWorker()` / pending-Map pattern as `src/lib/semantic.js`:
  ```js
  let synWorker = null;
  let synMsgId = 0;
  const synPending = new Map();

  function getSynWorker() {
    if (synWorker) return synWorker;
    synWorker = new Worker(
      new URL('../workers/synonyms.worker.js', import.meta.url),
      { type: 'module' }
    );
    synWorker.onmessage = ({ data }) => {
      const p = synPending.get(data.id);
      if (!p) return;
      const map = new Map(data.entries);
      shardCache.set(data.letter, map);
      p.resolve(map);
      synPending.delete(data.id);
    };
    return synWorker;
  }

  async function loadShard(letter) {
    if (shardCache.has(letter)) return shardCache.get(letter);
    return new Promise((resolve, reject) => {
      const id = ++synMsgId;
      synPending.set(id, { resolve, reject });
      getSynWorker().postMessage({ id, letter });
    });
  }
  ```
  The `mobyLookup` and `expandTerms` functions remain unchanged (they already `await
  loadShard`).
- [ ] **Fallback:** if `typeof Worker === 'undefined'` (SSR/test env), keep the original
  inline `fetch + resp.json()` path. Add an environment guard at the top of `loadShard`.
- [ ] Manual test: search a 'c'-initial term ("climate"). DevTools → Performance → confirm
  no ≥50 ms long task on the main thread during synonym expansion. Synonym expansion still
  returns results (e.g. "climate" expands to weather-related synonyms).

**T3.3 — Admin score normalization for F-201 (~0.75 h)**
- [ ] Read `src/components/admin/AdminConsole.jsx` to locate the ScoreCard renderer.
- [ ] In the ScoreCard component (or inline in AdminConsole), compute
  `displayScore = Math.round((_score / maxScore) * 100)` where `maxScore` is
  `results[0]?._score || 1`. Render as `{displayScore}/100` with the raw `_score` in a
  secondary `text-stone-400` span.
- [ ] Manual test: open `#/admin/console` → Score Explainer → run a query. Confirm top
  result shows "100/100"; others show proportional values. Raw scores still visible.

**T3.4 — F-200 mitigation comment (~0 h code / ~0.25 h doc)**
- [ ] Add a block comment at `src/lib/scoring.js:155` (before the IDF computation loop):
  ```js
  // F-200 (accepted residual): IDF is computed over the micro-pool (typically 14–45 docs),
  // not a real corpus. This makes IDF values statistically noisy — a term's apparent
  // "rarity" reflects pool composition, not true corpus frequency.
  //
  // MITIGATION (in place): RRF fusion weights local BM25F at most 30–50% depending on
  // pool size (nativeWeight=0.7 at pool<20 → localWeight=0.3; nativeWeight=0.5 at pool≥50).
  // The full-corpus native signal (OpenAlex relevance_score, Crossref Solr score, etc.)
  // dominates when pool is small — exactly when IDF is most degenerate.
  //
  // TO ELIMINATE: replace with corpus-level IDF priors (background stats endpoint) or
  // rely entirely on native+semantic when available. Not a priority at current traffic.
  // See: docs/wiki/03-Search-Pipeline/Known-Defects.md#d3 · F-200
  ```

---

### T4 — F-205 research spike (stretch, ~1.5 h)

> Skip if T1–T3 run long. Spike report is the only deliverable — no code committed.

- [ ] T4.1 Read `docs/wiki/03-Search-Pipeline/Semantic-Rerank.md` and `src/lib/semantic.js`
  to document the current client path parameters (model size, latency, recall).
- [ ] T4.2 Survey options (web search / docs):
  - OpenAI `text-embedding-3-small` latency + cost at ~30 docs/query.
  - Jina AI `jina-embeddings-v2-small-en` (ONNX, 33 MB — too large for serverless cold start?).
  - `@vercel/ai` embedding support in Edge/Node runtime.
  - Upstash Vector / Supabase pgvector feasibility for pre-embedding the result pool.
- [ ] T4.3 Write `docs/wiki/03-Search-Pipeline/Semantic-Server-Spike.md` (≤400 words):
  - Go/no-go table: option, latency budget fit, cost/day at 100 queries, cold-start size,
    verdict.
  - Recommendation: which option (if any) to prototype in v0.43+, or "defer indefinitely".
- [ ] T4.4 Update `docs/wiki/03-Search-Pipeline/Known-Defects.md` F-205 status: `open →
  spike-complete`, link to spike doc.

---

### T5 — Test & cleanup (~1.5 h)

- [ ] T5.1 Run the full app locally against a test query set:
  `{ "climate change", "mughal architecture", "rembrandt", "ocean temperature" }`.
  Confirm:
  - No regression in result count or ranking vs. pre-sprint baseline.
  - CreditsChip invisible (stub).
  - AuthModal focus trap works.
  - ThemeStrip swatches have `aria-label` in DOM inspector.
  - LibraryPanel shows two-step confirm (no native dialog).
  - Met network tab shows ≤15 concurrent requests.
  - PANGAEA network tab shows fewer RIS fetches than total ES hits.
  - dedup and synonym expansion complete without errors.
  - Admin score cards show "XX/100" display values.
- [ ] T5.2 Update `docs/wiki/_machine/findings.json`:
  - F-311: `status: "shell-complete"` + note `"F-300 required for live balance"`.
  - F-312: `status: "fixed"`.
  - F-303: `status: "fixed"`.
  - F-306, F-313: `status: "fixed"`.
  - F-113: `status: "mitigated"` (1.5× multiplier, not fully eliminated).
  - F-115: `status: "mitigated"` (session cache).
  - F-116: `status: "mitigated"` (pre-filter).
  - F-206: `status: "fixed"`.
  - F-208: `status: "fixed"` (field-merge on dedup collapse; pooled path only).
  - F-207: `status: "fixed"` (if option A shipped) or `"mitigated"` (if option B).
  - F-201: `status: "fixed"` (normalized display).
  - F-200: `status: "confirmed"` (comment added; accepted residual).
  - F-205: `status: "spike-complete"` or `"open"` (if T4 skipped).
- [ ] T5.3 Commit with message:
  `feat(v0.42): UX & perf polish — focus trap, credits chip, aria swatches, adapter fan-out, dedup O(1)+field-merge, synonym off-thread`

---

## 4. Acceptance criteria

- [ ] `CreditsChip` renders in the Header nav; shows `null` when `credits === Infinity`
  (stub); renders a count when `credits` is finite (verified by temporary stub override).
- [ ] `AuthModal`: Tab key cycles within the modal's interactive elements; Shift+Tab cycles
  in reverse; Escape calls `onDismiss`; focus returns to the triggering element on close.
- [ ] `ThemeStrip` swatch buttons have `aria-label={t.label}` and `aria-pressed={active}`
  in the rendered DOM.
- [ ] `LibraryPanel` "Clear all" flow: first click → "⚠ Confirm clear?" + "Cancel" appear;
  Cancel reverts; Confirm clears library. Native browser `confirm()` is never invoked.
- [ ] Met adapter: network requests to `collectionapi.metmuseum.org/…/objects/` ≤ `⌈pageSize × 1.5⌉`
  per search (≤15 for initial, ≤30 for load-more).
- [ ] Rijksmuseum: a second search for the same query produces 0 calls to linked-art proxy
  endpoints for objects already resolved in the session.
- [ ] PANGAEA: number of `/oai/provider` RIS fetches ≤ number of ES hits with a
  non-empty `agg-datasetname` or `title` field.
- [ ] `dedupHighestScore`: no `indexOf` calls on `out` array; correctness unchanged
  (verified by existing tests or a new synthetic 200-record test). **[F-206]**
- [ ] On a same-`doi` collision, the surviving record is the higher-`_score` copy **enriched**
  with the loser's longer abstract, richer author list, max `citedBy`, and unioned `sources`
  — not the loser-discarded record. Single-value scalars keep the canonical record's values.
  `dedupFirstWins` streaming path unchanged. **[F-208]**
- [ ] Synonym shard parse for a 'c'-initial term does not produce a long task > 50 ms on
  the main thread (Chrome DevTools Performance trace).
- [ ] Admin Score Explainer: top result shows "100/100"; scores are proportional within a
  query; raw BM25F value still visible in secondary text.
- [ ] No production search regression on the baseline query set (T5.1).

---

## 5. Risk register

| ID | Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | T1.1 F-311 | BillingProvider (F-300) ships in a different version and the chip API changes | Med | Low | CreditsChip reads only `credits` scalar from `useBilling()` — minimal surface; easy to adapt |
| R2 | T1.2 F-312 | focus trap `querySelectorAll` misses dynamically added elements inside modal | Low | Low | Modal has only 2 static buttons; `querySelectorAll` at mount is sufficient |
| R3 | T2.1 F-113 | Reduced Met multiplier (1.5×) returns too few candidates after relevance filter | Med | Med | Relevance filter accepts ~50% of fetched items; 1.5× gives 15 candidates → typically ≥7 pass filter. If < pageSize results return, fall back silently (current behavior: `results` is shorter than pageSize). Monitor in T5.1 |
| R4 | T3.2 F-207 | Synonyms worker `new Worker(...)` fails in test/SSR environments | Low | Low | Add `typeof Worker === 'undefined'` guard + synchronous fallback path |
| R5 | T3.2 F-207 | Worker `Map` serialization (entries array) adds noticeable overhead for large shards | Low | Low | Entries array for 'c' shard is ~4 MB JSON → ~100 ms to re-serialize for postMessage. If overhead is > 200 ms on first load, fall back to option B (queueMicrotask) and document |
| R6 | T4 F-205 | Spike overruns budget, crowds out T5 | Low | Med | T4 is explicitly stretch; skip if T1–T3 consume the session |
| R7 | T3.1 F-208 | Field-merge is the only behavior change in a polish sprint — a wrong merge rule could corrupt cards (e.g. cross-paper field bleed if keys over-match) | Med | Med | Merge only fires on an *existing key collision* (same `doiKey`/`titleFingerprint` that already collapses today) — it changes what survives, never what matches. Scalars keep the canonical record. Covered by the unit test in T3.1; verify cards on the T5.1 baseline set show no mismatched author/abstract |

---

## 6. Definition of done

- [ ] All T1–T3 tasks executed and checked off.
- [ ] T5.1 manual test suite passes (no regression on 4 baseline queries).
- [ ] T5.2 `findings.json` statuses updated for all in-scope findings.
- [ ] T4 spike doc written, OR explicitly marked skipped with a note in this log.
- [ ] Single commit `feat(v0.42): ...` **directly to `main`** (no branch, per CLAUDE.md), clean diff, only on Shahbaz's request.
- [ ] No new `console.error` output in the browser during a baseline search.

---

## 7. Dependencies

| Finding | Depends on | Status |
|---|---|---|
| **F-311 CreditsChip (full live balance)** | **F-300 BillingProvider mounted (v0.41)** | **BLOCKED — v0.41 must ship first for live display; this sprint ships the shell only** |
| F-207 synonyms worker | Existing `src/workers/embed.worker.js` pattern | Available — no new infrastructure |
| F-205 spike | `docs/wiki/03-Search-Pipeline/Semantic-Rerank.md` | Available |
| All | v0.38 dead-adapter quarantine | DONE — SCIELO/OPENNEURO/ENA removed; no conflict |
| All | v0.35 RRF fusion | DONE — scoring pipeline stable; no conflict |

---

## 8. Cross-sprint links

- `[[01-Frontend/UI-Map]]` — AuthModal, ThemeStrip, LibraryPanel, Header anatomy.
- `[[01-Frontend/Contexts#billingcontext]]` — BillingContext stub detail (F-300/F-311).
- `[[03-Search-Pipeline/Known-Defects#d3]]` — BM25F micro-pool (F-200 accepted residual).
- `[[03-Search-Pipeline/Known-Defects#d4]]` — Cross-query score incomparability (F-201).
- `[[03-Search-Pipeline/Dedup-Grouping#correctness-notes]]` — dedupHighestScore (F-206).
- `[[03-Search-Pipeline/Synonyms-Vocab#correctness-notes]]` — Moby shard jank (F-207).
- `[[02-Adapters/Extension-Adapters#met]]` — Met fan-out (F-113).
- `[[02-Adapters/Extension-Adapters#rijksmuseum]]` — 2-hop image resolve (F-115).
- `[[02-Adapters/Extension-Adapters#pangaea]]` — per-hit RIS fetch (F-116).
- `[[03-Search-Pipeline/Semantic-Rerank#overengineering-assessment]]` — F-205 background.

---

*End v0.42 sprint plan. T1–T5, ~14 h. One cross-sprint dependency (F-311 → v0.41 F-300,
shell only this sprint). F-205 is explicitly stretch — spike report, no code committed.*
