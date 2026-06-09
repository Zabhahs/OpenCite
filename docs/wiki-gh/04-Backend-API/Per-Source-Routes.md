---
machine_ids: [api.route.europeana, api.route.dpla, api.route.smithsonian, api.route.bl, api.route.gallica, api.route.bdh, api.route.mexicana, api.route.opencontext, api.route.openedition]
findings: [F-407, F-408, F-409]
runtime: server
status: mixed
tags: [api, per-source, browser-shim, edge, cors, heritage]
---
<!-- AUTO-GENERATED from docs/wiki/04-Backend-API/Per-Source-Routes.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Per-Source Routes (`api/search/*.js`)

> Nine edge/Node serverless routes that proxy browser clients to sources that require backend secrets, CORS workarounds, or POST request bodies.

## What it is

The client adapters in `src/adapters/` normally call upstream APIs directly from the browser. Two categories of sources cannot be called this way:

1. **Keyed CC0 sources** (Europeana, DPLA, Smithsonian): require API keys that cannot live in the browser bundle. The browser adapter calls the same-origin `/api/search/europeana` (etc.) instead of the upstream, and the route injects the secret from `serverInjectedKeys()`.

2. **CORS/protocol sources** (BL/SPARQL, Gallica/SRU-XML, BDH/BNE REST, Mexicana/OAI-PMH, OpenContext JSON-LD, OpenEdition POST): these upstreams either block CORS requests from browsers, return XML that needs server-side parsing, or require POST bodies with `Content-Type: application/json` (OpenEdition — the generic proxy drops Content-Type on POST).

These routes do **not** go through the API billing / auth pipeline. They are browser-facing helpers with no auth, no rate limit, and no credit charge. They exist purely to enable the browser search UI; the `api/search.js` fan-out does not call them (it calls the adapter code directly).

## Route table

| Route | File | Runtime | Reason | Auth | Key source |
|---|---|---|---|---|---|
| `/api/search/europeana` | `europeana.js` | Node | Secret API key | None | `serverInjectedKeys()` |
| `/api/search/dpla` | `dpla.js` | Node | Secret API key | None | `serverInjectedKeys()` |
| `/api/search/smithsonian` | `smithsonian.js` | Node | Secret API key | None | `serverInjectedKeys()` |
| `/api/search/bl` | `bl.js` | Edge | CORS + SPARQL | None | None |
| `/api/search/gallica` | `gallica.js` | Edge | CORS + SRU/XML | None | None |
| `/api/search/bdh` | `bdh.js` | Edge | CORS | None | None |
| `/api/search/mexicana` | `mexicana.js` | Edge | CORS + OAI-PMH | None | None |
| `/api/search/opencontext` | `opencontext.js` | Edge | CORS | None | None |
| `/api/search/openedition` | `openedition.js` | Edge | CORS + POST body | None | None |

## Keyed routes (Europeana, DPLA, Smithsonian) — v0.34

All three are structurally identical (same pattern, ~23 lines each):

```
GET /api/search/{source}?q=<query>&offset=<n>
→ serverInjectedKeys() → adapter.search(q, keys, {offset})
→ 200 { results:[], hasMore:false } always (fail-soft)
```

The adapter's server branch does the actual upstream fetch + normalize. No duplication of adapter logic in the route. The key is never echoed in the response or error body. If the env key is absent, `serverInjectedKeys()` returns an object without that key → the adapter gets no key → it will error → the fail-soft catch returns `{results:[], hasMore:false, error:e.message}`.

**Security note (F-407):** These routes have no auth, no rate limit, and no credit charge. A public caller who discovers them can query Europeana/DPLA/Smithsonian for free, spending the project's API quota. They are not protected by any of the `/api/search` billing machinery. The URLs are not secret (they're in the client adapter code), but they are undocumented public endpoints.

## Heritage/CORS routes (Edge runtime)

All six use the Edge runtime (`export const config = { runtime: 'edge' }`). They all:
- Set `Access-Control-Allow-Origin: *`
- Return HTTP 200 with `{results:[], error:...}` on upstream failure (fail-soft)
- Use `AbortController` + `setTimeout(8000)` for timeout

