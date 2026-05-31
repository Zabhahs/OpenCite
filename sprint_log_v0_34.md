# OpenCITE — Sprint Log v0.34

> **PM + architecture document for the next Claude instance(s).** Self-contained execution plan for
> **moving the keyed CC0 sources to backend-only secrets** (Smithsonian, DPLA, Europeana), **making
> Rijksmuseum keyless**, and **decluttering Settings** so a human user never sees or manages an API
> key. The thesis: keys are infrastructure, not user data — host them on the backend like every other
> secret, and let the browser reach those sources through dedicated server endpoints.
> Read `architecture_report_v0_30.md` for project context, `TOS-items.md` §D6–D8 for the source
> go/no-go decisions this implements, and `sprint_log_v0_32.md` for the source-tier-gating dependency.
> (v0.31 = relevance sliders; v0.32 = credit meter; v0.33 = admin console — all independent of this.)
>
> **Created:** 2026-05-31 · **Status:** PLANNED — not executed.
> **Mode:** C (plan → approval → execute → checklist). No padding; precise execution.

---

## 0. TL;DR

Three CC0 sources (Smithsonian, DPLA, Europeana) are **origin-blind-safe and commercially clean**
(`TOS-items.md` D6) and should join the paid API. Today they require a **per-user API key in Settings**,
which (a) clutters the UI, (b) can't work server-side (no per-user settings on the API path), and (c)
puts key management on the human. This sprint makes their keys **backend-only env vars**, removes the
key fields from Settings, and routes the browser app to those sources through **dedicated server
endpoints** so the secret never touches the client. Rijksmuseum drops its legacy key entirely by moving
to the keyless Linked-Art API.

| WS | Workstream | Effort | This sprint? |
|---|---|---|---|
| **A** | Dedicated per-source backend endpoints + browser shims (Europeana, DPLA, Smithsonian); keys read from env server-side only | ~¾ day | **Yes** |
| **B** | `serverSafe` + `corpusSize` for the three; place in the **`all`** (paid) tier; presence-guard eligibility | ~¼ day | **Yes** |
| **C** | Rijksmuseum → keyless Linked-Art API (two-step resolve rewrite) | ~½ day | **Yes** |
| **D** | Settings declutter (remove 4 key fields) + comment-lock CORE/NDLI off the server set | ~¼ day | **Yes** |

**Thesis:** there is **no secret that needs to live in the browser**. The only reason the current
adapters embed a key client-side is that the web app fans out *from the browser*. We already solve this
for `OPENEDITION`/`GALLICA`/etc. with a dedicated `api/search/<source>` endpoint that owns the upstream
call. We extend that pattern to the keyed CC0 trio so the key is read from `process.env` **inside the
backend handler**, used, and discarded — exactly like the Stripe/DB secrets. No key in the client
bundle, and (critically) **no key injected into the generic `api/proxy.js`** — see §2.

---

## 1. The architecture issue (why this isn't a one-liner)

