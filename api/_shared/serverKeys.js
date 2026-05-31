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
  return out;
}