They do their own upstream fetch, response parsing, and normalization inline (not delegating to a client adapter). This creates some duplication between the route's normalization logic and any corresponding client adapter.

### `bl.js` — British Library SPARQL

Queries `https://bnb.data.bl.uk/sparql` with a SPARQL FILTER on `dc:title`. **Security note (F-408):** The query string is injected into the SPARQL template with only `query.replace(/"/g, '')` as sanitization (`bl.js:15`). This is limited sanitization — it prevents quote injection but not all SPARQL injection vectors (e.g. comment injection with `#`, backslash, or other literal patterns). Low practical impact since the result is only data returned to the browser, but it could cause unexpected SPARQL parse errors or partial result manipulation.

### `gallica.js` — Gallica SRU

Queries Gallica's SRU endpoint; parses XML using `DOMParser`. Includes a graceful catch for `DOMParser unavailable in Edge runtime`. Uses a Chrome User-Agent to avoid bot detection.

### `bdh.js` — Biblioteca Digital Hispánica (BNE)

Simple JSON REST query to `datos.bne.es/api/records`. No special auth needed; uses `OpenCITE/1.0` User-Agent.

### `mexicana.js` — Mexicana OAI-PMH

Fetches a full `ListRecords` page from the OAI-PMH endpoint, then filters client-side by title/description/subject match. **Security note (F-409):** This is a scan-and-filter approach, not a server-side full-text search — it fetches a page of all records and client-filters. For high-cardinality queries this may return many irrelevant records; for low-cardinality corpora it's acceptable. The `resumptionToken` from the caller is passed directly into the OAI URL without validation (`mexicana.js:51`) — a crafted token could potentially manipulate the OAI-PMH request (though the upstream would reject any invalid token).

### `opencontext.js` — Open Context JSON-LD

Proxies to `opencontext.org/query/.json`. Filters out items with `item-type === 'region'` and items with no label.

### `openedition.js` — OpenEdition POST

Issues a `POST` with `Content-Type: application/json` to `search-api.openedition.org/documents` (the generic `/api/proxy` cannot carry Content-Type on POST). Reverse-engineered from the OpenEdition SPA bundle.

## Relationship to client adapters

| Source | Client adapter exists? | Route reuses adapter? |
|---|---|---|
| Europeana | Yes (`src/adapters/extensions/europeana.js`) | Yes — calls `EUROPEANA_ADAPTER.search()` |
| DPLA | Yes (`src/adapters/extensions/dpla.js`) | Yes — calls `DPLA_ADAPTER.search()` |
| Smithsonian | Yes (`src/adapters/extensions/smithsonian.js`) | Yes — calls `SMITHSONIAN_ADAPTER.search()` |
| BL | Yes (client adapter) | No — route has its own SPARQL + normalize logic |
| Gallica | Yes (client adapter) | No — route has its own SRU + XML parse + normalize |
| BDH | Yes (client adapter) | No — route has its own REST + normalize |
| Mexicana | Yes (client adapter) | No — route has its own OAI-PMH + normalize |
| OpenContext | Yes (client adapter) | No — route has its own normalize |
| OpenEdition | Yes (client adapter) | No — route has its own normalize |

The six heritage routes duplicate normalization logic that exists in corresponding client adapters. See [Duplication-and-Reuse](../09-Audit/Duplication-and-Reuse.md#r-401).

## 🩺 Health audit

- **Verdict:** healthy for keyed routes; heritage routes have contained security/duplication concerns.
- **Findings:**
  - [F-407] Keyed per-source routes are unauthenticated public endpoints that burn API quota without credit charge.
  - [F-408] BL SPARQL route injects query into SPARQL template with minimal sanitization (`bl.js:15`).
  - [F-409] Mexicana OAI-PMH passes `resumptionToken` from query param directly into the OAI URL (`mexicana.js:51`).
- **Reuse:** Six heritage routes re-implement normalization logic that overlaps with client adapters. See [Duplication-and-Reuse](../09-Audit/Duplication-and-Reuse.md#r-401).

## See also

[Proxy](Proxy.md) · [Shared-Modules](Shared-Modules.md#serverkeysjs) · [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md) · [Security](../09-Audit/Security.md)
