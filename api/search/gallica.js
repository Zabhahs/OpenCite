export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const start = searchParams.get('start') || '1'; // Gallica is 1-indexed
  const rows = searchParams.get('rows') || '10';

  if (!query) return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });

  const targetUrl = `https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&query=${encodeURIComponent('dc.any all "' + query + '"')}&startRecord=${start}&maximumRecords=${rows}&recordSchema=dc&mode=json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://gallica.bnf.fr/',
        'Accept': 'application/json, text/javascript, */*'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Gallica Upstream Error: ${response.status}`);

    // Guard against Gallica returning HTML instead of JSON (happens when server is degraded)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error('Gallica returned HTML — service may be degraded');
    }

    const data = await response.json();
    const records = data?.srw?.records?.[0]?.record || [];
    const total = parseInt(data?.srw?.numberOfRecords?.[0] || "0", 10);

    const normalizedResults = records.map((rec) => {
      const dc = rec?.recordData?.[0]?.["oai_dc:dc"]?.[0] || {};
      const ark = (dc["dc:identifier"] || []).find(s => typeof s === "string" && s.includes("ark:")) || "";
      return {
        id: `gallica-${ark.split('/').pop() || Math.random().toString(36).substr(2, 9)}`,
        source: "GALLICA",
        title: (dc["dc:title"] || ["Untitled"])[0],
        authors: (dc["dc:creator"] || []).filter(Boolean),
        year: String((dc["dc:date"] || [""])[0] || "").match(/\d{4}/)?.[0] || "",
        url: ark,
        abstract: (dc["dc:description"] || [""])[0] || "",
        isOA: true,
        type: "primary-source",
        previewImage: ark ? `${ark}.thumbnail` : ""
      };
    });

    return new Response(JSON.stringify({ results: normalizedResults, total }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    clearTimeout(timeout);
    const isTimeout = error.name === "AbortError";
    return new Response(JSON.stringify({
      results: [],
      total: 0,
      error: isTimeout ? "Gallica timed out" : error.message
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
