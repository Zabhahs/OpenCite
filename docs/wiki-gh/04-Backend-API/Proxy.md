---
machine_ids: [api.proxy]
findings: [F-410, F-411, F-412]
runtime: server
status: healthy
tags: [api, proxy, edge, ssrf, cors, allowlist]
---
<!-- AUTO-GENERATED from docs/wiki/04-Backend-API/Proxy.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Proxy Route

> `GET /api/proxy?url=<encoded>` — edge-runtime CORS proxy with a hard-coded domain allowlist; prevents direct browser calls to CORS-restricted upstream APIs.

## What it is

`api/proxy.js` runs as a Vercel Edge Function (runtime: `'edge'`). It receives a browser request with a `?url=` parameter pointing at an upstream API, validates the target hostname against a static allowlist, then forwards the request and streams the response back with `Access-Control-Allow-Origin: *`.

It exists because several heritage adapters (BL, Gallica, Pangaea, OpenContext etc.) block CORS preflight from browsers. The proxy makes them reachable from the SPA without the browser touching the upstream directly.

Note: Six of the nine per-source routes in `api/search/` were created precisely to replace this proxy for sources that needed POST bodies or API keys (see [Per-Source-Routes](Per-Source-Routes.md)). The proxy handles the remaining GET-based CORS-only sources.

## Allowlist (as of last read)

`api/proxy.js:7–30` — 21 domains:

```
dpul.princeton.edu       ws.pangaea.de          doi.pangaea.de
opencontext.org          api.dc.library.northwestern.edu
openneuro.org            www.ebi.ac.uk          eutils.ncbi.nlm.nih.gov
api.dp.la                gallica.bnf.fr         www.iberoamericadigital.net
obv-at-oenb.alma.exlibrisgroup.com  datos.bne.es
api.bnf.fr               catalogue.bnf.fr       api.bl.uk
data.bl.uk               www.loc.gov            search.scielo.org
www.lareferencia.info    library.oapen.org      openlibrary.org
```

## SSRF posture

**Hostname-only check:** The allowlist is applied to `targetUrl.hostname` after parsing with `new URL()` (`proxy.js:61`). This is sound — `new URL()` fully parses the URL and `hostname` gives the eTLD+1 host without port or path.

**Known SSRF gaps:**

- **F-410 — No scheme validation:** There is no check that `targetUrl.protocol === "https:"`. A caller could pass `http://dpul.princeton.edu/...` and the proxy would forward in plaintext. More critically, `file://`, `ftp://`, or `data:` URLs would fail to match the allowlist (since those don't have a meaningful `hostname`), but the failure happens at the fetch level, not the allowlist check. A `javascript:` URL would parse with `hostname = ""` and be rejected, but an `http://` downgrade is functional and not blocked.

- **F-411 — `redirect: 'follow'` with no re-check:** `fetchOptions.redirect = 'follow'` (`proxy.js:78`). If an allowlisted host issues a redirect to a non-allowlisted host (including an internal/metadata endpoint), the proxy follows it without re-validating the destination hostname. An allowlisted host that is compromised or misconfigured could chain a redirect to any destination.

- **F-412 — Error body leaks upstream error message:** On fetch failure, the proxy returns `{ error: 'Proxy Execution Error', details: error.message }` (`proxy.js:103`). `error.message` from the Fetch API can include the target URL or internal host resolution details, potentially leaking internal information.

## Request forwarding

The proxy sets a fixed Chrome User-Agent, Accept, Accept-Language, and a Referer mirroring the target hostname (`proxy.js:70–74`). This impersonates a browser to bypass bot-detection on some heritage upstreams.

The POST path: if `?method=POST` is in searchParams OR the incoming method is POST, the proxy forwards as POST with the incoming body (`proxy.js:66, 81–83`). No Content-Type is set on POST — the caller must set it if required (this is why OpenEdition needed its own route).

## Auth

No auth on the proxy — it is open to any caller with network access to the Vercel function URL. The domain allowlist is the sole access control. Any caller can use the proxy to reach any allowlisted domain.

## Response passthrough

The proxy copies all upstream response headers and adds `Access-Control-Allow-Origin: *` and `X-Content-Type-Options: nosniff`. It streams `upstreamRes.body` directly, preserving Content-Type and status from the upstream.

## 🩺 Health audit

- **Verdict:** needs-work — allowlist logic is sound but redirect-follow and scheme-blindness are SSRF risks.
- **Findings:**
  - [F-410] No `https:` scheme enforcement — HTTP downgrade is not blocked (`proxy.js:61`).
  - [F-411] `redirect: 'follow'` without re-validating the redirect destination — allowlisted host could chain to an arbitrary internal target (`proxy.js:78`).
  - [F-412] `error.message` leaked in 502 body — may expose upstream host/URL details (`proxy.js:103`).
- **Smells:** Several allowlisted domains (`openneuro.org`, `search.scielo.org`) correspond to adapters known to be dead/non-returning (v0.36 diagnostic). Their proxy entries are harmless but dead weight.

## See also

[Per-Source-Routes](Per-Source-Routes.md) · [Security](../09-Audit/Security.md) · [Adapter-Architecture](../02-Adapters/Adapter-Architecture.md)
