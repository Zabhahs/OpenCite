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
  'api.dp.la',                // Added for DPLA
  'gallica.bnf.fr',           // Added for Gallica
  'www.iberoamericadigital.net' // Added for BDPI
];

export default async function handler(req) {
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
  const targetMethod = searchParams.get('method') === 'POST' || req.method === 'POST' ? 'POST' : 'GET';

  if (!targetUrlStr) return new Response('Missing target URL', { status: 400 });

  let targetUrl;
  try {
    targetUrl = new URL(targetUrlStr);
  } catch (err) {
    return new Response('Invalid target URL', { status: 400 });
  }

  if (!ALLOWED_DOMAINS.includes(targetUrl.hostname)) {
    return new Response(`Domain ${targetUrl.hostname} not allowlisted`, { status: 403 });
  }

  const headers = new Headers(req.headers);
  headers.set('User-Agent', 'OpenCITE/1.0 (https://opencite.app; scholarly meta-search)');
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');

  const fetchOptions = {
    method: targetMethod,
    headers: headers,
    redirect: 'follow',
  };

  if (targetMethod === 'POST' && req.body) {
    fetchOptions.body = req.body;
  }

  try {
    const upstreamRes = await fetch(targetUrl, fetchOptions);
    const responseHeaders = new Headers(upstreamRes.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 502 });
  }
}