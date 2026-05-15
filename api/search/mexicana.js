/**
 * api/search/mexicana.js — Vercel edge route
 *
 * Mexicana (Mexican Ministry of Culture digital aggregator) exposes an
 * OAI-PMH endpoint that returns Dublin Core XML. This server route handles:
 *   - OAI-PMH verb=ListRecords with metadataPrefix=oai_dc
 *   - Free-text pre-filter via the `set` param where available, then
 *     client-side keyword filter on title/description (OAI-PMH has no
 *     full-text search — we fetch a page and filter locally)
 *   - XML parsing (DOMParser not available in Edge; use string extraction)
 *   - Pagination via OAI-PMH resumptionToken
 *
 * Query params accepted:
 *   q      — search string (filtered client-side against title + description)
 *   start  — record offset (approximated via token caching — see note)
 *   rows   — page size (capped at 100 by OAI-PMH spec; we use 50)
 *
 * Pagination note: OAI-PMH uses opaque resumptionTokens, not numeric offsets.
 * For start=0 we issue a fresh ListRecords. For subsequent pages the client
 * must pass the token returned in the previous response as `token`. This
 * deviates slightly from the unified adapter pattern but is unavoidable with
 * OAI-PMH. The client adapter passes `opts.token` through the fetch URL.
 */

export const config = { runtime: 'edge' };

const OAI_BASE = 'https://mexicana.cultura.gob.mx/oai';
const PAGE_SIZE = 50;

/** Naive regex-based XML field extractor — no DOMParser in Edge runtime. */
const extractAll = (xml, tag) => {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'gi');
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].replace(/<[^>]+>/g, '').trim());
  }
  return results;
};

const extractOne = (xml, tag) => extractAll(xml, tag)[0] || '';

const extractResumptionToken = (xml) => {
  const m = xml.match(/<resumptionToken[^>]*>([\s\S]*?)<\/resumptionToken>/i);
  return m ? m[1].trim() : null;
};

const extractRecords = (xml) => {
  const re = /<record>([\s\S]*?)<\/record>/gi;
  const records = [];
  let m;
  while ((m = re.exec(xml)) !== null) records.push(m[1]);
  return records;
};

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...corsHeaders, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
  }

  const { searchParams } = new URL(req.url);
  const query   = searchParams.get('q') || '';
  const token   = searchParams.get('token') || '';   // OAI resumptionToken from prior page
  const rows    = Math.min(parseInt(searchParams.get('rows') || '20', 10), PAGE_SIZE);

  // Build OAI-PMH URL
  let oaiUrl;
  if (token) {
    oaiUrl = `${OAI_BASE}?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`;
  } else {
    oaiUrl = `${OAI_BASE}?verb=ListRecords&metadataPrefix=oai_dc`;
  }

  let xml;
  try {
    const res = await fetch(oaiUrl, {
      headers: {
        'User-Agent': 'OpenCITE/1.0 (academic meta-search; contact: admin@opencite.app)',
        'Accept': 'text/xml, application/xml',
      },
    });
    if (!res.ok) throw new Error(`Mexicana OAI-PMH ${res.status}`);
    xml = await res.text();
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, results: [], total: 0 }), { status: 502, headers: corsHeaders });
  }

  // Check for OAI error response
  if (xml.includes('<error')) {
    const errCode = extractOne(xml, 'error');
    return new Response(JSON.stringify({ error: `OAI-PMH error: ${errCode}`, results: [], total: 0 }), { status: 200, headers: corsHeaders });
  }

  const rawRecords = extractRecords(xml);
  const nextToken  = extractResumptionToken(xml);

  // Client-side keyword filter (OAI-PMH has no query param)
  const q = query.toLowerCase();
  const matched = q
    ? rawRecords.filter(r => {
        const title = extractOne(r, 'title').toLowerCase();
        const desc  = extractOne(r, 'description').toLowerCase();
        const subj  = extractAll(r, 'subject').join(' ').toLowerCase();
        return title.includes(q) || desc.includes(q) || subj.includes(q);
      })
    : rawRecords;

  const slice = matched.slice(0, rows);

  const results = slice.map((rec, i) => {
    const identifier = extractOne(rec, 'identifier');
    const title      = extractOne(rec, 'title') || 'Untitled';
    const creators   = extractAll(rec, 'creator');
    const date       = extractOne(rec, 'date');
    const description= extractOne(rec, 'description');
    const subjects   = extractAll(rec, 'subject');
    const language   = extractOne(rec, 'language');
    const type       = extractOne(rec, 'type');
    const publisher  = extractOne(rec, 'publisher');
    // Identifier may be a URL or URN
    const url = identifier.startsWith('http') ? identifier : '';
    const year = String(date).match(/\d{4}/)?.[0] || '';

    return {
      id: `mexicana-${i}-${year}`,
      source: 'MEXICANA',
      title,
      authors: creators,
      year,
      journal: '',
      publisher,
      volume: '', issue: '', pages: '', doi: '',
      url,
      abstract: description,
      isOA: true,
      type: type || 'primary-source',
      subjects,
      language,
    };
  });

  return new Response(
    JSON.stringify({
      results,
      total: matched.length,
      nextToken: nextToken || null,
      hasMore: !!nextToken || matched.length > rows,
    }),
    { status: 200, headers: corsHeaders }
  );
}
