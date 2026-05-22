import { log } from "../_shared/log.js";

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const start = searchParams.get('start') || '0';
  const rows = searchParams.get('rows') || '3';

  if (!query) return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });

  log("OPENCONTEXT", "start", { q: query, start });

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
      log.err("OPENCONTEXT", "upstream-fail", { status: response.status });
      return new Response(JSON.stringify({ results: [], total: 0, error: `Open Context status ${response.status}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      log.err("OPENCONTEXT", "got-html", { contentType });
      return new Response(JSON.stringify({ results: [], total: 0, error: 'Open Context returned HTML' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let data;
    try {
      data = await response.json();
    } catch {
      log.err("OPENCONTEXT", "json-parse-fail", {});
      return new Response(JSON.stringify({ results: [], total: 0, error: 'Open Context JSON parse failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const items = data['oc-api:has-results'] || [];
    const total = parseInt(
      data?.['oai:totalResults'] ||
      data?.['oc-api:total-results'] ||
      data?.totalResults ||
      "0", 10
    );

    const normalizedResults = items
      .filter(item => item.label && item.label !== '' && item['item-type'] !== 'region')
      .map(item => {
        const uri = item.uri || item['@id'] || "";
        const canonicalUri = uri.replace('http://opencontext.org', 'https://opencontext.org');
        const year = String(item.published || item.updated || "").match(/\d{4}/)?.[0] || "";
        const itemType = item['item-type'] || "";
        const type = itemType === 'projects' ? 'dataset'
          : itemType === 'documents' ? 'primary-source'
          : itemType === 'media' ? 'primary-source'
          : 'archaeological-data';
        return {
          id: `oc-${canonicalUri.split('/').pop() || Math.random().toString(36).substr(2, 9)}`,
          source: "OPENCONTEXT",
          title: item.label || "Untitled Record",
          authors: [],
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
    log("OPENCONTEXT", "parse-ok", { items: normalizedResults.length, total });

    return new Response(JSON.stringify({ results: normalizedResults, total, hasMore }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    clearTimeout(timeout);
    const isTimeout = error.name === "AbortError";
    log.err("OPENCONTEXT", isTimeout ? "upstream-timeout" : "edge-error", { err: error.name, msg: error.message });
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
