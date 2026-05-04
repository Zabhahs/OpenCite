// /api/proxy.js — Vercel Serverless CORS proxy for OpenCITE
//
// Usage: /api/proxy?url=<encoded-upstream-url>[&method=POST]
//
// Allowlist gates to known scholarly institutions only — prevents this
// being abused as an open relay. Add new adapter domains here when needed.
//
// Also injects a polite User-Agent identifying OpenCITE; required by some
// institutions (e.g. OpenContext explicitly blocks requests without it).

const ALLOWED_DOMAINS = new Set([
  "dpul.princeton.edu",
  "ws.pangaea.de",
  "opencontext.org",
  "api.dc.library.northwestern.edu",
  "openneuro.org",
  "www.ebi.ac.uk",
  "eutils.ncbi.nlm.nih.gov"
]);

export default async function handler(req, res) {
  const { url, method = "GET" } = req.query;

  if (!url) {
    return res.status(400).json({ error: "missing url parameter" });
  }

  let parsed;
  try {
    parsed = new URL(decodeURIComponent(url));
  } catch {
    return res.status(400).json({ error: "invalid url parameter" });
  }

  if (!ALLOWED_DOMAINS.has(parsed.hostname)) {
    return res.status(403).json({
      error: `domain not in allowlist: ${parsed.hostname}`,
      allowed: [...ALLOWED_DOMAINS]
    });
  }

  const upstreamMethod = method.toUpperCase();

  try {
    const upstream = await fetch(parsed.toString(), {
      method: upstreamMethod,
      headers: {
        // Polite identification — some APIs (OpenContext) require a recognized UA.
        "User-Agent": "OpenCITE/1.0 (https://opencite.app; scholarly meta-search)",
        "Accept": "application/json",
        // Forward Content-Type for POST adapters (PANGAEA, Northwestern, OpenNeuro)
        ...(upstreamMethod === "POST" ? { "Content-Type": "application/json" } : {})
      },
      body: upstreamMethod === "POST" ? req.body : undefined
    });

    const text = await upstream.text();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json"
    );
    return res.status(upstream.status).send(text);

  } catch (err) {
    return res.status(502).json({ error: `upstream fetch failed: ${err.message}` });
  }
}
