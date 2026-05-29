// Client-side semantic scoring via Web Worker + @xenova/transformers.
// Model (all-MiniLM-L6-v2, ~23MB) loads from CDN on first use, cached permanently.
// Embeddings are L2-normalized — cosine similarity = dot product.

let worker = null;
let msgId = 0;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(
    new URL("../workers/embed.worker.js", import.meta.url),
    { type: "module" }
  );
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    if (data.type === "result") { p.resolve(data.embeddings); pending.delete(data.id); }
    if (data.type === "error") { p.reject(new Error(data.error)); pending.delete(data.id); }
  };
  return worker;
}

function embed(texts) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: "embed", texts, id });
  });
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export async function computeSemanticRanks(query, results) {
  const texts = results.map(r => {
    const t = r.title || "";
    const a = r.abstract || "";
    // Include keywords/subjects so the same content signals BM25F weights
    // (incl. v0.27 MeSH descriptors) also feed the semantic arm of RRF.
    // Appended last so the 512-char window keeps title+abstract priority.
    const kw = [...(r.keywords || []), ...(r.subjects || [])].join(", ");
    let text = t;
    if (a)  text += ". " + a;
    if (kw) text += ". " + kw;
    return text.slice(0, 512);
  });

  const embeddings = await embed([query, ...texts]);
  const qEmb = embeddings[0];
  const sims = embeddings.slice(1).map(e => dot(qEmb, e));

  const sorted = sims.map((s, i) => [i, s]).sort((a, b) => b[1] - a[1]);
  const ranks = new Map();
  sorted.forEach(([idx], rank) => ranks.set(idx, rank + 1));
  return ranks;
}
