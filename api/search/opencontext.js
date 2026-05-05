export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const start = searchParams.get('start') || '0';
  const rows = searchParams.get('rows') || '10';

  if (!query) return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });

  // Open Context prefers .json at the end of the set path
  const targetUrl = `https://opencontext.org/sets/.json?q=${encodeURIComponent(query)}&start=${start}&rows=${rows}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'OpenCITE/1.0 (https://opencite.app)',
        'Accept': 'application/json',
        'Referer': 'https://opencontext.org/'
      }
    });

    if (!response.ok) throw new Error(`Open Context Upstream Error: ${response.status}`);

    const data = await response.json();
    
    // Open Context results can be in features (GeoJSON style) or has-results
    const features = data.features || data.oc_api?.["has-results"] || [];
    const total = parseInt(data?.totalResults || data?.["oc-api:total"] || "0", 10) || features.length;

    const normalizedResults = features.map((f) => {
      const props = f.properties || {};
      const uri = props.uri || f.id || "";
      
      return {
        id: `oc-${uri.split('/').pop() || Math.random().toString(36).substr(2, 9)}`,
        source: "OPENCONTEXT",
        title: props.label || f.label || "Untitled Record",
        authors: props.creator ? [props.creator] : [],
        year: String(props.published || props.created || "").match(/\d{4}/)?.[0] || "",
        journal: props["project label"] || props.project || "Open Context",
        publisher: "Open Context",
        url: uri,
        abstract: props.description || props["dc-terms:abstract"] || "",
        isOA: true,
        type: "archaeological-data",
        previewImage: props.thumbnail || ""
      };
    });

    return new Response(JSON.stringify({
      results: normalizedResults,
      total: total
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' 
      }
    });

  } catch (error) {
    // If we hit an HTML page (the "<!doctype" error), this catch block handles it
    return new Response(JSON.stringify({ error: "Failed to parse Open Context data. The service may be returning HTML." }), { status: 502 });
  }
}