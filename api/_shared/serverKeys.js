// OpenCITE — server-side env key SSOT (v0.34)
// The ONLY place backend API keys for keyed CC0 sources are read from process.env.
// Imported by api/search/{europeana,dpla,smithsonian}.js (browser-shim routes) and
// by api/search.js (the API fan-out). A missing env var yields `undefined` (not "")
// so search.js's presence-guard can drop an unconfigured source from eligibility.
// SECRET BOUNDARY: keys read here are used in the backend→upstream hop ONLY; they are
// never echoed to the client, never logged, never injected into the open proxy.
export function serverInjectedKeys() {
  const out = {};
  if (process.env.EUROPEANA_API_KEY)  out.europeanaKey  = process.env.EUROPEANA_API_KEY;
  if (process.env.DPLA_API_KEY)        out.dplaKey        = process.env.DPLA_API_KEY;
  if (process.env.SMITHSONIAN_API_KEY) out.smithsonianKey = process.env.SMITHSONIAN_API_KEY;
  // v0.46: OpenAlex bills $0.001 per search call and a keyless caller shares a $0.10/day budget.
  // The project key ($1/day free, prepaid beyond) rides the existing `settings.openAlexKey`
  // path in openalex.js / curatedJournals.js (`&api_key=`). Never reaches the browser.
  if (process.env.OPENALEX_API_KEY)    out.openAlexKey    = process.env.OPENALEX_API_KEY;
  // NCBI E-utilities: tool/email are mandatory per policy; the key lifts 3 → 10 req/s.
  if (process.env.NCBI_API_KEY)        out.ncbiApiKey     = process.env.NCBI_API_KEY;
  return out;
}
