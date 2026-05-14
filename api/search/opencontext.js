export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const start = searchParams.get('start') || '0';
  const rows = searchParams.get('rows') || '3';

  if (!query) return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });

  // CRITICAL: response=uri-meta returns actual item records.
  // Without this, the API returns geo-facet region buckets ("Region (1)", "Region (2)"...)
  // which have no useful metadata. rows controls page size.
  const targetUrl = `https://opencontext.org/query/.json?q=${encodeURIComponent(query)}&rows=${rows}&start=${start}&response=uri-meta`;

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

    // With response=uri-meta, actual item records are in data['oc-api:has-results']
    // Each record has: uri, label, project-label, project-href, published, updated,
    // context-label, item-type, thumbnail-uri, latitude, longitude
    const items = data['oc-api:has-results'] || [];
    const total = parseInt(
      data?.['oai:totalResults'] ||
      data?.['oc-api:total-results'] ||
      data?.totalResults ||
      "0", 10
    );

    const normalizedResults = items
      // Filter out any geo-facet region buckets that slip through (no label or type=region)
      .filter(item => item.label && item.label !== '' && item['item-type'] !== 'region')
      .map(item => {
        const uri = item.uri || item['@id'] || "";
        const canonicalUri = uri.replace('http://opencontext.org', 'https://opencontext.org');

        // published is ISO date string e.g. "2013-07-31T00:00:00"
        const year = String(item.published || item.updated || "").match(/\d{4}/)?.[0] || "";

        // item-type can be: subjects, media, documents, projects, persons, predicates, types
        // Map to our type vocab
        const itemType = item['item-type'] || "";
        const type = itemType === 'projects' ? 'dataset'
          : itemType === 'documents' ? 'primary-source'
          : itemType === 'media' ? 'primary-source'
          : 'archaeological-data';

        return {
          id: `oc-${canonicalUri.split('/').pop() || Math.random().toString(36).substr(2, 9)}`,
          source: "OPENCONTEXT",
          title: item.label || "Untitled Record",
          authors: item['context-label'] ? [] : [], // OC records don't surface authors at this level
          year,
          journal: item['project-label'] || "Open Context",
          publisher: "Open Context",
          url: canonicalUri,
          abstract: [
            item['context-label'] ? `Context: ${item['context-label']}` : '',
            item['item-type'] ? `Type: ${item['item-type']}` : ''
          ].filter(Boolean).join(' · '),
          isOA: true,
          type,
          previewImage: item['thumbnail-uri'] || ""
        };
      });

    const hasMore = (parseInt(start, 10) + normalizedResults.length) < total;

    return new Response(JSON.stringify({ results: normalizedResults, total, hasMore }), {
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
