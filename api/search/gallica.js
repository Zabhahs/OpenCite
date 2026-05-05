export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const start = searchParams.get('start') || '1'; // Gallica is 1-indexed
  const rows = searchParams.get('rows') || '10';

  if (!query) return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });

  const targetUrl = `https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&query=${encodeURIComponent('dc.any all "' + query + '"')}&startRecord=${start}&maximumRecords=${rows}&recordSchema=dc&mode=json`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://gallica.bnf.fr/',
        'Accept': 'application/json, text/javascript, */*'
      }
    });

    if (!response.ok) throw new Error(`Gallica Upstream Error: ${response.status}`);

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
    return new Response(JSON.stringify({ error: error.message }), { status: 502 });
  }
}