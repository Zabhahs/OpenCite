export const config = {
  runtime: 'edge',
};

const ALLOWED_DOMAINS = [
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
  // Phase 1 — OIDC provider discovery endpoints
  'accounts.google.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
];

export default async function handler(req) {
  // 1. Handle CORS Preflight
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

  // 2. Robust URL Decoding (Prevents 404s from double-encoding)
  try {
    targetUrlStr = decodeURIComponent(targetUrlStr);
  } catch (e) {
    // If decoding fails, we proceed with the raw string as a fallback
  }

  let targetUrl;
  try {
    targetUrl = new URL(targetUrlStr);
  } catch (err) {
    return new Response('Invalid target URL', { status: 400 });
  }

  // 3. Security: Domain Validation
  if (!ALLOWED_DOMAINS.includes(targetUrl.hostname)) {
    return new Response(`Domain ${targetUrl.hostname} not allowlisted`, { status: 403 });
  }

  // 4. Architect-Level Header Spoofing (The "Opaque" Strategy)
  // This tricks legacy servers (BDPI/Gallica) into seeing a real browser
  const headers = new Headers();
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  headers.set('Accept', 'application/json, text/javascript, */*; q=0.01');
  headers.set('Accept-Language', 'en-US,en;q=0.9');
  
  // Spoofing the Referer is critical for BDPI's legacy .do endpoints
  headers.set('Referer', `https://${targetUrl.hostname}/`);

  const targetMethod = searchParams.get('method') === 'POST' || req.method === 'POST' ? 'POST' : 'GET';

  const fetchOptions = {
    method: targetMethod,
    headers: headers,
    redirect: 'follow', // Essential for handling library SSO/Redirection hops
  };

  // Attach body for POST requests (Northwestern / OpenNeuro)
  if (targetMethod === 'POST' && req.body) {
    fetchOptions.body = req.body;
  }

  try {
    const upstreamRes = await fetch(targetUrl.href, fetchOptions);
    
    // 5. Clean Up Response Headers
    const responseHeaders = new Headers(upstreamRes.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    
    // Ensure the browser doesn't try to execute scripts from the proxy
    responseHeaders.set('X-Content-Type-Options', 'nosniff');

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Proxy Execution Error', 
      details: error.message 
    }), { 
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}