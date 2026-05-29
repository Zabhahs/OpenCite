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

const EMBED_MAX = 512;  // chars fed to the embedder (model truncates ~256 tokens)
const KW_BUDGET = 140;  // reserved tail for keywords/subjects

export async function computeSemanticRanks(query, results) {
  const texts = results.map(r => {
    const t = (r.title || "").trim();
    const a = (r.abstract || "").trim();
    // Include keywords/subjects (incl. v0.27 MeSH descriptors) so the same
    // content that BM25F weights also feeds the semantic arm of RRF. Reserve a
    // fixed tail budget for them — otherwise a long abstract truncates them out
    // of the window entirely and they never reach the embedding. Order: title,
    // abstract (fills the remaining room), keywords (guaranteed slice).
    const kw = [...(r.keywords || []), ...(r.subjects || [])].join(", ").trim();
    const kwPart = kw ? ". " + kw.slice(0, KW_BUDGET) : "";
    const abstractBudget = Math.max(0, EMBED_MAX - t.length - kwPart.length - 2);
    let text = t;
    if (a) text += ". " + a.slice(0, abstractBudget);
    text += kwPart;
    return text.slice(0, EMBED_MAX);
  });

  const embeddings = await embed([query, ...texts]);
  const qEmb = embeddings[0];
  const sims = embeddings.slice(1).map(e => dot(qEmb, e));

  const sorted = sims.map((s, i) => [i, s]).sort((a, b) => b[1] - a[1]);
  const ranks = new Map();
  sorted.forEach(([idx], rank) => ranks.set(idx, rank + 1));
  return ranks;
}