The app has **two execution paths** for the same adapter (`architecture_report_v0_30.md` — "one core,
two front-ends"):

- **Browser app:** `useSearch` runs `adapter.search()` **in the browser**; the upstream `fetch` is
  browser-initiated (`europeana.js:33`, `smithsonian.js:22` are raw `fetch`; `dpla.js:38` goes through
  `proxiedFetch` → `/api/proxy`). A browser **cannot hold a secret** — the client bundle is public.
- **API product (`/api/search`):** runs `adapter.search()` **server-side**, where `process.env` works
  privately and natively.

So the server path is trivially fixed (inject the env key into the server-side `settings`). The browser
path is the whole problem: to attach a secret to a browser-initiated upstream call, **something on the
backend that sits on the request's path** must add it. Two candidate touchpoints existed:

1. **The generic open proxy** `api/proxy.js` (`/api/proxy?url=…`, proxies *any* URL). Injecting the key
   here would let **anyone** route their own Europeana/DPLA/Smithsonian traffic through our key — an
   open-proxy key-exposure hole. **Rejected.**
2. **A dedicated per-source endpoint** `api/search/<source>` that performs *only* that source's query,
   reads the key from `process.env` internally, and exposes no arbitrary-URL surface. **Chosen** — this
   is the existing `OPENEDITION`/`GALLICA` pattern (`api/search/openedition.js`).

**Decision:** the browser reaches Europeana/DPLA/Smithsonian via dedicated `api/search/<source>` Node
endpoints; the key is a backend env var read inside those handlers (and inside `/api/search`), never in
the client, never in the open proxy. This deletes the exposure risk by construction.

---

## 2. Design — one adapter, context-branched fetch, single normalize

Keep **one** adapter per source (no fork). The adapter branches on context for the *fetch only*; the
normalize runs once, server-side, in both paths.

```js
// src/adapters/extensions/europeana.js  (shape — same for dpla, smithsonian)
search: async (query, settings, opts = {}) => {
  const offset = opts.offset || 0;
  if (typeof window !== "undefined") {
    // BROWSER: no secret here — ask our own backend endpoint (same-origin).
    const r = await fetch(`/api/search/europeana?q=${encodeURIComponent(query)}&offset=${offset}`);
    if (!r.ok) throw new Error(`Europeana ${r.status}`);
    return await r.json();                      // { results, hasMore } — already normalized
  }
  // SERVER (the api/search/<source> route OR the /api/search fan-out):
  const key = settings.europeanaKey;            // === process.env.EUROPEANA_API_KEY (injected by caller)
  if (!key) throw new Error("EUROPEANA_API_KEY not configured");  // backend config error, not user-facing
  const url = `https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(key)}&query=...`;
  /* ...existing fetch + normalize, unchanged... */
  return { results, hasMore };
}
```

```js
// api/search/europeana.js  (NEW — Node runtime, may import from src/)
import { EUROPEANA_ADAPTER } from "../../src/adapters/extensions/europeana.js";
import { serverInjectedKeys } from "../_shared/serverKeys.js";
export default async function handler(req, res) {
  const q = req.query.q, offset = Number(req.query.offset) || 0;
  if (!q) return res.status(400).json({ results: [], hasMore: false, error: "No query" });
  try {
    const out = await EUROPEANA_ADAPTER.search(q, serverInjectedKeys(), { offset });
    res.status(200).json(out);                  // runs the adapter's SERVER branch → real keyed fetch
  } catch (e) {
    res.status(200).json({ results: [], hasMore: false, error: e.message });  // fail-soft like openedition
  }
}
```

- **`api/_shared/serverKeys.js` (NEW):** the single place env keys are read.
  `serverInjectedKeys()` → `{ europeanaKey: process.env.EUROPEANA_API_KEY, dplaKey: process.env.DPLA_API_KEY,
  smithsonianKey: process.env.SMITHSONIAN_API_KEY }`. Imported by the three routes **and** by
  `api/search.js` (so the fan-out injects the same keys and runs the adapter's server branch directly —
  no self-HTTP hop).
- **Runtime = Node, not Edge.** Unlike `openedition.js` (Edge, inline logic because Edge can't import
  `src/`), these routes are **Node** so they reuse the adapter's normalize from `src/` (one
  implementation). Node functions importing `src/` is already how `api/search.js` works.
- **Same-origin** browser → `/api/search/<source>`: no CORS, no preflight, no key on the wire.

---

## 3. WS-A — dedicated endpoints + browser shims

**Files:** `src/adapters/extensions/{europeana,dpla,smithsonian}.js` · `api/search/{europeana,dpla,smithsonian}.js` (NEW) · `api/_shared/serverKeys.js` (NEW).

- [ ] **A.1** Add `api/_shared/serverKeys.js` (`serverInjectedKeys()` — present-only merge so a missing
      env key yields `undefined`, not `""`).
- [ ] **A.2** Refactor the three adapters to the §2 shape: browser branch shims to `/api/search/<source>`;
      server branch builds the URL from `settings.<keyName>` (the injected env key) and runs the existing
      normalize. Remove the user-facing `if (!settings.xKey) throw "... add yours in settings"` message;
      the server branch's missing-key error is a backend config error.
- [ ] **A.3** Add the three Node route handlers (mirror `openedition.js`'s fail-soft envelope: always
      200 with `{results, hasMore, error?}` so one source erroring never 500s a browser search).
