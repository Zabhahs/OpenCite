// OpenCITE — on-device semantic scoring (v0.49)
//
// Thin main-thread client for workers/embed.worker.js. Builds the text we embed for each
// result, embeds the query (with the model's query prefix) + the documents in one batch, and
// returns a cosine similarity per result. Pure data in, numbers out — ordering is the job of
// lib/semanticSearch.js (orderBySimilarity), state is the job of hooks/useSemanticRerank.js.
//
// Why on-device: free forever, private (titles/abstracts never leave the browser), and no
// server function budget spent. Trade-off: a one-time ~22 MB model download and 1–5 s of
// compute per search depending on the device. See the sprint log for the full rationale.

export const MODEL_ID = "Snowflake/snowflake-arctic-embed-xs";
export const MODEL_SIZE_MB = 22;
// Arctic-embed v1 models are trained with this prefix on the QUERY side only (model card).
export const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

// Character budget per document. The model reads 512 tokens (~2,000 chars); we cap lower so
// 100 documents embed in a few seconds on WASM. Title first, then abstract, then a reserved
// tail for keywords/subjects so a long abstract can't push them out of the window.
const DOC_MAX = 700;
const KW_BUDGET = 120;

let worker = null;
let msgId = 0;
const pending = new Map(); // id → { resolve, reject, onProgress }

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/embed.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    if (data.type === "progress") { p.onProgress?.(data); return; }
    pending.delete(data.id);
    if (data.type === "result") p.resolve(data.embeddings);
    else p.reject(new Error(data.error || "embedding failed"));
  };
  worker.onerror = (e) => {
    // A worker-level failure (e.g. CDN import blocked) rejects everything in flight and lets
    // the next call spawn a fresh worker instead of hanging on a dead one.
    for (const p of pending.values()) p.reject(new Error(e?.message || "embedding worker error"));
    pending.clear();
    worker = null;
  };
  return worker;
}

/** Embed a batch of texts. Resolves to number[][] (L2-normalized, 384-d). */
export function embedTexts(texts, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ type: "embed", id, texts });
  });
}

/** The text we embed for one result: title. abstract. keywords — within DOC_MAX chars. */
export function docText(r) {
  const title = String(r.title || "").trim();
  const abstract = String(r.abstract || "").trim();
  const kw = [...(r.keywords || []), ...(r.subjects || [])].join(", ").trim();
  const kwPart = kw ? ". " + kw.slice(0, KW_BUDGET) : "";
  const abstractBudget = Math.max(0, DOC_MAX - title.length - kwPart.length - 2);
  let text = title;
  if (abstract && abstractBudget > 20) text += ". " + abstract.slice(0, abstractBudget);
  text += kwPart;
  return text.slice(0, DOC_MAX);
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/**
 * scoreResults — cosine similarity of each result to the query.
 * @param {string} query            raw user query (prefix is added here)
 * @param {Array}  results          UnifiedResults (title/abstract/keywords read via docText)
 * @param {object} [o]
 * @param {Map}    [o.cache]        id → embedding, reused across load-more pages of one search
 * @param {Function} [o.onProgress] model download/load progress events
 * @returns {Promise<number[]>}     similarity per result, same order as `results`
 */
export async function scoreResults(query, results, { cache, onProgress } = {}) {
  const toEmbed = [QUERY_PREFIX + String(query || "").trim()];
  const slots = []; // index into `embeddings` for each result (null → served from cache)
  for (const r of results) {
    if (cache && r.id && cache.has(r.id)) { slots.push(null); continue; }
    slots.push(toEmbed.length);
    toEmbed.push(docText(r));
  }
  const embeddings = await embedTexts(toEmbed, { onProgress });
  const q = embeddings[0];
  return results.map((r, i) => {
    const slot = slots[i];
    const e = slot === null ? cache.get(r.id) : embeddings[slot];
    if (cache && r.id && slot !== null) cache.set(r.id, e);
    return dot(q, e);
  });
}
