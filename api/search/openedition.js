import { log } from "../_shared/log.js";

export const config = { runtime: 'edge' };

// OpenEdition (OpenEdition Journals / Books / Hypotheses / Calenda) — French/European
// open-access humanities & social sciences platform. The public SPA talks to
// search-api.openedition.org via a JSON POST (not GET): the generic /api/proxy drops
// Content-Type on POST, so this route owns the upstream call. Contract reverse-engineered
// from the SPA bundle: POST /documents { q, pagination: { currentPage (1-based), documentsPerPage } }.

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const rows = parseInt(searchParams.get('rows') || '10', 10);

  if (!query) return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  log("OPENEDITION", "start", { q: query, page });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch("https://search-api.openedition.org/documents", {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://search.openedition.org/',
      },
      body: JSON.stringify({
        q: query,
        pagination: { currentPage: page, documentsPerPage: rows },
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      log.err("OPENEDITION", "upstream-fail", { status: response.status });
      return new Response(JSON.stringify({ results: [], total: 0, error: `OpenEdition status ${response.status}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const data = await response.json();
    const docs = Array.isArray(data.documents) ? data.documents : [];
    const total = data.totalDocumentCount ?? docs.length;

    const stripHtml = (s) => (typeof s === "string" ? s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "");
    const firstStr = (v) => (Array.isArray(v) ? v.find((x) => typeof x === "string") || "" : (typeof v === "string" ? v : ""));

    const results = docs.map((d, i) => {
      const title = stripHtml(firstStr(d.naked_titre) || firstStr(d.titre)) || "Untitled";
      const authors = Array.isArray(d.authors) ? d.authors.filter(Boolean)
        : (Array.isArray(d.auteur) ? d.auteur.filter(Boolean) : (d.author ? [d.author] : []));
      const year = String(d.anneedatepubli || d.datepubli || "").match(/\d{4}/)?.[0] || "";
      const abstract = stripHtml(firstStr(d.overview) || firstStr(d.resume) || firstStr(d.description));
      const journal = firstStr(d.site_title) || firstStr(d.collection_title) || "";
      const lang = firstStr(d.lang) || firstStr(d.langue) || "";
      const subjects = Array.isArray(d.subject) ? d.subject.filter(Boolean).slice(0, 8)
        : (Array.isArray(d.motcle) ? d.motcle.filter(Boolean).slice(0, 8) : []);
      const docUrl = d.url || d.uri || (d.id ? `https://search.openedition.org/index.php?id=${d.id}` : "");
      const access = String(d.access || d.via || "").toLowerCase();
      const isOA = access ? /open|libre|gratuit|freemium/.test(access) : true;

      return {
        id: `openedition-${d.id || `${page}-${i}`}`,
        source: "OPENEDITION",
        title,
        authors,
        year,
        journal,
        publisher: "OpenEdition",
        volume: "", issue: "", pages: "", doi: "",
        url: docUrl,
        abstract,
        isOA,
        type: d.type || "article",
        subjects,
        language: lang,
      };
    });

    log("OPENEDITION", "parse-ok", { items: results.length, total });

    return new Response(JSON.stringify({ results, total }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    clearTimeout(timeout);
    const isTimeout = error.name === "AbortError";
    log.err("OPENEDITION", isTimeout ? "upstream-timeout" : "edge-error", { err: error.name, msg: error.message });
    return new Response(JSON.stringify({
      results: [],
      total: 0,
      error: isTimeout ? "OpenEdition timed out (8s)" : error.message
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
