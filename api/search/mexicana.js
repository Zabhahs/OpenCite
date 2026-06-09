import { log } from "../_shared/log.js";

export const config = { runtime: 'edge' };

const OAI_BASE = 'https://mexicana.cultura.gob.mx/oai';
const PAGE_SIZE = 50;

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
  const query = searchParams.get('q') || '';
  const token = searchParams.get('token') || '';
  const rows  = Math.min(parseInt(searchParams.get('rows') || '20', 10), PAGE_SIZE);

  log("MEXICANA", "start", { q: query, hasToken: !!token });

  // F-409: the OAI resumptionToken is opaque but observably [alnum + limited punct].
  // encodeURIComponent already prevents extra-param injection, but reject URL-structural
  // chars (& ? # whitespace, <>) up front as defence-in-depth before it touches the URL.
  if (token && !/^[\w%=+/\-.@:*]+$/.test(token)) {
    return new Response(
      JSON.stringify({ error: "Invalid resumption token", results: [], total: 0 }),
      { status: 400, headers: corsHeaders }
    );
  }

  let oaiUrl;
  if (token) {
    oaiUrl = `${OAI_BASE}?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`;
  } else {
    oaiUrl = `${OAI_BASE}?verb=ListRecords&metadataPrefix=oai_dc`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let xml;
  try {
    const res = await fetch(oaiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'OpenCITE/1.0 (academic meta-search; contact: admin@opencite.app)',
        'Accept': 'text/xml, application/xml',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      log.err("MEXICANA", "upstream-fail", { status: res.status });
      return new Response(JSON.stringify({ error: `Mexicana OAI-PMH ${res.status}`, results: [], total: 0 }), { status: 200, headers: corsHeaders });
    }
    xml = await res.text();
    log("MEXICANA", "upstream-ok", { bytes: xml.length });
  } catch (err) {
    clearTimeout(timeout);
    const isTimeout = err.name === 'AbortError';
    log.err("MEXICANA", isTimeout ? "upstream-timeout" : "upstream-error", { err: err.name });
    return new Response(JSON.stringify({ error: isTimeout ? "Mexicana timed out (8s)" : err.message, results: [], total: 0 }), { status: 200, headers: corsHeaders });
  }

  if (xml.includes('<error')) {
    const errCode = extractOne(xml, 'error');
    log.err("MEXICANA", "oai-error", { code: errCode });
    return new Response(JSON.stringify({ error: `OAI-PMH error: ${errCode}`, results: [], total: 0 }), { status: 200, headers: corsHeaders });
  }

  const rawRecords = extractRecords(xml);
  const nextToken  = extractResumptionToken(xml);

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
    const url = identifier.startsWith('http') ? identifier : '';
    const year = String(date).match(/\d{4}/)?.[0] || '';
    return {
      id: `mexicana-${i}-${year}`,
      source: 'MEXICANA',
      title, authors: creators, year,
      journal: '', publisher,
      volume: '', issue: '', pages: '', doi: '',
      url, abstract: description,
      isOA: true, type: type || 'primary-source',
      subjects, language,
    };
  });

  log("MEXICANA", "parse-ok", { items: results.length, total: matched.length, hasMore: !!nextToken });

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
