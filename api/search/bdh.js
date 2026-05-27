import { log } from "../_shared/log.js";

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...corsHeaders, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';
  const start = parseInt(searchParams.get('start') || '0', 10);
  const rows  = Math.min(parseInt(searchParams.get('rows') || '20', 10), 50);

  if (!query.trim()) {
    return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200, headers: corsHeaders });
  }

  log("BDH", "start", { q: query, start, rows });

  const targetUrl = `https://datos.bne.es/api/records?q=${encodeURIComponent(query)}&start=${start}&rows=${rows}&format=json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'OpenCITE/1.0 (academic meta-search)',
        'Referer': 'https://datos.bne.es/',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      log.err("BDH", "upstream-fail", { status: res.status });
      return new Response(JSON.stringify({ results: [], total: 0, error: `BDH/BNE ${res.status}` }), { status: 200, headers: corsHeaders });
    }

    const data = await res.json();
    log("BDH", "upstream-ok", { status: res.status });

    const records = data.records || data.results || data.items || [];
    const total   = data.total || data.totalResults || records.length;

    const results = records.map((rec, i) => {
      const title      = rec.title || rec['dc:title'] || rec.prefLabel || 'Untitled';
      const creators   = [].concat(rec.creator || rec['dc:creator'] || []).filter(Boolean);
      const date       = rec.date || rec['dc:date'] || '';
      const desc       = rec.description || rec['dc:description'] || '';
      const subjects   = [].concat(rec.subject || rec['dc:subject'] || []).filter(Boolean);
      const language   = rec.language || rec['dc:language'] || 'es';
      const identifier = rec.uri || rec.url || rec['dc:identifier'] || '';
      const itemUrl    = identifier.startsWith('http') ? identifier : `https://bdh.bne.es/bnesearch/detalle/${rec.id || ''}`;
      return {
        id: `bdh-${rec.id || `${start}-${i}`}`,
        source: 'BDH',
        title: String(title),
        authors: creators.map(String),
        year: String(date).match(/\d{4}/)?.[0] || '',
        journal: '', publisher: 'Biblioteca Nacional de España',
        volume: '', issue: '', pages: '', doi: '',
        url: itemUrl,
        abstract: String(desc),
        isOA: true,
        type: 'primary-source',
        subjects: subjects.map(String),
        language: String(language),
      };
    });

    log("BDH", "parse-ok", { items: results.length, total });

    return new Response(JSON.stringify({ results, total }), { status: 200, headers: corsHeaders });

  } catch (err) {
    clearTimeout(timeout);
    const isTimeout = err.name === 'AbortError';
    log.err("BDH", isTimeout ? "upstream-timeout" : "upstream-error", { err: err.name });
    return new Response(JSON.stringify({ results: [], total: 0, error: isTimeout ? "BDH timed out (8s)" : err.message }), { status: 200, headers: corsHeaders });
  }
}
