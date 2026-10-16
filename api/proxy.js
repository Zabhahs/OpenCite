import { log } from "./_shared/log.js";

export const config = {
  runtime: 'edge',
};

// v0.46: exactly the hosts a REGISTERED adapter reaches via proxiedFetch (browser branch). Hosts of
// quarantined adapters (BL, Mexicana, SciELO, OpenNeuro, BASE, LA Referencia, PANGAEA, Open Context)
// were removed: each was a free anonymous relay target with no product value. Rijksmuseum, CORE and
// NDLI were MISSING (their adapters had been 403ing through this proxy since they shipped).
const ALLOWED_DOMAINS = new Set([
  "dpul.princeton.edu",
  "api.dc.library.northwestern.edu",
  "www.ebi.ac.uk",
  "eutils.ncbi.nlm.nih.gov",
  "api.dp.la",
  "gallica.bnf.fr",
  "obv-at-oenb.alma.exlibrisgroup.com",
  "api.bnf.fr",
  "catalogue.bnf.fr",
  "www.loc.gov",
  "library.oapen.org",
  "openlibrary.org",
  "data.rijksmuseum.nl",
  "api.core.ac.uk",
  "ndl.iitkgp.ac.in",
]);
// v0.46: streamed-byte budget — the relay used to hand back whatever the upstream sent (895 KB
// loc.gov pages measured live), an unmetered path to Vercel's transfer cap and a site-wide pause.
const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10000;
const SERVER_USER_AGENT = "OpenCITE/0.46 (+https://citation.today; mailto:ops@citation.today)";

// F-411: fetch while validating every redirect hop ourselves. An allowlisted host that
// 30x-redirects to an internal/un-allowlisted target (e.g. cloud metadata 169.254.169.254)
// would otherwise be followed silently (SSRF). We require each Location to be https AND
// still on the allowlist, with a small hop cap to defeat redirect loops.
async function followSafe(url, options) {
  let current = url;
  for (let hop = 0; hop <= 2; hop++) {
    const res = await fetch(current, { ...options, redirect: 'manual' });
    if (res.status < 300 || res.status >= 400) return res;

    const loc = res.headers.get('location');
    if (!loc) return res; // 3xx without a target — hand back as-is
    let next;
    try { next = new URL(loc, current); } catch { return new Response('Invalid redirect target', { status: 400 }); }
    if (next.protocol !== 'https:' || !ALLOWED_DOMAINS.has(next.hostname)) {
      log.warn("proxy", "redirect-blocked", { to: next.hostname, scheme: next.protocol });
      return new Response('Redirect to disallowed target', { status: 400 });
    }
    current = next.href;
    // POST is not replayed across redirects — follow as GET like a browser would.
    options = { ...options, method: 'GET', body: undefined };
  }
  return new Response('Too many redirects', { status: 400 });
}

export default async function handler(req) {
  const startMs = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const { searchParams } = new URL(req.url);
  let targetUrlStr = searchParams.get('url');

  if (!targetUrlStr) return new Response('Missing target URL', { status: 400 });

  try { targetUrlStr = decodeURIComponent(targetUrlStr); } catch (e) {}

  let targetUrl;
  try {
    targetUrl = new URL(targetUrlStr);
  } catch (err) {
    return new Response('Invalid target URL', { status: 400 });
  }

  // F-410: enforce https — an http:// target would be proxied in cleartext.
  if (targetUrl.protocol !== 'https:') {
    return new Response('Only HTTPS targets allowed', { status: 400 });
  }

  if (!ALLOWED_DOMAINS.has(targetUrl.hostname)) {
    log.warn("proxy", "reject", { hostname: targetUrl.hostname });
    return new Response(`Domain ${targetUrl.hostname} not allowlisted`, { status: 403 });
  }

  const targetMethod = searchParams.get('method') === 'POST' || req.method === 'POST' ? 'POST' : 'GET';
  log("proxy", "request", { hostname: targetUrl.hostname, method: targetMethod });

  const headers = new Headers();
    headers.set('User-Agent', SERVER_USER_AGENT); // v0.46: honest identity (no Chrome spoof)
  headers.set('Accept', 'application/json, text/javascript, */*; q=0.01');
  headers.set('Accept-Language', 'en-US,en;q=0.9');
  headers.set('Referer', `https://${targetUrl.hostname}/`);

  const fetchOptions = {
    method: targetMethod,
    headers: headers,
    redirect: 'manual', // F-411: re-validate each redirect hop ourselves (see followSafe)
  };

  if (targetMethod === 'POST' && req.body) {
    fetchOptions.body = req.body;
  }

  try {
    const upstreamRes = await followSafe(targetUrl.href, fetchOptions);
    log("proxy", "upstream-ok", { hostname: targetUrl.hostname, status: upstreamRes.status, ms: Date.now() - startMs });

    const responseHeaders = new Headers(upstreamRes.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');

    // v0.46: cap what we relay — read up to MAX_UPSTREAM_BYTES, then cut the stream. Before this
    // the proxy streamed whatever the upstream sent (895 KB loc.gov pages measured live), an
    // unmetered path to Vercel's transfer cap.
    let sent = 0;
    const budget = new TransformStream({
      transform(chunk, controller) {
        sent += chunk.byteLength;
        if (sent > MAX_UPSTREAM_BYTES) { controller.terminate(); return; }
        controller.enqueue(chunk);
      },
    });
    responseHeaders.delete('content-length'); // body may be truncated by the budget
    return new Response(upstreamRes.body ? upstreamRes.body.pipeThrough(budget) : null, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    // F-412: the detailed message (which can carry the target URL / internal host
    // resolution) is logged server-side only; the client gets a generic body.
    log.err("proxy", "upstream-error", { hostname: targetUrl.hostname, err: error.name, msg: error.message, ms: Date.now() - startMs });
    return new Response(JSON.stringify({
      error: 'Upstream unreachable'
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
