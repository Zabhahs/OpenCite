export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const start = searchParams.get('start') || '0';
  const rows = searchParams.get('rows') || '10';

  if (!query) return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });

  // Correct endpoint — /sets/.json is dead (404). Current API is /query/.json
  const targetUrl = `https://opencontext.org/query/.json?q=${encodeURIComponent(query)}&start=${start}&rows=${rows}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'OpenCITE/1.0 (https://opencite.app; mailto:contact@opencite.app)',
        'Accept': 'application/json, application/ld+json',
        'Referer': 'https://opencontext.org/'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return new Response(JSON.stringify({ results: [], total: 0, error: `Open Context status ${response.status}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return new Response(JSON.stringify({ results: [], total: 0, error: 'Open Context returned HTML' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return new Response(JSON.stringify({ results: [], total: 0, error: 'Open Context JSON parse failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Open Context query API returns GeoJSON features + oc-api metadata
    const features = data.features || data['oc-api:has-results'] || [];
    const total = parseInt(data?.totalResults || data?.['oc-api:total-results'] || data?.['oai:totalResults'] || "0", 10) || features.length;

    const normalizedResults = features.map((f) => {
      const props = f.properties || {};
      // URI can be on the feature itself or in properties
      const uri = props.uri || props.id || f.id || f['@id'] || "";
      const label = props.label || props['rdfs:label'] || f.label || "Untitled Record";
      const project = props['oc-api:project-label'] || props['label:proj'] || props.project || "Open Context";

      return {
        id: `oc-${uri.split('/').pop() || Math.random().toString(36).substr(2, 9)}`,
        source: "OPENCONTEXT",
        title: label,
        authors: props.creator ? [props.creator] : [],
        year: String(props.published || props['dc-terms:date'] || props.created || "").match(/\d{4}/)?.[0] || "",
        journal: project,
        publisher: "Open Context",
        url: uri.startsWith('http') ? uri : `https://opencontext.org${uri}`,
        abstract: props.description || props['dc-terms:abstract'] || props['rdfs:comment'] || "",
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
