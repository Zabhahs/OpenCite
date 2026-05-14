export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const start = searchParams.get('start') || '0';
  const rows = searchParams.get('rows') || '10';

  if (!query) return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });

  const targetUrl = `https://opencontext.org/sets/.json?q=${encodeURIComponent(query)}&start=${start}&rows=${rows}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'OpenCITE/1.0 (https://opencite.app)',
        'Accept': 'application/json',
        'Referer': 'https://opencontext.org/'
      }
    });
    clearTimeout(timeout);

    // ── DIAGNOSTIC ───────────────────────────────────────────────────────────
    console.log('[OPENCONTEXT] status:', response.status);
    console.log('[OPENCONTEXT] content-type:', response.headers.get('content-type'));
    console.log('[OPENCONTEXT] final URL after redirects:', response.url);
    const rawText = await response.text();
    console.log('[OPENCONTEXT] raw response (first 500 chars):', rawText.slice(0, 500));
    // ── END DIAGNOSTIC ───────────────────────────────────────────────────────

    if (!response.ok) {
      return new Response(JSON.stringify({ results: [], total: 0, error: `Open Context status ${response.status}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      console.log('[OPENCONTEXT] got HTML response — UA blocked or rate-limited');
      return new Response(JSON.stringify({ results: [], total: 0, error: 'Open Context returned HTML' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.log('[OPENCONTEXT] JSON parse failed:', parseErr.message);
      console.log('[OPENCONTEXT] attempted to parse (first 300):', rawText.slice(0, 300));
      return new Response(JSON.stringify({ results: [], total: 0, error: 'Open Context JSON parse failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    console.log('[OPENCONTEXT] parsed data top-level keys:', Object.keys(data));

    const features = data.features || data.oc_api?.["has-results"] || [];
    console.log('[OPENCONTEXT] features/results count:', features.length);
    console.log('[OPENCONTEXT] totalResults field:', data?.totalResults || data?.["oc-api:total"]);

    // Log first feature shape to confirm field mapping
    if (features.length > 0) {
      console.log('[OPENCONTEXT] first feature keys:', Object.keys(features[0]));
      console.log('[OPENCONTEXT] first feature properties keys:', Object.keys(features[0].properties || {}));
    }

    const total = parseInt(data?.totalResults || data?.["oc-api:total"] || "0", 10) || features.length;

    const normalizedResults = features.map((f) => {
      const props = f.properties || {};
      const uri = props.uri || f.id || "";
      return {
        id: `oc-${uri.split('/').pop() || Math.random().toString(36).substr(2, 9)}`,
        source: "OPENCONTEXT",
        title: props.label || f.label || "Untitled Record",
        authors: props.creator ? [props.creator] : [],
        year: String(props.published || props.created || "").match(/\d{4}/)?.[0] || "",
        journal: props["project label"] || props.project || "Open Context",
        publisher: "Open Context",
        url: uri,
        abstract: props.description || props["dc-terms:abstract"] || "",
        isOA: true,
        type: "archaeological-data",
        previewImage: props.thumbnail || ""
      };
    });

    return new Response(JSON.stringify({ results: normalizedResults, total }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    clearTimeout(timeout);
    const isTimeout = error.name === "AbortError";
    console.log('[OPENCONTEXT] fetch threw:', error.name, error.message);
    return new Response(JSON.stringify({
      results: [],
      total: 0,
      error: isTimeout ? "Open Context timed out (8s)" : error.message
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