- [ ] **A.4** `api/search.js` fan-out: merge `serverInjectedKeys()` into the `settings` it passes to
      `runSearch`, so the server product runs the same adapters with env keys (server branch, no hop).

## 4. WS-B — server-safe + tier + eligibility

**Files:** `src/adapters/extensions/{europeana,dpla,smithsonian}.js` (capability) · `api/search.js`
(eligibility) · the source-tier map introduced in v0.32 (`allowedSourceIds`).

- [ ] **B.1** Add `capability.serverSafe: true` + `capability.corpusSize: <int>` to the three
      (Europeana ~50M, DPLA ~50M, Smithsonian ~11M — confirm in comments). They auto-join the derived
      `SERVER_SAFE_IDS`.
- [ ] **B.2** **Presence-guard:** in `api/search.js`, drop a keyed source from the *eligible* set when
      its env key is unset — so it is not counted as a failed adapter (no false `coverage` band drop),
      and **Europeana auto-activates the moment `EUROPEANA_API_KEY` is set** with no redeploy.
- [ ] **B.3** Place all three in the **`all`** (paid) tier of v0.32's `allowedSourceIds` so the Free
      (core) tier does **not** get them. *(Dependency on v0.32 — see §8.)*

## 5. WS-C — Rijksmuseum → keyless Linked-Art API

**Files:** `src/adapters/extensions/rijksmuseum.js`.

The legacy keyed endpoint (`rijksmuseum.nl/api/.../collection?key=…`, `rijksmuseum.js:22`) is replaced by
the **keyless** `data.rijksmuseum.nl` Search API (Linked-Art). **Heads-up — this is a rewrite, not a
swap:** that API returns a list of **LOD identifiers** in `orderedItems`; each must be **resolved with a
second call** (Persistent Identifier Resolver) to get object metadata — a two-step pattern like `MET`.

- [ ] **C.1** Rewrite `search()`: query the keyless Search API; cap resolves to the page size to bound
      the N+1 fan-out (mirror the `MET` IDs→detail batching).
- [ ] **C.2** Map resolved Linked-Art objects → UnifiedResult (title, creator, date, image, url).
- [ ] **C.3** `needsKey: false`; drop `rijksKey`/`keyName`/`keyLabel`/`keyHelp`. No env var (keyless).
- [ ] **C.4** It uses `proxiedFetch` (browser → `/api/proxy`, server → direct) like other keyless
      sources; **optionally** set `capability.serverSafe: true` to offer it in the API too (decision:
      include as `all`-tier, or keep app-only — recommend app-only first, promote later).

## 6. WS-D — Settings declutter + CORE/NDLI guard

**Files:** the three + rijksmuseum (done above) · `src/constants/defaults.js` · `src/components/Panels.jsx`
(`SettingsPanel` key-field rendering) · `coreAc.js`/`ndli.js` (comment only).

- [ ] **D.1** With `needsKey:false` on Europeana/DPLA/Smithsonian/Rijksmuseum, the key-field rows
      disappear from `SettingsPanel` (it renders fields off adapter `needsKey`/`keyName`). Verify no
      field renders for the four.
- [ ] **D.2** Remove `europeanaKey`/`dplaKey`/`smithsonianKey`/`rijksKey` from `DEFAULT_SETTINGS`.
      Migration-free: `useSettings` merges `defaults → local → DB`, so dropped keys are simply ignored;
      **stale values in existing users' saved settings are inert** (never read — the adapters no longer
      reference them). No data migration, no user action.
- [ ] **D.3** Comment-lock `coreAc.js` and `ndli.js` at `serverSafe:false` (they already are), with a
      cross-reference to `TOS-items.md` D7/D8: *web/app human-only, per-user key, excluded from
      `/api/search` + MCP.* CORE/NDLI keep their Settings key fields (`needsKey:true`) — those are the
      one **intentional** per-user keys left.

---

## 7. Verification (on Vercel — no local builds, per project rule)

- [ ] **Browser, empty Settings:** a search returns Europeana/DPLA/Smithsonian/Rijksmuseum cards with
      **no key configured anywhere in Settings**. Inspect the client Network tab — the request is to
      `/api/search/<source>` (same-origin) and **carries no key**; the secret appears only in the
      backend → upstream hop.
