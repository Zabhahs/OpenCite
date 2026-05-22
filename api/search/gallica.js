import { log } from "../_shared/log.js";

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const start = searchParams.get('start') || '1';
  const rows = searchParams.get('rows') || '10';

  if (!query) return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });

  log("GALLICA", "start", { q: query, start });

  const targetUrl = `https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&query=${encodeURIComponent('dc.any all "' + query + '"')}&startRecord=${start}&maximumRecords=${rows}&recordSchema=dc`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://gallica.bnf.fr/',
        'Accept': 'application/xml, text/xml, */*'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      log.err("GALLICA", "upstream-fail", { status: response.status });
      return new Response(JSON.stringify({ results: [], total: 0, error: `Gallica status ${response.status}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const xmlText = await response.text();
    log("GALLICA", "upstream-ok", { status: response.status, bytes: xmlText.length });

    // DOMParser may not exist in Vercel Edge V8 — this catch will surface that
    let parser, doc;
    try {
      parser = new DOMParser();
      doc = parser.parseFromString(xmlText, 'application/xml');
    } catch (domErr) {
      log.err("GALLICA", "domparser-unavailable", { err: domErr.name, msg: domErr.message });
      return new Response(JSON.stringify({ results: [], total: 0, error: 'DOMParser unavailable in Edge runtime' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      log.err("GALLICA", "xml-parse-fail", { sample: xmlText.slice(0, 200) });
      return new Response(JSON.stringify({ results: [], total: 0, error: 'Gallica XML parse failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const numberOfRecordsEl = doc.getElementsByTagNameNS('http://www.loc.gov/zing/srw/', 'numberOfRecords')[0];
    const total = parseInt(numberOfRecordsEl?.textContent || "0", 10);
    const records = doc.getElementsByTagNameNS('http://www.loc.gov/zing/srw/', 'record');

    const getText = (el, ns, localName) => {
      const els = el.getElementsByTagNameNS(ns, localName);
      return els[0]?.textContent?.trim() || "";
    };
    const getAll = (el, ns, localName) => {
      const els = el.getElementsByTagNameNS(ns, localName);
      return Array.from(els).map(e => e.textContent?.trim()).filter(Boolean);
    };

    const DC_NS = 'http://purl.org/dc/elements/1.1/';
    const normalizedResults = Array.from(records).map((rec) => {
      const title = getText(rec, DC_NS, 'title') || "Untitled";
      const creators = getAll(rec, DC_NS, 'creator');
      const date = getText(rec, DC_NS, 'date');
      const description = getText(rec, DC_NS, 'description');
      const identifiers = getAll(rec, DC_NS, 'identifier');
      const ark = identifiers.find(id => id.includes('ark:') || id.includes('gallica.bnf.fr')) || identifiers[0] || "";
      const year = date.match(/\d{4}/)?.[0] || "";
      return {
        id: `gallica-${ark.split('/').pop() || Math.random().toString(36).substr(2, 9)}`,
        source: "GALLICA",
        title,
        authors: creators,
        year,
        url: ark.startsWith('http') ? ark : (ark ? `https://gallica.bnf.fr/${ark}` : ""),
        abstract: description,
        isOA: true,
        type: "primary-source",
        previewImage: ark ? `${ark.startsWith('http') ? ark : 'https://gallica.bnf.fr/' + ark}.thumbnail` : ""
      };
    });

    log("GALLICA", "parse-ok", { items: normalizedResults.length, total });

    return new Response(JSON.stringify({ results: normalizedResults, total }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    clearTimeout(timeout);
    const isTimeout = error.name === "AbortError";
    log.err("GALLICA", isTimeout ? "upstream-timeout" : "edge-error", { err: error.name, msg: error.message });
    return new Response(JSON.stringify({
      results: [],
      total: 0,
      error: isTimeout ? "Gallica timed out (8s)" : error.message
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
