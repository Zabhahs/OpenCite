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

    // ── DIAGNOSTIC ───────────────────────────────────────────────────────────
    console.log('[GALLICA] status:', response.status);
    console.log('[GALLICA] content-type:', response.headers.get('content-type'));
    console.log('[GALLICA] final URL after redirects:', response.url);
    const rawText = await response.text();
    console.log('[GALLICA] raw response (first 500 chars):', rawText.slice(0, 500));
    // ── END DIAGNOSTIC ───────────────────────────────────────────────────────

    if (!response.ok) {
      return new Response(JSON.stringify({ results: [], total: 0, error: `Gallica status ${response.status}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      console.log('[GALLICA] got HTML response — service degraded or blocking');
      return new Response(JSON.stringify({ results: [], total: 0, error: 'Gallica returned HTML' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.log('[GALLICA] JSON parse failed:', parseErr.message);
      console.log('[GALLICA] attempted to parse (first 300):', rawText.slice(0, 300));
      return new Response(JSON.stringify({ results: [], total: 0, error: 'Gallica JSON parse failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    console.log('[GALLICA] parsed data top-level keys:', Object.keys(data));
    const records = data?.srw?.records?.[0]?.record || [];
    console.log('[GALLICA] records count:', records.length);
    console.log('[GALLICA] numberOfRecords:', data?.srw?.numberOfRecords?.[0]);

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
    console.log('[GALLICA] fetch threw:', error.name, error.message);
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
