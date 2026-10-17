// OpenCITE — embedding Web Worker (v0.49)
//
// Runs Snowflake/snowflake-arctic-embed-xs in the browser via transformers.js. The model
// (~22 MB, 8-bit ONNX) downloads from the Hugging Face hub on first use and is cached by the
// browser (Cache API) permanently; subsequent loads are local. Nothing is sent to our server.
//
// Model facts (verified against the model card, 2026-10-17):
//   - CLS pooling (NOT mean pooling — the 1_Pooling config has pooling_mode_cls_token: true)
//   - L2-normalized outputs, so cosine similarity == dot product
//   - queries get a prefix (see lib/semantic.js QUERY_PREFIX); documents do not
//   - 384 dimensions, 512-token window, English-only training data, Apache-2.0
//
// Messages in:  { type: "embed", id, texts: string[] }
// Messages out: { type: "progress", id, status, file, progress }   (model download/load)
//               { type: "result",   id, embeddings: number[][] }
//               { type: "error",    id, error }

const MODEL_ID = "Snowflake/snowflake-arctic-embed-xs";
let pipePromise = null;

function loadPipeline(reportTo) {
  if (pipePromise) return pipePromise;
  pipePromise = (async () => {
    const { pipeline, env } = await import(
      /* @vite-ignore */
      "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"
    );
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    return pipeline("feature-extraction", MODEL_ID, {
      quantized: true, // onnx/model_quantized.onnx — 22,972,992 bytes
      progress_callback: (p) => {
        // Only download/load events carry a numeric progress; forward them so the UI can show
        // "Downloading model… 63%" the first time the toggle is used.
        self.postMessage({ type: "progress", id: reportTo, status: p.status, file: p.file, progress: p.progress });
      },
    });
  })().catch(err => { pipePromise = null; throw err; }); // allow a retry after a failed load
  return pipePromise;
}

self.onmessage = async ({ data }) => {
  if (data.type !== "embed") return;
  try {
    const embedder = await loadPipeline(data.id);
    const output = await embedder(data.texts, { pooling: "cls", normalize: true });
    const dim = output.dims[1];
    const embeddings = [];
    for (let i = 0; i < data.texts.length; i++) {
      embeddings.push(Array.from(output.data.slice(i * dim, (i + 1) * dim)));
    }
    self.postMessage({ type: "result", id: data.id, embeddings });
  } catch (err) {
    self.postMessage({ type: "error", id: data.id, error: err?.message || String(err) });
  }
};
