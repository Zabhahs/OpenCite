/**
 * api/search/bl.js — Vercel edge route
 *
 * British Library — data.bl.uk linked open data + bl.uk catalogue search.
 *
 * The BL exposes two useful surfaces:
 *   1. data.bl.uk SPARQL endpoint — structured linked data, CORS-blocked
 *   2. explore.bl.uk catalogue search — HTML scrape (fragile, avoid)
 *
 * Strategy: SPARQL via data.bl.uk/sparql with a DC-based query.
 * Returns JSON (application/sparql-results+json).
 *
 * Query params accepted:
 *   q     — search string
 *   start — offset (SPARQL OFFSET)
 *   rows  — page size (SPARQL LIMIT, max 50)
 */

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
  const query  = searchParams.get('q') || '';
  const start  = parseInt(searchParams.get('start') || '0', 10);
  const rows   = Math.min(parseInt(searchParams.get('rows') || '20', 10), 50);

  if (!query.trim()) {
    return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200, headers: corsHeaders });
  }

  const sparql = buildSparql(query, rows, start);
  const sparqlUrl = `${BL_SPARQL}?query=${encodeURIComponent(sparql)}&format=application%2Fsparql-results%2Bjson`;

  let data;
  try {
    const res = await fetch(sparqlUrl, {
      headers: {
        'Accept': 'application/sparql-results+json',
        'User-Agent': 'OpenCITE/1.0 (academic meta-search)',
      },
    });
    if (!res.ok) throw new Error(`BL SPARQL ${res.status}`);
    data = await res.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, results: [], total: 0 }), { status: 502, headers: corsHeaders });
  }

  const bindings = data?.results?.bindings || [];

  // Group by ?item to collapse multi-value fields (subject can repeat)
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
    // Derive a clean type label from RDF type URI
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
      isOA: true,
      type,
      subjects: it.subjects,
      language: it.lang,
    };
  });

  return new Response(
    JSON.stringify({ results, total: results.length, hasMore: results.length === rows }),
    { status: 200, headers: corsHeaders }
  );
}
