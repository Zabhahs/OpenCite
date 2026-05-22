import { log } from "../_shared/log.js";

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const start = searchParams.get('start') || '0';
  const rows = searchParams.get('rows') || '10';

  if (!query) return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });

  const pageSize = parseInt(rows, 10) || 10;
  const pageNumber = Math.floor(parseInt(start, 10) / pageSize) + 1;
  const CALLBACK = 'opencite_cb';

  const targetUrl = `https://www.iberoamericadigital.net/gdl/ExternalSearch.do?field1val=${encodeURIComponent(query)}&numfields=1&field1=todos&pageNumber=${pageNumber}&jsonCallback=${CALLBACK}`;

  log("BDPI", "start", { q: query, page: pageNumber });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://www.iberoamericadigital.net/',
        'Accept': 'application/javascript, text/javascript, */*; q=0.01'
      },
      redirect: 'follow'
    });
    clearTimeout(timeout);

    if (!response.ok) {
      log.err("BDPI", "upstream-fail", { status: response.status });
      return new Response(JSON.stringify({ results: [], total: 0, error: `BDPI status ${response.status}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const rawText = await response.text();
    log("BDPI", "upstream-ok", { status: response.status, bytes: rawText.length });

    const jsonMatch = rawText.match(/^\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\(\s*([\s\S]*)\s*\)\s*;?\s*$/);
    if (!jsonMatch) {
      const stripped = rawText.replace(/^[^{[]+/, "").replace(/[^}\]]+$/, "");
      if (!stripped) {
        log.err("BDPI", "parse-fail", { reason: "no-jsonp-wrapper", sample: rawText.slice(0, 200) });
        return new Response(JSON.stringify({ results: [], total: 0, error: 'BDPI: unexpected response format' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    let data;
    try {
      const jsonStr = jsonMatch ? jsonMatch[1] : rawText.replace(/^[^{[]+/, "").replace(/[^}\]]+$/, "");
      data = JSON.parse(jsonStr);
    } catch {
      log.err("BDPI", "json-parse-fail", { sample: rawText.slice(0, 200) });
      return new Response(JSON.stringify({ results: [], total: 0, error: 'BDPI JSON parse failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const items = data.results || data.items || data.docs || [];
    const total = data.total || data.totalResults || data.count || items.length;

    const normalizedResults = items.map(it => ({
      id: `bdpi-${it.id || Math.random().toString(36).substr(2, 9)}`,
      source: "BDPI",
      title: it.titulo || it.title || "Sin título",
      authors: it.autor
        ? (Array.isArray(it.autor) ? it.autor : [it.autor])
        : (Array.isArray(it.creator) ? it.creator : (it.creator ? [it.creator] : [])),
      year: String(it.fecha || it.date || "").match(/\d{4}/)?.[0] || "",
      url: it.enlace || it.link || it.url || "",
      abstract: it.descripcion || it.description || "",
      isOA: true,
      type: "primary-source",
      previewImage: it.miniatura || it.thumbnail || it.image || ""
    }));

    log("BDPI", "parse-ok", { items: normalizedResults.length, total });

    return new Response(JSON.stringify({ results: normalizedResults, total }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    clearTimeout(timeout);
    const isTimeout = error.name === "AbortError";
    log.err("BDPI", isTimeout ? "upstream-timeout" : "edge-error", { err: error.name, msg: error.message });
    return new Response(JSON.stringify({
      results: [],
      total: 0,
      error: isTimeout ? "BDPI timed out (8s)" : error.message
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