- [ ] **API product:** `/api/search?sources=…` returns the three; **origin-blind invariant holds**
      (no `source` on cards, opaque `oc_` ids); a missing env key drops the source from eligibility
      (graceful — no 500, no false coverage drop).
- [ ] **Tiering:** a Free/core key cannot reach the three; a paid (`all`) key can.
- [ ] **Rijksmuseum:** keyless search returns results; the resolve step is capped to page size.
- [ ] **Settings UI:** the four key fields are gone; CORE/NDLI key fields remain.

---

## 8. Dependencies & sequencing

- **v0.32 (credit meter + source-tier gating) → v0.34.** WS-B.3 places the three in the `all` tier of
  v0.32's `allowedSourceIds`. Without v0.32's gating, the three would serve to *everyone* (the current
  pre-gating behavior for all server-safe sources) — not harmful, but the paid sources wouldn't be
  paywalled. **Land v0.34 after (or alongside) v0.32's tier logic.**
- **Independent of v0.31 and v0.33** (different files — scoring UI / admin console).
- **No collision with v0.30** (monetization) beyond the shared `api/search.js`, edited in different
  regions (eligibility + settings merge vs. the v0.32 middleware chain).

---

## 9. Risk register

| ID | Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | §2/A.2 | Key leaks to the client (in bundle, request URL, or an error echo) | Low | **Critical** | Key only ever read in backend handlers via `serverKeys.js`; browser branch builds **no** key; routes never echo the key in the error envelope; assert in the Network-tab check (§7) |
| R2 | A.3 | A per-source endpoint 500s and breaks the browser search | Low | Med | Fail-soft 200 `{results:[],error}` envelope (mirror `openedition.js`); the pool just loses that source |
| R3 | C.1 | Rijksmuseum N+1 resolve is slow / rate-limited | Med | Med | Cap resolves to page size; reuse the `MET` batching idiom; 12s adapter timeout already bounds it |
| R4 | §1 | Shared project key = one upstream quota across all customers (`TOS-items.md` D2) | Med | Low | CC0 metadata, low stakes; surfaces as a coverage band dip, not an error; accept |
| R5 | B.2 | Forgetting the presence-guard → an unset key makes the source a "failed adapter" and silently lowers `coverage` | Med | Med | Presence-guard at eligibility (B.2) is the explicit fix; test the env-absent path |
| R6 | A.4 | The `/api/search` fan-out double-pays a hop by calling the route instead of the adapter directly | Low | Low | Fan-out injects env keys and calls `adapter.search()` **directly** (server branch); routes are browser-only |
| R7 | D.2 | A dropped settings key is still read somewhere → `undefined` crash | Low | Med | Grep for `settings.europeanaKey`/`dplaKey`/`smithsonianKey`/`rijksKey` after the edit; only the adapters referenced them |

---

## 10. Definition of done

- [ ] Europeana/DPLA/Smithsonian keys exist **only** as Vercel env vars (`EUROPEANA_API_KEY`,
      `DPLA_API_KEY`, `SMITHSONIAN_API_KEY`); no key field for them in Settings; no key on the client.
- [ ] All three work in **both** the browser app (via `api/search/<source>`) and the `/api/search` API
      (server fan-out), with the origin-blind invariant intact.
- [ ] The three are `serverSafe`, corpus-weighted, and gated to the **paid** tier; unset key ⇒ graceful
      drop, not a coverage hit; Europeana auto-activates on key add.
- [ ] Rijksmuseum is keyless (Linked-Art), no env var, two-step resolve capped to page size.
- [ ] Settings shows **only** CORE/NDLI key fields (the intentional per-user keys); the other four are
      gone; existing users' stale saved keys are inert.
- [ ] Verified on a Vercel preview (Network-tab no-key check + API origin-blind check); this log updated
      with actuals; `architecture_report` + `MEMORY` updated on execution.

---

*End v0.34 sprint plan. WS-A–D this sprint. Sequence after v0.32's source-tier gating. The guiding
principle: a secret never lives in the browser — the backend owns every key, and the browser reaches
keyed sources through dedicated same-origin endpoints.*
