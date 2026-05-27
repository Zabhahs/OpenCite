import { log } from "./_shared/log.js";

export const config = {
  runtime: 'edge',
};

const ALLOWED_DOMAINS = new Set([
  'dpul.princeton.edu',
  'ws.pangaea.de',
  'opencontext.org',
  'api.dc.library.northwestern.edu',
  'openneuro.org',
  'www.ebi.ac.uk',
  'eutils.ncbi.nlm.nih.gov',
  'api.dp.la',
  'gallica.bnf.fr',
  'www.iberoamericadigital.net',
  'obv-at-oenb.alma.exlibrisgroup.com',
  'datos.bne.es',
  'api.bnf.fr',
  'catalogue.bnf.fr',
  'api.bl.uk',
  'data.bl.uk',
  'www.loc.gov',
  'search.scielo.org',
]);

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

  if (!ALLOWED_DOMAINS.has(targetUrl.hostname)) {
    log.warn("proxy", "reject", { hostname: targetUrl.hostname });
    return new Response(`Domain ${targetUrl.hostname} not allowlisted`, { status: 403 });
  }

  const targetMethod = searchParams.get('method') === 'POST' || req.method === 'POST' ? 'POST' : 'GET';
  log("proxy", "request", { hostname: targetUrl.hostname, method: targetMethod });

  const headers = new Headers();
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  headers.set('Accept', 'application/json, text/javascript, */*; q=0.01');
  headers.set('Accept-Language', 'en-US,en;q=0.9');
  headers.set('Referer', `https://${targetUrl.hostname}/`);

  const fetchOptions = {
    method: targetMethod,
    headers: headers,
    redirect: 'follow',
  };

  if (targetMethod === 'POST' && req.body) {
    fetchOptions.body = req.body;
  }

  try {
    const upstreamRes = await fetch(targetUrl.href, fetchOptions);
    log("proxy", "upstream-ok", { hostname: targetUrl.hostname, status: upstreamRes.status, ms: Date.now() - startMs });

    const responseHeaders = new Headers(upstreamRes.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    log.err("proxy", "upstream-error", { hostname: targetUrl.hostname, err: error.name, msg: error.message, ms: Date.now() - startMs });
    return new Response(JSON.stringify({
      error: 'Proxy Execution Error',
      details: error.message
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
