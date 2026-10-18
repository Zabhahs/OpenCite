// OpenCITE — JSON request-body parser with a hard size cap (F-400)
//
// Vercel's platform body limit is 4.5 MB; our routes (checkout, history, library) only
// ever send small JSON, so we cap far lower to stop a caller wasting function memory on
// multi-MB garbage. On overflow we send a 413 and resolve to `null` so the route can
// `if (!body) return;` and stop. Malformed JSON within the cap resolves to {} (lenient —
// routes validate the specific fields they need).
//
// Pass `res` so the 413 is sent for you. Without it (legacy call), overflow resolves to
// null without responding — every in-repo caller passes res.

const MAX_BYTES = 65_536; // 64 KB

// v0.50: `maxBytes` lets one route raise the cap — the search-telemetry beacon carries a
// 100-deep page of records with abstracts (~150 KB). Every other caller keeps the default.
export async function parseBody(req, res, { maxBytes = MAX_BYTES } = {}) {
  return new Promise((resolve) => {
    let data = "", bytes = 0, aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        aborted = true;
        if (res) {
          res.statusCode = 413;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Payload too large" }));
        }
        req.destroy();
        return resolve(null);
      }
      data += chunk;
    });
    req.on("end", () => {
      if (aborted) return;
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    req.on("error", () => { if (!aborted) resolve(res ? null : {}); });
  });
}
