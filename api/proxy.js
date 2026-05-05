export const config = {
  runtime: 'edge',
};

// 7-domain allowlist from v.13 Architecture Report
const ALLOWED_DOMAINS = [
  'dpul.princeton.edu',
  'ws.pangaea.de',
  'opencontext.org',
  'api.dc.library.northwestern.edu',
  'openneuro.org',
  'www.ebi.ac.uk',
  'eutils.ncbi.nlm.nih.gov'
];

export default async function handler(req) {
  // 1. Handle CORS Preflight Requests instantly
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const { searchParams } = new URL(req.url);
  const targetUrlStr = searchParams.get('url');
  
  // proxiedFetch passes the method in the query string for POSTs, 
  // but we also check the actual request method.
  const targetMethod = searchParams.get('method') === 'POST' || req.method === 'POST' ? 'POST' : 'GET';

  if (!targetUrlStr) {
    return new Response('Missing target URL', { status: 400 });
  }

  let targetUrl;
  try {
    targetUrl = new URL(targetUrlStr);
  } catch (err) {
    return new Response('Invalid target URL', { status: 400 });
  }

  // 2. Enforce the Domain Allowlist
  if (!ALLOWED_DOMAINS.includes(targetUrl.hostname)) {
    return new Response(`Domain ${targetUrl.hostname} not allowlisted`, { status: 403 });
  }

  // 3. Prepare Headers (Injecting the required polite User-Agent)
  const headers = new Headers(req.headers);
  headers.set('User-Agent', 'OpenCITE/1.0 (https://opencite.app; scholarly meta-search)');
  
  // Clean up standard browser headers that cause origin/host mismatch issues upstream
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');

  // 4. Forward the request
  const fetchOptions = {
    method: targetMethod,
    headers: headers,
    redirect: 'follow',
  };

  // Only forward the body if it's a POST request
  if (targetMethod === 'POST' && req.body) {
    fetchOptions.body = req.body;
    // Ensure content-type is passed through for ES queries (Northwestern/PANGAEA)
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  try {
    const upstreamRes = await fetch(targetUrl, fetchOptions);
    
    // 5. Return the upstream response with CORS headers forcefully appended
    const responseHeaders = new Headers(upstreamRes.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: `Proxy Error: ${error.message}` }), 
      { 
        status: 502, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      }
    );
  }
}