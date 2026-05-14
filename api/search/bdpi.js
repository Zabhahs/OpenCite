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

    if (!response.ok) throw new Error(`BDPI Upstream Error: ${response.status}`);

    const rawText = await response.text();
    const jsonString = rawText.replace(/^[^{[]+/, "").replace(/[^}\]]+$/, "");
    const data = JSON.parse(jsonString);

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
    // Return 200 with empty results — adapter checks r.ok and throws on non-200,
    // which renders as an error banner. Empty results render as "No matches." instead.
    return new Response(JSON.stringify({
      results: [],
      total: 0,
      error: isTimeout ? "BDPI timed out" : error.message
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
