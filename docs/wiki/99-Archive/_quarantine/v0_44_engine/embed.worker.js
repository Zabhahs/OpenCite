let pipe = null;

async function getPipeline() {
  if (pipe) return pipe;
  const { pipeline, env } = await import(
    /* @vite-ignore */
    "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"
  );
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  return pipe;
}

self.onmessage = async ({ data }) => {
  if (data.type !== "embed") return;
  try {
    const embedder = await getPipeline();
    const output = await embedder(data.texts, { pooling: "mean", normalize: true });
    const dim = output.dims[1];
    const embeddings = [];
    for (let i = 0; i < data.texts.length; i++) {
      embeddings.push(Array.from(output.data.slice(i * dim, (i + 1) * dim)));
    }
    self.postMessage({ type: "result", embeddings, id: data.id });
  } catch (err) {
    self.postMessage({ type: "error", error: err.message, id: data.id });
  }
};
