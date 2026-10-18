#!/usr/bin/env node
// Regenerate public/docs/licensing.html from the licence SSOT (api/_shared/licenses.js) and the
// adapter registry (names). GENERATED — never hand-edit the HTML.
//   node scripts/gen-licensing.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { LICENSES, UNKNOWN_LICENSE } = await import(new URL("../api/_shared/licenses.js", import.meta.url).href);
const { ADAPTERS } = await import(new URL("../src/adapters/index.js", import.meta.url).href);

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const serverSafe = ADAPTERS.filter((a) => a.capability?.serverSafe);
const rows = serverSafe.map((a) => {
  const l = LICENSES[a.id] || UNKNOWN_LICENSE;
  const lic = l.url ? `<a href="${esc(l.url)}">${esc(l.license)}</a>` : esc(l.license);
  return `    <tr><td><code>${esc(a.id)}</code></td><td>${esc(a.name)}</td><td>${lic}</td><td>${esc(l.note)}</td></tr>`;
}).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OpenCITE — Source licensing</title>
<meta name="description" content="What you may do with the metadata each OpenCITE source returns. Generated from the licence SSOT." />
<link rel="icon" href="/favicon.ico" />
<style>
  :root { --bg:#fdf8ee; --fg:#1c1917; --muted:#57534e; --rule:#a8a29e; --accent:#7f1d1d; --code:#f5efe1; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#1c1917; --fg:#f5f0e6; --muted:#c7bfb2; --rule:#57534e; --accent:#fca5a5; --code:#292524; } }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 "Mulish", system-ui, sans-serif; }
  main { max-width: 52rem; margin: 0 auto; padding: 2.5rem 1rem 4rem; }
  h1 { font-size:1.7rem; margin:0 0 .25rem; }
  .meta { color:var(--muted); font: 12px/1.5 "JetBrains Mono", ui-monospace, monospace; letter-spacing:.06em; text-transform: uppercase; }
  a { color:var(--accent); }
  code { font: 13px/1.5 "JetBrains Mono", ui-monospace, monospace; }
  table { border-collapse: collapse; width:100%; font-size:.9rem; }
  td, th { text-align:left; vertical-align:top; padding:.4rem .5rem .4rem 0; border-bottom:1px solid var(--rule); }
  nav { border-top:1px solid var(--rule); margin-top:3rem; padding-top:1rem; font: 12px/1.6 "JetBrains Mono", ui-monospace, monospace; letter-spacing:.06em; text-transform: uppercase; display:flex; gap:1rem; flex-wrap:wrap; }
</style>
</head>
<body>
<main>
  <p class="meta">OpenCITE · Developers · generated ${new Date().toISOString().slice(0, 10)}</p>
  <h1>Source licensing</h1>
  <p>What you may do with the <strong>metadata</strong> each source returns through the API. OpenCITE relays metadata and links; it does not redistribute full text. Per-work content licences, where the source states one, are on each card as <code>evidence.license</code>. Every API response lists the licences of the sources present under <code>licenses</code>. A source whose terms we have not confirmed is marked <code>unknown</code> — that is a statement of what we know, not a grant.</p>
  <table>
    <tr><th>Source id</th><th>Name</th><th>Metadata licence</th><th>Note</th></tr>
${rows}
  </table>
  <nav>
    <a href="/docs/">API docs</a>
    <a href="/llms.txt">llms.txt</a>
    <a href="/legal/terms.html">Terms</a>
  </nav>
</main>
</body>
</html>
`;
const out = join(root, "public", "docs", "licensing.html");
writeFileSync(out, html);
console.log(`wrote ${out} (${serverSafe.length} sources)`);
