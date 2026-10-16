import { log } from "../_shared/log.js";

export const config = { runtime: 'edge' };

// v0.46: this route parsed SRU XML with DOMParser, which does not exist in Vercel Edge — every
// request since 2026-05-21 returned the error envelope and the browser showed "no matches". It now
// uses the same targeted-regex Dublin Core extraction the ONB/BnF adapters use
// (src/adapters/_shared/xmlUtils.js), inlined because Edge routes cannot import from src/.
// Handles namespace prefixes (<dc:title>, <srw:record>, …) and basic entity decoding.
const dcOne = (xml, tag) => {
  const m = xml.match(new RegExp(`<(?:[^:>\\s]+:)?${tag}[^>]*>([^<]*)<`, "i"));
  return m ? m[1].trim() : "";
};
const dcAll = (xml, tag) => {
  const re = new RegExp(`<(?:[^:>\\s]+:)?${tag}[^>]*>([^<]*)<`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) { const v = m[1].trim(); if (v) out.push(v); }
  return out;
};
const decode = (t) => t
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const sruTotal = (xml) => { const m = xml.match(/<(?:[^:>\s]+:)?numberOfRecords[^>]*>(\d+)</i); return m ? parseInt(m[1], 10) : 0; };
const sruRecords = (xml) => {
  const re = /<(?:[^:>\s]+:)?recordData[^>]*>([\s\S]*?)<\/(?:[^:>\s]+:)?recordData>/gi;
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
};

const json = (body) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
});

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const start = searchParams.get('start') || '1';
  const rows = searchParams.get('rows') || '10';

  if (!query) return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });

  log("GALLICA", "start", { q: query, start });

  // The `dc.any all` index is rejected by Gallica's SRU (returns an SRW diagnostic, 0 records).
  // `gallica all` is the catch-all index that matches OCR'd full text *and* metadata — the
  // "search inside" behaviour, mirroring the Internet Archive full-text adapter.
  const targetUrl = `https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&query=${encodeURIComponent('gallica all "' + query + '"')}&startRecord=${start}&maximumRecords=${rows}&recordSchema=dc`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        // v0.46: honest identity (no browser spoof) — see src/adapters/_shared/proxy.js SERVER_USER_AGENT.
        'User-Agent': 'OpenCITE/0.46 (+https://citation.today; mailto:ops@citation.today)',
        'Referer': 'https://gallica.bnf.fr/',
        'Accept': 'application/xml, text/xml, */*'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      log.err("GALLICA", "upstream-fail", { status: response.status });
      return json({ results: [], total: 0, error: `Gallica status ${response.status}` });
    }

    const xmlText = await response.text();
    log("GALLICA", "upstream-ok", { status: response.status, bytes: xmlText.length });

    const records = sruRecords(xmlText);
    if (!records.length && /<(?:[^:>\s]+:)?diagnostic[\s>]/i.test(xmlText)) {
      log.err("GALLICA", "sru-diagnostic", { sample: xmlText.slice(0, 200) });
      return json({ results: [], total: 0, error: 'Gallica SRU diagnostic' });
    }
    const total = sruTotal(xmlText);

    const normalizedResults = records.map((rec) => {
      const title = decode(dcOne(rec, 'title')) || "Untitled";
      const creators = dcAll(rec, 'creator').map(decode);
      const date = dcOne(rec, 'date');
      const description = decode(dcOne(rec, 'description'));
      const identifiers = dcAll(rec, 'identifier');
      const ark = identifiers.find(id => id.includes('ark:') || id.includes('gallica.bnf.fr')) || identifiers[0] || "";
      const year = date.match(/\d{4}/)?.[0] || "";
      // E5 — dc:type, dc:subject, dc:language from the DC namespace
      const dcType    = dcOne(rec, 'type');
      const subjects  = dcAll(rec, 'subject').map(decode);
      const language  = dcOne(rec, 'language');
      return {
        id: `gallica-${ark.split('/').pop() || Math.random().toString(36).substr(2, 9)}`,
        source: "GALLICA",
        title,
        authors: creators,
        year,
        url: ark.startsWith('http') ? ark : (ark ? `https://gallica.bnf.fr/${ark}` : ""),
        abstract: description,
        isOA: true,
        type: dcType || "primary-source",
        subjects,
        language,
        previewImage: ark ? `${ark.startsWith('http') ? ark : 'https://gallica.bnf.fr/' + ark}.thumbnail` : ""
      };
    });

    log("GALLICA", "parse-ok", { items: normalizedResults.length, total });
    return json({ results: normalizedResults, total });

  } catch (error) {
    clearTimeout(timeout);
    const isTimeout = error.name === "AbortError";
    log.err("GALLICA", isTimeout ? "upstream-timeout" : "edge-error", { err: error.name, msg: error.message });
    return json({ results: [], total: 0, error: isTimeout ? "Gallica timed out (8s)" : error.message });
  }
}
