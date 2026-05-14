export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const start = searchParams.get('start') || '0';
  const rows = searchParams.get('rows') || '10';

  if (!query) return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });

  const targetUrl = `https://www.iberoamericadigital.net/BDPI/OpenSearch.do?Field=todos&text=${encodeURIComponent(query)}&start=${start}&rows=${rows}&format=json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://www.iberoamericadigital.net/BDPI/Search.do',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      },
      redirect: 'follow'
    });
    clearTimeout(timeout);

    // ── DIAGNOSTIC ───────────────────────────────────────────────────────────
    console.log('[BDPI] status:', response.status);
    console.log('[BDPI] content-type:', response.headers.get('content-type'));
    console.log('[BDPI] final URL after redirects:', response.url);
    const rawText = await response.text();
    console.log('[BDPI] raw response (first 500 chars):', rawText.slice(0, 500));
    // ── END DIAGNOSTIC ───────────────────────────────────────────────────────

    if (!response.ok) {
      return new Response(JSON.stringify({ results: [], total: 0, error: `BDPI status ${response.status}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const jsonString = rawText.replace(/^[^{[]+/, "").replace(/[^}\]]+$/, "");
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (parseErr) {
      console.log('[BDPI] JSON parse failed:', parseErr.message);
      console.log('[BDPI] attempted to parse (first 300):', jsonString.slice(0, 300));
      return new Response(JSON.stringify({ results: [], total: 0, error: 'BDPI JSON parse failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    console.log('[BDPI] parsed data top-level keys:', Object.keys(data));
    console.log('[BDPI] items count:', (data.items || data.docs || []).length);

    const normalizedResults = (data.items || data.docs || []).map(it => ({
      id: `bdpi-${it.id || Math.random().toString(36).substr(2, 9)}`,
      source: "BDPI",
      title: it.title || it.titulo || "Sin título",
      authors: Array.isArray(it.creator) ? it.creator : (it.autor ? [it.autor] : []),
      year: String(it.date || it.fecha || "").match(/\d{4}/)?.[0] || "",
      url: it.link || it.url || "",
      abstract: it.description || it.descripcion || "",
      isOA: true,
      type: "primary-source",
      previewImage: it.thumbnail || it.image || ""
    }));

    return new Response(JSON.stringify({
      results: normalizedResults,
      total: data.totalResults || data.count || normalizedResults.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    clearTimeout(timeout);
    const isTimeout = error.name === "AbortError";
    console.log('[BDPI] fetch threw:', error.name, error.message);
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
