export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const start = searchParams.get('start') || '0';
  const rows = searchParams.get('rows') || '10';

  if (!query) return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });

  // 1. Construct the target URL internally (safer than passing it as a param)
  const targetUrl = `https://www.iberoamericadigital.net/BDPI/OpenSearch.do?Field=todos&text=${encodeURIComponent(query)}&start=${start}&rows=${rows}&format=json`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://www.iberoamericadigital.net/BDPI/Search.do',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      },
      redirect: 'follow'
    });

    if (!response.ok) throw new Error(`BDPI Upstream Error: ${response.status}`);

    const rawText = await response.text();
    
    // 2. Data Cleaning: BDPI often returns JSON with leading/trailing junk
    const jsonString = rawText.replace(/^[^{[]+/, "").replace(/[^}\]]+$/, "");
    const data = JSON.parse(jsonString);

    // 3. Normalization: Map BDPI's specific fields to YOUR internal schema
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
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' 
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 502 });
  }
}