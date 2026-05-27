import { log } from "../_shared/log.js";

export const config = { runtime: 'edge' };

const BL_SPARQL = 'https://bnb.data.bl.uk/sparql';

const buildSparql = (query, limit, offset) => `
PREFIX dc:   <http://purl.org/dc/elements/1.1/>
PREFIX dct:  <http://purl.org/dc/terms/>
PREFIX bibo: <http://purl.org/ontology/bibo/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?item ?title ?creator ?date ?description ?subject ?type ?lang WHERE {
  ?item dc:title ?title .
  FILTER(CONTAINS(LCASE(STR(?title)), LCASE("${query.replace(/"/g, '')}")))
  OPTIONAL { ?item dc:creator ?creator }
  OPTIONAL { ?item dc:date ?date }
  OPTIONAL { ?item dc:description ?description }
  OPTIONAL { ?item dc:subject ?subject }
  OPTIONAL { ?item rdf:type ?type }
  OPTIONAL { ?item dc:language ?lang }
}
LIMIT ${limit}
OFFSET ${offset}
`.trim();

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

  log("BL", "start", { q: query, start, rows });

  const sparql = buildSparql(query, rows, start);
  const sparqlUrl = `${BL_SPARQL}?query=${encodeURIComponent(sparql)}&format=application%2Fsparql-results%2Bjson`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let data;
  try {
    const res = await fetch(sparqlUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/sparql-results+json',
        'User-Agent': 'OpenCITE/1.0 (academic meta-search)',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      log.err("BL", "upstream-fail", { status: res.status });
      return new Response(JSON.stringify({ error: `BL SPARQL ${res.status}`, results: [], total: 0 }), { status: 200, headers: corsHeaders });
    }
    data = await res.json();
    log("BL", "upstream-ok", { status: res.status });
  } catch (err) {
    clearTimeout(timeout);
    const isTimeout = err.name === 'AbortError';
    log.err("BL", isTimeout ? "upstream-timeout" : "upstream-error", { err: err.name });
    return new Response(JSON.stringify({ error: isTimeout ? "BL timed out (8s)" : err.message, results: [], total: 0 }), { status: 200, headers: corsHeaders });
  }

  const bindings = data?.results?.bindings || [];

  const itemMap = new Map();
  for (const b of bindings) {
    const uri = b.item?.value || '';
    if (!itemMap.has(uri)) {
      itemMap.set(uri, {
        uri,
        title:       b.title?.value || 'Untitled',
        creator:     b.creator?.value || '',
        date:        b.date?.value || '',
        description: b.description?.value || '',
        subjects:    [],
        type:        b.type?.value || '',
        lang:        b.lang?.value || '',
      });
    }
    if (b.subject?.value) {
      itemMap.get(uri).subjects.push(b.subject.value);
    }
  }

  const results = [...itemMap.values()].map((it, i) => {
    const year = String(it.date).match(/\d{4}/)?.[0] || '';
    const typeRaw = it.type.split(/[/#]/).pop() || 'primary-source';
    const typeMap = { Book: 'book', Article: 'article', Thesis: 'thesis', Manuscript: 'primary-source' };
    const type = typeMap[typeRaw] || 'primary-source';
    return {
      id: `bl-${start}-${i}`,
      source: 'BL',
      title: it.title,
      authors: it.creator ? [it.creator] : [],
      year,
      journal: '', publisher: 'British Library',
      volume: '', issue: '', pages: '', doi: '',
      url: it.uri.startsWith('http') ? it.uri : '',
      abstract: it.description,
      isOA: true, type,
      subjects: it.subjects,
      language: it.lang,
    };
  });

  log("BL", "parse-ok", { items: results.length, hasMore: results.length === rows });

  return new Response(
    JSON.stringify({ results, total: results.length, hasMore: results.length === rows }),
    { status: 200, headers: corsHeaders }
  );
}
