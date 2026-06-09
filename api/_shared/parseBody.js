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

export async function parseBody(req, res) {
  return new Promise((resolve) => {
    let data = "", bytes = 0, aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      bytes += chunk.length;
      if (bytes > MAX_BYTES) {
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
